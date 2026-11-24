// CodedOK — real screens for Gap check, Deficiency log, Inspection pack and
// Surveys. Before this they showed an "in progress" placeholder to real users
// (an App Review 2.1 risk and a dead end from the Tools tab). Built only from
// data the app already holds: Store records + Codes requirements.
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
  function days(d) { return window.Store ? Store.daysUntil(d) : Infinity; }
  function vessels() { return (window.Store && Store.snapshot().vessels) || []; }

  // One vessel is "current" across these screens.
  var current = null;
  function pickVessel() {
    var vs = vessels();
    if (!vs.length) return null;
    if (!current || !vs.some(function (v) { return v.id === current; })) current = vs[0].id;
    return Store.getVessel(current);
  }
  function vesselSwitcher(screen) {
    var vs = vessels();
    if (vs.length < 2) return '';
    return '<div class="rs-seg" role="tablist" aria-label="Choose a boat">' + vs.map(function (v) {
      var on = v.id === current;
      return '<button type="button" role="tab" aria-selected="' + on + '" class="rs-seg-b' + (on ? ' on' : '') +
        '" data-v="' + esc(v.id) + '" data-s="' + esc(screen) + '">' + esc(v.name) + '</button>';
    }).join('') + '</div>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.rs-seg-b[data-v]');
    if (!b) return;
    current = b.getAttribute('data-v');
    var r = RENDER[b.getAttribute('data-s')];
    if (r) r();
  });
  function noBoats(sc) {
    sc.innerHTML = '<div class="rs-empty"><div class="rs-empty-ic" aria-hidden="true">⛵️</div>' +
      '<div class="rs-empty-h">Add your first boat</div>' +
      '<div class="rs-empty-sub">This works from your boat\'s records. Add a boat to get started.</div>' +
      '<button class="btn btn-sea rs-cta" onclick="go(\'s-onboard\')">Add a boat</button></div>';
  }
  function scrollOf(id) { var s = document.getElementById(id); return s && s.querySelector('.scroll'); }

  // ── Requirements gap ─────────────────────────────────────────────────────
  var CREW_KEYS = ['eng1', 'ml5', 'vhf', 'src', 'goc', 'stcw', 'first aid', 'yachtmaster', 'day skipper', 'powerboat', 'coastal skipper', 'boatmaster', 'sea survival', 'fire'];
  function gapFor(v) {
    var C = window.Codes;
    if (!C) return null;
    var certs = Store.vesselCerts(v.id), equip = Store.vesselEquipment(v.id);
    var crewNames = [];
    var snap = Store.snapshot();
    Store.vesselCrew(v.id).forEach(function (p) {
      (snap.crewCerts || []).forEach(function (cc) {
        if (cc.person_id === p.id && days(cc.expires_at) >= 0) crewNames.push(String(cc.name || '').toLowerCase());
      });
    });
    var out = { certs: [], equip: [], crew: [] };
    var trackedC = function (k) { return !C.TRACKED_CERT_KINDS || C.TRACKED_CERT_KINDS.indexOf(k) !== -1; };
    var trackedE = function (k) { return !C.TRACKED_EQUIPMENT_KINDS || C.TRACKED_EQUIPMENT_KINDS.indexOf(k) !== -1; };
    // Records count whichever list they were logged in.
    var both = certs.map(function (c) { return { kind: c.kind, expires_at: c.expires_at }; })
      .concat(equip.map(function (e) { return { kind: e.kind, expires_at: e.next_service_at }; }));
    C.requiredVesselCerts(v.category, v).filter(function (r) { return r.required; }).forEach(function (r) {
      var have = both.filter(function (c) { return c.kind === r.kind; });
      var best = have.sort(function (a, b) { return days(b.expires_at) - days(a.expires_at); })[0];
      // Items we can't hold a record for, or that the Code is unclear on,
      // are "check" rather than "missing".
      var st = !best ? (trackedC(r.kind) && !r.verify ? 'missing' : 'check') : days(best.expires_at) < 0 ? 'expired' : days(best.expires_at) <= 30 ? 'soon' : 'ok';
      out.certs.push({ name: r.name, sub: r.authority || '', st: st, rec: best, ref: r.ref });
    });
    C.requiredEquipment(v.category, v).filter(function (r) { return r.mandatory; }).forEach(function (r) {
      var have = both.filter(function (e) { return e.kind === r.kind; });
      var best = have.sort(function (a, b) { return days(b.expires_at) - days(a.expires_at); })[0];
      var st = !best ? (trackedE(r.kind) && !r.verify ? 'missing' : 'check') : days(best.expires_at) < 0 ? 'expired' : days(best.expires_at) <= 30 ? 'soon' : 'ok';
      var q = r.qty_resolved;
      out.equip.push({ name: r.name || r.kind, sub: typeof q === 'number' ? (q > 1 ? q + ' needed' : '') : (q ? String(q) : ''), st: st, rec: best, ref: r.ref });
    });
    C.requiredCrewQuals(v.category, v).filter(function (r) { return r.mandatory; }).forEach(function (r) {
      var want = String(r.cert || '').toLowerCase();
      var keys = CREW_KEYS.filter(function (k) { return want.indexOf(k) !== -1; });
      var met = keys.length && keys.some(function (k) { return crewNames.some(function (n) { return n.indexOf(k) !== -1; }); });
      out.crew.push({ name: r.cert, sub: r.role, st: met ? 'ok' : 'check' });
    });
    var all = out.certs.concat(out.equip, out.crew);
    // Score only what the app can verify from records; "check on board"
    // items are counted separately so they don't drag the score down.
    var decided = all.filter(function (x) { return x.st !== 'check'; });
    out.total = decided.length;
    out.met = decided.filter(function (x) { return x.st === 'ok' || x.st === 'soon'; }).length;
    out.toCheck = all.length - decided.length;
    out.problems = all.filter(function (x) { return x.st === 'missing' || x.st === 'expired'; }).length;
    return out;
  }
  var ST = {
    ok: ['rs-ok', '✓', 'On file'], soon: ['rs-am', '!', 'Renew soon'], expired: ['rs-rd', '!', 'Expired'],
    missing: ['rs-rd', '+', 'Missing'], check: ['rs-mu', '?', 'Check']
  };
  function reqRows(list, addAction) {
    return '<div class="ios-group">' + list.map(function (x) {
      var s = ST[x.st];
      var act = (x.st === 'missing' || x.st === 'expired') && addAction ? ' onclick="' + addAction + '"' : '';
      return '<div class="ios-row rs-req"' + act + (act ? ' role="button"' : '') + '>' +
        '<div class="rs-dot ' + s[0] + '" aria-hidden="true">' + s[1] + '</div>' +
        '<div class="ios-row-tx"><div class="ios-row-tt">' + esc(x.name) + '</div>' +
        (x.sub ? '<div class="ios-row-ss">' + esc(x.sub) + '</div>' : '') + '</div>' +
        '<span class="rs-tag ' + s[0] + '">' + s[2] + '</span></div>';
    }).join('') + '</div>';
  }

  // Code deadlines that matter right now (from Codes.KEY_DATES).
  function deadlineNote(v) {
    var C = window.Codes;
    if (!C || !C.KEY_DATES) return '';
    var wb = C.codeFor && C.codeFor(v) === 'workboat';
    var k = wb ? C.KEY_DATES.workboat : C.KEY_DATES.spv;
    var hasSms = (Store.snapshot().sms_documents || []).some(function (d) { return d.vessel_id === v.id && (d.status === 'signed' || d.status === 'active'); });
    var d = days(k.sms_by);
    var lines = [];
    if (!hasSms && d >= 0) lines.push('<strong>Safety Management System due by ' + fmt(k.sms_by) + '</strong> (' + d + ' days). ' + (wb ? 'Workboat Code §31.1.1.' : 'SPV Code §30.1.1.'));
    if (!wb) lines.push('Existing boats move to the new Code at their next renewal examination or by ' + fmt('2028-12-12') + ', whichever is later (Appendix 12).');
    if (!lines.length) return '';
    return '<div class="rs-note' + (!hasSms && d >= 0 && d <= 60 ? ' rs-note-urgent' : '') + '">' + lines.join('<br>') +
      (!hasSms ? '<button type="button" class="rs-link rs-note-btn" onclick="go(\'s-sms\')">Build your SMS ›</button>' : '') +
      '<button type="button" class="rs-link rs-note-btn" onclick="go(\'s-ready\')">Am I ready for the new Code? ›</button></div>';
  }

  function renderGap() {
    var sc = scrollOf('s-gap'); if (!sc) return;
    var v = pickVessel(); if (!v) return noBoats(sc);
    var g = gapFor(v);
    if (!g) { sc.innerHTML = '<div class="rs-empty"><div class="rs-empty-h">Requirements unavailable</div></div>'; return; }
    var pct = g.total ? Math.round(g.met / g.total * 100) : 100;
    sc.innerHTML = vesselSwitcher('s-gap') +
      '<div class="rs-hero">' +
        '<div class="rs-ring" style="--p:' + pct + '" role="img" aria-label="' + pct + ' percent of requirements met"><span>' + pct + '%</span></div>' +
        '<div><div class="rs-hero-h">' + (g.problems ? g.problems + ' thing' + (g.problems === 1 ? '' : 's') + ' to sort' : 'Nothing missing') + '</div>' +
        '<div class="rs-hero-sub">' + g.met + ' of ' + g.total + ' records in place for ' + esc(v.name) + ' · ' + esc(window.vesselCodeLabel ? vesselCodeLabel(v) : (v.category || '')) +
          (g.toCheck ? '<br>Plus ' + g.toCheck + ' item' + (g.toCheck === 1 ? '' : 's') + ' to check on board' : '') + '</div></div>' +
      '</div>' +
      '<div class="slbl">Certificates</div>' + reqRows(g.certs, "go('s-scan')") +
      '<div class="slbl">Safety equipment</div>' + reqRows(g.equip, "setActiveVessel('" + esc(v.id) + "');go('s-equipment-add')") +
      '<div class="slbl">Crew qualifications</div>' + reqRows(g.crew, null) +
      deadlineNote(v) +
      '<p class="rs-foot">Checked against the ' + (window.Codes.codeFor && window.Codes.codeFor(v) === 'workboat' ? 'Workboat Code Edition 3' : 'Sport or Pleasure Vessel Code 2025') +
      ' for Area ' + esc(String(window.Codes.areaFor(v.category, v) || '').replace('cat', '') || 'this category') +
      '. “Check” means it needs checking on board or can\'t be matched to a record automatically. Your Certifying Authority has the final say.</p>';
  }

  // ── Ready for the new Code ───────────────────────────────────────────────
  // The headline changes each Code brought in, the date each one bites, and
  // where this boat stands, worked out from her own records. Dates come from
  // Codes.KEY_DATES; section numbers are checked against the Code texts.
  var readyOpenOn = null; // set by openReady(): the boat to show first
  function openReady(vesselId) {
    readyOpenOn = vesselId || (window.getActiveVesselId ? getActiveVesselId() : null);
    if (window.go) go('s-ready');
  }
  // A Code date within 60 days (or already past) with no signed SMS: the one
  // line Home shows so the owner does not have to go looking for it.
  function codeWarning(v) {
    var C = window.Codes; if (!C || !C.KEY_DATES) return null;
    var wb = C.codeFor && C.codeFor(v) === 'workboat';
    var k = wb ? C.KEY_DATES.workboat : C.KEY_DATES.spv, d = days(k.sms_by);
    if (!(d <= 60)) return null;
    var has = (Store.snapshot().sms_documents || []).some(function (x) { return x.vessel_id === v.id && (x.status === 'signed' || x.status === 'active'); });
    if (has) return null;
    return { days: d, date: k.sms_by, text: 'Safety Management System ' + (d < 0 ? 'was needed by ' + fmt(k.sms_by) : d === 0 ? 'is needed today' : 'needed in ' + d + ' day' + (d === 1 ? '' : 's')) };
  }
  function readyFor(v) {
    var C = window.Codes, Q = window.QuickSms;
    var wb = C.codeFor && C.codeFor(v) === 'workboat';
    var k = wb ? C.KEY_DATES.workboat : C.KEY_DATES.spv;
    var doc = Q && Q.docFor ? Q.docFor(v.id) : null;
    var a = doc ? doc.sections.quick.answers : null;
    var signed = !!doc && doc.status === 'signed';
    var other = !doc && (Store.snapshot().sms_documents || []).some(function (d) { return d.vessel_id === v.id && (d.status === 'signed' || d.status === 'active'); });
    var sms = "QuickSms.start('" + esc(v.id) + "')";
    var by = function (d) { return 'Needed by ' + fmt(d); };
    var items = [];
    items.push({ name: 'Safety Management System, written and signed', due: k.sms_by,
      sub: by(k.sms_by) + (wb ? ' · Code 31.1.1' : ' · Code 30.1.1'),
      st: signed || other ? 'ok' : doc ? 'soon' : 'missing', tag: signed || other ? 'Done' : doc ? 'Sign it' : 'Start', act: sms });
    items.push({ name: 'Risk assessment to show your surveyor',
      sub: 'Before a certificate is issued or renewed · Code ' + (wb ? '3.14.1' : '3.13.1'),
      st: doc ? 'ok' : 'missing', tag: doc ? 'Done' : 'Start', act: sms });
    var rib = /rib/i.test(String(v.type || ''));
    if (a ? a.planing === 'y' : rib) items.push({ name: wb ? 'High-speed operation assessed; a proper seat for everyone' : 'Passengers at planing speed assessed',
      sub: wb ? 'At your next renewal or ' + fmt(k.sms_by) + ', whichever is later · Code 25.4' : 'Six points the Code lists · Code 25.7.2',
      st: a ? (a.fwdSeats ? 'ok' : 'soon') : 'missing', tag: a ? (a.fwdSeats ? 'Done' : 'Finish') : 'Start', act: sms });
    items.push({ name: 'Cyber security measures written down', due: wb ? k.sms_by : null,
      sub: wb ? by(k.sms_by) + ' · Code 31.3' : 'Part of the SMS · Appendix 7, 10',
      st: doc ? 'ok' : 'missing', tag: doc ? 'Done' : 'Start', act: sms });
    var drills = doc && Q.drillStatus ? Q.drillStatus(doc) : null;
    var due = drills ? drills.filter(function (x) { return x.due; }).length : 0;
    items.push({ name: 'Drills recorded, with the names of who took part',
      sub: (drills ? (due ? due + ' of ' + drills.length + ' due now' : 'All up to date') : 'Logged from your SMS') + ' · Appendix ' + (wb ? '8, 10.5' : '7, 7.5'),
      st: !doc ? 'missing' : due ? 'soon' : 'ok', tag: !doc ? 'Start' : due ? 'Log a drill' : 'Done',
      act: doc ? "QuickSms.log('drill','" + esc(doc.id) + "')" : sms });
    var crew = Store.vesselCrew(v.id) || [], acks = (doc && doc.acknowledgements) || [];
    var read = crew.filter(function (c) { return acks.some(function (x) { return x.crew_id === c.id; }); }).length;
    if (crew.length) items.push({ name: 'Crew have read the SMS',
      sub: read + ' of ' + crew.length + ' confirmed',
      st: !signed ? 'missing' : read < crew.length ? 'soon' : 'ok', tag: !signed ? 'After signing' : read < crew.length ? 'Confirm' : 'Done',
      act: doc ? "openSmsDoc('" + esc(doc.id) + "')" : sms });
    var snap = Store.snapshot(), fire = false;
    crew.forEach(function (p) { (snap.crewCerts || []).forEach(function (cc) { if (cc.person_id === p.id && /fire/i.test(String(cc.name || '')) && days(cc.expires_at) >= 0) fire = true; }); });
    items.push({ name: 'One-day firefighting course', due: wb ? null : k.courses_by,
      sub: wb ? (Number(v.length) >= 15 ? 'All crew' : 'At least one crew member') + ' · Appendix 5, Table A5.3'
              : (Number(v.length) >= 15 ? 'Master and one crew member' : 'Master or one crew member') + ' by ' + fmt(k.courses_by) + ' · Code 28.10',
      st: fire ? 'ok' : 'check', tag: fire ? 'On file' : 'Check', act: "go('s-crew')" });
    var g = gapFor(v);
    if (g) items.push({ name: 'Certificates and safety equipment on record',
      sub: g.problems ? g.problems + ' missing or expired' : g.met + ' of ' + g.total + ' in place',
      st: g.problems ? 'missing' : 'ok', tag: g.problems ? 'Sort' : 'Done', act: "go('s-gap')" });
    var coding = Store.vesselCerts(v.id).filter(function (c) { return c.kind === 'coding' && c.expires_at; })
      .sort(function (x, y) { return days(y.expires_at) - days(x.expires_at); })[0];
    return { wb: wb, k: k, items: items, coding: coding };
  }
  function renderReady() {
    var sc = scrollOf('s-ready'); if (!sc) return;
    if (readyOpenOn) { current = readyOpenOn; readyOpenOn = null; }
    var v = pickVessel(); if (!v) return noBoats(sc);
    if (!window.Codes || !Codes.KEY_DATES) { sc.innerHTML = '<div class="rs-empty"><div class="rs-empty-h">Requirements unavailable</div></div>'; return; }
    var r = readyFor(v), k = r.k;
    var counted = r.items.filter(function (x) { return x.st !== 'check'; });
    var done = counted.filter(function (x) { return x.st === 'ok'; }).length;
    var pct = counted.length ? Math.round(done / counted.length * 100) : 100;
    // The nearest dated item that is not done drives the headline.
    var next = r.items.filter(function (x) { return x.due && x.st !== 'ok' && x.st !== 'check'; }).sort(function (x, y) { return days(x.due) - days(y.due); })[0];
    var nd = next ? days(next.due) : null;
    var head = !next ? (done === counted.length ? 'Ready' : (counted.length - done) + ' to finish')
      : nd < 0 ? 'Past the date' : nd === 0 ? 'Due today' : nd + ' day' + (nd === 1 ? '' : 's') + ' left';
    var rows = '<div class="ios-group">' + r.items.map(function (x) {
      var s = ST[x.st];
      return '<div class="ios-row rs-req" role="button" tabindex="0" onclick="' + x.act + '">' +
        '<div class="rs-dot ' + s[0] + '" aria-hidden="true">' + (x.st === 'ok' ? '✓' : x.st === 'check' ? '?' : '!') + '</div>' +
        '<div class="ios-row-tx"><div class="ios-row-tt">' + esc(x.name) + '</div><div class="ios-row-ss">' + esc(x.sub) + '</div></div>' +
        '<span class="rs-tag ' + s[0] + '">' + esc(x.tag) + '</span></div>';
    }).join('') + '</div>';
    var codeName = r.wb ? 'Workboat Code Edition 3' : 'Sport or Pleasure Vessel Code 2025';
    var cut = r.wb ? k.sms_by : '2028-12-12';
    var when = r.coding && days(r.coding.expires_at) > days(cut)
      ? 'Your coding certificate on file runs to ' + fmt(r.coding.expires_at) + ', so for ' + esc(v.name) + ' the date is the renewal examination around then.'
      : r.coding ? 'Your coding certificate on file runs out before then, so for ' + esc(v.name) + ' the date is ' + fmt(cut) + '.' : '';
    sc.innerHTML = vesselSwitcher('s-ready') +
      '<div class="rs-hero">' +
        '<div class="rs-ring" style="--p:' + pct + '" role="img" aria-label="' + done + ' of ' + counted.length + ' ready"><span>' + done + '/' + counted.length + '</span></div>' +
        '<div><div class="rs-hero-h">' + esc(head) + '</div>' +
        '<div class="rs-hero-sub">' + (next ? esc(next.name.split(',')[0]) + ' · by ' + fmt(next.due) + '<br>' : '') + esc(v.name) + ' · ' + esc(codeName) + '</div></div>' +
      '</div>' +
      (next && nd >= 0 && nd <= 60 ? '<div class="rs-note rs-note-urgent"><strong>' + esc(next.name.split(',')[0]) + ' is needed by ' + fmt(next.due) + '.</strong> ' + (next.st === 'soon' ? 'Your draft is written. Check it and sign.' : 'It takes about 10 minutes to write here.') +
        '<button type="button" class="rs-link rs-note-btn" onclick="' + next.act + '">' + (next.st === 'soon' ? 'Open it ›' : 'Start now ›') + '</button></div>' : '') +
      '<div class="slbl">What the new Code asks for</div>' + rows +
      '<div class="rs-note"><strong>When it applies to an existing boat.</strong> A boat coded under the old rules meets the new Code at her next renewal examination or by ' + fmt(cut) + ', whichever is later (Appendix ' + (r.wb ? '9' : '12') + '). ' + when + '</div>' +
      '<p class="rs-foot">The ' + codeName + ' came into force on ' + fmt(k.in_force) + '. This list covers the main new duties for an owner, not every technical change to the boat. ' +
      '“Check” means the app cannot tell from your records. Your Certifying Authority has the final say.</p>';
  }

  // ── Deficiency log ───────────────────────────────────────────────────────
  var defView = 'open';
  var SEV = { critical: ['rs-rd', 'Critical'], major: ['rs-am', 'Major'], minor: ['rs-mu', 'Minor'] };
  function renderDeficiencies() {
    var sc = scrollOf('s-deficiencies'); if (!sc) return;
    var v = pickVessel(); if (!v) return noBoats(sc);
    var all = Store.vesselDeficiencies(v.id);
    var open = all.filter(function (d) { return d.status === 'open'; });
    var done = all.filter(function (d) { return d.status !== 'open'; });
    var list = (defView === 'open' ? open : done).slice().sort(function (a, b) {
      var o = { critical: 0, major: 1, minor: 2 };
      return (o[a.severity] - o[b.severity]) || String(b.raised_at).localeCompare(String(a.raised_at));
    });
    var rows = list.map(function (d) {
      var s = SEV[d.severity] || SEV.minor;
      var meta = (d.status === 'open' ? 'Raised ' + fmt(d.raised_at) : 'Fixed ' + fmt(d.resolved_at)) + (d.code_ref ? ' · ' + d.code_ref : '');
      return '<div class="ios-row rs-def">' +
        '<div class="ios-row-tx"><div class="ios-row-tt">' + esc(d.title) + '</div>' +
        '<div class="ios-row-ss"><span class="rs-tag ' + s[0] + '">' + s[1] + '</span> ' + esc(meta) + '</div>' +
        (d.notes ? '<div class="ios-row-ss rs-notes">' + esc(d.notes) + '</div>' : '') + '</div>' +
        (d.status === 'open' ? '<button type="button" class="rs-fix" data-fix="' + esc(d.id) + '" aria-label="Mark ' + esc(d.title) + ' as fixed">Fixed</button>' : '') +
        '</div>';
    }).join('');
    sc.innerHTML = vesselSwitcher('s-deficiencies') +
      '<div class="rs-tabs" role="tablist">' +
        '<button type="button" role="tab" aria-selected="' + (defView === 'open') + '" class="rs-tab' + (defView === 'open' ? ' on' : '') + '" data-dv="open">Open · ' + open.length + '</button>' +
        '<button type="button" role="tab" aria-selected="' + (defView === 'done') + '" class="rs-tab' + (defView === 'done' ? ' on' : '') + '" data-dv="done">Fixed · ' + done.length + '</button>' +
      '</div>' +
      (list.length ? '<div class="ios-group rs-list">' + rows + '</div>'
        : '<div class="rs-empty rs-empty-sm"><div class="rs-empty-ic" aria-hidden="true">' + (defView === 'open' ? '✓' : '—') + '</div>' +
          '<div class="rs-empty-h">' + (defView === 'open' ? 'No open deficiencies' : 'Nothing fixed yet') + '</div>' +
          '<div class="rs-empty-sub">' + (defView === 'open' ? 'Log anything a surveyor flags, or anything you spot yourself, so it\'s tracked until it\'s fixed.' : 'Fixed items appear here with the date, as your audit trail.') + '</div></div>') +
      '<div class="rs-pad"><button type="button" class="btn btn-sea btn-full rs-cta" data-newdef="1">Log a deficiency</button></div>';
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-dv],[data-fix],[data-newdef],[data-sev],[data-savedef],[data-closedef]');
    if (!t) return;
    if (t.hasAttribute('data-dv')) { defView = t.getAttribute('data-dv'); renderDeficiencies(); }
    else if (t.hasAttribute('data-fix')) {
      Store.resolveDeficiency(t.getAttribute('data-fix'));
      try { CodedokNative.haptic('success'); } catch (_) {}
      if (window.toast) toast('Marked as fixed');
      renderDeficiencies();
    }
    else if (t.hasAttribute('data-newdef')) openDefSheet();
    else if (t.hasAttribute('data-sev')) {
      document.querySelectorAll('#rs-def-sheet [data-sev]').forEach(function (b) { b.classList.toggle('on', b === t); b.setAttribute('aria-checked', b === t); });
    }
    else if (t.hasAttribute('data-closedef')) closeDefSheet();
    else if (t.hasAttribute('data-savedef')) {
      var title = (document.getElementById('rs-def-title').value || '').trim();
      if (!title) { document.getElementById('rs-def-title').focus(); return; }
      var sevBtn = document.querySelector('#rs-def-sheet [data-sev].on');
      Store.addDeficiency({
        vessel_id: current, title: title,
        severity: sevBtn ? sevBtn.getAttribute('data-sev') : 'minor',
        notes: (document.getElementById('rs-def-notes').value || '').trim() || null
      });
      try { CodedokNative.haptic('success'); } catch (_) {}
      closeDefSheet(); defView = 'open'; renderDeficiencies();
      if (window.toast) toast('Deficiency logged');
    }
  });
  function openDefSheet() {
    closeDefSheet();
    var el = document.createElement('div');
    el.className = 'bdrop on'; el.id = 'rs-def-sheet';
    el.innerHTML = '<div class="sheet rs-sheet" role="dialog" aria-modal="true" aria-labelledby="rs-def-h">' +
      '<div class="rs-grab" aria-hidden="true"></div>' +
      '<div class="rs-sheet-hd"><button type="button" class="rs-link" data-closedef="1">Cancel</button>' +
      '<div class="rs-sheet-t" id="rs-def-h">New deficiency</div>' +
      '<button type="button" class="rs-link rs-strong" data-savedef="1">Add</button></div>' +
      '<label class="fl" for="rs-def-title">What needs fixing?</label>' +
      '<input class="fi" id="rs-def-title" maxlength="140" placeholder="e.g. Bilge alarm not sounding" autocomplete="off">' +
      '<div class="fl rs-mt">How serious is it?</div>' +
      '<div class="rs-seg rs-seg-full" role="radiogroup" aria-label="Severity">' +
        '<button type="button" role="radio" aria-checked="false" class="rs-seg-b" data-sev="minor">Minor</button>' +
        '<button type="button" role="radio" aria-checked="true" class="rs-seg-b on" data-sev="major">Major</button>' +
        '<button type="button" role="radio" aria-checked="false" class="rs-seg-b" data-sev="critical">Critical</button>' +
      '</div>' +
      '<label class="fl rs-mt" for="rs-def-notes">Notes (optional)</label>' +
      '<textarea class="fi" id="rs-def-notes" rows="3" maxlength="600" placeholder="Where it is, who flagged it, what you\'ve ordered"></textarea>' +
      '</div>';
    el.addEventListener('click', function (e) { if (e.target === el) closeDefSheet(); });
    document.body.appendChild(el);
    setTimeout(function () { var i = document.getElementById('rs-def-title'); if (i) i.focus(); }, 280);
  }
  function closeDefSheet() { var el = document.getElementById('rs-def-sheet'); if (el) el.remove(); }

  // ── Inspection pack ──────────────────────────────────────────────────────
  function renderPack() {
    var sc = scrollOf('s-inspection-pack'); if (!sc) return;
    var v = pickVessel(); if (!v) return noBoats(sc);
    var certs = Store.vesselCerts(v.id), equip = Store.vesselEquipment(v.id);
    var dated = certs.map(function (c) { return days(c.expires_at); }).concat(equip.map(function (e) { return days(e.next_service_at); }));
    var expired = dated.filter(function (d) { return d < 0; }).length;
    var soon = dated.filter(function (d) { return d >= 0 && d <= 30; }).length;
    var openDefs = Store.vesselDeficiencies(v.id, { openOnly: true }).length;
    var g = gapFor(v);
    var missing = g ? g.problems : 0;
    var ready = !expired && !missing && !openDefs;
    var native = window.CodedokIOS && CodedokIOS.canPrintNatively;
    sc.innerHTML = vesselSwitcher('s-inspection-pack') +
      '<div class="rs-hero">' +
        '<div class="rs-badge ' + (ready ? 'rs-ok' : 'rs-am') + '" aria-hidden="true">' + (ready ? '✓' : '!') + '</div>' +
        '<div><div class="rs-hero-h">' + (ready ? 'Ready for your surveyor' : 'Worth a look first') + '</div>' +
        '<div class="rs-hero-sub">' + esc(v.name) + ' · ' + certs.length + ' certificates · ' + equip.length + ' equipment items</div></div>' +
      '</div>' +
      '<div class="ios-group">' +
        statRow('Expired', expired, expired ? 'rs-rd' : 'rs-ok', "go('s-certs')") +
        statRow('Due in 30 days', soon, soon ? 'rs-am' : 'rs-ok', "go('s-certs')") +
        statRow('Missing requirements', missing, missing ? 'rs-rd' : 'rs-ok', "go('s-gap')") +
        statRow('Open deficiencies', openDefs, openDefs ? 'rs-am' : 'rs-ok', "go('s-deficiencies')") +
      '</div>' +
      '<div class="slbl">In the pack</div>' +
      '<div class="ios-group rs-incl">' +
        ['Vessel particulars and compliance score', 'Every certificate with issuer, number and expiry', 'Safety equipment register and service dates', 'Crew and their qualifications', 'Open deficiencies and recent history'].map(function (t) {
          return '<div class="ios-row"><div class="rs-dot rs-ok" aria-hidden="true">✓</div><div class="ios-row-tx"><div class="ios-row-tt">' + t + '</div></div></div>';
        }).join('') +
      '</div>' +
      '<div class="rs-pad">' +
        '<button type="button" class="btn btn-sea btn-full rs-cta" data-pack="' + esc(v.id) + '">Create PDF</button>' +
        (vessels().length > 1 ? '<button type="button" class="btn btn-out btn-full rs-cta2" data-pack="fleet">Whole fleet</button>' : '') +
        '<p class="rs-foot">' + (native ? 'Opens the iOS print sheet. Tap the Share button there to save the PDF to Files or send it.' : 'Opens your browser\'s print dialog. Choose “Save as PDF”.') + '</p>' +
      '</div>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-pack]');
    if (!b) return;
    var id = b.getAttribute('data-pack');
    var day = new Date().toISOString().slice(0, 10);
    if (id === 'fleet') {
      window.__printTitle = 'CodedOK inspection pack - fleet - ' + day;
      exportFleetInspectionPack();
    } else {
      var v = Store.getVessel(id);
      window.__printTitle = 'CodedOK inspection pack - ' + String((v && v.name) || 'vessel').replace(/[\\/:*?"<>|]/g, '') + ' - ' + day;
      setActiveVessel(id);
      exportInspectionPack();
    }
  });
  function statRow(label, n, cls, action) {
    return '<div class="ios-row" role="button" onclick="' + action + '"><div class="ios-row-tx"><div class="ios-row-tt">' + label + '</div></div>' +
      '<span class="rs-count ' + cls + '">' + n + '</span><span class="chev" aria-hidden="true">›</span></div>';
  }

  // ── Surveys ──────────────────────────────────────────────────────────────
  function renderSurveys() {
    var sc = scrollOf('s-surveys'); if (!sc) return;
    var v = pickVessel(); if (!v) return noBoats(sc);
    var coding = Store.vesselCerts(v.id).filter(function (c) { return c.kind === 'coding'; })
      .sort(function (a, b) { return days(b.expires_at) - days(a.expires_at); })[0];
    var insp = (Store.vesselInspections(v.id) || []);
    var next = '';
    if (coding && coding.expires_at) {
      var d = days(coding.expires_at);
      next = '<div class="rs-hero">' +
        '<div class="rs-badge ' + (d < 0 ? 'rs-rd' : d <= 60 ? 'rs-am' : 'rs-ok') + '" aria-hidden="true">⚓︎</div>' +
        '<div><div class="rs-hero-h">' + (d < 0 ? 'Coding survey overdue' : 'Next coding survey') + '</div>' +
        '<div class="rs-hero-sub">' + (d < 0 ? 'Certificate expired ' + fmt(coding.expires_at) : 'Due by ' + fmt(coding.expires_at) + ' · ' + d + ' days') + '</div></div></div>';
    } else {
      next = '<div class="rs-hero"><div class="rs-badge rs-mu" aria-hidden="true">?</div><div><div class="rs-hero-h">No coding certificate on file</div>' +
        '<div class="rs-hero-sub">Scan it and we\'ll track when the next survey is due.</div></div></div>' +
        '<div class="rs-pad"><button type="button" class="btn btn-sea btn-full rs-cta" onclick="go(\'s-scan\')">Scan coding certificate</button></div>';
    }
    var hist = insp.length ? '<div class="ios-group">' + insp.map(function (i) {
      var signed = i.status === 'signed';
      return '<div class="ios-row"><div class="rs-dot ' + (signed ? 'rs-ok' : 'rs-am') + '" aria-hidden="true">' + (signed ? '✓' : '…') + '</div>' +
        '<div class="ios-row-tx"><div class="ios-row-tt">' + esc(i.summary || (signed ? 'Inspection signed off' : 'Inspection in progress')) + '</div>' +
        '<div class="ios-row-ss">' + fmt(i.completed_at || i.started_at) + '</div></div></div>';
    }).join('') + '</div>'
      : '<div class="rs-empty rs-empty-sm"><div class="rs-empty-h">No surveys recorded yet</div><div class="rs-empty-sub">When your surveyor signs off an inspection in CodedOK it\'s saved here.</div></div>';
    sc.innerHTML = vesselSwitcher('s-surveys') + next +
      '<div class="slbl">History</div>' + hist +
      '<div class="rs-pad">' +
        '<button type="button" class="btn btn-out btn-full rs-cta2" onclick="go(\'s-gap\')">Check what a surveyor will look for</button>' +
        (typeof window.openInviteSurveyorModal === 'function' ? '<button type="button" class="btn btn-sea btn-full rs-cta" onclick="openInviteSurveyorModal()">Invite your surveyor</button>' : '') +
      '</div>';
  }

  // ── Crew (all crew across the fleet) ────────────────────────────────────
  function initialsOf(name) {
    return String(name || '?').trim().split(/\s+/).map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase();
  }
  function renderCrew() {
    var sc = scrollOf('s-crew'); if (!sc) return;
    var snap = Store.snapshot();
    var crew = (snap.crew || []).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    if (!crew.length) {
      sc.innerHTML = '<div class="rs-empty"><div class="rs-empty-ic" aria-hidden="true">👥</div>' +
        '<div class="rs-empty-h">No crew yet</div>' +
        '<div class="rs-empty-sub">Add the people who work your boats. We\'ll track their tickets and medicals and remind you before anything runs out.</div>' +
        '<button class="btn btn-sea rs-cta" onclick="openAddCrewMemberModal(\'s-crew\')">Add crew member</button></div>';
      return;
    }
    var certs = snap.crewCerts || [];
    var attention = 0;
    var cards = crew.map(function (p) {
      var mine = certs.filter(function (c) { return c.person_id === p.id; })
        .sort(function (a, b) { return days(a.expires_at) - days(b.expires_at); });
      var boats = (p.vessel_ids || []).map(function (id) { var v = Store.getVessel(id); return v && v.name; }).filter(Boolean);
      var rows = mine.map(function (c) {
        var d = days(c.expires_at);
        var tag = d === Infinity ? ['rs-ok', 'No expiry'] : d < 0 ? ['rs-rd', 'Expired'] : d <= 30 ? ['rs-am', d + ' days'] : ['rs-ok', 'Valid'];
        if (d !== Infinity && d <= 30) attention++;
        return '<div class="rs-cq"><div class="rs-cq-tx"><div class="rs-cq-n">' + esc(c.name) + '</div>' +
          (c.expires_at ? '<div class="rs-cq-d">' + (d < 0 ? 'Expired ' : 'Expires ') + fmt(c.expires_at) + '</div>' : '') +
          '</div><span class="rs-tag ' + tag[0] + '">' + tag[1] + '</span></div>';
      }).join('') || '<div class="rs-cq rs-cq-none">No qualifications on file yet</div>';
      return '<div class="rs-person">' +
        '<div class="rs-person-hd"><div class="rs-av" aria-hidden="true">' + esc(p.initials || initialsOf(p.name)) + '</div>' +
        '<div class="rs-person-id"><div class="rs-person-n">' + esc(p.name) + '</div>' +
        '<div class="rs-person-s">' + esc([p.role, boats.join(', ')].filter(Boolean).join(' · ')) + '</div></div></div>' +
        rows + '</div>';
    }).join('');
    sc.innerHTML =
      '<div class="rs-hero">' +
        '<div class="rs-badge ' + (attention ? 'rs-am' : 'rs-ok') + '" aria-hidden="true">' + (attention ? '!' : '✓') + '</div>' +
        '<div><div class="rs-hero-h">' + (attention ? attention + (attention === 1 ? ' qualification needs attention' : ' qualifications need attention') : 'Everyone is in date') + '</div>' +
        '<div class="rs-hero-sub">' + crew.length + ' crew member' + (crew.length === 1 ? '' : 's') + ' across your fleet</div></div>' +
      '</div>' +
      '<div class="rs-people">' + cards + '</div>' +
      '<div class="rs-pad"><button type="button" class="btn btn-out btn-full rs-cta2" onclick="openAddCrewCertModal(\'s-crew\')">Add a qualification</button>' +
      '<button type="button" class="btn btn-sea btn-full rs-cta" onclick="openAddCrewMemberModal(\'s-crew\')">Add crew member</button></div>';
  }

  var RENDER = {
    's-crew': renderCrew,
    's-gap': renderGap,
    's-ready': renderReady,
    's-deficiencies': renderDeficiencies,
    's-inspection-pack': renderPack,
    's-surveys': renderSurveys
  };
  window.CodedokScreens = {
    openReady: openReady, codeWarning: codeWarning,
    has: function (id) { return !!RENDER[id]; },
    render: function (id) { var r = RENDER[id]; if (r) { try { r(); } catch (e) { console.error('screen ' + id, e); } } }
  };
})();
