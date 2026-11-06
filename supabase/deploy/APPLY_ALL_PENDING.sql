-- ═══════════════════════════════════════════════════════════════
-- CodedOK — APPLY ALL pending migrations (0017 → 0024)
-- Paste this whole file into the Supabase SQL Editor and click Run.
-- All statements are idempotent — safe to run more than once.
-- Generated from supabase/migrations/0017–0024.
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

  -- Crew certs → every member of the crew member's org. crew_certs keys
  -- to crew via person_id (no crew_id / user_id / cert_type column);
  -- crew belongs to an org, not one vessel, so vessel columns are null.
  select m.user_id, 'crew_cert', cc.id,
         cr.name || ' — ' || cc.name, null::text, null::text,
         cc.expires_at
  from crew_certs cc
  join crew cr         on cr.id = cc.person_id
  join memberships m   on m.org_id = cr.org_id
  where cc.expires_at is not null and cc.deleted_at is null

  union all

  -- Surveyor grants → the surveyor themselves (they need to renew access).
  select sg.surveyor_user_id, 'grant', sg.id,
         'Surveyor access', sg.vessel_id, v.name,
         sg.expires_at
  from surveyor_grants sg
  join vessels v       on v.id = sg.vessel_id
  where sg.expires_at is not null and sg.revoked_at is null

  union all

  -- SMS review due → every member of the owning org.
  select m.user_id, 'sms_review', sd.id,
         coalesce(sd.title, 'SMS review'), sd.vessel_id, v.name,
         sd.review_due_at
  from sms_documents sd
  join vessels v       on v.id = sd.vessel_id
  join memberships m   on m.org_id = sd.org_id
  where sd.review_due_at is not null and sd.deleted_at is null
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



-- ▼▼▼ 0021_cert_issued_extraction.sql ▼▼▼
-- Adds cert/equipment columns the client captures but had no column for
-- (issue date + AI extraction audit blob). Idempotent.
alter table certs     add column if not exists issued_at  date;
alter table certs     add column if not exists extraction jsonb;
alter table equipment add column if not exists extraction jsonb;

comment on column certs.extraction is
  'AI extraction + human-override audit for certs added via the vision scanner. {raw, saved, overrides, confidence, receivedAt}.';
comment on column equipment.extraction is
  'AI extraction + human-override audit for equipment added via the vision scanner.';
-- ▲▲▲ end 0021_cert_issued_extraction.sql ▲▲▲


-- ▼▼▼ 0022_ai_usage_rate_limit.sql ▼▼▼
-- Per-user rate-limit counter for the paid AI endpoints. Service-role
-- write only (RLS on, no policies). Idempotent.
create table if not exists public.ai_usage_log (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  fn           text not null,
  at           timestamptz not null default now()
);

create index if not exists ai_usage_log_lookup
  on public.ai_usage_log (auth_user_id, fn, at desc);

alter table public.ai_usage_log enable row level security;

comment on table public.ai_usage_log is
  'One row per paid-AI-endpoint call, keyed by auth user. Backs the per-user daily rate limit in extract-cert / generate-sms. Service-role write only.';
-- ▲▲▲ end 0022_ai_usage_rate_limit.sql ▲▲▲


