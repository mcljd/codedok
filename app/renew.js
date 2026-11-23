// CodedOK — one-tap renewals.
//
// Tap an expired / due certificate → a Renew card shows:
//   1. who renews it, with a link to find them (opens in Safari View on iPhone)
//   2. "Snap the new certificate" → AI reads it → updates THIS record
//      (new dates, number, photo attached); the old details are kept in
//      renewal_history so the audit trail survives.
// Also "Type the new date" for when there's no paper yet.
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(d) {
    if (!d) return '—';
    var x = new Date(d);
    return isNaN(x.getTime()) ? '—' : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function search(q) { return 'https://www.google.com/search?q=' + encodeURIComponent(q); }

  // Who renews what. Plain-English, UK-first with the Irish equivalent noted.
  var GUIDE = {
    coding:      { who: 'Your Certifying Authority', tip: 'Book the renewal (or annual) examination with the Certifying Authority that coded the boat — e.g. YDSA, MECAL or another MCA-approved CA.', q: 'MCA certifying authority small commercial vessel coding survey' },
    radio:       { who: 'Ofcom (UK) or ComReg (Ireland)', tip: 'Ship Radio Licences are renewed online. Check the vessel name and MMSI match.', q: 'Ofcom ship radio licence renew' },
    mmsi:        { who: 'Ofcom (UK) or ComReg (Ireland)', tip: 'Your MMSI is part of the Ship Radio Licence — renew that and this is covered.', q: 'Ofcom ship radio licence MMSI' },
    pli:         { who: 'Your marine insurer or broker', tip: 'Ask for the new schedule as a PDF and snap or upload it here.', q: 'commercial vessel public liability insurance renewal' },
    insurance:   { who: 'Your marine insurer or broker', tip: 'Ask for the new schedule as a PDF and snap or upload it here.', q: 'marine insurance renewal commercial vessel' },
    liferaft:    { who: 'An approved liferaft service station', tip: 'The service certificate and the label on the canister both show the next due date.', q: 'approved liferaft service station near me' },
    pyrotechnics:{ who: 'A chandlery or flare supplier', tip: 'Replace out-of-date flares, and take old ones to an approved disposal point — never the bin.', q: 'SOLAS flares supplier and old flare disposal UK' },
    epirb:       { who: 'A beacon service agent', tip: 'Check the battery and hydrostatic release dates, and keep your beacon registration up to date.', q: 'EPIRB battery service and beacon registration UK' },
    sart:        { who: 'A beacon service agent', tip: 'Battery replacement is done by an approved service agent.', q: 'SART battery replacement service' },
    fire_ext_portable: { who: 'A fire equipment service engineer', tip: 'Portable extinguishers need an annual service by a competent engineer.', q: 'marine fire extinguisher service near me' },
    fire_ext_fixed:    { who: 'A fire equipment service engineer', tip: 'Fixed systems need servicing by an approved engineer.', q: 'marine fixed fire extinguishing system service' },
    medical:     { who: 'An MCA-approved ENG1 doctor', tip: 'Book an ENG1 (or ML5 where allowed) with an approved doctor.', q: 'MCA approved doctor ENG1 medical' },
    first_aid:   { who: 'An approved first-aid training centre', tip: 'Book a refresher course before it lapses.', q: 'RYA first aid course near me' },
    skipper:     { who: 'An RYA or MCA training centre', tip: 'Commercial endorsements need a valid medical and first-aid certificate.', q: 'RYA commercial endorsement revalidation' }
  };
  function guideFor(c) {
    var g = GUIDE[c.kind] || null;
    var name = c.name || 'certificate';
    if (!g) g = { who: c.issuer || 'Whoever issued it', tip: 'Contact the issuer to renew, then snap the new certificate.', q: (c.issuer ? c.issuer + ' ' : '') + name + ' renewal' };
    var links = [];
    if (c.issuer && !/^(certifying authority|marine insurer)$/i.test(c.issuer)) links.push({ label: 'Find ' + c.issuer, url: search(c.issuer + ' ' + name + ' renewal') });
    links.push({ label: 'Where to renew', url: search(g.q) });
    return { who: g.who, tip: g.tip, links: links };
  }

  // The card shown at the top of the certificate sheet when it needs doing.
  function block(c) {
    if (!c || !window.Store) return '';
    var d = Store.daysUntil(c.expires_at);
    if (d === Infinity || d > 60) return '';
    var g = guideFor(c);
    var head = d < 0 ? 'Expired ' + Math.abs(d) + ' day' + (Math.abs(d) === 1 ? '' : 's') + ' ago' : d === 0 ? 'Expires today' : 'Due in ' + d + ' day' + (d === 1 ? '' : 's');
    return '<div class="rn-card ' + (d < 0 ? 'rn-rd' : 'rn-am') + '">' +
      '<div class="rn-head">' + head + '</div>' +
      '<div class="rn-step"><span class="rn-n">1</span><div class="rn-tx"><div class="rn-t">Get it renewed</div>' +
        '<div class="rn-s">' + esc(g.who) + '. ' + esc(g.tip) + '</div>' +
        '<div class="rn-links">' + g.links.map(function (l) {
          return '<a class="rn-link" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + ' ›</a>';
        }).join('') + '</div></div></div>' +
      '<div class="rn-step"><span class="rn-n">2</span><div class="rn-tx"><div class="rn-t">Snap the new certificate</div>' +
        '<div class="rn-s">We\'ll read the new dates and update this record. The old one is kept in its history.</div></div></div>' +
      '<button type="button" class="btn btn-sea btn-full rn-go" data-renew="' + esc(c.id) + '">Snap the new certificate</button>' +
      '<button type="button" class="rn-alt" data-renew-date="' + esc(c.id) + '">No paper yet? Type the new expiry date</button>' +
    '</div>';
  }

  // ── Renewal state ────────────────────────────────────────────────────────
  // A renewal is "live" for a few minutes only, so a cancelled camera can
  // never cause a later, unrelated scan to overwrite this certificate.
  var renewingId = null, startedAt = 0, TTL = 4 * 60 * 1000;
  function start(certId) {
    var c = Store.getCert(certId);
    if (!c) return;
    renewingId = certId; startedAt = Date.now();
    if (window.closeCertSheet) closeCertSheet();
    if (typeof window.pickCertPhoto === 'function') pickCertPhoto(c.vessel_id);
  }
  function active() {
    if (renewingId && Date.now() - startedAt > TTL) renewingId = null;
    return renewingId && Store.getCert(renewingId) ? Store.getCert(renewingId) : null;
  }
  function cancel() { renewingId = null; }

  // Apply the new details to the existing record, keeping the old ones.
  function apply(certId, fields) {
    var c = Store.getCert(certId);
    if (!c) return null;
    var history = Array.isArray(c.renewal_history) ? c.renewal_history.slice() : [];
    history.push({
      expires_at: c.expires_at || null, issued_at: c.issued_at || null,
      number: c.number || null, issuer: c.issuer || null,
      file_name: c.file ? c.file.name : null,
      replaced_at: new Date().toISOString()
    });
    var patch = { renewal_history: history.slice(-20), renewed_at: new Date().toISOString() };
    ['expires_at', 'issued_at', 'number', 'issuer', 'file', 'extraction'].forEach(function (k) {
      if (fields[k] !== undefined && fields[k] !== null && fields[k] !== '') patch[k] = fields[k];
    });
    Store.updateCert(certId, patch);
    renewingId = null;
    try { CodedokNative.haptic('success'); } catch (_) {}
    var d = Store.daysUntil(patch.expires_at || c.expires_at);
    if (window.toast) toast(patch.expires_at ? 'Renewed — valid until ' + fmt(patch.expires_at) : 'Certificate updated');
    try { if (window.CodedokIOS) CodedokIOS.scheduleReminders(); } catch (_) {}
    refresh();
    return d;
  }
  function refresh() {
    var on = document.querySelector('.shell.on');
    if (on && typeof window.go === 'function') go(on.id);
  }

  // ── "Type the new date" sheet ────────────────────────────────────────────
  function openDateSheet(certId, message) {
    var c = Store.getCert(certId);
    if (!c) return;
    closeDateSheet();
    if (window.closeCertSheet) closeCertSheet();
    var el = document.createElement('div');
    el.className = 'bdrop on'; el.id = 'rn-date-sheet';
    el.innerHTML = '<div class="sheet rs-sheet" role="dialog" aria-modal="true" aria-labelledby="rn-date-h">' +
      '<div class="rs-grab" aria-hidden="true"></div>' +
      '<div class="rs-sheet-hd"><button type="button" class="rs-link" data-rn-close="1">Cancel</button>' +
      '<div class="rs-sheet-t" id="rn-date-h">Renew</div>' +
      '<button type="button" class="rs-link rs-strong" data-rn-save="' + esc(certId) + '">Save</button></div>' +
      (message ? '<p class="rn-msg">' + esc(message) + '</p>' : '') +
      '<div class="rn-what">' + esc(c.name) + '</div>' +
      '<label class="fl" for="rn-exp">New expiry date</label>' +
      '<input class="fi" id="rn-exp" type="date" min="' + new Date().toISOString().slice(0, 10) + '">' +
      '<label class="fl rs-mt" for="rn-num">New certificate number (optional)</label>' +
      '<input class="fi" id="rn-num" autocomplete="off" placeholder="' + esc(c.number || '') + '">' +
      '<p class="rs-foot">The previous dates stay in this certificate\'s history.</p>' +
      '</div>';
    el.addEventListener('click', function (e) { if (e.target === el) closeDateSheet(); });
    document.body.appendChild(el);
    setTimeout(function () { var i = document.getElementById('rn-exp'); if (i) i.focus(); }, 280);
  }
  function closeDateSheet() { var el = document.getElementById('rn-date-sheet'); if (el) el.remove(); }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-renew],[data-renew-date],[data-rn-close],[data-rn-save]');
    if (!t) return;
    if (t.hasAttribute('data-renew')) start(t.getAttribute('data-renew'));
    else if (t.hasAttribute('data-renew-date')) openDateSheet(t.getAttribute('data-renew-date'));
    else if (t.hasAttribute('data-rn-close')) { closeDateSheet(); renewingId = null; }
    else if (t.hasAttribute('data-rn-save')) {
      var exp = (document.getElementById('rn-exp') || {}).value;
      if (!exp) { var i = document.getElementById('rn-exp'); if (i) i.focus(); return; }
      var num = ((document.getElementById('rn-num') || {}).value || '').trim();
      var id = t.getAttribute('data-rn-save');
      closeDateSheet();
      apply(id, { expires_at: exp, number: num || undefined });
    }
  });

  window.CodedokRenew = {
    block: block, start: start, active: active, cancel: cancel, apply: apply,
    openDateSheet: openDateSheet, guideFor: guideFor
  };
})();
