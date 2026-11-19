# Sign in with Apple

Code is done (native button on the sign-in and create-account screens, iPhone app only).
Two switches outside the code must be on before it works:

1. **Apple Developer → Identifiers → com.codedok.app → tick "Sign in with Apple" → Save.**
   (Then rebuild in Codemagic. If signing complains about the entitlement, re-run the
   build after saving; the provisioning profile regenerates.)
2. **Supabase → Authentication → Providers → Apple → Enable.**
   - Authorized Client IDs: `com.codedok.app`
   - Leave Secret Key blank for native-only sign-in.

How it works: the app asks Apple for a token (with a hashed nonce), then calls
`supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce })`.
The first sign-in saves the name Apple provides (Apple only sends it once).

## Account deletion + Apple token revocation (done in code)
App Store rule 5.1.1(v). Account → Delete account now calls the `delete-account` edge
function, which revokes the person's Apple token, deletes their data (organisations they
alone belong to, storage files, profile) and then their login. Shared organisations are left
for the other members. `apple-link` stores Apple's refresh token at sign-in (table
`apple_tokens`, migration 0026, service-role only).

To switch revocation on:
1. Apple Developer → Keys → **+** → tick "Sign in with Apple" → Configure (primary App ID
   `com.codedok.app`) → Register → download the `.p8` once. Note the **Key ID** and your **Team ID**.
2. Supabase → Edge Functions → Secrets, add:
   - `APPLE_TEAM_ID` — 10-character Team ID
   - `APPLE_KEY_ID` — the Key ID
   - `APPLE_PRIVATE_KEY` — the whole contents of the `.p8` file
3. Run migration 0026 (it is at the end of `supabase/deploy/APPLY_ALL_PENDING.sql`) and
   deploy `apple-link` and `delete-account` (they auto-deploy on push to main).
Without the secrets, deletion still works; it just skips the Apple revoke (logged).

## Private relay emails
People who tap "Hide My Email" get an address like `abc@privaterelay.appleid.com`. Apple only
forwards mail from domains you register: Apple Developer → Certificates, Identifiers & Profiles →
More → **Configure Sign in with Apple for Email Communication**; add your sending domain
(codedok.com / the address Supabase and send-reminder-emails send from) and set up the SPF/DKIM
records Apple shows. Until then, password-reset and reminder emails to those users may bounce.