-- ▼▼▼ 0023_native_push_tokens.sql ▼▼▼
-- Native iOS/Android push device tokens (APNs/FCM). Web push uses
-- push_subscriptions; native tokens live here. send-reminders fans out to
-- both. RLS: users manage only their own rows; the edge function reads all
-- via the service role. Idempotent.
create table if not exists device_push_tokens (
  id           text primary key,
  user_id      text not null references users(id) on delete cascade,
  platform     text not null default 'ios'
               check (platform in ('ios', 'android')),
  token        text not null,
  environment  text not null default 'prod'
               check (environment in ('prod', 'sandbox')),
  app_version  text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists device_push_tokens_token_uq
  on device_push_tokens(token);
create index if not exists device_push_tokens_user_idx
  on device_push_tokens(user_id);

alter table device_push_tokens enable row level security;

drop policy if exists "device_push_tokens self all" on device_push_tokens;
create policy "device_push_tokens self all"
  on device_push_tokens for all
  using (user_id in (select id from current_user_row()))
  with check (user_id in (select id from current_user_row()));
-- ▲▲▲ end 0023_native_push_tokens.sql ▲▲▲


-- ▼▼▼ 0024_founding_waitlist.sql ▼▼▼
-- CodedOK — pre-launch "founding list" (App Store waitlist) with referrals.
--
-- The public /founding page calls two RPCs with the anon key. The table
-- itself has RLS on and NO policies, so nobody can read or write it
-- directly from the browser — only through these functions, which only
-- ever return the caller's own referral code, place and referral count
-- (plus a public total for social proof). Read the list yourself in the
-- Supabase table editor or SQL editor (service role bypasses RLS).
--
-- Idempotent — safe to re-run.

create table if not exists public.waitlist (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  email_lc          text generated always as (lower(btrim(email))) stored,
  ref_code          text not null unique,          -- public: goes in their share link
  edit_token        uuid not null default gen_random_uuid(), -- private: lets the page save step-2 answers
  referred_by       text,                          -- ref_code of whoever sent them
  role              text,
  boat_count        text,
  region            text,
  marketing_consent boolean not null default false,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  utm_content       text,
  utm_term          text,
  fbclid            text,
  landing_path      text,
  created_at        timestamptz not null default now()
);

create unique index if not exists waitlist_email_lc_uq on public.waitlist (email_lc);
create index if not exists waitlist_referred_by_idx on public.waitlist (referred_by);
create index if not exists waitlist_created_idx on public.waitlist (created_at);

alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;

-- Place in the queue: signups ahead of you, minus 10 places per referral.
create or replace function public.waitlist_place(p_id uuid)
returns table (place int, referrals int)
language sql stable security definer set search_path = public as $$
  with me as (select id, created_at, ref_code from waitlist where id = p_id),
       refs as (select count(*)::int n from waitlist w, me where w.referred_by = me.ref_code)
  select greatest(1, (select count(*) from waitlist w, me where w.created_at < me.created_at)::int + 1 - refs.n * 10),
         refs.n
  from refs;
$$;
revoke all on function public.waitlist_place(uuid) from public, anon, authenticated;

create or replace function public.join_waitlist(
  p_email    text,
  p_ref      text    default null,
  p_consent  boolean default false,
  p_utm      jsonb   default '{}'::jsonb,
  p_fbclid   text    default null,
  p_path     text    default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_row   waitlist%rowtype;
  v_code  text;
  v_place int;
  v_refs  int;
  v_new   boolean := false;
begin
  if length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  select * into v_row from waitlist where email_lc = v_email;

  if not found then
    loop
      v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
      exit when not exists (select 1 from waitlist where ref_code = v_code);
    end loop;

    insert into waitlist (email, ref_code, referred_by, marketing_consent,
                          utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                          fbclid, landing_path)
    values (
      v_email, v_code,
      -- Only credit a real, existing code (and never yourself).
      (select ref_code from waitlist where ref_code = upper(left(btrim(coalesce(p_ref, '')), 12))),
      coalesce(p_consent, false),
      left(p_utm->>'utm_source', 100), left(p_utm->>'utm_medium', 100),
      left(p_utm->>'utm_campaign', 150), left(p_utm->>'utm_content', 150),
      left(p_utm->>'utm_term', 150),
      left(p_fbclid, 500), left(p_path, 200)
    )
    on conflict (email_lc) do nothing
    returning * into v_row;

    if v_row.id is null then  -- lost a race with an identical signup
      select * into v_row from waitlist where email_lc = v_email;
    else
      v_new := true;
    end if;
  elsif p_consent and not v_row.marketing_consent then
    update waitlist set marketing_consent = true where id = v_row.id;
  end if;

  select place, referrals into v_place, v_refs from waitlist_place(v_row.id);

  return jsonb_build_object(
    'ok', true,
    'already', not v_new,
    'ref_code', v_row.ref_code,
    -- Only a brand-new signup gets the private token for the optional
    -- "tell us about your boats" step.
    'edit_token', case when v_new then v_row.edit_token::text end,
    'place', v_place,
    'referrals', v_refs
  );
end;
$$;

create or replace function public.update_waitlist_profile(
  p_token      uuid,
  p_role       text default null,
  p_boat_count text default null,
  p_region     text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update waitlist set
    role       = coalesce(left(p_role, 60), role),
    boat_count = coalesce(left(p_boat_count, 20), boat_count),
    region     = coalesce(left(p_region, 60), region)
  where edit_token = p_token;
  return jsonb_build_object('ok', found);
end;
$$;

-- Public total, for "Join N skippers already on the list".
create or replace function public.waitlist_total()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from waitlist;
$$;

revoke all on function public.join_waitlist(text, text, boolean, jsonb, text, text) from public;
revoke all on function public.update_waitlist_profile(uuid, text, text, text) from public;
revoke all on function public.waitlist_total() from public;
grant execute on function public.join_waitlist(text, text, boolean, jsonb, text, text) to anon, authenticated;
grant execute on function public.update_waitlist_profile(uuid, text, text, text) to anon, authenticated;
grant execute on function public.waitlist_total() to anon, authenticated;

comment on table public.waitlist is
  'Pre-launch founding list from /founding. RLS on, no policies: browser access only via join_waitlist / update_waitlist_profile / waitlist_total.';
-- ▲▲▲ end 0024_founding_waitlist.sql ▲▲▲
