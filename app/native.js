// CodedOK — native (Capacitor) bridge.
//
// This file is loaded on web AND inside the native iOS/Android shell. On
// the web it does nothing except expose `CodedokNative.isNative === false`,
// so callers transparently fall back to the existing web flows.
//
// Inside the native shell, Capacitor exposes each installed plugin on
// `window.Capacitor.Plugins.<Name>` via the native bridge — no bundler or
// ES imports required. Every method here is defensive: if a plugin is
// missing or throws, it returns a falsy value and the caller falls back to
// the web implementation. Nothing here can break the web app.
(function () {
  'use strict';

  var Cap = window.Capacitor;
  var isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());

  function plugin(name) {
    try { return (Cap && Cap.Plugins && Cap.Plugins[name]) || null; }
    catch (_) { return null; }
  }

  // Turn a base64 string (no data: prefix) into a data URL.
  function toDataUrl(b64, mime) {
    if (!b64) return null;
    if (/^data:/i.test(b64)) return b64;
    return 'data:' + (mime || 'image/jpeg') + ';base64,' + b64;
  }

  // Turn a data URL into a File the existing extraction pipeline accepts.
  function dataUrlToFile(dataUrl, filename) {
    try {
      var m = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl || '');
      if (!m) return null;
      var mime = m[1] || 'image/jpeg';
      var isB64 = !!m[2];
      var data = m[3] || '';
      var bytes;
      if (isB64) {
        var bin = atob(data);
        bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        bytes = new TextEncoder().encode(decodeURIComponent(data));
      }
      return new File([bytes], filename || ('scan-' + Date.now() + '.jpg'), { type: mime });
    } catch (_) { return null; }
  }

  // ── Native document scanner (iOS VisionKit / Android MLKit) ──────────
  // Auto edge-detection, perspective correction, glare reduction and
  // multi-page capture — a big step up from a raw camera photo for
  // reading certificates. Returns a File (first page) or null.
  async function scanDocument() {
    if (!isNative) return null;
    var Scanner = plugin('DocumentScanner');
    if (Scanner && typeof Scanner.scanDocument === 'function') {
      try {
        var res = await Scanner.scanDocument({
          responseType: 'base64',   // get image data back directly
          croppedImageQuality: 92,
          maxNumDocuments: 1
        });
        var imgs = res && (res.scannedImages || res.images || res.scannedImageBase64s);
        var first = Array.isArray(imgs) ? imgs[0] : imgs;
        if (first) {
          var file = dataUrlToFile(toDataUrl(first, 'image/jpeg'), 'cert-scan.jpg');
          if (file) return file;
        }
      } catch (err) {
        // User cancelled, or the scanner isn't available — fall through
        // to the camera, then to the web picker.
        if (err && /cancel/i.test(err.message || '')) return 'cancelled';
        console.warn('native scanDocument failed, falling back', err);
      }
    }
    // Fallback: native camera (still far better than a web file input).
    return takePhoto();
  }

  // ── Native camera (fallback for the scanner) ────────────────────────
  async function takePhoto() {
    if (!isNative) return null;
    var Camera = plugin('Camera');
    if (!Camera || typeof Camera.getPhoto !== 'function') return null;
    try {
      var photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,     // lets the user crop to the cert
        resultType: 'base64',
        source: 'CAMERA',
        saveToGallery: false
      });
      var b64 = photo && (photo.base64String || photo.dataUrl);
      if (!b64) return null;
      return dataUrlToFile(toDataUrl(b64, 'image/jpeg'), 'cert-photo.jpg');
    } catch (err) {
      if (err && /cancel/i.test(err.message || '')) return 'cancelled';
      console.warn('native takePhoto failed', err);
      return null;
    }
  }

  // ── Native share sheet (for the inspection-pack PDF) ────────────────
  async function shareFile(opts) {
    if (!isNative) return false;
    var Share = plugin('Share');
    if (!Share || typeof Share.share !== 'function') return false;
    try {
      await Share.share(opts || {});
      return true;
    } catch (err) {
      if (err && /cancel/i.test(err.message || '')) return true;
      console.warn('native share failed', err);
      return false;
    }
  }

  // ── Haptic feedback (small taps on key actions) ─────────────────────
  function haptic(kind) {
    if (!isNative) return;
    var H = plugin('Haptics');
    if (!H) return;
    try {
      if (kind === 'success' && H.notification) H.notification({ type: 'SUCCESS' });
      else if (kind === 'warning' && H.notification) H.notification({ type: 'WARNING' });
      else if (kind === 'error' && H.notification) H.notification({ type: 'ERROR' });
      else if (H.impact) H.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'light' ? 'LIGHT' : 'MEDIUM' });
    } catch (_) {}
  }

  // ── Status bar + splash polish on launch ────────────────────────────
  function initChrome() {
    if (!isNative) return;
    var Status = plugin('StatusBar');
    // Light screens are the default → black status-bar text. go() flips it
    // to white on navy screens via setStatusBar().
    try { if (Status && Status.setStyle) Status.setStyle({ style: 'LIGHT' }); } catch (_) {}
    var Splash = plugin('SplashScreen');
    try { if (Splash && Splash.hide) setTimeout(function () { Splash.hide(); }, 300); } catch (_) {}
  }

  // ── Native push registration (APNs) ─────────────────────────────────
  // Registers for native push and hands the token to the app so the
  // backend can target iOS devices. The actual send-side wiring lives in
  // the send-reminders edge function (see docs/IOS-BUILD.md).
  async function initPush(onToken) {
    if (!isNative) return;
    var Push = plugin('PushNotifications');
    if (!Push) return;
    try {
      var perm = await Push.checkPermissions();
      if (perm && perm.receive !== 'granted') perm = await Push.requestPermissions();
      if (!perm || perm.receive !== 'granted') return;
      Push.addListener('registration', function (token) {
        try { if (typeof onToken === 'function') onToken(token && token.value); } catch (_) {}
      });
      Push.addListener('registrationError', function (e) { console.warn('push reg error', e); });
      await Push.register();
    } catch (err) { console.warn('initPush failed', err); }
  }

  // ── Status bar text colour per screen ─────────────────────────────────
  // dark=true → white text (for navy screens); false → black text (light).
  // In system dark mode every screen is dark, so the text is always white.
  function systemDark() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch (_) { return false; }
  }
  function setStatusBar(dark) {
    if (!isNative) return;
    var S = plugin('StatusBar');
    try { if (S && S.setStyle) S.setStyle({ style: (dark || systemDark()) ? 'DARK' : 'LIGHT' }); } catch (_) {}
  }

  // ── Dynamic Type ──────────────────────────────────────────────────────
  // Follow the iPhone's Settings → Display & Brightness → Text Size. The
  // plugin returns a multiplier (1.0 = default); capped at 1.35 so the
  // largest settings enlarge the text without breaking the layouts.
  async function applyDynamicType() {
    var TZ = plugin('TextZoom');
    if (!isNative || !TZ || typeof TZ.getPreferred !== 'function') return;
    try {
      var r = await TZ.getPreferred();
      var v = Math.max(1, Math.min(1.35, (r && r.value) || 1));
      await TZ.set({ value: v });
    } catch (_) {}
  }
  if (isNative) {
    document.addEventListener('visibilitychange', function () { if (!document.hidden) applyDynamicType(); });
    setTimeout(applyDynamicType, 0);
  }

  // ── In-app purchases (RevenueCat over StoreKit) ───────────────────────
  // Subscriptions are bought through Apple; RevenueCat validates receipts
  // and webhooks the result to Supabase (supabase/functions/revenuecat-
  // webhook), which sets organizations.plan. The app user id is the
  // Supabase auth user id so purchases follow the account, not the phone.
  var iapUser;               // undefined = not configured yet
  function purchases() { return plugin('Purchases'); }
  function iapAvailable() {
    var key = (window.CodedOkConfig || {}).revenueCatAppleKey;
    return !!(isNative && key && purchases());
  }
  async function iapConfigure(appUserID) {
    var P = purchases();
    if (!iapAvailable()) return false;
    try {
      if (iapUser === undefined) {
        await P.configure({ apiKey: window.CodedOkConfig.revenueCatAppleKey, appUserID: appUserID || null });
        iapUser = appUserID || null;
      } else if (appUserID && appUserID !== iapUser) {
        await P.logIn({ appUserID: appUserID });
        iapUser = appUserID;
      }
      return true;
    } catch (err) { console.warn('iapConfigure failed', err); return false; }
  }
  // The plan the active entitlements grant: 'team' beats 'pro'.
  function planFromCustomerInfo(info) {
    var active = (info && info.entitlements && info.entitlements.active) || {};
    if (active.team) return 'team';
    if (active.pro) return 'pro';
    return null;
  }
  async function iapPackages() {
    if (!iapAvailable()) return [];
    var o = await purchases().getOfferings();
    return (o && o.current && o.current.availablePackages) || [];
  }
  // → { plan, cancelled }   (cancelled = user backed out of Apple's sheet)
  async function iapBuy(pkg) {
    try {
      var r = await purchases().purchasePackage({ aPackage: pkg });
      haptic('success');
      return { plan: planFromCustomerInfo(r && r.customerInfo), cancelled: false };
    } catch (err) {
      if (err && (err.userCancelled || /cancel/i.test(err.message || ''))) return { plan: null, cancelled: true };
      throw err;
    }
  }
  async function iapRestore() {
    var r = await purchases().restorePurchases();
    return planFromCustomerInfo(r && r.customerInfo);
  }
  async function iapCurrentPlan() {
    if (!iapAvailable()) return null;
    var r = await purchases().getCustomerInfo();
    return planFromCustomerInfo(r && r.customerInfo);
  }
  async function iapManage() {
    var P = purchases();
    if (P && typeof P.showManageSubscriptions === 'function') { try { await P.showManageSubscriptions(); return; } catch (_) {} }
    window.location.href = 'https://apps.apple.com/account/subscriptions';
  }

  // Subscription UI only appears once a RevenueCat key is configured —
  // until then there's nothing to buy, so no dead-end "See plans" screen.
  if (iapAvailable()) { try { document.documentElement.classList.add('iap-live'); } catch (_) {} }

  window.CodedokNative = {
    isNative: isNative,
    scanDocument: scanDocument,
    takePhoto: takePhoto,
    shareFile: shareFile,
    haptic: haptic,
    initChrome: initChrome,
    initPush: initPush,
    setStatusBar: setStatusBar,
    iap: {
      available: iapAvailable,
      configure: iapConfigure,
      packages: iapPackages,
      buy: iapBuy,
      restore: iapRestore,
      currentPlan: iapCurrentPlan,
      manage: iapManage
    }
  };

  // VoiceOver: give icon-only controls a spoken name (title → glyph map).
  (function () {
    var GLYPH = { '×': 'Close', '✕': 'Close', '✖': 'Close', 'x': 'Close', '‹': 'Back', '←': 'Back', '＋': 'Add', '+': 'Add', '⋯': 'More', '…': 'More', '›': 'Open' };
    function label() {
      var els = document.querySelectorAll('button:not([aria-label]), [role="button"]:not([aria-label]), .bni:not([aria-label])');
      for (var i = 0; i < els.length; i++) {
        var el = els[i], txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (el.title) { el.setAttribute('aria-label', el.title); continue; }
        if (GLYPH[txt]) { el.setAttribute('aria-label', GLYPH[txt]); continue; }
        if (!txt && el.querySelector('svg') && !el.getAttribute('aria-labelledby')) el.setAttribute('aria-label', el.getAttribute('data-label') || 'Button');
      }
    }
    var t = null;
    function soon() { clearTimeout(t); t = setTimeout(label, 250); }
    document.addEventListener('DOMContentLoaded', function () {
      label();
      new MutationObserver(soon).observe(document.body, { childList: true, subtree: true });
    });
  })();

  if (isNative) {
    // Collapse the large title as a screen scrolls. Hysteresis (on at 36px,
    // off at 6px) plus an overflow guard stop short pages flickering when
    // the shrinking header frees up space.
    document.addEventListener('scroll', function (e) {
      var sc = e.target;
      if (!sc || !sc.classList || !sc.classList.contains('scroll')) return;
      var shell = sc.closest('.shell');
      var head = shell && shell.querySelector('.ios-home-head');
      if (!head) return;
      var roomy = (sc.scrollHeight - sc.clientHeight) > 100;
      var on = head.classList.contains('compact');
      if (!on && roomy && sc.scrollTop > 36) head.classList.add('compact');
      else if (on && sc.scrollTop < 6) head.classList.remove('compact');
    }, true);
    // A light haptic tick on tab switches and primary actions — the
    // tactile feedback iOS users expect from native controls.
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('.bni, .btn-sea, .ss-btn-primary, .ios-head-btn, .chip-tap, .vf-chip');
      if (t) haptic('light');
    }, { passive: true });
    try { initChrome(); } catch (_) {}
    try { document.documentElement.classList.add('is-native'); } catch (_) {}
    // A native app doesn't pinch-zoom, and iOS shouldn't auto-zoom into
    // form fields either: lock the viewport scale inside the shell only.
    try {
      var vp = document.querySelector('meta[name="viewport"]');
      if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    } catch (_) {}
  }
})();
