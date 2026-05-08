# CodedOK v1 — Build Plan

Goal: ship a paid iOS + Android app that the App Store featuring team would notice, that beats Sea-Flux on the experience a UK/IE coded-boat skipper has on their phone, with a clear premium SMS add-on, and a free surveyor seat that doubles as a viral loop.

Brand spelling: **CodedOK** (one word, lowercase d, capital OK). Bundle ID: `com.codedok.app`.

Target launch: **TestFlight in 6 weeks, public on App Store + Play in 10 weeks**. Early customer pipeline via McCollam Marine.

---

## 1. Architecture

### Repo layout (monorepo, pnpm workspaces)

```
/apps
  /app          Capacitor app — iOS, Android, web (the product)
  /marketing    Astro site (codedok.com — pricing, login, blog)
  /functions    Supabase edge functions (PDF, notifications, Wallet, Stripe webhooks)
/packages
  /core         Types, Supabase client, Store API, business rules
  /ui           Shared components (button, sheet, row, etc.)
  /codes        UK Workboat Code Ed 3 + Sport/Pleasure Code 2025 — structured cert/equipment schedules (the moat)
```

### Frontend stack — final calls

- **Preact + Signals + TypeScript + Vite.** Senior call: vanilla JS is going to bite once we add forms, realtime, multi-step wizards, Stripe Checkout, file uploads. Preact is React-shaped at 3kb, signals are a saner state model than Redux/Zustand for this app size, TypeScript catches whole classes of bugs in a solo codebase. Vite is the build tool.
- **Keep the existing CSS as-is.** The design system in `style.css` is good. Move to per-component CSS files but do not Tailwind-rewrite — that's months for no gain.
- **Capacitor 6** for the native shell. iOS + Android from one codebase, plus the same code runs as a web app for surveyors and admin.
- **Service worker stays** — offline first remains a core differentiator.

### Backend stack — final calls

