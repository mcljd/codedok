-- ═══════════════════════════════════════════════════════════════
-- CodedOK — APPLY ALL pending migrations (0017 → 0020)
-- Paste this whole file into the Supabase SQL Editor and click Run.
-- All statements are idempotent — safe to run more than once.
-- Generated from supabase/migrations/0017–0020.
-- ═══════════════════════════════════════════════════════════════

-- Lets us add the 'support' enum value (0018) and, in the same run,
-- create a function that references it (0020) without Postgres
-- rejecting the function body for using a not-yet-committed enum
-- value. Nothing here EXECUTES with the new value, so this is safe.
set check_function_bodies = off;


-- ▼▼▼ 0017_reminder_buckets_60_90.sql ▼▼▼
-- Adds 60-day and 90-day buckets to the expiring_items view so the
-- send-reminders edge function can fire push notifications at all
-- four cadences (90 / 60 / 30 / 7 days) instead of just two.
--
-- Why: marketing copy on codedok.com promised "Push reminders 90,
-- 60, 30 days before expiry" but the view only emitted due7 and
-- due30 — so half the schedule never fired. The 90-day window is
-- specifically what gives a busy skipper time to book a survey
-- BEFORE the certificate lapses, which is the whole point.
--
-- Mirrors the client-side bucket formula in app/store.js:254 — keep
-- that in sync if you reorder the cases here.

create or replace view expiring_items as
select
  user_id,
  item_kind,
  item_id,
  label,
  vessel_id,
  vessel_name,
  expires_at,
  case
    when expires_at <  current_date           then 'overdue'
    when expires_at <= current_date + 7       then 'due7'
    when expires_at <= current_date + 30      then 'due30'
    when expires_at <= current_date + 60      then 'due60'
    when expires_at <= current_date + 90      then 'due90'
    else 'valid'
  end as bucket
from (
  -- Certificates → every member of the owning org.
  select m.user_id, 'cert'::text as item_kind, c.id as item_id,
         c.name as label, c.vessel_id, v.name as vessel_name,
         c.expires_at
  from certs c
  join vessels v       on v.id = c.vessel_id
  join memberships m   on m.org_id = v.org_id
  where c.expires_at is not null and c.deleted_at is null

  union all

  -- Equipment service due → every member of the owning org.
  select m.user_id, 'equipment', e.id,
         e.name, e.vessel_id, v.name,
         e.next_service_at
  from equipment e
  join vessels v       on v.id = e.vessel_id
  join memberships m   on m.org_id = v.org_id
  where e.next_service_at is not null and e.deleted_at is null

  union all

  -- Crew certs / qualifications → the crew member themselves.
  select cc.user_id, 'crew_cert', cc.id,
         cc.cert_type, cr.vessel_id, v.name,
         cc.expires_at
  from crew_certs cc
  join crew cr       on cr.id = cc.crew_id
  left join vessels v on v.id = cr.vessel_id
  where cc.expires_at is not null
    and cc.user_id is not null
    and cc.deleted_at is null
) src;

comment on view expiring_items is
  'Union of every row with a renewal date, bucketed into overdue / due7 / due30 / due60 / due90 / valid relative to today. One row per (recipient_user, item).';
-- ▲▲▲ end 0017_reminder_buckets_60_90.sql ▲▲▲


-- ▼▼▼ 0018_support_user_kind.sql ▼▼▼
-- Adds 'support' to the user_kind enum so CodedOK support-team
-- accounts can be routed to the support console (s-support).
--
-- Prior version of this migration tried to drop/re-add a CHECK
-- constraint, which failed with "22P02: invalid input value for
-- enum user_kind" because users.kind is actually an enum type,
-- not a text column with a CHECK.
--
-- Postgres 12+ allows ALTER TYPE ... ADD VALUE to run inside a
-- transaction as long as the new value isn't used in that same
-- transaction. Supabase's SQL editor is fine with this. The
-- IF NOT EXISTS makes the migration idempotent — safe to re-run.

alter type user_kind add value if not exists 'support';

comment on type user_kind is
  'Account roles: operator (skipper), surveyor (marine surveyor), builder (boat builder), admin (Joseph/staff SMS review), support (CodedOK support-team user-management), crew (crew member).';
-- ▲▲▲ end 0018_support_user_kind.sql ▲▲▲


-- ▼▼▼ 0019_support_audit_log.sql ▼▼▼
-- Support-action audit log. Every mutating action taken through the
-- CodedOK support console (password reset, delete, ban, role change,
-- email change, verify, magic link) is recorded here with WHO did it,
-- to WHOM, and WHEN. This is the accountability backbone for the
-- internal admin tool — without it there's no way to answer "who
-- deleted this account?".
--
-- Written only by the admin-user-actions edge function using the
-- service role. No RLS policy grants INSERT to normal clients — the
-- service role bypasses RLS, and we never expose a client-writable
-- path to this table. Support users can READ it through the edge
-- function (which gates on kind), not directly.

