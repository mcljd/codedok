# CodedOK — iOS App Store build guide

How to turn the CodedOK web app (in `app/`) into an iOS app and ship it.
The web app is unchanged and still deploys to Cloudflare as normal — this
only wraps it in a native shell (Capacitor) for the App Store.

Launch plan: **free app, no in-app purchases** (fastest Apple approval).
Pro/Team upgrades are handled on the web, not sold inside the iOS app.

---

## 0. Apple Developer account (do this first — enrolment can take 24–48h)

1. On your Mac, sign in with your Apple ID at https://developer.apple.com.
2. Enrol in the **Apple Developer Program** → **Start Enrollment**. Cost:
   **£79/year** (US$99). Choose entity type:
   - **Individual/Sole trader** — fastest; the app lists under your own name.
   - **Organisation (company)** — lists under "McLaughlin Digital"; needs a
     **D-U-N-S number** (free, ~1–2 weeks to get if you don't have one) and
     proof you can bind the company. Only pick this if you want the company
     name as the seller.
3. Verify identity (Apple may ask for ID) and pay. Wait for the
   "Welcome to the Apple Developer Program" email (usually hours, up to 48h).
4. Sign the latest **Program License Agreement** in App Store Connect
   (https://appstoreconnect.apple.com → Agreements) — the app can't be
   submitted until this is signed.
5. (Free app means **no** banking/tax forms needed. Those are only required
   if you ever sell paid apps or in-app purchases.)

## 1. Tools on the Mac

- **Xcode** (free, from the Mac App Store) — then open it once to install
  components, and run `xcode-select --install` for the command-line tools.
- **Node 20+** and **CocoaPods** (`sudo gem install cocoapods`).

## 2. Create the iOS project (from the repo root)

```bash
npm install
npm run add:ios      # creates the ios/ Xcode project
npm run sync         # copies app/ into it + installs native plugins
npm run open:ios     # opens it in Xcode
```

## 3. Configure in Xcode

- **Signing & Capabilities** → select your Team (your Developer account),
  set Bundle Identifier to `com.codedok.app`. Turn on **Automatically
  manage signing**.
- Add capability **Push Notifications** (for reminders) and, under
  Background Modes, **Remote notifications**.
- Create an **APNs Auth Key** (App Store Connect → Users and Access → Keys)
  and add it to the `send-reminders` setup so pushes reach iOS. (Web push
  and native push differ — see "Native push" below.)
- Set the app icon (use `app/icons/icon-512.png`) and a launch screen.

### Required privacy strings (Info.plist)

The native document scanner and camera need usage descriptions, or the app
**crashes on first scan** and Apple rejects the build. In Xcode open
`ios/App/App/Info.plist` and add:

| Key | Value |
|---|---|
| `NSCameraUsageDescription` | `CodedOK uses the camera to scan your certificates so it can read and file them for you.` |
| `NSPhotoLibraryUsageDescription` | `CodedOK lets you attach certificate photos and PDFs from your library.` |
| `NSPhotoLibraryAddUsageDescription` | `CodedOK can save a copy of scanned documents to your library.` |

### Native features already wired (in `app/native.js`)

The web app auto-detects the native shell and upgrades itself — no code
changes needed, these light up once the plugins are synced:

- **Document scanner** — the "Take a photo" cert flow uses iOS **VisionKit**
  (`capacitor-document-scanner`): automatic edge-detection, perspective
  correction and glare reduction, then straight into the AI reader. Falls
  back to the native camera, then the web file input, if unavailable.
- **Native camera** (`@capacitor/camera`) — with in-place cropping.
- **Haptics** (`@capacitor/haptics`) — a success tap when a scan lands.
- **Status bar / splash** (`@capacitor/status-bar`, `@capacitor/splash-screen`).
- **Share sheet** (`@capacitor/share`) — available for exporting packs.

> All of these degrade gracefully: if a plugin is missing or a user
> cancels, the app silently falls back to the existing web behaviour, so a
> plugin that fails to install never breaks the build — you just lose that
> one enhancement. If `npm install` ever fails on `capacitor-document-scanner`,
> you can remove it from `package.json`; the camera path still works.

### Native push — now wired end-to-end

Native reminders are fully built. On sign-in the app registers the device
with APNs and stores the token in the `device_push_tokens` table (migration
`0023`), and the `send-reminders` edge function now fans out to both web-push
browsers **and** native iOS devices via APNs. All you have to do is give the
function the APNs auth key and turn on the capability:

1. **Push Notifications capability** in Xcode (Signing & Capabilities) and
   **Background Modes → Remote notifications** (per section 3 above).
2. **Create an APNs Auth Key** (`.p8`): App Store Connect → Users and Access
   → **Integrations / Keys** → **+**, enable **Apple Push Notifications
   service (APNs)**, download the `.p8` once (you can't re-download it), and
   note the **Key ID** and your **Team ID**.
3. **Set these secrets on the `send-reminders` function** (Supabase →
   Edge Functions → Secrets):
   - `APNS_KEY_ID` — the 10-char Key ID
   - `APNS_TEAM_ID` — your Apple Developer Team ID
   - `APNS_PRIVATE_KEY` — the full `.p8` contents (including the
     `-----BEGIN/END PRIVATE KEY-----` lines)
   - `APNS_TOPIC` — `com.codedok.app` (only needed if the bundle id differs)
4. Deploy: `supabase functions deploy send-reminders`.

Until those secrets are set the APNs branch is **skipped** (fail-open), so
web push keeps working unchanged. App Store and TestFlight builds use the
production APNs gateway (the default). Only a build run directly from Xcode
uses the sandbox gateway — for that, set `window.CodedokConfig.apnsEnv =
'sandbox'` in `index.html` so its token is stored against the sandbox host.

## 4. App Store Connect — create the listing

At https://appstoreconnect.apple.com → **Apps → +**:
- **Name:** CodedOK  ·  **Primary language:** English (U.K.)
- **Bundle ID:** com.codedok.app  ·  **SKU:** codedok-ios
- **Price:** Free
- **Category:** Business (secondary: Productivity)
- **Privacy Policy URL:** https://codedok.com/privacy
- **App Privacy** (nutrition labels): declare what you collect — typically
  *Contact Info (email, name)*, *User Content (the documents/photos they
  add)*, linked to identity, used for App Functionality. Not used for
  tracking.
- Screenshots: 6.7" and 6.1" iPhone sizes (generated from the app).
- Description / keywords / promo text: see `docs/APP-STORE-LISTING.md`
  (draft to be added).

## 5. Build, upload, submit

- Xcode → **Product → Archive** → **Distribute App → App Store Connect**.
- In App Store Connect, attach the build to the version, fill **App Review
  notes** (a test login so the reviewer can get in), and **Submit**.

---

## Review gotchas (what gets apps rejected — and where we stand)

- **4.2 Minimum functionality ("just a website"):** mitigated — the app
  bundles its content (not a remote URL), uses the native camera and native
  push, works offline-first, and is a genuine professional tool. Keep the
  native camera/push wiring in place.
- **5.1.1(v) Account deletion:** ✅ already built — Account → Delete account
  (calls the `delete_my_account` RPC). Apple requires this; we have it.
- **3.1.1 In-app purchase:** avoided — the iOS build sells nothing digital
  in-app. Don't add a "Subscribe / Upgrade — £19" button that completes
  in-app, or Apple will require IAP. Linking out to manage billing on the
  web is fine within current reader/external-link rules; keep upgrade copy
  to "manage your plan at codedok.com".
- **Privacy:** policy URL live, nutrition labels filled, account deletion
  present.
- **Sign in:** email/password is fine; no Sign in with Apple requirement
  unless you add a third-party social login.
