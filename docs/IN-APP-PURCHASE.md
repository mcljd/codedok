# Setting up Pro / Team subscriptions (in-app purchase)

The code is done: the iPhone app sells Pro and Team through Apple, using
RevenueCat to handle receipts, renewals and cancellations. RevenueCat then
tells Supabase (`revenuecat-webhook`) which organisation is now Pro/Team.
You need to do the account setup below once.

## 1. App Store Connect — agreements, bank, tax (required for any paid feature)
**Business → Agreements**: accept the **Paid Apps** agreement, then fill in
**Bank account** and **Tax forms** (UK: the W-8BEN form for US tax). Until
these show "Active", purchases won't work, even in testing.

Also enrol in the **App Store Small Business Program** (developer.apple.com
→ App Store Small Business Program) — Apple's cut drops from 30% to 15%.

## 2. App Store Connect — create the subscriptions
Your app → **Monetization → Subscriptions** → create a group **CodedOK Plans**,
then two subscriptions in it:

| Reference name | Product ID | Duration | Price |
|---|---|---|---|
| Pro monthly | `codedok_pro_monthly` | 1 month | £18.99 |
| Team monthly | `codedok_team_monthly` | 1 month | £48.99 |

For each: add a display name + description, and a review screenshot (any
screenshot of the Plans screen). Optional: **Introductory offer → Free,
2 weeks** on Pro. Rank Team above Pro in the group (so Pro → Team is an
upgrade). Product IDs must match exactly — the app tells Pro and Team apart
by whether the ID contains "team".

Then **App Information → License Agreement**: leave as Apple's standard EULA
(the app links to it), and make sure the Privacy Policy URL is set.

## 3. RevenueCat (free up to $2.5k/month revenue)
1. Sign up at **revenuecat.com** → create project **CodedOK** → add an
   **App Store** app, bundle ID `com.codedok.app`.
2. It asks for an **In-App Purchase key**: App Store Connect → Users and
   Access → Integrations → **In-App Purchase** → + → download the .p8, and
   upload it to RevenueCat with its Key ID + your Issuer ID.
3. **Products**: import `codedok_pro_monthly` and `codedok_team_monthly`.
4. **Entitlements**: create `pro` (attach the Pro product) and `team`
   (attach the Team product). Names must be exactly `pro` and `team`.
5. **Offerings**: the `default` offering → add two packages (custom
   identifiers `pro_monthly`, `team_monthly`) with those products. Make it
   the current offering.
6. **API keys**: copy the **Apple public key** (starts `appl_`) and put it in
   `app/index.html` → `revenueCatAppleKey` (or send it to Claude).

## 4. Connect RevenueCat to Supabase
1. Run `supabase/deploy/APPLY_ALL_PENDING.sql` (adds migration 0025: plan
   columns + the guard that stops users granting themselves Pro).
2. Deploy the webhook (no JWT — RevenueCat can't send one):
   `supabase functions deploy revenuecat-webhook --no-verify-jwt`
3. Make up a long random secret, and set it on the function:
   Supabase → Edge Functions → revenuecat-webhook → Secrets →
   `REVENUECAT_WEBHOOK_AUTH` = `Bearer <your secret>`
4. RevenueCat → **Integrations → Webhooks** → URL
   `https://zftoqqrqsxctehltebad.supabase.co/functions/v1/revenuecat-webhook`,
   Authorization header = the same `Bearer <your secret>`. Send a test event:
   it should return `{"ok":true,"test":true}`.

## 5. Test before release
Settings → App Store → **Sandbox Account** on your iPhone (create a sandbox
tester in App Store Connect → Users and Access → Sandbox). Install the
TestFlight build, go to **Account → See plans → Subscribe**. Sandbox months
last 5 minutes, so you can watch renew → expire → back to Solo.

## How it fits together
- **Plans screen (iPhone)**: prices come live from the App Store; Subscribe,
  Restore purchases, Manage subscription, and the auto-renewal terms Apple
  requires are all on it.
- **Who gets Pro**: the RevenueCat user is the Supabase auth user id, so a
  subscription follows the CodedOK account across devices.
- **Database**: only the webhook (or the support console) can set an org to
  Pro/Team. On expiry it drops back to Solo — but never overrides a plan the
  support team granted by hand.
