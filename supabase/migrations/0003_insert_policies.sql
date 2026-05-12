-- CodedOK — Fill-in policies + new-user provisioning
-- Apply after 0001_schema.sql and 0002_policies.sql.
--
-- 0002 set up READ + UPDATE policies; it forgot the INSERT policies needed
-- for the JS handleSignedIn() flow to create the row at first sign-in.
-- This migration adds:
--   1. INSERT policies on users / organizations / memberships
--   2. INSERT policies for vessel-scoped child rows so operators can add
--      certs/equipment/deficiencies/etc.
--   3. INSERT policy for surveyor grants (operators inviting surveyors).
--   4. INSERT policy for SMS docs created via the builder.
--
-- Run with: Supabase Dashboard -> SQL Editor -> paste -> Run.

-- ============================================================
-- USERS: let an authenticated visitor create their own row
-- ============================================================

drop policy if exists "users self insert" on users;
create policy "users self insert"
  on users for insert
  with check (auth_user_id = auth.uid());

-- ============================================================
-- ORGANIZATIONS: any authenticated user can create an org
-- (the JS layer then inserts a 'owner' membership row for them)
-- ============================================================

drop policy if exists "orgs authed insert" on organizations;
create policy "orgs authed insert"
  on organizations for insert
  with check (auth.uid() is not null);

drop policy if exists "orgs owner update" on organizations;
create policy "orgs owner update"
  on organizations for update
  using (id in (select current_user_org_ids()))
  with check (id in (select current_user_org_ids()));

-- ============================================================
-- MEMBERSHIPS: a user can insert their own membership when creating
-- a new org. (We're not yet supporting cross-user invites in v1.)
-- ============================================================

drop policy if exists "memberships self insert" on memberships;
create policy "memberships self insert"
  on memberships for insert
  with check (
    user_id in (select id from users where auth_user_id = auth.uid())
  );

-- ============================================================
-- Vessel-scoped INSERT policies for child tables that 0002 only
-- gave permissive SELECT/UPDATE access to.
-- ============================================================

-- The 0002 helper macro already added "FOR ALL" policies for certs /
-- equipment / deficiencies / inspections scoped to the operator's org.
-- This block adds the same for SMS docs + jobs + invoices + surveyor
-- grants so operator inserts land cleanly.

drop policy if exists "sms operator insert" on sms_documents;
create policy "sms operator insert"
  on sms_documents for insert
  with check (org_id in (select current_user_org_ids()));

drop policy if exists "jobs operator insert" on jobs;
create policy "jobs operator insert"
  on jobs for insert
  with check (vessel_id in (
    select id from vessels where org_id in (select current_user_org_ids())
  ));

drop policy if exists "invoices operator insert" on invoices;
create policy "invoices operator insert"
  on invoices for insert
  with check (org_id in (select current_user_org_ids()));

drop policy if exists "grants operator insert" on surveyor_grants;
create policy "grants operator insert"
  on surveyor_grants for insert
  with check (vessel_id in (
    select id from vessels where org_id in (select current_user_org_ids())
  ));
