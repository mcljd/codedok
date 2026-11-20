-- CodedOK — security hardening (Nov 2026 audit).
--
-- 1. expiring_items view bypassed RLS (owned by postgres, not security_invoker)
--    and was readable with the public anon key → every tenant's certs/crew.
-- 2. Anyone could sign up as kind='builder' and pick any builder slug, which
--    unlocks "builder read" on every vessel built by that yard.
-- 3. users.email was client-writable, and invitations match on it → an
--    attacker could claim someone else's invite. Email now always follows the
--    verified login email.
-- 4. Granted surveyors could move/rewrite SMS documents and jobs, and plant
--    invoices in any org.
-- 5. Clients could insert an org with a far-future trial or an unknown plan.
-- 6. SVG logos in a public bucket = stored XSS. org_is_unclaimed callable by anon.
-- 7. Record ids are rendered inside onclick handlers; enforce a safe id format.
--
-- Safe to re-run.

-- ─── 1. expiring_items: respect RLS, not for clients ──────────────────────────
alter view if exists public.expiring_items set (security_invoker = true);
revoke all on public.expiring_items from anon, authenticated;

-- ─── 2 + 3. users: kind, builder profile and email are server-controlled ─────
create or replace function public.guard_user_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims   jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  jwt_role text  := claims ->> 'role';
  jwt_mail text  := nullif(lower(claims ->> 'email'), '');
begin
  -- Trusted callers (service role, or direct SQL with no JWT) may set anything.
  if jwt_role is null or jwt_role = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Privileged and builder kinds are granted by support only.
    if new.kind in ('admin', 'support', 'builder') then
      new.kind := 'operator';
    end if;
    new.builder := null;
    if jwt_mail is not null then new.email := jwt_mail; end if;
  elsif tg_op = 'UPDATE' then
    if new.kind is distinct from old.kind then
      new.kind := old.kind;          -- silently revert any client kind change
    end if;
    new.builder := old.builder;      -- builder slug grants cross-org read
    -- Email always tracks the verified login email (or stays as it was).
    new.email := coalesce(jwt_mail, old.email);
    new.auth_user_id := old.auth_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_user_kind_trg on public.users;
create trigger guard_user_kind_trg
  before insert or update on public.users
  for each row execute function public.guard_user_kind();

-- ─── 4a. SMS documents: surveyors can't move or re-share them ─────────────────
create or replace function public.guard_sms_surveyor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
begin
  if jwt_role is null or jwt_role = 'service_role' then return new; end if;
  -- Org members manage their own documents normally.
  if old.org_id in (select public.current_user_org_ids()) then return new; end if;
  -- Anyone else reaching here is a granted surveyor: they may review, polish
  -- and sign, but not move the document, change sharing, or alter crew sign-offs.
  new.org_id                 := old.org_id;
  new.vessel_id              := old.vessel_id;
  new.type                   := old.type;
  new.share_token            := old.share_token;
  new.share_token_expires_at := old.share_token_expires_at;
  new.acknowledgements       := old.acknowledgements;
  new.deleted_at             := old.deleted_at;
  return new;
end;
$$;

drop trigger if exists guard_sms_surveyor_trg on public.sms_documents;
create trigger guard_sms_surveyor_trg
  before update on public.sms_documents
  for each row execute function public.guard_sms_surveyor();

-- ─── 4b. Jobs: an assigned surveyor can't move a job to another vessel ───────
create or replace function public.guard_job_surveyor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
begin
  if jwt_role is null or jwt_role = 'service_role' then return new; end if;
  if old.vessel_id in (select v.id from public.vessels v where v.org_id in (select public.current_user_org_ids())) then
    return new;
  end if;
  new.vessel_id            := old.vessel_id;
  new.surveyor_user_id     := old.surveyor_user_id;
  new.requested_by_user_id := old.requested_by_user_id;
  return new;
end;
$$;

drop trigger if exists guard_job_surveyor_trg on public.jobs;
create trigger guard_job_surveyor_trg
  before update on public.jobs
  for each row execute function public.guard_job_surveyor();

-- ─── 4c. Invoices: only for jobs you hold, in that job's org ──────────────────
drop policy if exists "invoices surveyor access" on invoices;
create policy "invoices surveyor access"
  on invoices for all
  using (surveyor_user_id in (select id from current_user_row()))
  with check (
    surveyor_user_id in (select id from current_user_row())
    and job_id in (select j.id from jobs j where j.surveyor_user_id in (select id from current_user_row()))
    and vessel_id = (select j.vessel_id from jobs j where j.id = invoices.job_id)
    and org_id = (select v.org_id from jobs j join vessels v on v.id = j.vessel_id where j.id = invoices.job_id)
  );

-- ─── 5. Organisations: clients get a normal trial and free plans only ─────────
create or replace function public.guard_org_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
begin
  if jwt_role is null or jwt_role = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.plan is null or new.plan not in ('trial', 'solo') then new.plan := 'trial'; end if;
    new.plan_source := null;
    new.plan_expires_at := null;
    new.trial_ends_at := least(coalesce(new.trial_ends_at, current_date + 14), current_date + 14);
  elsif tg_op = 'UPDATE' then
    -- Clients may only move between the free plans.
    if new.plan is distinct from old.plan and (new.plan is null or new.plan not in ('trial', 'solo')) then
      new.plan := old.plan;
    end if;
    new.plan_source := old.plan_source;
    new.plan_expires_at := old.plan_expires_at;
    new.trial_ends_at := old.trial_ends_at;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_org_plan_trg on public.organizations;
create trigger guard_org_plan_trg
  before insert or update on public.organizations
  for each row execute function public.guard_org_plan();

-- ─── 6. Misc ─────────────────────────────────────────────────────────────────
-- SVG can carry script; the logos bucket is public.
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'surveyor-logos';

-- Only signed-in users' policies need this helper.
revoke execute on function public.org_is_unclaimed(text) from anon, public;
grant execute on function public.org_is_unclaimed(text) to authenticated;

-- ─── 7. Safe id format on every client-written table (new rows only) ─────────
do $$
declare t text;
begin
  foreach t in array array['users','organizations','vessels','certs','equipment','deficiencies',
                           'inspections','crew','crew_certs','surveyor_grants','sms_documents',
                           'jobs','invoices']
  loop
    if to_regclass('public.' || t) is not null and not exists (
      select 1 from pg_constraint where conname = t || '_id_format' and conrelid = ('public.' || t)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I check (id ~ ''^[A-Za-z0-9_.:-]{1,128}$'') not valid',
        t, t || '_id_format');
    end if;
  end loop;
end $$;
