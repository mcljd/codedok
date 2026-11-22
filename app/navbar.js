// CodedOK — floating "glass" tab bar with a separate scan button.
//
// The tab bars are repeated in each screen's markup; rather than edit them
// all, this wraps each bar's tabs in a pill and adds a round scan button
// beside it. The scan button opens an action sheet:
//   • Scan a certificate (camera + AI reader)
//   • Scan a QR code     (iPhone native scanner: CodedOK invite links open in
//                         the app; web links open in Safari View; text shown)
//   • Invite your surveyor
(function () {
  'use strict';

  var Cap = window.Capacitor;
  var isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
  function hasNative(name) {
    var h = (Cap && Cap.PluginHeaders) || [];
    for (var i = 0; i < h.length; i++) if (h[i] && h[i].name === name) return true;
    return false;
  }
  function plugin(name) {
    if (!isNative || !hasNative(name)) return null;
    try { return (Cap.Plugins && Cap.Plugins[name]) || null; } catch (_) { return null; }
  }
  function haptic(k) { try { window.CodedokNative && CodedokNative.haptic(k); } catch (_) {} }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var SCAN_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/>' +
    '<rect x="8" y="8" width="3" height="3" rx=".5"/><rect x="13" y="8" width="3" height="3" rx=".5"/><rect x="8" y="13" width="3" height="3" rx=".5"/><path d="M13 13h3v3"/></svg>';

  function build() {
    var navs = document.querySelectorAll('nav.bnav');
    for (var i = 0; i < navs.length; i++) {
      var nav = navs[i];
      if (nav.getAttribute('data-float')) continue;
      nav.setAttribute('data-float', '1');
      nav.classList.add('bnav-float');
      nav.setAttribute('aria-label', 'Main');
      var pill = document.createElement('div');
      pill.className = 'bnav-pill';
      pill.setAttribute('role', 'tablist');
      var tabs = nav.querySelectorAll('.bni');
      for (var j = 0; j < tabs.length; j++) {
        tabs[j].setAttribute('role', 'tab');
        tabs[j].setAttribute('aria-selected', tabs[j].classList.contains('on') ? 'true' : 'false');
        pill.appendChild(tabs[j]);
      }
      nav.appendChild(pill);
      var qr = document.createElement('button');
      qr.type = 'button';
      qr.className = 'bnav-qr';
      qr.setAttribute('aria-label', 'Scan a certificate or QR code');
      qr.innerHTML = SCAN_ICON;
      qr.addEventListener('click', function () { haptic('light'); openMenu(); });
      nav.appendChild(qr);
      var shell = nav.closest('.shell');
      if (shell) shell.classList.add('has-floatnav');
    }
  }

  // ── Action sheet ─────────────────────────────────────────────────────────
  function closeMenu() { var el = document.getElementById('scan-menu'); if (el) el.remove(); }
  function openMenu() {
    closeMenu();
    var el = document.createElement('div');
    el.className = 'bdrop on'; el.id = 'scan-menu';
    el.innerHTML =
      '<div class="sm-wrap" role="dialog" aria-modal="true" aria-label="Scan">' +
        '<div class="sm-group">' +
          '<button type="button" class="sm-act" data-sm="cert"><span class="sm-ic" aria-hidden="true">' + SCAN_ICON + '</span><span class="sm-tx"><b>Scan a certificate</b><small>We read the dates and file it for you</small></span></button>' +
          '<button type="button" class="sm-act" data-sm="qr"><span class="sm-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/></svg></span><span class="sm-tx"><b>Scan a QR code</b><small>Team or surveyor invites, equipment labels</small></span></button>' +
          '<button type="button" class="sm-act" data-sm="invite"><span class="sm-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><path d="M12 7v13M5 12H3a9 9 0 0 0 18 0h-2"/></svg></span><span class="sm-tx"><b>Invite your surveyor</b><small>They sign off inspections in the app</small></span></button>' +
        '</div>' +
        '<button type="button" class="sm-cancel" data-sm="cancel">Cancel</button>' +
      '</div>';
    el.addEventListener('click', function (e) {
      if (e.target === el) return closeMenu();
      var b = e.target.closest && e.target.closest('[data-sm]');
      if (!b) return;
      var a = b.getAttribute('data-sm');
      closeMenu();
      if (a === 'cert') { if (typeof window.scanCertWithAI === 'function') scanCertWithAI(); else if (window.go) go('s-scan'); }
      else if (a === 'qr') scanQr();
      else if (a === 'invite') { if (typeof window.openInviteSurveyorModal === 'function') openInviteSurveyorModal(); }
    });
    document.body.appendChild(el);
  }

  // ── QR scanning ──────────────────────────────────────────────────────────
  async function scanQr() {
    var P = plugin('CapacitorBarcodeScanner');
    if (!P) { if (window.toast) toast('QR scanning works in the CodedOK iPhone app'); return; }
    var text = '';
    try {
      var r = await P.scanBarcode({ hint: 0, scanInstructions: 'Point your camera at a QR code', scanButton: false, cameraDirection: 1, scanOrientation: 3 });
      text = (r && (r.ScanResult || r.scanResult)) || '';
    } catch (e) {
      if (!/cancel/i.test((e && e.message) || '')) { console.warn('QR scan', e); if (window.toast) toast('Couldn\'t read that QR code'); }
      return;
    }
    if (!text) return;
    haptic('success');
    handleQr(String(text).trim());
  }

  function handleQr(text) {
    // CodedOK invite link → accept it in the app.
    var inv = /[?#&]invite=([0-9a-f-]{8,})/i.exec(text);
    if (inv && /codedok/i.test(text)) {
      try { localStorage.setItem('codedok-pending-invite', inv[1]); } catch (_) {}
      if (typeof window.acceptPendingInvitation === 'function') {
        window.acceptPendingInvitation().then(function (ok) {
          if (!ok && window.toast) toast('Invite saved — sign in to accept it');
        });
      }
      return;
    }
    // Any other web link → confirm, then open in Safari View.
    if (/^https?:\/\//i.test(text)) {
      var host = '';
      try { host = new URL(text).hostname; } catch (_) {}
      if (confirm('Open this link?\n\n' + (host || text))) window.open(text, '_blank');
      return;
    }
    // Plain text → show it with a copy option.
    showText(text);
  }
  function showText(text) {
    closeMenu();
    var el = document.createElement('div');
    el.className = 'bdrop on'; el.id = 'scan-menu';
    el.innerHTML = '<div class="sm-wrap" role="dialog" aria-modal="true" aria-label="QR code contents">' +
      '<div class="sm-group sm-text"><div class="sm-text-h">QR code says</div><div class="sm-text-b">' + esc(text) + '</div></div>' +
      '<button type="button" class="sm-cancel" data-copy="1">Copy</button>' +
      '<button type="button" class="sm-cancel sm-plain" data-sm="cancel">Done</button></div>';
    el.addEventListener('click', function (e) {
      if (e.target === el) return closeMenu();
      var b = e.target.closest && e.target.closest('[data-copy],[data-sm]');
      if (!b) return;
      if (b.hasAttribute('data-copy')) { try { navigator.clipboard.writeText(text); if (window.toast) toast('Copied'); } catch (_) {} }
      closeMenu();
    });
    document.body.appendChild(el);
  }

  // Keep aria-selected in step with the highlighted tab.
  function syncSelected() {
    var tabs = document.querySelectorAll('.bnav-pill .bni');
    for (var i = 0; i < tabs.length; i++) tabs[i].setAttribute('aria-selected', tabs[i].classList.contains('on') ? 'true' : 'false');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.bni')) setTimeout(syncSelected, 0); });

  window.CodedokScan = { openMenu: openMenu, scanQr: scanQr, handleQr: handleQr };
})();
