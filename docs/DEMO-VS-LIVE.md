# Demo vs Live — architecture

## The two modes

CodedOK ships in two modes from one codebase. The login screen is the gate.

| Mode | How user enters | Where data lives | What changes |
|---|---|---|---|
| **Demo** | "Try the live demo →" link on login | Browser localStorage | Purple "Demo mode" badge top-left. Resetable. No real account. |
| **Live** | Magic-link email, Apple Sign In, or Google Sign In | Cloud database (Supabase) | Real persistence, multi-device sync, multi-user, billing. |

Both modes share the same UI, the same screens, the same components. The only thing that swaps is the `Store` backend.

## Where the demo "version" lives

In production it's not a separate app — it's the **same** app served at the same URL. The login page always offers a one-tap demo. This lets:
- A skipper try the full product before signing up.
- Joseph demo on stage at a boat show without typing credentials.
- Sales / press / partners see the experience without admin overhead.
- McCollam Marine show the surveyor flow to clients on the spot.

When a demo user clicks "Sign out" or signs up properly, they're moved to a fresh live account — the demo localStorage stays around as a sandbox they can return to anytime.

---

## Production stack — what's actually needed for "live" mode

### 1. Backend: Supabase (locked in BUILD-PLAN)

A managed Postgres + Auth + Storage + Edge Functions stack. Hosted, EU-resident, cheap.

- **Postgres** — relational DB for vessels, certs, crew, equipment, jobs, invoices, etc.
- **Auth** — handles email magic links, Apple Sign In, Google Sign In out of the box. Returns a JWT the app uses on every request.
- **Storage** — buckets per organisation for cert PDFs, equipment photos, signed SMS docs. Files served via signed URLs.
- **Row-Level Security (RLS)** — Postgres rules so an operator can only ever see their own organisation's rows. Enforced in the database, not the app. No way to "forget" to scope a query.
- **Realtime** — when McCollam Marine signs and uploads a cert, the operator's app updates live without refreshing.
- **Edge Functions** — small server-side bits for: PDF generation (`pdf-lib`), Wallet pass signing, push-notification dispatching, Stripe webhooks.

**Cost at launch:** £25/month (Pro plan) — covers up to ~100k monthly active users and daily backups + point-in-time recovery. Free tier covers the first 6 months of beta.

### 2. Auth — what the user sees

The login UI you have now is the production design. It just needs the actions wired:

- **Magic link.** User enters email → Supabase sends a one-time link → click link → JWT in the app → home. No password. Reduces friction massively for skippers who hate password managers.
- **Apple Sign In.** Required by Apple if Google is offered. Returns a verified email + Apple user ID.
- **Google Sign In.** OAuth flow. Useful for surveyors who use Google Workspace.

All three create or look up a user row in `auth.users`. Then we link to our `users` profile row (operator vs surveyor kind, name, etc).

### 3. Database schema (recap from BUILD-PLAN.md)

The schema is already defined and the app's `Store` API matches it shape-for-shape:

```
organizations  ← top-level account ("McLaughlin Charters")
users          ← people (kind: operator | surveyor)
memberships    ← org_id × user_id × role (owner | skipper | crew | viewer)

vessels                   ← per-organisation
certificates              ← per-vessel, with file
crew_members + crew_certificates
equipment + equipment_certificates
deficiencies
inspections
sms_documents
surveyor_grants           ← cross-org access for surveyors
jobs + invoices           ← marketplace
audit_log                 ← every action recorded
handoff_links             ← time-limited read-only QR tokens
```

RLS rules per table — examples:

```sql
-- Operators can only read vessels in orgs they belong to
CREATE POLICY "vessels_select_own_org" ON vessels
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM memberships WHERE user_id = auth.uid()
  ));

-- Surveyors can read vessels they have an active grant on
CREATE POLICY "vessels_select_via_grant" ON vessels
  FOR SELECT USING (id IN (
    SELECT vessel_id FROM surveyor_grants
    WHERE surveyor_user_id = auth.uid() AND revoked_at IS NULL
  ));
```

