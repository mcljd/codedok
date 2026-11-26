-- CodedOK — weekly launch report.
--
-- 1. weekly_report_data(): the numbers for the report. SELECT only, marked
--    STABLE so Postgres itself refuses any write inside it. Callable by the
--    service role only.
-- 2. A cron job every Monday 07:00 UTC that calls the weekly-report edge
--    function. pg_cron runs in UTC: that is 07:00 in winter (GMT) and 08:00
--    in summer (BST).
--
-- The cron job authenticates with a shared secret read from Supabase Vault
-- at run time, so the secret is never written in this file or in cron.job.
-- Create it once, by hand, in the SQL editor (see docs/WEEKLY-REPORT.md):
--   select vault.create_secret('<the secret>', 'weekly_report_secret');
-- Until it exists the job still runs but the function answers 401.
--
-- Idempotent — safe to re-run.

create or replace function public.weekly_report_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with b as (
    select now() as t1, now() - interval '7 days' as t0, now() - interval '14 days' as tp
  )
  select jsonb_build_object(
    'generated_at', b.t1,
    'week_start',   b.t0,
    'waitlist', jsonb_build_object(
      'this_week', (select count(*) from public.waitlist w where w.created_at >= b.t0),
      'last_week', (select count(*) from public.waitlist w where w.created_at >= b.tp and w.created_at < b.t0),
      'total',     (select count(*) from public.waitlist),
      'consented_total',    (select count(*) from public.waitlist w where w.marketing_consent),
      'referred_this_week', (select count(*) from public.waitlist w where w.created_at >= b.t0 and w.referred_by is not null),
      'by_source', coalesce((
        select jsonb_agg(jsonb_build_object('source', x.s, 'count', x.n) order by x.n desc, x.s)
        from (select coalesce(nullif(btrim(w.utm_source), ''), 'direct or unknown') as s, count(*) as n
              from public.waitlist w where w.created_at >= b.t0 group by 1) x), '[]'::jsonb),
      'by_campaign', coalesce((
        select jsonb_agg(jsonb_build_object('campaign', x.c, 'count', x.n) order by x.n desc, x.c)
        from (select btrim(w.utm_campaign) as c, count(*) as n
              from public.waitlist w
              where w.created_at >= b.t0 and nullif(btrim(w.utm_campaign), '') is not null group by 1) x), '[]'::jsonb)
    ),
    'accounts', jsonb_build_object(
      'this_week', (select count(*) from auth.users u where u.created_at >= b.t0),
      'last_week', (select count(*) from auth.users u where u.created_at >= b.tp and u.created_at < b.t0),
      'total',     (select count(*) from auth.users),
      'boats_this_week', (select count(*) from public.vessels v where v.created_at >= b.t0 and v.deleted_at is null),
      'boats_total',     (select count(*) from public.vessels v where v.deleted_at is null)
    ),
    'security_events', coalesce((
      select jsonb_agg(jsonb_build_object('kind', x.kind, 'count', x.n) order by x.n desc, x.kind)
      from (select e.kind, count(*) as n from public.security_events e
            where e.at >= b.t0 and e.kind <> 'test_event' group by e.kind) x), '[]'::jsonb),
    'ai_calls', coalesce((
      select jsonb_object_agg(x.fn, x.n)
      from (select l.fn, count(*) as n from public.ai_usage_log l where l.at >= b.t0 group by l.fn) x), '{}'::jsonb)
  )
  from b;
$$;

revoke all on function public.weekly_report_data() from public, anon, authenticated;
grant execute on function public.weekly_report_data() to service_role;

do $$ begin
  if not exists (select 1 from cron.job where jobname = 'codedok-weekly-report') then
    perform cron.schedule(
      'codedok-weekly-report',
      '0 7 * * 1',
      $job$
      select net.http_post(
        url := 'https://zftoqqrqsxctehltebad.supabase.co/functions/v1/weekly-report',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-report-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'weekly_report_secret' limit 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
      $job$
    );
  end if;
end $$;
