// CodedOK — iPhone-only features layered on the web app.
//
//   • Print / PDF        window.print() → native iOS print sheet (MainViewController.swift)
//   • Quick actions      long-press the app icon: Scan, What's Due, Inspection Pack
//   • Local reminders    renewal alerts scheduled on the iPhone itself (30 / 7 / 0 days),
//                        so they arrive even with no signal and no server push
//   • Offline banner     honest status when the boat is out of signal
//   • Safari View        web links open in an in-app Safari sheet, not a dead WebView
//   • App Lock           optional Face ID / Touch ID / passcode lock + app-switcher privacy
//
// Every feature checks for its plugin and silently does nothing on the web.
(function () {
  'use strict';

  var Cap = window.Capacitor;
  var isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
  // Only hand back a plugin whose NATIVE half is in this build. Some plugin JS
  // wrappers call themselves when the native side is missing, which would spin
  // forever; a missing pod must degrade to "feature off", never a frozen app.
  function hasNative(name) {
    var h = (Cap && Cap.PluginHeaders) || [];
    for (var i = 0; i < h.length; i++) if (h[i] && h[i].name === name) return true;
    return false;
  }
  function plugin(name) {
    if (!isNative || !hasNative(name)) return null;
    try { return (Cap && Cap.Plugins && Cap.Plugins[name]) || null; } catch (_) { return null; }
  }
  function quiet(p) { if (p && typeof p.catch === 'function') p.catch(function () {}); return p; }
  function pref(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val);
    } catch (_) {}
    return null;
  }
  function say(msg) { if (window.toast) window.toast(msg); }
  function haptic(kind) { try { window.CodedokNative && CodedokNative.haptic(kind); } catch (_) {} }
  function locked() { return !!document.getElementById('app-lock'); }
  function inApp() {
    var on = document.querySelector('.shell.on');
    return !!on && !/^s-(login|land)$/.test(on.id) && !locked();
  }

  // ── 1. Print → iOS print sheet (Save to Files / Share as PDF) ────────────
  var printBridge = isNative && window.webkit && webkit.messageHandlers && webkit.messageHandlers.codedokPrint;
  if (printBridge) {
    window.print = function () {
      // The job name becomes the PDF's file name when saved from the print sheet.
      var name = window.__printTitle || document.title || 'CodedOK';
      window.__printTitle = null;
      try { webkit.messageHandlers.codedokPrint.postMessage(name); } catch (_) {}
    };
  }

  // ── 2. Home Screen quick actions ─────────────────────────────────────────
  function runAction(a) {
    if (typeof window.go !== 'function') return;
    if (a === 'scan') go('s-scan');
    else if (a === 'due') go('s-certs');
    else if (a === 'pack') go('s-inspection-pack');
  }
  var waiting = null;
  function waitForApp() {
    if (waiting) return;
    var tries = 0;
    waiting = setInterval(function () {
      tries++;
      if (window.__codedokLaunchAction && inApp()) {
        var a = window.__codedokLaunchAction;
        window.__codedokLaunchAction = null;
        clearInterval(waiting); waiting = null;
        setTimeout(function () { runAction(a); }, 250);
      } else if (tries > 240) { clearInterval(waiting); waiting = null; }
    }, 500);
  }
  window.CodedokQuickAction = function (a) {
    if (inApp()) runAction(a);
    else { window.__codedokLaunchAction = a; waitForApp(); }
  };
  if (window.__codedokLaunchAction) waitForApp();

  // ── 3. Renewal reminders scheduled on the iPhone ─────────────────────────
  var LN_IDS = 'codedok-ln-ids';
  var LN_PREF = 'codedok-local-reminders';   // 'on' | 'off' | null (not decided)
  function hashId(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (Math.abs(h) % 2000000000) + 1;
  }
  function dueDate(d) {
    if (!d) return null;
    var x = new Date(String(d).length <= 10 ? d + 'T09:00:00' : d);
    return isNaN(x.getTime()) ? null : x;
  }
  async function scheduleReminders() {
    var LN = plugin('LocalNotifications');
    if (!isNative || !LN || !window.Store || pref(LN_PREF) === 'off') return;
    try {
      var perm = await LN.checkPermissions();
      if (perm.display !== 'granted') return;
      var snap = Store.snapshot();
      var vessels = {};
      (snap.vessels || []).forEach(function (v) { vessels[v.id] = v; });
      var items = [];
      (snap.certs || []).forEach(function (c) { if (c.expires_at) items.push({ key: 'c' + c.id, name: c.name, v: vessels[c.vessel_id], date: c.expires_at, service: false }); });
      (snap.equipment || []).forEach(function (e) { if (e.next_service_at) items.push({ key: 'e' + e.id, name: e.name, v: vessels[e.vessel_id], date: e.next_service_at, service: true }); });
      (snap.crewCerts || []).forEach(function (cc) { if (cc.expires_at) items.push({ key: 'cc' + cc.id, name: cc.name, v: null, date: cc.expires_at, service: false }); });
      var now = Date.now(), notes = [];
      items.forEach(function (it) {
        var due = dueDate(it.date); if (!due) return;
        [30, 7, 0].forEach(function (off) {
          var at = new Date(due.getTime() - off * 86400000);
          at.setHours(9, 0, 0, 0);
          if (at.getTime() <= now + 60000) return;
          var what = it.service ? (off === 0 ? 'is due for service today' : 'is due for service in ' + off + ' days')
                                : (off === 0 ? 'expires today' : 'expires in ' + off + ' days');
          notes.push({
            id: hashId(it.key + ':' + off),
            title: it.name + ' ' + what,
            body: (it.v ? it.v.name + ' · ' : '') + 'Open CodedOK to renew it or log the new date.',
            schedule: { at: at, allowWhileIdle: true },
            threadIdentifier: 'codedok-renewals',
            extra: { screen: 's-certs' }
          });
        });
      });
      notes.sort(function (a, b) { return a.schedule.at - b.schedule.at; });
      notes = notes.slice(0, 60); // iOS keeps at most 64 pending
      var old = [];
      try { old = JSON.parse(pref(LN_IDS) || '[]'); } catch (_) {}
      if (old.length) await LN.cancel({ notifications: old.map(function (id) { return { id: id }; }) });
      if (notes.length) await LN.schedule({ notifications: notes });
      pref(LN_IDS, JSON.stringify(notes.map(function (n) { return n.id; })));
    } catch (e) { console.warn('local reminders', e); }
  }
  async function setLocalReminders(on) {
    var LN = plugin('LocalNotifications');
    if (!LN) return false;
    if (!on) {
      pref(LN_PREF, 'off');
      try {
        var old = JSON.parse(pref(LN_IDS) || '[]');
        if (old.length) await LN.cancel({ notifications: old.map(function (id) { return { id: id }; }) });
        pref(LN_IDS, '[]');
      } catch (_) {}
      return false;
    }
    var perm = await LN.checkPermissions();
    if (perm.display !== 'granted') perm = await LN.requestPermissions();
    if (perm.display !== 'granted') {
      say('Turn on notifications for CodedOK in Settings to get reminders.');
      pref(LN_PREF, 'off');
      return false;
    }
    pref(LN_PREF, 'on');
    await scheduleReminders();
    haptic('success');
    return true;
  }
  var reTimer = null;
  function scheduleSoon() { clearTimeout(reTimer); reTimer = setTimeout(scheduleReminders, 1500); }
  if (isNative) {
    var LNp = plugin('LocalNotifications');
    if (LNp && LNp.addListener) {
      quiet(LNp.addListener('localNotificationActionPerformed', function (e) {
        var screen = e && e.notification && e.notification.extra && e.notification.extra.screen;
        if (screen) { window.__codedokLaunchAction = 'due'; waitForApp(); }
      }));
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) scheduleReminders(); });
    setTimeout(scheduleReminders, 4000);
  }

  // ── 4. Offline banner ────────────────────────────────────────────────────
  var offline = false;
  function setOffline(off) {
    off = !!off;
    if (off === offline) return;
    offline = off;
    document.documentElement.classList.toggle('is-offline', off);
    var b = document.getElementById('net-banner');
    if (off && !b) {
      b = document.createElement('div');
      b.id = 'net-banner';
      b.setAttribute('role', 'status');
      b.textContent = 'Offline. Changes are saved on this iPhone and sync when you’re back in signal.';
      document.body.appendChild(b);
    } else if (!off && b) {
      b.remove();
      say('Back online');
    }
  }
  var Net = plugin('Network');
  if (Net && Net.getStatus) {
    Net.getStatus().then(function (s) { setOffline(!s.connected); }).catch(function () {});
    quiet(Net.addListener('networkStatusChange', function (s) { setOffline(!s.connected); }));
  } else {
    window.addEventListener('online', function () { setOffline(false); });
    window.addEventListener('offline', function () { setOffline(true); });
    if (navigator.onLine === false) setOffline(true);
  }

  // ── 5. Web links in Safari View Controller ───────────────────────────────
  var Browser = plugin('Browser');
  if (isNative && Browser) {
    var openUrl = function (url) { Browser.open({ url: url, presentationStyle: 'popover', toolbarColor: '#03203D' }); };
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a || a.hasAttribute('download')) return;
      var href = a.getAttribute('href') || '';
      if (!/^https?:\/\//i.test(href)) return;
      e.preventDefault();
      openUrl(href);
    }, true);
    var nativeOpen = window.open;
    window.open = function (url) {
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) { openUrl(url); return null; }
      return nativeOpen.apply(window, arguments);
    };
  }

  // ── 6. App Lock (Face ID / Touch ID / passcode) ──────────────────────────
  var LOCK_PREF = 'codedok-app-lock';
  var BA = hasNative('BiometricAuthNative') && window.capacitorBiometricAuth && window.capacitorBiometricAuth.BiometricAuth;
  var bioName = 'Face ID';
  var backgroundAt = 0;
  var LOCK_AFTER_MS = 60 * 1000;

  async function lockInfo() {
    if (!isNative || !BA) return { available: false, name: 'Face ID' };
    try {
      var r = await BA.checkBiometry();
      var t = r && r.biometryType;
      // BiometryType: 1 = touchId, 2 = faceId (iOS values).
      bioName = t === 1 ? 'Touch ID' : t === 2 ? 'Face ID' : (r.deviceIsSecure ? 'Passcode' : 'Face ID');
      // Device passcode also counts: we allow it as a fallback.
      return { available: !!(r.isAvailable || r.deviceIsSecure), name: bioName };
    } catch (_) { return { available: false, name: bioName }; }
  }
  async function authenticate() {
    if (!BA) return false;
    try {
      await BA.authenticate({ reason: 'Unlock CodedOK', cancelTitle: 'Cancel', allowDeviceCredential: true, iosFallbackTitle: 'Use Passcode' });
      return true;
    } catch (_) { return false; }
  }
  function showLock() {
    if (locked()) return;
    var el = document.createElement('div');
    el.id = 'app-lock';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'CodedOK is locked');
    el.innerHTML =
      '<div class="al-card">' +
        '<img src="icons/codedok-mark.svg" alt="" width="64" height="64">' +
        '<div class="al-title">CodedOK is locked</div>' +
        '<button type="button" class="al-btn" id="al-unlock">Unlock with ' + bioName + '</button>' +
      '</div>';
    document.body.appendChild(el);
    document.getElementById('al-unlock').addEventListener('click', unlock);
  }
  async function unlock() {
    if (await authenticate()) {
      var el = document.getElementById('app-lock');
      if (el) { el.classList.add('out'); setTimeout(function () { el.remove(); }, 220); }
      haptic('success');
      if (window.__codedokLaunchAction) waitForApp();
    }
  }
  async function lockNow() { await lockInfo(); showLock(); unlock(); }
  async function setAppLock(on) {
    if (!on) { pref(LOCK_PREF, null); return false; }
    var info = await lockInfo();
    if (!info.available) { say('Set up Face ID or a passcode on this iPhone first.'); return false; }
    if (!(await authenticate())) return false;  // prove it works before relying on it
    pref(LOCK_PREF, 'on');
    say('App Lock is on');
    return true;
  }
  if (isNative && BA) {
    if (pref(LOCK_PREF) === 'on') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lockNow);
      else lockNow();
    }
    var App = plugin('App');
    if (App && App.addListener) {
      quiet(App.addListener('appStateChange', function (s) {
        if (pref(LOCK_PREF) !== 'on') return;
        if (!s.isActive) {
          backgroundAt = Date.now();
          document.documentElement.classList.add('app-privacy'); // hide data in the app switcher
        } else {
          document.documentElement.classList.remove('app-privacy');
          if (backgroundAt && Date.now() - backgroundAt > LOCK_AFTER_MS) lockNow();
        }
      }));
    }
  }

  // ── 7. Swipe from the left edge to go back (like UINavigationController) ──
  (function () {
    var sx = 0, sy = 0, shell = null, back = null, dx = 0;
    document.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      shell = null;
      if (!t || t.clientX > 24 || locked()) return;
      var on = document.querySelector('.shell.on');
      var b = on && on.querySelector('.tbar .back');
      if (!b || b.offsetParent === null) return;
      shell = on; back = b; sx = t.clientX; sy = t.clientY; dx = 0;
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!shell) return;
      var t = e.touches[0];
      dx = t.clientX - sx;
      if (Math.abs(t.clientY - sy) > 60) { shell.style.transform = ''; shell = null; return; }
      if (dx > 0) { shell.style.transition = 'none'; shell.style.transform = 'translateX(' + Math.min(dx, innerWidth) * 0.6 + 'px)'; }
    }, { passive: true });
    document.addEventListener('touchend', function () {
      if (!shell) return;
      var s = shell, b = back; shell = null;
      s.style.transition = 'transform .2s ease';
      s.style.transform = '';
      setTimeout(function () { s.style.transition = ''; }, 220);
      if (dx > 90) { haptic('light'); b.click(); }
    }, { passive: true });
  })();

  // ── 8. Account switches (App Lock, renewal alerts) ───────────────────────
  async function syncSwitches() {
    var lock = document.getElementById('acct-lock'), ln = document.getElementById('acct-ln');
    if (lock) {
      lock.checked = pref(LOCK_PREF) === 'on';
      var info = await lockInfo();
      var nm = document.getElementById('acct-lock-sub');
      if (nm) nm.textContent = info.available ? 'Ask for ' + info.name + ' when CodedOK opens' : 'Set up Face ID or a passcode on this iPhone to use App Lock';
      lock.disabled = !info.available;
    }
    if (ln) {
      var LN = plugin('LocalNotifications');
      var granted = false;
      try { granted = !!LN && (await LN.checkPermissions()).display === 'granted'; } catch (_) {}
      ln.checked = granted && pref(LN_PREF) !== 'off';
    }
  }
  document.addEventListener('change', async function (e) {
    var t = e.target;
    if (t && t.id === 'acct-lock') { t.checked = await setAppLock(t.checked); }
    if (t && t.id === 'acct-ln') { t.checked = await setLocalReminders(t.checked); }
  });
  if (isNative) {
    var acct = document.getElementById('s-account');
    var watch = function () {
      var a = document.getElementById('s-account');
      if (!a) return;
      new MutationObserver(function () { if (a.classList.contains('on')) syncSwitches(); })
        .observe(a, { attributes: true, attributeFilter: ['class'] });
    };
    if (acct) watch(); else document.addEventListener('DOMContentLoaded', watch);
  }

  window.CodedokIOS = {
    scheduleReminders: scheduleSoon,
    setLocalReminders: setLocalReminders,
    localRemindersOn: function () { return pref(LN_PREF) !== 'off'; },
    lockInfo: lockInfo,
    setAppLock: setAppLock,
    appLockOn: function () { return pref(LOCK_PREF) === 'on'; },
    canPrintNatively: !!printBridge
  };
})();
