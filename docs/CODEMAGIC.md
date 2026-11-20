# Building the iOS app with Codemagic (no Mac needed)

`codemagic.yaml` builds CodedOK on Codemagic's cloud Macs and uploads it to
App Store Connect. The iOS project (`ios/`) is already in the repo with the
app icon, navy splash, camera/photo permission text, iPhone-only and
portrait-only settings, and the encryption answer pre-filled.

## One-time setup

### 1. App Store Connect API key
App Store Connect → **Users and Access → Integrations → App Store Connect
API** → **Team Keys → +**. Name it `Codemagic`, access **Admin** → Generate.
- Note the **Issuer ID** (top of the page) and the key's **Key ID**.
- **Download** the `.p8` file — Apple only lets you download it once. Keep
  it somewhere private (not a shared/library computer's Desktop).

### 2. Certificate key
In Terminal on any Mac:
```
ssh-keygen -t rsa -b 2048 -m PEM -f ~/Desktop/codemagic_cert_key -q -N ""
cat ~/Desktop/codemagic_cert_key
```
Copy the whole output (including the BEGIN/END lines). Keep a private copy:
reusing the same key stops Apple's certificate limit filling up.

### 3. Codemagic
1. **Add your first app** → GitHub → `mcljd/codedok` → **codemagic.yaml**.
2. App → **Environment variables** → add four variables, all in a group
   named **`app_store_credentials`**, all ticked **Secret**:
   | Name | Value |
   |---|---|
   | `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID |
   | `APP_STORE_CONNECT_KEY_IDENTIFIER` | Key ID |
   | `APP_STORE_CONNECT_PRIVATE_KEY` | whole `.p8` file contents |
   | `CERTIFICATE_PRIVATE_KEY` | whole `codemagic_cert_key` contents |

## Each build
**Start new build** → branch `claude/test-github-push-IySCw` → workflow
**CodedOK iOS** → Start. About 10–15 minutes. When it finishes, the build
appears in App Store Connect → your app → **TestFlight** after Apple's
processing (~15 min), then select it on the version page and submit.

## Notes
- The document-scanner plugin was dropped for v1: no release supports
  Capacitor 6. `app/native.js` already falls back to the native camera
  (with cropping), so scanning still works.
- Push notifications aren't enabled on the App ID yet; reminders still go by
  email. Enable Push on the App ID and add the capability later.
