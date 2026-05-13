// CodedOK — Sentry browser SDK init.
//
// Activates only when window.CodedOkConfig.sentryDsn is set. Loads
// the SDK from the official CDN on idle so it never blocks the
// critical render path. No-op without a DSN, so this file is safe
// to ship without configuration — the user pastes their DSN into
// index.html (CodedOkConfig.sentryDsn) and the next page load
// starts capturing errors.
//
// Captures uncaught exceptions and unhandled promise rejections by
// default. Manual capture via window.Sentry.captureException(err).

(function () {
  'use strict';
  var cfg = window.CodedOkConfig || {};
  var dsn = cfg.sentryDsn;
  if (!dsn) return; // No DSN configured — silent no-op.

  function load() {
    var s = document.createElement('script');
    s.src = 'https://browser.sentry-cdn.com/7.119.0/bundle.tracing.min.js';
    s.crossOrigin = 'anonymous';
    s.async = true;
    s.onload = function () {
      try {
        if (!window.Sentry) return;
        window.Sentry.init({
          dsn: dsn,
          environment: cfg.sentryEnv || 'production',
          release: 'codedok@' + (cfg.appVersion || 'unknown'),
          tracesSampleRate: 0.1,
          // Stop noisy errors that fire on every cross-origin script load
          // (Safari especially), and ignore the self-heal reset path.
          ignoreErrors: [
            'ResizeObserver loop limit exceeded',
            'Non-Error promise rejection captured',
            'Load failed',
            'NetworkError when attempting to fetch resource'
          ],
          beforeSend: function (event) {
            try {
              if (window.location.search.indexOf('reset') !== -1) return null;
            } catch (_) {}
            return event;
          }
        });
      } catch (e) { /* swallow init errors — Sentry off → app continues */ }
    };
    s.onerror = function () { /* CDN blocked → silent */ };
    document.head.appendChild(s);
  }

  if (window.requestIdleCallback) {
    requestIdleCallback(load, { timeout: 3000 });
  } else {
    setTimeout(load, 1200);
  }
})();
