-- CodedOK — Supabase Storage buckets + RLS for media uploads.
--
-- Replaces the previous base64-in-row approach for vessel photos,
-- surveyor logos, and cert/equipment file attachments. Storage URLs
-- live in the existing record fields (vessels.photo, users.surveyor.logo,
-- cert files JSONB), so render code keeps working unchanged.
--
-- Buckets:
--   vessel-photos   — public read, org members write to vessel_id folder
--   surveyor-logos  — public read, user writes to their own user_id folder
--   cert-files      — private (signed URLs only), org members write to
--                     vessel_id folder. Some cert PDFs contain personal
--                     data so we don't make them publicly browseable.

-- ============================================================
-- Buckets
-- ============================================================

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
