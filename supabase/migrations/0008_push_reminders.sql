-- CodedOK — Web push reminders.
--
-- Adds:
--   1. push_subscriptions  — one row per device a user has opted in on
--   2. reminder_log        — dedupe: don't re-notify the same item in the
--                            same bucket inside the same window
--   3. expiring_items view — UNION over every table with a renewal date,
--                            already joined to the recipient user_id so the
--                            edge function can SELECT … and fan out
--
-- Mirrors the client-side bucket formula in app/store.js:254:
--   < today      → overdue
--   ≤ +7 days    → due7
--   ≤ +30 days   → due30
--   else         → valid (not emitted)

-- ============================================================
-- push_subscriptions
-- ============================================================

create table if not exists push_subscriptions (
  id          text primary key,
  user_id     text not null references users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists push_subs_endpoint_uq on push_subscriptions(endpoint);
create index if not exists push_subs_user_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "push_subs self all" on push_subscriptions;
create policy "push_subs self all"
  on push_subscriptions for all
  using (user_id in (select id from current_user_row()))
  with check (user_id in (select id from current_user_row()));

-- ============================================================
-- reminder_log — one row per (recipient, item, bucket) we've notified about.
-- The unique key is what prevents repeat pushes for the same expiry.
-- When an item's bucket changes (e.g. due30 → due7) we'll add a new row,
-- so each escalation gets one notification.
-- ============================================================

create table if not exists reminder_log (
  id            bigserial primary key,
  user_id       text not null references users(id) on delete cascade,
  item_kind     text not null,
  item_id       text not null,
  bucket        text not null,
  sent_at       timestamptz not null default now()
);

create unique index if not exists reminder_log_dedupe_uq
  on reminder_log(user_id, item_kind, item_id, bucket);
create index if not exists reminder_log_user_idx on reminder_log(user_id);

alter table reminder_log enable row level security;

drop policy if exists "reminder_log self read" on reminder_log;
create policy "reminder_log self read"
  on reminder_log for select
  using (user_id in (select id from current_user_row()));

-- The edge function writes via the service-role key, which bypasses RLS,
-- so no insert policy is needed for it. No client-side writes.

-- ============================================================
-- expiring_items view — every row that has a date worth nudging about,
-- already attributed to a recipient user. Filtered to bucket != 'valid'.
-- ============================================================

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

  -- Crew certs → every member of the crew member's org.
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
) e
where expires_at <= current_date + 30;

comment on view expiring_items is
  'Cross-table rollup of every expiry/renewal date, attributed to the user_id we should notify. Filtered to <= 30 days out.';
