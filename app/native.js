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
    try { if (Status && Status.setStyle) Status.setStyle({ style: 'DARK' }); } catch (_) {}
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

  window.CodedokNative = {
    isNative: isNative,
    scanDocument: scanDocument,
    takePhoto: takePhoto,
    shareFile: shareFile,
    haptic: haptic,
    initChrome: initChrome,
    initPush: initPush
  };

  if (isNative) {
    try { initChrome(); } catch (_) {}
    try { document.documentElement.classList.add('is-native'); } catch (_) {}
  }
})();
