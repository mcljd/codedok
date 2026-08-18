# CodedOK — Trial Readiness Pack

Everything needed to hand CodedOK to a company for a supervised trial.
Three parts:

- **Part A** — Deploy checklist (what *you*, the operator, must do first)
- **Part B** — Verification walkthrough (prove it works before you send it)
- **Part C** — Welcome note you can copy-paste to the trial company
- **Part D** — Known limitations to be upfront about

---

## Part A — Pre-trial deploy checklist

Do these in order in the [Supabase dashboard](https://supabase.com/dashboard)
for project `zftoqqrqsxctehltebad`. Tick each off.

### A0. SECURITY — mandatory before real data (do these FIRST)

A pre-trial security review found two cross-tenant escalation paths and one
committed secret. All three are addressed in code, but **two require action
from you**:

- [ ] **Apply migration `0020_trial_security_gates.sql`** — this is the real
      server-side fix for both escalation paths (a trigger that stops anyone
      minting themselves an admin role, and a policy that stops anyone joining
      another company's org). The app will NOT be safe for multi-company data
      without it.
- [ ] **Rotate the VAPID keypair.** A private push key was committed to git
      history. Generate a new keypair (`npx web-push generate-vapid-keys`),
      update `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in the edge-function
      secrets AND the public key constant in `app.js`, and consider the old
      key burned. (Push reminders are optional for the trial — if you're not
      using push yet, you can skip push entirely and rotate later, but do NOT
      ship the old key.)

### A1. Apply all database migrations

The app ships 19 migrations in `supabase/migrations/`. If your project is
already live they're mostly applied — but the recent ones almost certainly
are **not**. Run these in the **SQL Editor** (each is idempotent / safe to
re-run):

- [ ] `0017_reminder_buckets_60_90.sql` — adds 60/90-day reminder windows
- [ ] `0018_support_user_kind.sql` — adds the `support` account role
- [ ] `0019_support_audit_log.sql` — support-action audit table
- [ ] `0020_trial_security_gates.sql` — **the security fix from A0**

Quickest check that the schema is current:

```sql
-- should list: operator, surveyor, builder, admin, crew, support
select unnest(enum_range(null::user_kind));
-- should return a row (table exists)
select count(*) from public.support_audit_log;
-- should show reminder buckets incl due60/due90
select distinct bucket from expiring_items;
```

### A2. Deploy the edge functions

Five functions live in `supabase/functions/`. **Edge Functions → Deploy a
new function** for any that aren't already live, name each EXACTLY as its
folder:

- [ ] `extract-cert` — AI certificate scanning (the headline feature)
- [ ] `generate-sms` — Safety Management System builder
- [ ] `send-reminders` — push expiry reminders (cron)
- [ ] `send-reminder-emails` — email expiry reminders (cron)
- [ ] `admin-user-actions` — support console backend

Then confirm the secrets each needs are set under **Edge Functions →
Secrets** (most are defaults):

- [ ] `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (default)
- [ ] `ANTHROPIC_API_KEY` — required for `extract-cert` and `generate-sms`
- [ ] `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — for push reminders
- [ ] `RESEND_API_KEY` — for email reminders (optional for trial)

### A3. Supabase Auth configuration

**Authentication → URL Configuration:**

- [ ] Site URL: `https://app.codedok.com`
- [ ] Redirect URLs include: `https://app.codedok.com/*`, `https://mobile.codedok.com/*`,
      `https://codedok.com/*`
- [ ] **Confirm email** enabled (Authentication → Providers → Email) so new
      trial users verify their address
- [ ] Consider enabling **rate limits** at the default level

### A4. Verify the domains resolve

- [ ] `https://codedok.com` → landing page loads
- [ ] `https://app.codedok.com` → sign-in screen loads
- [ ] `https://demo.codedok.com` → auto-seeded demo loads

### A5. Confirm the support inboxes exist

The app references these addresses. Make sure mail to each actually reaches
you (Cloudflare Email Routing is free):

- [ ] `hello@codedok.com` — general contact
- [ ] `privacy@codedok.com` — data requests (named in the privacy policy)
- [ ] `support@codedok.com` — used for the support account

---

## Part B — Verification walkthrough (10 minutes)

Do this on a fresh browser / incognito window before sending anything.

1. **Landing** — open `codedok.com`. Scrolls top to bottom, no broken images,
   nav links work.
2. **Sign up** — on `app.codedok.com`, create a brand-new test account with an
   email you control. You should get a verification email; confirm it.
3. **First run** — after sign-in you should see the guided tour, then land on
   an *empty* Home (no fake vessels). Add a vessel through onboarding.
4. **Scan a cert** — from the vessel, tap "Take a photo" / upload a PDF of any
   certificate. The AI should extract issuer/expiry (this proves `extract-cert`
   is deployed with `ANTHROPIC_API_KEY`).
5. **Records + Calendar** — the cert appears in Records; the Compliance
   calendar shows its expiry on the right month.
6. **Invite a surveyor** — send an invite to a second email; confirm the link
   works and the surveyor lands on their own view.
7. **Delete the test account** — Account → Delete account, so the trial
   company starts from clean data.

If any step fails, fix before sending. If step 4 fails specifically, it's
almost always the `ANTHROPIC_API_KEY` secret missing on the edge function.

---

## Part C — Welcome note for the trial company

> **Subject: Your CodedOK trial is ready**
>
> Hi [name],
>
> Thanks for trialling CodedOK — the compliance app for UK & Irish coded
> vessels. Here's everything to get started.
>
> **Get in:** go to **app.codedok.com** and tap *Start free*. Sign up with
> your work email; you'll get a verification link to confirm.
>
> **First 10 minutes:**
> 1. Add your first boat — we'll ask its category and use, then load the
>    certificate and equipment list the Code expects for it.
> 2. Photograph a certificate — coding cert, insurance, liferaft service.
>    We read the issuer, expiry and serial automatically. No typing.
> 3. Check the Compliance calendar — every renewal date, laid out by month,
>    with reminders at 90/60/30/7 days before anything lapses.
> 4. Invite your surveyor — free for them, they sign off inside the app.
>
> **Want to look before you commit?** There's a no-signup demo at
> **demo.codedok.com** with a sample fleet already loaded.
>
> **During the trial:** it's free, no card. Tell us what's confusing, what's
> missing, and what you'd want before you'd pay for it — that's the whole
> point of the trial.
>
> **Anything at all:** reply to this email or contact hello@codedok.com.
>
> [your name] · CodedOK

---

## Part D — Known limitations (be upfront during the trial)

Fine for a supervised trial; worth being transparent about. None block the
trial once Part A is done.

- **Some deep tabs are still being built.** AI gap analysis, the standalone
  survey history, jurisdiction dashboard, deficiency log and export packs
  show a clean "in progress" placeholder for real accounts. Everything a
  trial operator needs lives in **Records**, the **Compliance calendar**, and
  the per-vessel screens. (The demo at demo.codedok.com still shows these as
  sales mockups.)
- **In-app payments are not switched on.** Surveyor quotes and the SMS
  builder are free during the trial — accepting a quote records it and
  notifies the surveyor, but no card is charged. Clearly labelled in the UI.
- **Per-vessel team permissions are UI-level only.** A team member scoped to
  one boat won't *see* others in the app, but the tier isn't yet enforced at
  the database layer — so it protects against accident, not a determined
  insider with API access. Fine if the trial company trusts its own staff;
  flagged as a hardening follow-up.
- **Legal pages need a solicitor sign-off before general availability.** The
  in-app Terms and Privacy Policy are written to be reasonable and GDPR-aware
  for a supervised trial, but have not been reviewed by a UK/IE solicitor.
  Get them reviewed before you charge customers or scale beyond the trial.
- **A few error messages are still technical.** Customer-facing flows (sign
  in, adding vessels, inviting a surveyor, saving) now show plain-English
  errors; some deeper/admin paths may still surface a raw message. Report any
  you see and they'll be smoothed.

---

## Readiness verdict

**Ready for a supervised single-company trial once Part A (especially A0) is
done.** The core loop — sign up → add a vessel → scan a certificate → see
gaps on the calendar → invite a surveyor → generate an SMS — works end to
end. The data model is sound (every customer table has row-level security),
and the two escalation paths found in review are closed by migration 0020.

**Do not skip A0.** Without migration 0020 applied, one trial company could
reach another's data — that's the one hard stop.