Multiplied across every table. Once written, the database is the security boundary — no way to leak data through an app bug.

### 4. Files / PDFs

Each organisation gets a Supabase Storage bucket. Cert PDFs and equipment photos go there, not in the database. The DB row stores `file_url` (a signed URL valid for 24 hours) and metadata (size, type, name).

For the inspection-pack PDF: an Edge Function pulls the data, renders with `pdf-lib`, returns a signed URL. The same Edge Function can sign Apple Wallet passes for crew tickets.

### 5. Billing — Stripe

- Stripe Customer per organisation.
- Stripe Products + Prices for the plan tiers (Free / Skipper / Fleet / SMS-add-on).
- Stripe Customer Portal for self-service: change card, download invoices, upgrade/downgrade.
- Stripe Connect for the surveyor marketplace — when an operator pays a surveyor's invoice, Stripe automatically splits the funds (surveyor gets 92%, CodedOK keeps 8%).
- Stripe Webhooks → Edge Function → updates `organizations.plan` field when subscription status changes.

### 6. Email & notifications

- **Resend** for transactional email — magic links, invoice receipts, expiry reminders, McCollam-Marine-delivered-a-cert notifications. EU-resident, cheap (~£0/month for our volumes initially).
- **Push notifications** via Capacitor's plugin + Supabase scheduled function checking `expires_at` columns daily. Skipper gets pinged at 60d, 30d, 14d, 7d, 1d before each cert expiry.

### 7. The native app shell — Capacitor

Wraps this exact codebase as iOS + Android apps from a single source. Capacitor adds:
- Native camera (replaces the file picker on mobile)
- Native push notifications
- Biometric unlock (Face ID / Touch ID on top of the magic-link session)
- Apple Wallet pass downloads
- Native share sheet for the inspection pack PDF

The web version of the app stays available at codedok.com for surveyors and admin.

---

## Migration path: what's needed to go from prototype → live

The prototype is structured so this is mostly mechanical.

1. **Stand up Supabase** — create project (London region), run schema migrations, set up RLS policies, create the storage buckets.
2. **Swap `Store` implementation** — keep the public API of `app/store.js` identical, change the implementation to call Supabase. Every screen keeps working unchanged.
3. **Wire the three auth methods** — replace the four mock functions (`submitLoginEmail`, `mockMagicLinkArrived`, `mockOauthSignIn`, `signOut`) with Supabase calls. The login UI stays exactly as designed.
4. **Wire Stripe** — Customer Portal link from the Account screen, Stripe Connect onboarding for surveyors from the surveyor profile, webhook → plan field.
5. **Wire Resend** — magic links go through Supabase Auth (uses Resend by default with a config swap). Custom emails for the marketplace events.
6. **Capacitor wrap** — `npx cap init`, add iOS + Android, add the camera/push/biometric plugins, build, upload to TestFlight.

None of this requires rewriting screens. The work is plumbing, not UX.

**Estimate:** 2-3 weeks of focused work for a single dev to get from "prototype on localhost" to "first TestFlight build with real auth and a real database".

---

## Cost summary at launch

| Service | Cost | Notes |
|---|---|---|
| Supabase | £25/mo | Pro plan, EU region, daily backups |
| Stripe | 1.5% + 20p / txn | Plus 0.25% Connect fee on marketplace payouts |
| Resend | £0 → £18/mo | Free under 3k emails/month |
| Cloudflare Pages | £0 | Marketing site + web app hosting |
| Cloudflare Email Routing | £0 | support@/joseph@codedok.com → Gmail |
| Sentry | £0 | Free tier covers ≤ 5k events/mo |
| PostHog (EU) | £0 | Free tier covers our first year |
| Apple Developer | £79/yr | Annual |
| Google Play | £20 | One-off |
| Domain (codedok.com + .app + .co.uk) | ~£40/yr | Cloudflare Registrar |

**~£350 first year before customers.** Each paying customer covers all of it after the first ~25 sign-ups.
