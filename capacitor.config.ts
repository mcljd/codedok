import type { CapacitorConfig } from '@capacitor/cli';

// Native wrapper config for the App Store / Play Store build.
//
// webDir points at the EXISTING web app (app/). `npx cap sync` copies it
// into the native project, so the binary ships the app bundled — it opens
// instantly and offline-first, and Apple much prefers bundled content to
// a thin remote-URL wrapper (Guideline 4.2). Supabase / AI calls still go
// over the network at runtime, exactly as on the web.
const config: CapacitorConfig = {
  appId: 'com.codedok.app',
  appName: 'CodedOK',
  webDir: 'app',
  ios: {
    contentInset: 'always',
    backgroundColor: '#0f172a',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
