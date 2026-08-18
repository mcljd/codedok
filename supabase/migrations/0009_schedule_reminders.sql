-- CodedOK — Daily web push reminders.
--
-- Schedules the send-reminders edge function to run every morning at
-- 08:00 UTC (≈ 09:00 BST). Uses Supabase's built-in pg_net to call
-- the function over HTTPS with the project's service-role key, which
-- bypasses RLS so the function can read every user's expiring items.
--
-- Prerequisites:
--   1. Set Vault secret `service_role_key` to the project service-role JWT
--      (Dashboard → Project Settings → API → service_role).
--   2. Set Vault secret `project_url` to https://<ref>.supabase.co
--   3. In Edge Functions → send-reminders → Secrets, add:
--        VAPID_PUBLIC_KEY  — BESwTm9pizzS1pXWoABM-oQH2p0ZN6ZGWGc_IAmFgCn7-ZMnxCnQhGRgiIv039pVWtdlt2TrThY0K_9OXi2q6_Y
--        VAPID_PRIVATE_KEY — <set as an edge-function secret, never commit it>
--        (the private key that was previously here has been ROTATED and
--         scrubbed — see docs/TRIAL-READINESS.md Part A)
--        VAPID_SUBJECT     — mailto:hello@codedok.com  (or your own contact)

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Drop any previous schedule with the same name so this migration is
-- safe to re-run.
do $$
declare
  job_id bigint;
begin
  select jobid into job_id from cron.job where jobname = 'codedok-send-reminders';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end$$;

select cron.schedule(
  'codedok-send-reminders',
  '0 8 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
