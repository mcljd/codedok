# CodedOK — Supabase setup

The app currently runs on `localStorage`. To turn it into a real backend
with multi-device sync, offline-first writes, and a real auth flow,
you need a Supabase project.

## 1. Create the Supabase project (2 min)

1. Go to <https://supabase.com> → **Start your project**
2. Sign in with GitHub
3. **New project** — name `codedok`, region `London`, generate a strong DB password (save it somewhere — you won't need it day to day)
4. Wait ~90 seconds for the project to provision

## 2. Run the schema (1 min)

In the Supabase dashboard:

1. Left sidebar → **SQL Editor** → **New query**
2. Open `supabase/migrations/0001_schema.sql` in this repo
3. Copy everything, paste it into the editor, click **Run**
4. Repeat for `supabase/migrations/0002_policies.sql`

You should see "Success. No rows returned." after each.

## 3. Wire the app to Supabase (1 min)

In the Supabase dashboard:

1. Left sidebar → **Project Settings** → **API**
2. Copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon / public** key (long string starting with `eyJ`)

Then edit `app/index.html` and add — right before the existing
`<script src="codes.js" defer></script>` line:

```html
<script>
  window.CodedOkConfig = {
    supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
    supabaseAnonKey: 'YOUR-ANON-KEY-HERE'
  };
</script>
<script src="supabase-client.js" defer></script>
<script src="sync.js" defer></script>
```

The `anon` key is safe to commit — RLS policies in `0002_policies.sql`
are what actually protect data.

## 4. (Optional) Seed your local data into Supabase

On any device that has run CodedOK, open the browser console and run:

```js
await Sync.now();
```

This flushes every cached row in `localStorage` up to Supabase. You'll
see them in the Supabase dashboard's **Table Editor**.

## 5. (Later) Real auth

Replace the current login screen with the magic-link flow:

```js
await Supa.signIn('joseph@codedok.com');
// → user gets an email with a one-tap link
// → clicking it redirects back to the app, signed in
```

The `Supa.onAuthChange(cb)` helper notifies you when sign-in completes.

## 6. (Later) Real Claude API for SMS generation

Today, `generateSmsFromInputs()` in `app.js` uses template substitution
as a mock. To wire the real Claude API:

1. In Supabase dashboard → **Edge Functions** → **New function** → name it `generate-sms`
2. Use the template at `supabase/functions/generate-sms/index.ts` (coming
   in a follow-up commit — needs your Anthropic API key as a secret)
3. In `app.js`, replace `generateSmsFromInputs(inputs)` with:

```js
const { data } = await Supa.client.functions.invoke('generate-sms', { body: inputs });
return data.draft;
```

## What you get when this is done

- Multi-device sync (open on iPhone + laptop, see same data)
- Offline-safe writes (queue when offline, flush when back online)
- Surveyor signs a doc → realtime push to the operator's phone within 1s
- File storage for vessel photos + surveyor logos (no more 1MB base64 limits)
- Real auth — no more "demo mode" shortcut
- Free until ~50k monthly active users (~£20/mo Pro tier after that)

## Total cost

- **Supabase**: £0/month on the free tier (500MB DB + 1GB storage + 50k MAU)
- **Claude API**: pay-per-use, ~£0.05 per SMS generated (you charge £10)
- **Cloudflare Workers**: unchanged (free tier)
