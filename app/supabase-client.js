// CodedOK — Supabase client wrapper.
//
// Loads supabase-js from CDN on demand, reads config from window.CodedOkConfig,
// and exposes a tiny window.Supa with sane defaults. No-op if config is absent —
// the app keeps working with localStorage only, just doesn't sync.
//
// To wire it up:
//   1. Create a Supabase project at https://supabase.com (free)
//   2. Run supabase/migrations/0001_schema.sql in the SQL editor
//   3. Run supabase/migrations/0002_policies.sql
//   4. Drop the following into index.html ABOVE this script:
//        <script>
//          window.CodedOkConfig = {
//            supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
//            supabaseAnonKey: 'YOUR-ANON-KEY-HERE'
//          };
//        </script>
//
// The anon key is safe to commit — Row-Level Security in policies.sql is
// what actually protects data.

(function () {
  'use strict';

  const cfg = window.CodedOkConfig || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    // No config — running in pure-localStorage mode. Stub out the API
    // so callers don't have to null-check.
    window.Supa = {
      ready: false,
      client: null,
      signIn: () => Promise.reject(new Error('Supabase not configured')),
      signOut: () => Promise.resolve(),
      getUser: () => Promise.resolve(null),
      onAuthChange: () => {}
    };
    return;
  }

  // supabase-js is bundled with the app (app/lib, pinned version) rather than
  // pulled from a public CDN at runtime: whoever serves this file can read every
  // user's session, so it must not be a third party, and the iPhone app must be
  // able to sign in without reaching a CDN. Upgrade by replacing the file.
  const SUPABASE_JS = 'lib/supabase-js-2.118.0.js';
  // Resolve next to this file, whatever page or app scheme loaded it.
  const HERE = (document.currentScript && document.currentScript.src) || location.href;
  function loadLocalScript(src) {
    return new Promise((resolve, reject) => {
      if (window.supabase && window.supabase.createClient) return resolve(window.supabase);
      const s = document.createElement('script');
      s.src = new URL(src, HERE).href;
      s.async = true;
      s.onload = () => (window.supabase && window.supabase.createClient) ? resolve(window.supabase) : reject(new Error('supabase-js loaded but did not register'));
      s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }

  let loadPromise = null;
  function loadSupabase() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const { createClient } = await loadLocalScript(SUPABASE_JS);
        const client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true   // handles the magic-link redirect
          }
        });
        window.Supa.client = client;
        window.Supa.ready = true;
        return client;
      } catch (err) {
        window.Supa.loadError = err;
        console.warn('Supabase failed to load:', err && err.message);
        throw err;
      }
    })();
    // Don't let the promise itself surface as unhandled if no one awaits.
    loadPromise.catch(() => {});
    return loadPromise;
  }

  window.Supa = {
    ready: false,
    client: null,

    // Email + password sign-in. Throws on bad credentials.
    async signInWithPassword(email, password) {
      const client = await loadSupabase();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },

    // Sign in with Apple (native iPhone app). `token` is Apple's identity
    // token and `nonce` the raw value whose SHA-256 was sent to Apple.
    async signInWithApple(token, nonce) {
      const client = await loadSupabase();
      const { data, error } = await client.auth.signInWithIdToken({ provider: 'apple', token, nonce });
      if (error) throw error;
      return data;
    },

    // Email + password sign-up. Supabase emails a verification link;
    // the user must click it before signInWithPassword will succeed.
    // 'extra' is merged into user_metadata so we can capture role
    // selection (operator / surveyor) from the sign-up form.
    async signUpWithPassword(email, password, extra) {
      const client = await loadSupabase();
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname,
          data: extra || {}
        }
      });
      if (error) throw error;
      return data;
    },

    // Legacy magic-link path — still exposed because some old buttons in
    // the app may call it. New code should use signInWithPassword.
    async signIn(email) {
      const client = await loadSupabase();
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      return { sent: true };
    },

    // Change the signed-in user's password. Supabase rejects passwords
    // shorter than 6 chars by default; we enforce 8 in the UI.
    async updatePassword(newPassword) {
      const client = await loadSupabase();
      const { data, error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw error;
      return data;
    },

    // Send a password-reset email. The email carries a one-time code
    // ({{ .Token }} in the Supabase "Reset Password" template) which the
    // user types into the app — no link, so it never leaves the app.
    async sendPasswordReset(email) {
      const client = await loadSupabase();
      const { error } = await client.auth.resetPasswordForEmail(email);
      if (error) throw error;
      return { sent: true };
    },

    // Exchange the emailed recovery code for a session, then set the new
    // password. Returns the signed-in user.
    async resetPasswordWithCode(email, code, newPassword) {
      const client = await loadSupabase();
      const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'recovery' });
      if (error) throw error;
      const upd = await client.auth.updateUser({ password: newPassword });
      if (upd.error) throw upd.error;
      return (upd.data && upd.data.user) || (data && data.user) || null;
    },

    async signOut() {
      if (!window.Supa.client) return;
      await window.Supa.client.auth.signOut();
    },

    async getUser() {
      const client = await loadSupabase();
      const { data } = await client.auth.getUser();
      return data.user || null;
    },

    async onAuthChange(cb) {
      const client = await loadSupabase();
      client.auth.onAuthStateChange((event, session) => cb(event, session));
    },

    // Helper for the sync layer: returns the configured client, loaded.
    async getClient() {
      return loadSupabase();
    }
  };

  // Kick off the lazy load on idle so the first real call is fast.
  if (window.requestIdleCallback) {
    requestIdleCallback(() => loadSupabase().catch(() => {}));
  }
})();
