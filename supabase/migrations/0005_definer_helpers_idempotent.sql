-- CodedOK — Make RLS helpers SECURITY DEFINER (idempotent fix)
--
-- Re-run this any time the "infinite recursion detected in policy for
-- relation 'users'" error surfaces at sign-in. Unlike 0004 this uses
-- CREATE OR REPLACE so it does NOT cascade-drop any policies — just
-- patches the function attributes in place. Safe to run repeatedly.
--
-- After running, the verification SELECT at the bottom should print
-- five rows, all with `prosecdef = t`. If any are `f`, the migration
-- didn't take.

create or replace function current_user_row()
returns setof users
language sql
security definer
set search_path = public
stable
as $$
  select * from users where auth_user_id = auth.uid() limit 1;
$$;

create or replace function current_kind()
returns user_kind
language sql
security definer
set search_path = public
stable
as $$
  select kind from users where auth_user_id = auth.uid() limit 1;
$$;

create or replace function current_user_org_ids()
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

create or replace function current_surveyor_vessel_ids()
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

create or replace function current_builder_slug()
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

-- Verification: should print 5 rows, all `prosecdef = t`.
select proname, prosecdef
from pg_proc
where proname in (
  'current_user_row',
  'current_kind',
  'current_user_org_ids',
  'current_surveyor_vessel_ids',
  'current_builder_slug'
)
order by proname;
