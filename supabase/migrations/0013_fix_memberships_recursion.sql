-- CodedOK — Break memberships RLS recursion introduced by 0011.
--
-- The "memberships owner manage" policy in 0011 used a self-referential
-- subquery on memberships, which (just like the users-recursion bug
-- 0007 fixed) loops the policy evaluator. Replace with a SECURITY
-- DEFINER helper that bypasses RLS for the inner lookup.

-- Helper: orgs where the calling auth user is an owner. SECURITY
-- DEFINER + BYPASSRLS-owning role means the inner query does not
-- re-enter the memberships policy chain.
create or replace function current_owner_org_ids()
returns setof text
language sql
security definer
set search_path = public
stable
as $$
  select m.org_id
  from memberships m
  join users u on u.id = m.user_id
  where u.auth_user_id = auth.uid()
    and m.role = 'owner';
$$;

revoke all on function current_owner_org_ids() from public;
grant execute on function current_owner_org_ids() to authenticated;

-- Re-bind the owner-manage policy to use the helper instead of a
-- self-referential subselect.
drop policy if exists "memberships owner manage" on memberships;
create policy "memberships owner manage"
  on memberships for all
  using (org_id in (select current_owner_org_ids()))
  with check (org_id in (select current_owner_org_ids()));
