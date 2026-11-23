-- CodedOK — security hardening, round 2 (from a live audit, Nov 2026).
--
-- What the audit found on the live project:
--   * Every table has RLS on, but the `anon` (not signed in) role still held
--     full table privileges, so RLS was the only barrier.
--   * Internal helper and trigger functions were callable over the API by
--     anyone, signed in or not.
--   * `authenticated` held TRUNCATE / REFERENCES / TRIGGER, and privileges on
--     server-only tables.
--   * The Storage buckets from 0014 were never created, so attachments had
--     nowhere private to go.
-- Idempotent: safe to run more than once.

-- ─── 1. Not signed in = no table access at all ───────────────────────────────
-- (`workshops` is not part of CodedOK; it is closed in section 4.)
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and c.relname <> 'workshops'
  loop
    execute format('revoke all on public.%I from anon', r.relname);
    -- Signed-in users never need these, and TRUNCATE is not covered by RLS.
    execute format('revoke truncate, references, trigger on public.%I from authenticated', r.relname);
  end loop;
end $$;
revoke all on all sequences in schema public from anon;

-- Server-only tables: reachable by the service role (edge functions) alone.
do $$
declare t text;
begin
  foreach t in array array['action_log', 'ai_usage_log', 'support_audit_log', 'apple_tokens', 'waitlist']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
  -- Users may read their own reminder history; only the server writes it.
  if to_regclass('public.reminder_log') is not null then
    revoke insert, update, delete on public.reminder_log from authenticated;
  end if;
end $$;

-- New tables and functions start locked down instead of open.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- ─── 2. Internal functions are not an API ────────────────────────────────────
-- RLS helpers: signed-in users only (policies call them as the querying role).
do $$
declare f text;
begin
  foreach f in array array['current_user_row()', 'current_kind()', 'current_builder_slug()', 'current_user_org_ids()',
                           'current_owner_org_ids()', 'current_surveyor_vessel_ids()', 'org_is_unclaimed(text)',
                           'accept_invitation(uuid)']
  loop
    if to_regprocedure('public.' || f) is not null then
      execute format('revoke execute on function public.%s from public, anon', f);
      execute format('grant execute on function public.%s to authenticated, service_role', f);
    end if;
  end loop;
  -- Trigger functions fire from triggers; nobody calls them directly.
  foreach f in array array['guard_user_kind()', 'guard_org_plan()', 'guard_sms_surveyor()', 'guard_job_surveyor()', 'tg_set_updated_at()']
  loop
    if to_regprocedure('public.' || f) is not null then
      execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    end if;
  end loop;
  -- Only reachable through join_waitlist.
  if to_regprocedure('public.waitlist_place(uuid)') is not null then
    revoke execute on function public.waitlist_place(uuid) from public, anon, authenticated;
  end if;
end $$;

-- Pin the search path so the function cannot be redirected to another schema.
alter function public.tg_set_updated_at() set search_path = '';

-- ─── 3. Storage buckets and their access rules (0014, never applied live) ────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('vessel-photos',  'vessel-photos',  true,  10485760,
   array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('surveyor-logos', 'surveyor-logos', true,  5242880,
   array['image/jpeg','image/png','image/webp','image/svg+xml']),
  ('cert-files',     'cert-files',     false, 26214400,
   array['image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

-- ============================================================
-- vessel-photos — write scoped to vessels in the user's orgs.
-- Path convention: <vessel_id>/<filename>
-- ============================================================

drop policy if exists "vessel-photos auth insert" on storage.objects;
create policy "vessel-photos auth insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'vessel-photos'
    and (storage.foldername(name))[1] in (
      select v.id from vessels v
      where v.org_id in (select current_user_org_ids())
    )
  );

drop policy if exists "vessel-photos auth update" on storage.objects;
create policy "vessel-photos auth update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'vessel-photos'
    and (storage.foldername(name))[1] in (
      select v.id from vessels v
      where v.org_id in (select current_user_org_ids())
    )
  );

drop policy if exists "vessel-photos auth delete" on storage.objects;
create policy "vessel-photos auth delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'vessel-photos'
    and (storage.foldername(name))[1] in (
      select v.id from vessels v
      where v.org_id in (select current_user_org_ids())
    )
  );

-- ============================================================
-- surveyor-logos — each user writes only to their own user_id folder.
-- Path convention: <user_id>/<filename>
-- ============================================================

drop policy if exists "surveyor-logos self insert" on storage.objects;
create policy "surveyor-logos self insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'surveyor-logos'
    and (storage.foldername(name))[1] in (select id from current_user_row())
  );

drop policy if exists "surveyor-logos self update" on storage.objects;
create policy "surveyor-logos self update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'surveyor-logos'
    and (storage.foldername(name))[1] in (select id from current_user_row())
  );

drop policy if exists "surveyor-logos self delete" on storage.objects;
create policy "surveyor-logos self delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'surveyor-logos'
    and (storage.foldername(name))[1] in (select id from current_user_row())
  );

-- ============================================================
-- cert-files — private. Org members upload + read via signed URL.
-- Path convention: <vessel_id>/<filename>
-- Surveyors with grants on the vessel can also read.
-- ============================================================

drop policy if exists "cert-files auth insert" on storage.objects;
create policy "cert-files auth insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'cert-files'
    and (storage.foldername(name))[1] in (
      select v.id from vessels v
      where v.org_id in (select current_user_org_ids())
    )
  );

drop policy if exists "cert-files auth select" on storage.objects;
create policy "cert-files auth select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'cert-files'
    and (
      (storage.foldername(name))[1] in (
        select v.id from vessels v
        where v.org_id in (select current_user_org_ids())
      )
      or (storage.foldername(name))[1] in (
        select cast(vessel_id as text) from current_surveyor_vessel_ids() as vessel_id
      )
    )
  );

drop policy if exists "cert-files auth update" on storage.objects;
create policy "cert-files auth update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'cert-files'
    and (storage.foldername(name))[1] in (
      select v.id from vessels v
      where v.org_id in (select current_user_org_ids())
    )
  );

drop policy if exists "cert-files auth delete" on storage.objects;
create policy "cert-files auth delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'cert-files'
    and (storage.foldername(name))[1] in (
      select v.id from vessels v
      where v.org_id in (select current_user_org_ids())
    )
  );

-- SVG can carry script and the logos bucket is public (0027 §6).
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'surveyor-logos';
-- Certificates are photos and PDFs; keep the private bucket to those.
update storage.buckets
   set public = false,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
 where id = 'cert-files';

-- ─── 4. The open `workshops` table ───────────────────────────────────────────
-- Not part of CodedOK, and it was readable and writable by anyone on the
-- internet. Closed to API callers; its rules and data are left in place so
-- access can be granted back if a site turns out to need it.
do $$ begin
  if to_regclass('public.workshops') is not null then
    revoke all on public.workshops from anon, authenticated;
  end if;
end $$;
