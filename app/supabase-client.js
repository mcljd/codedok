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

  // Load supabase-js from CDN on first use. Module-mode import keeps it
  // off the critical path.
  let loadPromise = null;
  function loadSupabase() {
    if (loadPromise) return loadPromise;
    loadPromise = import('https://esm.sh/@supabase/supabase-js@2').then((mod) => {
      const { createClient } = mod;
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
    });
    return loadPromise;
  }

  window.Supa = {
    ready: false,
    client: null,

    // Email magic-link sign-in. Supabase emails the user a one-tap link.
    async signIn(email) {
      const client = await loadSupabase();
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      return { sent: true };
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
