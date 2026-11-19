-- CodedOK — Apple in-app subscriptions (via RevenueCat).
--
-- 1. Columns recording where a paid plan came from and when it lapses.
-- 2. A guard so ONLY the server can grant a paid plan. Until now the
--    owner-update RLS policy let any owner set organizations.plan from
--    the client (fine while plans were free) — with real payments that
--    would let anyone make themselves Pro for nothing. Paid plans are
--    now set only by the service role: the revenuecat-webhook edge
--    function, or the support console (admin-user-actions).
--
-- Idempotent — safe to re-run.

alter table public.organizations
  add column if not exists plan_source     text,          -- 'apple' | 'support' | null
  add column if not exists plan_expires_at timestamptz;   -- when the current paid period ends

create or replace function public.guard_org_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
begin
  -- Trusted: service role (edge functions) or direct SQL (no JWT).
  if jwt_role is null or jwt_role = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- New orgs start on the free trial whatever the client sends.
    if new.plan in ('pro', 'team') then new.plan := 'trial'; end if;
    new.plan_source := null;
    new.plan_expires_at := null;
  elsif tg_op = 'UPDATE' then
    -- Clients can never move an org ONTO a paid plan, and can't touch
    -- the billing fields. (Other columns — name etc. — still update.)
    if new.plan is distinct from old.plan and new.plan in ('pro', 'team') then
      new.plan := old.plan;
    end if;
    new.plan_source := old.plan_source;
    new.plan_expires_at := old.plan_expires_at;
    -- Nor extend their own trial.
    new.trial_ends_at := old.trial_ends_at;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_org_plan_trg on public.organizations;
create trigger guard_org_plan_trg
  before insert or update on public.organizations
  for each row execute function public.guard_org_plan();

comment on function public.guard_org_plan is
  'Paid plans (pro/team), billing fields and trial_ends_at can only be set by the service role (revenuecat-webhook, support console).';
