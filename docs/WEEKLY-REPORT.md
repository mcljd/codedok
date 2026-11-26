# Weekly launch report

A plain-text email every Monday 07:00 UTC (07:00 in winter, 08:00 in summer)
with waitlist sign-ups, app accounts, security events and AI call counts.
No AI is involved. It only reads.

Pieces:
- `supabase/functions/weekly-report/index.ts` — builds and sends the email
- `supabase/migrations/0032_weekly_report.sql` — the read-only data function and the Monday job

## One-time setup

Do these yourself. Never paste the values into a chat.

1. Make a secret (run on your own computer):

   ```bash
   openssl rand -hex 32
   ```

2. Give it to the function, with the Resend key:

   ```bash
   supabase secrets set WEEKLY_REPORT_SECRET=<the secret> --project-ref zftoqqrqsxctehltebad
   supabase secrets set RESEND_API_KEY=<your Resend key> --project-ref zftoqqrqsxctehltebad
   ```

   No CLI? Supabase dashboard → Edge Functions → Secrets → add both there.

   Optional: `WEEKLY_REPORT_TO` (default `joseph@jdmcl.com`) and
   `RESEND_FROM` (default `CodedOK <reminders@codedok.com>`; the domain must
   be verified in Resend).

3. Give the same secret to the Monday job. Supabase dashboard → SQL Editor:

   ```sql
   select vault.create_secret('<the secret>', 'weekly_report_secret');
   ```

4. Deploy:

   ```bash
   supabase functions deploy weekly-report --no-verify-jwt --project-ref zftoqqrqsxctehltebad
   supabase db push   # applies 0032_weekly_report.sql
   ```

## Run it once by hand

See the report without sending an email:

```bash
curl -X POST 'https://zftoqqrqsxctehltebad.supabase.co/functions/v1/weekly-report?dry_run=1' \
  -H "x-report-secret: $WEEKLY_REPORT_SECRET"
```

Send the real email now:

```bash
curl -X POST 'https://zftoqqrqsxctehltebad.supabase.co/functions/v1/weekly-report' \
  -H "x-report-secret: $WEEKLY_REPORT_SECRET"
```

Without the right header it answers `401`.

## Change or stop the schedule

```sql
select cron.unschedule('codedok-weekly-report');                              -- stop
select jobname, schedule, active from cron.job where jobname = 'codedok-weekly-report';  -- check
```

## What it does not include

Edge function errors. Supabase only exposes function logs through its
management API, which needs an account-wide access token. That is not stored
here on purpose. Check errors in the dashboard under Edge Functions → Logs.
