# CodedOK

The compliance app for UK & Irish coded vessel skippers.

Tracks every certificate, equipment item and crew qualification per vessel against
the **Sport or Pleasure Vessel Code 2025** and **Workboat Code Edition 3**.
One-tap inspection-pack PDF, MCA-aligned SMS builder, and a free surveyor seat
that lets surveyors quote and bill operators directly through the app.

## Status

Working PWA prototype. Backend wire-up (Supabase + Stripe + Capacitor wrap) in
progress towards an iOS / Android App Store launch.

## Try it

The prototype lives in `app/`. Open `app/index.html` in any modern browser, or
serve the folder with a tiny HTTP server:

```bash
cd app
python -m http.server 4173
# open http://localhost:4173
```

Tap **"Try the live demo →"** on the login screen to skip the (mocked) auth and
land in the operator workspace with seeded vessels (Silver Sands + Cormorant) and
a pending SMS-review request from McCollam Marine in the surveyor inbox.

## Project layout

```
app/                    Working PWA prototype
  ├── index.html        All UI shells
  ├── style.css         Design system + screen styles
  ├── print.css         A4 print stylesheet for inspection pack PDFs
  ├── codes.js          MCA cert + equipment + crew schedules + SMS schema
  ├── store.js          localStorage data layer (will become Supabase in v1)
  ├── app.js            Renderers + navigation + auth + flows
  └── icons/, fonts/    Static assets

codedok-brand/          Brand guidelines, logos, palette
docs/                   Build plan, Sea-Flux teardown, demo-vs-live architecture
```

## Documents worth reading

- `docs/BUILD-PLAN.md` — locked stack, schema, pricing, roadmap, App Store specifics
- `docs/SEA-FLUX-TEARDOWN.md` — competitor analysis + where CodedOK wins
- `docs/DEMO-VS-LIVE.md` — how demo and live modes will share one codebase

## Brand

Navy Deep `#0A1628` · Ocean Cyan `#0891B2` · Compliance Green `#16A34A`.
Full guidelines in `codedok-brand/BRAND-GUIDELINES.md`.

## License

All rights reserved. Not open source.
