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
