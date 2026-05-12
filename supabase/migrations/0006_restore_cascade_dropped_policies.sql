-- CodedOK — Restore all policies cascade-dropped by 0004.
--
-- When 0004 ran `drop function ... cascade`, Postgres also dropped every
-- policy that called those helpers — about 20 of them. 0004 only
-- recreated the ones on users / organizations / memberships / vessels.
-- Everything else (certs, equipment, sms, jobs, invoices, surveyor_grants,
-- crew, crew_certs, deficiencies, inspections, plus the users-self-insert
-- needed for first-time sign-in) was left missing.
--
-- This migration is fully idempotent: every policy is dropped first
-- with `if exists`, then recreated. Safe to run on any database state
-- as long as 0005 has been applied (the helpers exist as SECURITY DEFINER).
--
-- Run with: Supabase Dashboard -> SQL Editor -> paste -> Run.

-- ============================================================
-- USERS — restore self-insert (needed for first sign-in)
-- ============================================================

drop policy if exists "users self insert" on users;
create policy "users self insert"
  on users for insert
  with check (auth_user_id = auth.uid());

-- ============================================================
-- ORGANIZATIONS — restore insert
-- ============================================================

drop policy if exists "orgs authed insert" on organizations;
create policy "orgs authed insert"
  on organizations for insert
  with check (auth.uid() is not null);

-- ============================================================
-- CERTS / EQUIPMENT / DEFICIENCIES / INSPECTIONS
-- Loop over the four vessel-scoped child tables and rebuild the
-- standard four-policy block on each.
-- ============================================================

do $$
declare
  t text;
begin
  for t in select unnest(array['certs','equipment','deficiencies','inspections']) loop
    execute format($f$
      drop policy if exists "%1$s org access"     on %1$I;
      drop policy if exists "%1$s surveyor read"  on %1$I;
      drop policy if exists "%1$s builder read"   on %1$I;
      drop policy if exists "%1$s admin all"      on %1$I;

      create policy "%1$s org access"
        on %1$I for all
        using (vessel_id in (select id from vessels where org_id in (select current_user_org_ids())))
        with check (vessel_id in (select id from vessels where org_id in (select current_user_org_ids())));

      create policy "%1$s surveyor read"
        on %1$I for select
        using (vessel_id in (select current_surveyor_vessel_ids()));

      create policy "%1$s builder read"
        on %1$I for select
        using (current_kind() = 'builder' and vessel_id in (
          select id from vessels where built_by = current_builder_slug()
        ));

      create policy "%1$s admin all"
        on %1$I for all using (current_kind() = 'admin');
    $f$, t);
  end loop;
end $$;

-- Surveyor write paths
drop policy if exists "deficiencies surveyor write" on deficiencies;
create policy "deficiencies surveyor write"
  on deficiencies for insert
  with check (vessel_id in (select current_surveyor_vessel_ids()));

drop policy if exists "inspections surveyor write" on inspections;
create policy "inspections surveyor write"
  on inspections for all
  using (vessel_id in (select current_surveyor_vessel_ids()))
  with check (vessel_id in (select current_surveyor_vessel_ids()));

-- ============================================================
-- CREW + CREW_CERTS
-- ============================================================

drop policy if exists "crew org access" on crew;
create policy "crew org access"
  on crew for all
  using (org_id in (select current_user_org_ids()))
  with check (org_id in (select current_user_org_ids()));

drop policy if exists "crew certs org access" on crew_certs;
create policy "crew certs org access"
  on crew_certs for all
  using (person_id in (
    select id from crew where org_id in (select current_user_org_ids())
  ))
  with check (person_id in (
    select id from crew where org_id in (select current_user_org_ids())
  ));

-- ============================================================
-- SURVEYOR GRANTS
-- ============================================================

drop policy if exists "grants org manage" on surveyor_grants;
create policy "grants org manage"
  on surveyor_grants for all
  using (vessel_id in (
    select id from vessels where org_id in (select current_user_org_ids())
  ))
  with check (vessel_id in (
    select id from vessels where org_id in (select current_user_org_ids())
  ));

drop policy if exists "grants surveyor read" on surveyor_grants;
create policy "grants surveyor read"
  on surveyor_grants for select
  using (
    surveyor_user_id in (select id from users where auth_user_id = auth.uid())
  );

drop policy if exists "grants operator insert" on surveyor_grants;
create policy "grants operator insert"
  on surveyor_grants for insert
  with check (vessel_id in (
    select id from vessels where org_id in (select current_user_org_ids())
  ));

-- ============================================================
-- SMS DOCUMENTS
-- ============================================================

drop policy if exists "sms org access" on sms_documents;
create policy "sms org access"
  on sms_documents for all
  using (org_id in (select current_user_org_ids()))
  with check (org_id in (select current_user_org_ids()));

drop policy if exists "sms surveyor read" on sms_documents;
create policy "sms surveyor read"
  on sms_documents for select
  using (vessel_id in (select current_surveyor_vessel_ids()));

drop policy if exists "sms surveyor sign" on sms_documents;
create policy "sms surveyor sign"
  on sms_documents for update
  using (vessel_id in (select current_surveyor_vessel_ids()))
  with check (vessel_id in (select current_surveyor_vessel_ids()));

drop policy if exists "sms operator insert" on sms_documents;
create policy "sms operator insert"
  on sms_documents for insert
  with check (org_id in (select current_user_org_ids()));

-- ============================================================
-- JOBS
-- ============================================================

drop policy if exists "jobs operator access" on jobs;
create policy "jobs operator access"
  on jobs for all
  using (vessel_id in (
    select id from vessels where org_id in (select current_user_org_ids())
  ))
  with check (vessel_id in (
    select id from vessels where org_id in (select current_user_org_ids())
  ));

drop policy if exists "jobs surveyor read" on jobs;
create policy "jobs surveyor read"
  on jobs for select
  using (
    surveyor_user_id in (select id from users where auth_user_id = auth.uid())
  );

drop policy if exists "jobs surveyor update" on jobs;
create policy "jobs surveyor update"
  on jobs for update
  using (
    surveyor_user_id in (select id from users where auth_user_id = auth.uid())
  );

drop policy if exists "jobs operator insert" on jobs;
create policy "jobs operator insert"
  on jobs for insert
  with check (vessel_id in (
    select id from vessels where org_id in (select current_user_org_ids())
  ));

-- ============================================================
-- INVOICES
-- ============================================================

drop policy if exists "invoices operator access" on invoices;
create policy "invoices operator access"
  on invoices for select
  using (org_id in (select current_user_org_ids()));

drop policy if exists "invoices surveyor access" on invoices;
create policy "invoices surveyor access"
  on invoices for all
  using (
    surveyor_user_id in (select id from users where auth_user_id = auth.uid())
  );

drop policy if exists "invoices operator insert" on invoices;
create policy "invoices operator insert"
  on invoices for insert
  with check (org_id in (select current_user_org_ids()));

-- ============================================================
-- Verification
-- ============================================================
-- Should return a count well above 20. If you see fewer than 30 rows
-- the script errored partway through.
select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