- **Supabase, EU-West (London) region.** Postgres + Auth + Storage + Realtime + Edge Functions + scheduled jobs. Row-level security per organisation. Buy the £25/mo Pro plan from day one for daily backups + PITR.
- **Stripe** for billing (Checkout + Customer Portal + webhooks). **Web-first signup** — the marketing site is the entry point, payment happens there, app sees an active subscription on login. This is the cleanest way around Apple's IAP rules for a B2B service tool.
- **Resend** for transactional email (magic links, expiry reminders, invites). EU-residency, dev-friendly, cheap.
- **PostHog (EU cloud)** for analytics, **Sentry** for errors. Both free at this scale.
- **Cloudflare Pages** for the marketing site. **Cloudflare Email Routing** for support@/joseph@codedok.com → Gmail (free, beats Google Workspace's £5/seat until you actually need shared inboxes).

### Native bridges (Capacitor plugins)

| Capability | Plugin / approach |
|---|---|
| Camera | `@capacitor/camera` |
| Cert OCR | Apple VisionKit (iOS) + Google ML Kit (Android), both on-device. Tesseract.js as web fallback. **Pay nothing per scan, no PII to a third-party.** |
| Push notifications | `@capacitor/push-notifications` + scheduled Supabase edge function dispatching daily |
| Biometric unlock | `@aparajita/capacitor-biometric-auth` |
| Apple Wallet pass | Self-signed `.pkpass` from a Supabase edge function (Apple PassKit cert required, ~$99/yr inside Developer Program) |
| Google Wallet pass | Google Wallet API, JWT-signed |
| Share sheet (inspection pack PDF) | `@capacitor/share` |
| File picker (cert upload) | `@capacitor/filesystem` + `@capacitor/file-picker` |
| Deep links (`codedok://vessel/123`) | `@capacitor/app` URL handler |
| Haptics | `@capacitor/haptics` |

### PDF generation

`pdf-lib` inside a Supabase edge function. Templates kept in `packages/core` so the same renderer works server-side and (future) on a desktop app. Signed URLs for download, 24-hour expiry.

### Auth

- **Email magic link** (passwordless) — primary.
- **Sign in with Apple** — required by Apple if Google is offered.
- **Sign in with Google** — for surveyors who use Workspace.
- **Multi-user per org** with roles: `owner | skipper | crew | viewer`.
- **Surveyor accounts are separate sign-ups** with cross-org access (see §9).

### Why not native rewrite

I considered it. React Native or SwiftUI would give us 5% extra polish on iOS. The cost: 8-12 weeks rebuild, single platform, and we lose the surveyor desktop use case. Capacitor + a good design system gets us 95% of native feel with 1 codebase across iOS, Android, *and* desktop browser — which the surveyor module needs anyway.

---

## 2. Data model

```
organizations          (id, name, plan, stripe_customer_id, trial_ends_at, created_at)
users                  (id, email, name, kind: operator | surveyor, created_at)
memberships            (org_id, user_id, role: owner | skipper | crew | viewer)

vessels                (id, org_id, name, type, mca_category, length_m,
                        flag, ssr, port, certifier, jurisdictions[], icon)

certificates           (id, vessel_id, kind, name, issuer, number,
                        issued_at, expires_at, file_url, category,
                        issued_by_user_id)  -- surveyor who signed it

crew_members           (id, org_id, name, role, photo_url)
crew_vessel_assign     (crew_id, vessel_id, primary)
crew_certificates      (id, crew_id, name, issuer, expires_at, file_url)

equipment              (id, vessel_id, kind, make, model, serial,
                        installed_at, last_service_at, next_service_at,
                        photo_url, notes)
equipment_certificates (id, equipment_id, name, expires_at, file_url)

deficiencies           (id, vessel_id, title, severity, status,
                        raised_at, resolved_at,
                        source: self | surveyor,
                        raised_by_user_id, resolved_by_user_id)

sms_documents          (id, org_id, vessel_id, type, version,
                        file_url, status: draft | review | signed,
                        built_by_codedok: bool, last_reviewed_at)

inspection_packs       (id, vessel_id, generated_at, generated_by_user_id, file_url)

-- Surveyor module
surveyor_profiles      (user_id, qualifications[], certifying_bodies[],
                        regions[], company_name, phone, public_listing: bool)
surveyor_grants        (id, vessel_id, surveyor_user_id, granted_by_user_id,
                        granted_at, expires_at, scopes[]: view | deficiency | inspect | issue_cert,
                        revoked_at)
inspections            (id, vessel_id, surveyor_user_id, started_at,
                        completed_at, signed_pdf_url, status: in_progress | signed)

audit_log              (id, org_id, actor_user_id, action, target_type,
                        target_id, metadata jsonb, at)
```

Row-level security:
- Operator data scoped to `org_id` via memberships.
- Surveyor data accessed via `surveyor_grants` (a surveyor can read a vessel only if a non-revoked grant exists).
- Audit log writeable by triggers, readable by org owners + surveyors (their actions).

---

## 3. Pricing model

Public, on the marketing page. Sea-Flux hides theirs — we publish.

| Tier | Price | Includes |
|---|---|---|
| **Free** | £0 | 1 vessel, 5 crew, 25 cert slots, push reminders. No PDF pack export, no SMS, no Wallet. |
| **Skipper** | **£14/mo** or **£140/yr** per vessel (2 months free annual) | All features. Push + email reminders, PDF inspection pack, Wallet passes, equipment tracking, surveyor invites, crew hand-off QR. |
| **Skipper + SMS** | **+ £395 one-off SMS build + £12/mo SMS hosting** | Skipper tier plus a bespoke SMS Joseph builds for the operator. Version-controlled in-app, annual review reminder. |
| **Fleet** | from **£49/mo** (3 vessels), then **£9/mo** each extra | Skipper across multiple vessels, multi-user with roles, full audit log, bulk inspection-pack export. |
| **Surveyor** | **£0** | Cross-org access to vessels they've been granted on. Free forever — surveyors are a referral channel. |

**Trial:** 14 days no-card on Skipper tier; downgrades to Free if not converted.

**Billing:** Stripe Checkout for sign-up, Customer Portal for self-service. Web-first signup; the iOS/Android app sees an active sub on login. Avoids Apple's 15-30% IAP cut and keeps cross-platform pricing identical. Apple's StoreKit External Purchase Link Entitlement (or just listing CodedOK as a B2B service tool) handles this cleanly.

---

## 4. Roadmap

### Phase 1 — Cloud & Native (weeks 1-4)
**Goal:** existing app, on iOS/Android, with a real backend and one new account on a real device.

- Supabase project, auth, schema as above
- Migrate `Store` to Supabase (keep API shape identical)
- Capacitor wrap, native shell, iOS/Android target
- Apple Developer + Play Console accounts set up
- Apple Sign-In, biometric unlock
- Push notifications wired (60/30/14/7/1 day expiry triggers)
- Onboarding redesign: 3 taps + skip, scan-first flow primary
- TestFlight build with Joseph + 5 friendly skippers

### Phase 2 — Polish & Differentiators (weeks 5-8)
**Goal:** the things Sea-Flux can't say they have.

- **Equipment as first-class** (new screens, photos, service log, certs)
- **One-tap inspection pack** PDF (server-side render, share sheet)
- **Apple Wallet / Google Wallet** for crew tickets
- **Skipper hand-off QR** — read-only time-limited link
- Public marketing site with live pricing (build into existing landing page)
- Stripe billing + Customer Portal
- App Store screenshots, preview video, listing copy

### Phase 3 — SMS Premium & Launch (weeks 9-10)
**Goal:** revenue.

- SMS module redesign — guided builder UI for Joseph + client
- Templates: Risk Assessment, Muster List, Drill Schedule, Emergency Contacts, Permit-to-Work, Toolbox-Talks
- Versioning, "review with Joseph" workflow
- Annual review reminders
- Submit to App Store + Play
- Press: Practical Boat Owner, MBM, Coastal Trade News, RYA — one-line pitch is ready

### Phase 4 — Stickiness (post-launch)
- Digital logbook (passenger lists, fuel, hours)
- Maintenance scheduler with parts inventory
- Yard / surveyor portal (paid seat for surveyors who want to view their clients' packs)
- Hours of rest module
- Multi-language (Irish-Gaelic, French for Channel ops)

---

## 5. UX bar — what "App Store featured quality" means here

Hold every screen against these:

1. **First action under 3 seconds.** No splash logos longer than the system requires.
2. **Scan, don't type.** Every input that *can* be photographed is offered as a scan first.
3. **One screen one verb.** Don't pile actions; if a screen does two things, split it.
4. **Empty states sell.** Empty home: explain the value + one big button. Don't show fake data.
5. **Haptics on every commit.** Saving a cert, completing onboarding, ticking a deficiency.
6. **Dark mode parity.** The app works on the bridge at night.
7. **Loading is instant or it's a skeleton, never a spinner.**
8. **Offline is default.** "Last synced 2m ago" — never "no connection" errors.
9. **Animations <240ms, with cubic-bezier(.32,.72,0,1).** Already in the CSS.
10. **One status colour per row.** Green / Amber / Red — never two on one element.

---

## 6. App Store submission specifics

### iOS
- Apple Developer Program: **$99/yr**. Set up first — ID verification can take a week.
- Bundle ID: `com.codedok.app`
- Categories: **Productivity** primary, **Business** secondary
- Age rating: 4+
- Privacy nutrition labels: location (optional, port detection), photos (cert capture), camera (scan), email (auth)
- Permissions strings written for: camera (`"To scan certificates so you don't have to type them"`), notifications (`"To remind you before certificates expire"`), photos (`"To attach a photo of your cert"`)
- Screenshots: 6.7" iPhone (required), 6.1" iPhone (required), 5.5" iPhone (required), 12.9" iPad (required if iPad-supported). 3-10 screenshots each.
- Preview video: 15-30 seconds, scan flow + inspection pack PDF.
- Privacy policy URL + support URL — both live on `codedok.com`.
- Sign in with Apple required if Google sign-in offered.

### Google Play
- Play Console: **$25 one-off**.
- Data safety form (similar to App Store nutrition labels).
- Same screenshots, less strict on dimensions.
- App bundle (`.aab`) not APK.

### Both
- Privacy policy + Terms of Service drafted and on website *before* submission.
- Support email: `support@codedok.com`.
- Crash reporting: Sentry, free tier.
- Analytics: PostHog (EU), event-based.

---

## 7. What we keep, redesign, or add from the current PWA

| Screen | Decision |
|---|---|
| `s-land` (landing) | **Replace** — becomes a marketing page outside the app; in-app starts at sign-in |
| `s-onboard` | **Redesign** — 3 taps, scan-first, skip allowed |
| `s-onboard-jur` | **Keep** — already good, polish copy |
| `s-home` | **Keep & polish** — fleet ring + actions is right |
| `s-vessels` | **Keep** — solid card layout |
| `s-vessel-detail` | **Restructure tabs** — Overview / Certs / Crew / **Equipment** / Log |
| `s-certs` | **Keep** — group by status |
| `s-scan` + processing + confirm | **Promote to primary action**, polish OCR confidence UI |
| `s-crew` | **Polish** — add "assign to vessel" affordance |
| `s-surveys` | **Reframe as Inspections** — calendar + booking |
| `s-inspection-pack` | **Rebuild** — generate real PDF on tap |
| `s-notif` | **Keep**, wire to real push |
| `s-calendar` | **Keep** |
| `s-gap` | **Keep** — strong feature |
| `s-account` | **Add billing & plan switcher** |
| `s-jur-dash` | **Keep** |
| `s-ie-licence` | **Keep** |
| `s-deficiencies` | **Keep** |
| `s-sms` | **Rebuild** as premium guided module |
| `s-export-pack` | **Merge** with inspection pack |
| **NEW: s-equipment** | **Add** — first-class equipment screen, per vessel |
| **NEW: s-handoff** | **Add** — skipper QR hand-off |
| **NEW: s-billing** | **Add** — Stripe portal entry |

---

## 8. Locked decisions

| Decision | Choice |
|---|---|
| Brand spelling | **CodedOK** |
| Bundle ID | `com.codedok.app` |
| Native shell | **Capacitor 6** |
| App framework | **Preact + Signals + TypeScript + Vite** |
| Backend | **Supabase, EU-West (London) region**, Pro plan from day 1 |
| Payments | **Stripe** (Checkout + Portal + webhooks), web-first signup |
| Email | **Resend** (EU) |
| Analytics / errors | **PostHog EU** + **Sentry** |
| Marketing site host | **Cloudflare Pages** |
| Email routing | **Cloudflare Email Routing** → Gmail |
| OCR | **Apple VisionKit + Google ML Kit** (on-device), Tesseract.js web fallback |
| PDF gen | **pdf-lib in Supabase edge function** |
| Pricing | Free / £14 Skipper / +£395+£12 SMS / £49 Fleet / £0 Surveyor (see §3) |
| Trial | 14 days, no card |
| Day-1 jurisdictions | **UK + IE** (the dual-jurisdiction story is a moat — keep it) |
| Codes baked in | **Workboat Code Ed 3** + **Sport/Pleasure Code 2025**, structured cert/equipment schedules in `packages/codes` |

## 9. Surveyor module (the viral loop)

Sea-Flux doesn't have this. Every surveyor we onboard becomes a referral channel for their other clients. The surveyor experience must be excellent or they'll never recommend it.

### Surveyor flow

1. **Sign up as a surveyor** at `codedok.com/surveyors` — separate flow, asks for: name, qualifications (YDSA / RYA / MCA-recognised / Bureau Veritas / etc.), certifying bodies, regions covered.
2. **Free forever** — `users.kind = 'surveyor'`, no Stripe customer.
3. **Operator invites them** by email per vessel, picks scopes (view / raise deficiency / mark inspected / issue cert), optional expiry.
4. Surveyor accepts → vessel appears on their **Surveyor Home** alongside any other vessels they've been granted to (across operators).
5. On a vessel, they can: review certs/crew/equipment, raise deficiencies, run an **Inspection** workflow (digital walk-through with the MCA Code requirements as a checklist), and **issue a coding cert** that auto-uploads to that vessel.
6. After signing the inspection: a single signed PDF lands in `inspection_packs` for the operator.

### Surveyor screens (new shells to add)

- `s-surveyor-home` — list of vessels granted to me, with status chips
- `s-surveyor-vessel` — drop-in vessel detail with surveyor toolbox
- `s-surveyor-inspect` — guided MCA Code checklist (Cat 2 / Cat 3 / etc.) with pass/fail/N-A per item, deficiency raising
- `s-surveyor-issue-cert` — fill issuer details, sign, attach PDF
- `s-surveyor-profile` — qualifications, regions, public listing toggle

### Discovery hook

Toggleable **public surveyor listing** at `codedok.com/find-a-surveyor` — operators searching for a coder in their region see a directory of CodedOK-using surveyors. Strong incentive for surveyors to fill their profile.

### Why this is a moat

Sea-Flux's reviews praise it for ease-of-use *for crew*. Nothing about surveyors. A surveyor who runs five inspections a month on CodedOK clients is going to recommend it to their *own* clients — instant pipeline. McCollam Marine introductions get us to skippers; surveyor module gets us to *every other skipper they survey*.

## 10. Distribution & route to first 50 customers

| Channel | Action |
|---|---|
| **McCollam Marine** | Joseph offers CodedOK to MM's existing client base — free 3 months in exchange for a testimonial. Target: 10 skippers in TestFlight by week 4. |
| **Friendly surveyors** | Identify 3 YDSA / RYA-recognised surveyors locally; onboard them free, ask for one operator referral each. |
| **Insurance brokers** | Reach out to Bishop Skinner / Pantaenius / Topsail with "compliant on CodedOK = potential premium discount" angle. Even one broker recommending it = dozens of leads. |
| **PR** | Practical Boat Owner, MBM, Coastal Trade News, RYA Magazine, Workboat World. Pitch: *"Northern Irish founder builds the skipper-friendly compliance app the MCA didn't ask for."* |
| **Trade shows** | Seawork (June, Southampton) — too late for soft launch but right for v1.1 push. Southampton Boat Show (September) for retail awareness. |

## 11. First-week setup checklist (in order)

1. **Register `codedok.com`** + `codedok.app` + `codedok.co.uk` defensively (~£40 total/yr at Cloudflare Registrar). Set up Cloudflare DNS + Email Routing.
2. **Form the company** — limited company, registered to your address, name "CodedOK Ltd" if available else "Coded OK Ltd". Don't be a sole trader; it makes Apple/Stripe/insurance harder later. ~£12 + ~£40 accountant fee for first set-up.
3. **Apply for DUNS number** (free, takes 5-30 days) — needed for Apple Developer Program org enrolment.
4. **Apple Developer enrolment** ($99) — start once DUNS is in.
5. **Google Play Console** ($25 one-off).
6. **Create Supabase project** (London region), spin up Postgres + Storage + Auth.
7. **Stripe account** (UK), create Products + Prices for Free/Skipper/Fleet, enable Customer Portal.
8. **Resend, PostHog (EU), Sentry, Cloudflare Pages** accounts.
9. **GitHub repo** — public marketing site, private app monorepo. Branch protection on `main`.
10. **ICO registration** (£40-£60/yr — UK GDPR requirement for processing customer data).
