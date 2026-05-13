-- CodedOK — Break the users RLS recursion at sign-in.
--
-- Symptom: "infinite recursion detected in policy for relation 'users'"
-- on sign-in / `select * from users`.
--
-- Root cause: even though 0005 made the helper functions SECURITY DEFINER,
-- five other policies still inlined `(select id from users where
-- auth_user_id = auth.uid())` instead of going through a helper. Postgres
-- OR-evaluates every SELECT policy on the target row, so a plain
-- `select … from users` triggers the `users surveyor read clients` policy,
-- which queries `memberships`, whose `memberships self read` policy queries
-- `users` again — infinite loop.
--
-- Fix: replace those raw `from users` subselects with
-- `(select id from current_user_row())`. `current_user_row()` is SECURITY
-- DEFINER and owned by a BYPASSRLS role, so its inner query does not
-- re-enter the users policy chain.
--
-- Idempotent: every policy is dropped first with `if exists` and recreated.

-- ============================================================
-- memberships — used inside the users surveyor policy, so this
-- one is the actual recursion entry point. Fix it first.
-- ============================================================

drop policy if exists "memberships self read" on memberships;
create policy "memberships self read"
  on memberships for select
  using (
    user_id in (select id from current_user_row())
    or org_id in (select current_user_org_ids())
  );

drop policy if exists "memberships self insert" on memberships;
create policy "memberships self insert"
  on memberships for insert
  with check (user_id in (select id from current_user_row()));

-- ============================================================
-- jobs
-- ============================================================

drop policy if exists "jobs surveyor read" on jobs;
create policy "jobs surveyor read"
  on jobs for select
  using (surveyor_user_id in (select id from current_user_row()));

drop policy if exists "jobs surveyor update" on jobs;
create policy "jobs surveyor update"
  on jobs for update
  using (surveyor_user_id in (select id from current_user_row()));

-- ============================================================
-- invoices
-- ============================================================

drop policy if exists "invoices surveyor access" on invoices;
create policy "invoices surveyor access"
  on invoices for all
  using (surveyor_user_id in (select id from current_user_row()))
  with check (surveyor_user_id in (select id from current_user_row()));

-- ============================================================
-- surveyor_grants
-- ============================================================

drop policy if exists "grants surveyor read" on surveyor_grants;
create policy "grants surveyor read"
  on surveyor_grants for select
  using (surveyor_user_id in (select id from current_user_row()));

-- ============================================================
-- Verification: no remaining policies should reference `from users`
-- directly. This SELECT should return zero rows.
-- ============================================================

select tablename, policyname
from pg_policies
where schemaname = 'public'
  and (qual ilike '%from users%' or with_check ilike '%from users%');
