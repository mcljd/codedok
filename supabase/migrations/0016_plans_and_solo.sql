-- CodedOK — Plans + solo-skipper support.
--
-- Adds:
--   1. organizations.plan_changed_at timestamp so the trial banner / UI
--      can show "Upgraded 3 days ago" etc.
--   2. UPDATE policy on organizations so the owner can change their own
--      org's plan / name / trial_ends_at without going through the edge
--      function (we're not charging yet).
--   3. A `solo_user_id` column on organizations so a solo-skipper org
--      (one user, no business name) is identifiable in queries.
--
-- No Stripe yet — the plan column is set client-side by the owner via
-- the new Plans screen. When payment goes live, the Stripe webhook will
-- replace direct client writes by stamping plan + stripe_customer_id
-- here instead.

alter table organizations
  add column if not exists plan_changed_at timestamptz,
  add column if not exists solo_user_id    text references users(id) on delete set null;

create index if not exists organizations_solo_idx on organizations(solo_user_id);

-- Owners can update their own org (plan, name, trial_ends_at, etc).
-- Uses the same SECURITY DEFINER helper as 0013 to avoid the recursion
-- trap.
drop policy if exists "orgs owner update" on organizations;
create policy "orgs owner update"
  on organizations for update
  using  (id in (select current_owner_org_ids()))
  with check (id in (select current_owner_org_ids()));