create table if not exists public.support_audit_log (
  id            uuid primary key default gen_random_uuid(),
  at            timestamptz not null default now(),
  actor_email   text,                 -- the support agent who acted
  actor_auth_id uuid,                  -- their auth.users id
  action        text not null,        -- e.g. 'set_password', 'delete_user'
  target_email  text,                 -- the customer acted upon
  target_auth_id uuid,                 -- their auth.users id (if applicable)
  details       jsonb default '{}'::jsonb
);

create index if not exists support_audit_log_at_idx
  on public.support_audit_log (at desc);
create index if not exists support_audit_log_target_idx
  on public.support_audit_log (target_email);

-- Lock the table down: enable RLS with NO policies, so only the
-- service role (which bypasses RLS) can touch it. Belt-and-braces —
-- there's no client path to it anyway.
alter table public.support_audit_log enable row level security;

comment on table public.support_audit_log is
  'Immutable-by-convention log of every mutating action taken through the CodedOK support console. Written by the admin-user-actions edge function via the service role.';
-- ▲▲▲ end 0019_support_audit_log.sql ▲▲▲


-- ▼▼▼ 0020_trial_security_gates.sql ▼▼▼
-- ═══════════════════════════════════════════════════════════════
-- Pre-trial security gates. Closes two cross-tenant escalation paths
-- found in the pre-trial security review. BOTH are mandatory before
-- real customer data goes in — each let a self-service signup read
-- and write every other customer's data.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- GATE 1 — nobody but the service role may set/change users.kind.
--
-- Attack it closes: user_metadata.kind is attacker-controlled
-- (anyone can auth.signUp with options.data.kind='admin'). The old
-- "users self update" policy had no WITH CHECK on the kind column,
-- so a user could UPDATE their own row to kind='admin' and then
-- satisfy every "* admin all" policy — full read/write of all orgs.
--
-- This trigger reverts any privileged kind coming from an
-- authenticated/anon caller. Privileged roles are ONLY ever set by
-- the service role: the support-console edge function (which uses
-- the service_role key) or the SQL editor (direct DB, no JWT).
-- ───────────────────────────────────────────────────────────────
create or replace function public.guard_user_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Empty/null for direct SQL (service context); the JWT role claim
  -- for API requests. service_role JWTs carry role='service_role'.
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
begin
  -- Trusted callers (service role, or direct SQL with no JWT) may
  -- set any kind.
  if jwt_role is null or jwt_role = 'service_role' then
    return new;
  end if;

  -- Untrusted callers (authenticated / anon) can never mint a
  -- privileged role, and can never change kind at all client-side.
  if tg_op = 'INSERT' then
    if new.kind in ('admin', 'support') then
      new.kind := 'operator';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.kind is distinct from old.kind then
      new.kind := old.kind;   -- silently revert any client kind change
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_user_kind_trg on public.users;
create trigger guard_user_kind_trg
  before insert or update on public.users
  for each row execute function public.guard_user_kind();

-- ───────────────────────────────────────────────────────────────
-- GATE 2 — you can only self-insert a membership for an org you own
-- OR a brand-new (unclaimed) org you're bootstrapping.
--
-- Attack it closes: the old "memberships self insert" policy only
-- checked that user_id was the caller's own — NOT that the org_id
-- belonged to them. Any authenticated user could
-- INSERT INTO memberships (org_id=<victim>, user_id=self,
-- role='owner') and instantly gain the victim org's vessels, certs,
-- crew, inspections — read and write.
--
-- Legit onboarding still works: a new operator's org has zero
-- memberships at the moment their owner-membership is created
-- (org_is_unclaimed → true). Team members join via accept_invitation
-- (SECURITY DEFINER, which bypasses this policy), never a raw insert.
-- ───────────────────────────────────────────────────────────────
create or replace function public.org_is_unclaimed(p_org text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (select 1 from memberships where org_id = p_org);
$$;

drop policy if exists "memberships self insert" on memberships;
create policy "memberships self insert"
  on memberships for insert
  with check (
    user_id in (select id from current_user_row())
    and (
      org_id in (select current_owner_org_ids())
      or public.org_is_unclaimed(org_id)
    )
  );

comment on function public.guard_user_kind is
  'Reverts any attempt by a non-service-role caller to set/change users.kind to a privileged value. Privileged roles are service-role-only.';
comment on function public.org_is_unclaimed is
  'True if an org has no memberships yet (bootstrap window). Used by the memberships self-insert policy to block joining a populated org.';
-- ▲▲▲ end 0020_trial_security_gates.sql ▲▲▲

