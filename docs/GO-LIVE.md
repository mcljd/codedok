# Go-live checklist — codedok.com

Code is ready. These are the four dashboard tasks only you can do.
Total time: ~25 minutes. After step 4 the site is live.

---

## 1. Point the domain at Cloudflare (5 min)

Wherever you bought `codedok.com`:

1. Log in to the registrar.
2. Find **Nameservers** for `codedok.com`.
3. Replace with Cloudflare's two nameservers (visible in
   Cloudflare → Add a Site → Free plan → next).
4. Save.

**If you bought it AT Cloudflare:** skip this step entirely — DNS is
already wired up.

Propagation: usually 15-30 minutes, occasionally a few hours.

---

## 2. Attach the domain to the Worker (2 min)

1. Cloudflare → Workers & Pages → **codedok**.
2. **Settings → Domains & Routes → Add Custom Domain.**
3. Add `codedok.com` and click **Add Domain**.
4. Click **Add Custom Domain** again → add `www.codedok.com`.
5. Cloudflare auto-provisions the TLS cert (takes 1-3 minutes).

Test: open https://codedok.com — should show the app.
Open https://codedok.com/welcome — should show the landing.

---

## 3. Email forwarding (3 min)

1. Cloudflare → **Email → Email Routing → Get started**.
2. Cloudflare auto-adds the MX records (one click).
3. Add three custom addresses, all forwarding to your real inbox:
   - `hello@codedok.com` → joseph@…
   - `privacy@codedok.com` → joseph@…
   - `support@codedok.com` → joseph@…
4. Verify your destination address (click the link Cloudflare emails you).

Done — anyone emailing `hello@codedok.com` now lands in your inbox.
You can reply *from* those addresses via Cloudflare's Gmail integration
(optional, in the same Email Routing screen).

---

## 4. Tell Supabase the new URL (3 min)

Magic-link sign-in needs the new domain whitelisted:

1. Supabase → **Authentication → URL Configuration**.
2. **Site URL:** `https://codedok.com`
3. **Redirect URLs** (one per line):
   ```
   https://codedok.com
   https://codedok.com/*
   https://codedok.com/welcome
   https://www.codedok.com
   https://www.codedok.com/*
   ```
4. Save.

Test: sign out, sign back in with a magic link — should land back on
`codedok.com` not `localhost` or the workers.dev URL.

---

## 5. Optional but recommended

### Edge function env vars (for push + email reminders)

In Supabase → **Edge Functions → Secrets**:

| Key                  | Value                                          |
|----------------------|------------------------------------------------|
| `VAPID_SUBJECT`      | `mailto:hello@codedok.com`                     |
| `VAPID_PUBLIC_KEY`   | (generate with `npx web-push generate-vapid-keys`) |
| `VAPID_PRIVATE_KEY`  | (from the same command)                        |
| `RESEND_API_KEY`     | (resend.com dashboard)                         |
| `RESEND_FROM`        | `CodedOK <reminders@codedok.com>`              |

Then verify `codedok.com` as a sender domain in Resend
(adds three DNS records — Cloudflare DNS, one click to apply).

### Search Console (so Google finds you)

1. https://search.google.com/search-console
2. Add property: `https://codedok.com`
3. Verify via Cloudflare TXT record (one click).
4. Submit `https://codedok.com/sitemap.xml`.

You should appear in Google search results within 2-7 days.

---

## Code already updated for you

These were swept in the same commit as this doc:

- All `codedok.app` references → `codedok.com` (emails, PDF footers, FAQ copy).
- `<title>`, `<meta description>`, OG + Twitter tags pointing at `codedok.com`.
- `robots.txt` + `sitemap.xml` at the root (Cloudflare Workers serves them).
- `manifest.webmanifest` `start_url` = `/` (was `./index.html`).
- Service worker cache bumped (`v73`) so the new shell ships immediately.
- Auth redirects use `window.location.origin` — domain-agnostic, nothing to change.

iOS bundle ID `com.codedok.app` was deliberately **not** changed — that's
the App Store identifier, not a website URL. It's reverse-DNS but never resolves.

---

## Failure modes

**"codedok.com still shows registrar parking page"** → nameservers
haven't propagated. Wait 30 min, try again. Use https://dnschecker.org
to see propagation status.

**"Custom domain stuck at 'Initializing'"** → Worker domain still tied
to old `codedok-mark.workers.dev` route. In the Workers settings,
remove the old route, re-add the custom domain.

**"Magic link redirects to localhost"** → Supabase Site URL still set
to dev URL. Step 4 fixes it.

**"www.codedok.com doesn't work"** → forgot to add the `www` custom
domain in step 2. Go add it.
