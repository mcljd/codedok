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

## Account deletion
App Store rule 5.1.1(v): when someone who signed in with Apple deletes their account, the
app should revoke their Apple token. That needs an Apple "Sign in with Apple" key (.p8) and
a call to Apple's revoke endpoint from the delete-account function. Not done yet.
