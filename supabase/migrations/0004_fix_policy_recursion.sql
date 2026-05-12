-- CodedOK — Fix infinite recursion in users-table policies
--
-- Symptom: at sign-in, the JS handleSignedIn() did a `select * from users
-- where auth_user_id = ...` which triggered:
--   "infinite recursion detected in policy for relation 'users'"
--
-- Root cause: helper functions like current_kind() read from users to
-- check the auth.uid() role. Those helpers were used inside the SELECT
-- policy on users itself ("users surveyor read clients" / "users admin
-- read all"). Postgres saw users -> policy -> helper -> users -> ...
--
-- Fix: mark the helpers SECURITY DEFINER so they execute as the function
-- owner (postgres) and bypass RLS when reading users / memberships /
-- surveyor_grants. Each helper is hard-filtered to `auth.uid()` so no
-- data is leaked beyond the current user.
--
-- Run with: Supabase Dashboard -> SQL Editor -> paste -> Run.

-- Drop and recreate each helper. SECURITY DEFINER + a fixed search_path
-- is the standard pattern for "policy helpers that read protected
-- tables" in Postgres.

drop function if exists current_user_row()         cascade;
drop function if exists current_kind()             cascade;
drop function if exists current_user_org_ids()     cascade;
drop function if exists current_surveyor_vessel_ids() cascade;
drop function if exists current_builder_slug()     cascade;

create function current_user_row()
returns setof users
language sql
security definer
set search_path = public
stable
as $$
  select * from users where auth_user_id = auth.uid() limit 1;
$$;

create function current_kind()
returns user_kind
language sql
security definer
set search_path = public
stable
as $$
  select kind from users where auth_user_id = auth.uid() limit 1;
$$;

create function current_user_org_ids()
returns setof text
language sql
security definer
set search_path = public
stable
as $$
  select m.org_id
  from memberships m
  join users u on u.id = m.user_id
  where u.auth_user_id = auth.uid();
$$;

create function current_surveyor_vessel_ids()
returns setof text
language sql
security definer
set search_path = public
stable
as $$
  select g.vessel_id
  from surveyor_grants g
  join users u on u.id = g.surveyor_user_id
  where u.auth_user_id = auth.uid() and g.revoked_at is null;
$$;

create function current_builder_slug()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select (builder->>'slug')
  from users
  where auth_user_id = auth.uid() and kind = 'builder'
  limit 1;
$$;

-- Re-create the policies the cascade dropped (those referenced the
-- helper functions and were taken down with them).

drop policy if exists "users surveyor read clients" on users;
create policy "users surveyor read clients"
  on users for select
  using (
    current_kind() = 'surveyor' and id in (
      select m.user_id from memberships m
      where m.org_id in (
        select v.org_id from vessels v where v.id in (select current_surveyor_vessel_ids())
      )
    )
  );

drop policy if exists "users admin read all" on users;
create policy "users admin read all"
  on users for select using (current_kind() = 'admin');

drop policy if exists "orgs member read" on organizations;
create policy "orgs member read"
  on organizations for select
  using (id in (select current_user_org_ids()));

drop policy if exists "orgs admin read all" on organizations;
create policy "orgs admin read all"
  on organizations for select using (current_kind() = 'admin');

drop policy if exists "orgs owner update" on organizations;
create policy "orgs owner update"
  on organizations for update
  using (id in (select current_user_org_ids()))
  with check (id in (select current_user_org_ids()));

drop policy if exists "memberships self read" on memberships;
create policy "memberships self read"
  on memberships for select
  using (
    user_id in (select id from users where auth_user_id = auth.uid())
    or org_id in (select current_user_org_ids())
  );

drop policy if exists "memberships self insert" on memberships;
create policy "memberships self insert"
  on memberships for insert
  with check (
    user_id in (select id from users where auth_user_id = auth.uid())
  );

drop policy if exists "vessels org read" on vessels;
create policy "vessels org read"
  on vessels for select
  using (org_id in (select current_user_org_ids()));

drop policy if exists "vessels surveyor read" on vessels;
create policy "vessels surveyor read"
  on vessels for select
  using (id in (select current_surveyor_vessel_ids()));

drop policy if exists "vessels builder read" on vessels;
create policy "vessels builder read"
  on vessels for select
  using (current_kind() = 'builder' and built_by = current_builder_slug());

drop policy if exists "vessels admin all" on vessels;
create policy "vessels admin all"
  on vessels for all using (current_kind() = 'admin');

drop policy if exists "vessels org write" on vessels;
create policy "vessels org write"
  on vessels for all
  using (org_id in (select current_user_org_ids()))
  with check (org_id in (select current_user_org_ids()));
