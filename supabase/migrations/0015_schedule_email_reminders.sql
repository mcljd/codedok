-- CodedOK — Schedule the email-reminder fallback edge function.
--
-- Runs daily at 08:05 UTC (5 mins after the push job, so push has
-- already inserted its reminder_log rows and we don't double-notify).
-- Requires the Vault secrets project_url + service_role_key set
-- previously for 0009. Edge function secrets needed on send-reminder-emails:
--   RESEND_API_KEY        — get one at https://resend.com
--   RESEND_FROM           — 'CodedOK <reminders@codedok.app>' (verified domain)
--   EMAIL_FALLBACK_ONLY   — 'true' (default) to skip users who already
--                            have a push subscription; 'false' to email
--                            everyone with expiring items.

do $$
declare
  job_id bigint;
begin
  select jobid into job_id from cron.job where jobname = 'codedok-send-reminder-emails';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end$$;

select cron.schedule(
  'codedok-send-reminder-emails',
  '5 8 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-reminder-emails',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
