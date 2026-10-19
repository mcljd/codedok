# CodedOK — App Store listing copy

Everything you paste into **App Store Connect** when creating the listing.
Character limits are Apple's; counts below are within them. UK English.

---

## App information

| Field | Value |
|---|---|
| **App Name** (max 30) | `CodedOK` |
| **Subtitle** (max 30) | `Vessel compliance, sorted` |
| **Bundle ID** | `com.codedok.app` |
| **SKU** | `codedok-ios` |
| **Primary category** | Business |
| **Secondary category** | Productivity |
| **Primary language** | English (U.K.) |
| **Price** | Free |
| **Age rating** | 4+ |

---

## Promotional text (max 170 — editable any time without a review)

```
Snap a photo of any certificate and CodedOK reads it, files it, and reminds you before it runs out. Keep every coded vessel survey-ready — on one boat or a whole fleet.
```

---

## Description (max 4000)

```
CodedOK keeps UK & Irish coded vessels survey-ready — without the spreadsheet.

Built for owner-operators, charter skippers and small fleet operators running
boats under the MCA Codes of Practice (and the Irish equivalent), CodedOK tracks
every certificate, piece of safety equipment and crew qualification, and tells
you exactly what needs doing before it becomes a problem.

SNAP A CERT, WE READ IT
Point your camera at any certificate — coding cert, radio licence, life-raft
service, insurance, flares — and CodedOK fills in the type, number and expiry
date for you. No typing. Upload a PDF from your email just as easily.

NEVER MISS A RENEWAL
Automatic reminders at 90, 60, 30 and 7 days before anything expires, by push
notification and email. Open the app and you see what's overdue, what's due
soon, and what's in hand — at a glance.

KNOW YOU'RE SURVEY-READY
Every boat gets a live compliance score and a clear "ready / not ready" status,
so you walk into your annual survey knowing there are no surprises.

ONE BOAT OR A WHOLE FLEET
Manage a single RIB or a fleet of charter boats from one place. One tap shows
which boat needs attention today.

INSPECTION PACK, INSTANTLY
Generate a tidy PDF pack of a vessel's certificates to hand to a surveyor,
broker or authority — in seconds.

BUILD YOUR SMS
A guided, MCA-aligned Safety Management System builder walks you through it
section by section.

WORKS OFFLINE
Everything you add is saved on your device first and syncs when you're back
in signal — so it works on the pontoon, in the yard, or out of range.

BUILT AROUND THE CODES
CodedOK understands the certificate and equipment schedules that actually apply
to your vessel's category and area of operation, so you're not guessing what
you need.

Free to get started. Manage your plan any time at codedok.com.

CodedOK is an independent tool and is not affiliated with or endorsed by the
Maritime & Coastguard Agency.
```

---

## Keywords (max 100 chars, comma-separated, no spaces after commas)

```
boat,vessel,coding,MCA,compliance,survey,certificate,marine,skipper,charter,fleet,safety,RYA
```
*(92 characters — under Apple's 100 limit)*

> Tip: don't repeat words already in the app name/subtitle ("CodedOK",
> "compliance") elsewhere — Apple indexes those automatically. Singular forms
> also match plurals, so "certificate" covers "certificates".

---

## URLs

| Field | Value |
|---|---|
| **Marketing URL** | `https://codedok.com` |
| **Support URL** | `https://codedok.com/support` *(must resolve — see note)* |
| **Privacy Policy URL** | `https://codedok.com/privacy` |

> **Support URL note:** Apple requires a working support page. If `/support`
> doesn't exist yet, point it at a page that has a contact email
> (hello@codedok.com) — even a simple one is fine, it just has to load.

---

## What's New (version notes for 1.0)

```
First release of CodedOK for iPhone. Track certificates, equipment and crew
qualifications for your coded vessels, scan certs with your camera, and get
reminders before anything expires.
```

---

## App Privacy (nutrition labels)

Declare in App Store Connect → App Privacy:

- **Contact Info** → Email address, Name — *Linked to identity* · used for **App Functionality**
- **User Content** → Photos/documents the user adds (certificates), Other user content — *Linked to identity* · used for **App Functionality**
- **Identifiers** → User ID — *Linked to identity* · used for **App Functionality**
- **Used for tracking?** → **No** (CodedOK does not track users across other apps/sites.)

---

## App Review information

Give the reviewer a way in and context, or 1.0 gets held:

- **Sign-in required:** Yes.
- **Demo account:** create a throwaway operator login before you submit and put
  the email + password here. *(Don't use hello@codedok.com — that's the live
  admin/support account.)*
- **Notes to reviewer:**
  ```
  CodedOK is a compliance tracker for small commercial vessels in the UK &
  Ireland. Sign in with the demo account above. From Home you can add a record
  (camera or manual), open a vessel to see its compliance score, and view the
  renewal calendar. The app works offline-first and syncs to the cloud.

  There are no in-app purchases — the app is free. Paid plans for multi-vessel
  fleets are managed on the web at codedok.com and are not sold inside the app.

  Account deletion: Account tab → Delete account.
  ```

---

## Screenshots

Generated into `docs/app-store/` at the two required iPhone sizes:

- **6.7"** (1290 × 2796) — `screenshot-01..05-67.png`
- **6.1"** (1179 × 2556) — `screenshot-01..05-61.png`

Upload order (first = the one most people see):
1. **Every certificate, in one place** (Home)
2. **Snap a cert. We read it for you** (AI scanner)
3. **Know you're ready before the surveyor does** (vessel score)
4. **Your whole fleet, at a glance** (vessels)
5. **Never miss a renewal again** (calendar)

> Apple accepts the 6.7" set alone for most devices and will down-scale, but
> uploading both the 6.7" and 6.1" sets is cleaner. iPad screenshots are only
> needed if you make the app available on iPad.
