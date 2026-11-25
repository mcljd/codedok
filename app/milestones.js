// CodedOK — Milestones.
//
// Small, earned markers for doing the things that keep a boat legal: logging
// records, signing the SMS, doing checks and drills. Everything is worked out
// from the boat's own records, so nothing can be "claimed" without the work.
// The only thing stored is which milestones the user has already been told
// about, so each one is announced once.
(function () {
  'use strict';

  var SEEN_KEY = 'codedok_milestones_seen';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function seen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch (_) { return {}; } }
  function saveSeen(s) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (_) {} }

  // Each milestone: have / need (for progress), and where to go to earn it.
  function forVessel(v) {
    var Q = window.QuickSms;
    var certs = Store.vesselCerts(v.id) || [], equip = Store.vesselEquipment(v.id) || [];
    var records = certs.length + equip.length;
    var dated = certs.map(function (c) { return c.expires_at; }).concat(equip.map(function (e) { return e.next_service_at; }))
      .map(function (d) { return Store.daysUntil(d); }).filter(function (d) { return d !== Infinity && !isNaN(d); });
    var doc = Q && Q.docFor ? Q.docFor(v.id) : null;
    var logs = (doc && doc.sections && doc.sections.quick && doc.sections.quick.logs) || [];
    var checks = logs.filter(function (l) { return l.kind === 'check'; }).length;
    var drillsLogged = logs.filter(function (l) { return l.kind === 'drill'; }).length;
    var drills = doc && Q.drillStatus ? Q.drillStatus(doc) : [];
    var drillsDue = drills.filter(function (d) { return d.due; }).length;
    var crew = Store.vesselCrew(v.id) || [], acks = (doc && doc.acknowledgements) || [];
    var read = crew.filter(function (c) { return acks.some(function (a) { return a.crew_id === c.id; }); }).length;
    var gap = window.CodedokScreens && CodedokScreens.gapFor ? CodedokScreens.gapFor(v) : null;
    var id = esc(v.id);
    var sms = "QuickSms.start('" + id + "')";
    var docId = doc ? esc(doc.id) : '';
    var list = [
      { k: 'first_record', name: 'First record on file', how: 'Scan a certificate or add a piece of safety equipment.', have: Math.min(records, 1), need: 1, act: 'scanCertWithAI()' },
      { k: 'five_records', name: 'Five records on file', how: 'Keep adding certificates and equipment.', have: Math.min(records, 5), need: 5, act: 'scanCertWithAI()' },
      { k: 'sms_written', name: 'Safety Management System written', how: 'Answer the questions and the app writes it.', have: doc ? 1 : 0, need: 1, act: sms },
      { k: 'sms_signed', name: 'Safety Management System signed', how: 'Check your SMS and approve it.', have: doc && doc.status === 'signed' ? 1 : 0, need: 1, act: sms },
      { k: 'first_check', name: 'First pre-departure check', how: 'Log a check before you leave the berth.', have: Math.min(checks, 1), need: 1, act: doc ? "QuickSms.log('check','" + docId + "')" : sms },
      { k: 'ten_checks', name: 'Ten pre-departure checks', how: 'One before every trip soon adds up.', have: Math.min(checks, 10), need: 10, act: doc ? "QuickSms.log('check','" + docId + "')" : sms },
      { k: 'first_drill', name: 'First drill logged', how: 'Run a drill and record who took part.', have: Math.min(drillsLogged, 1), need: 1, act: doc ? "QuickSms.log('drill','" + docId + "')" : sms },
      { k: 'drills_in_date', name: 'Every drill in date', how: 'Log each drill on the schedule in your SMS.', have: drills.length ? drills.length - drillsDue : 0, need: drills.length || 6, act: doc ? "QuickSms.log('drill','" + docId + "')" : sms }
    ];
    if (crew.length) list.push({ k: 'crew_read', name: 'Whole crew has read the SMS', how: 'Each crew member confirms they have read it.', have: doc && doc.status === 'signed' ? read : 0, need: crew.length, act: doc ? "openSmsDoc('" + docId + "')" : sms });
    list.push({ k: 'all_in_date', name: 'Everything in date', how: 'Three or more dated records and nothing overdue.',
      have: dated.length >= 3 && dated.every(function (d) { return d >= 0; }) ? 1 : 0, need: 1, act: "go('s-certs')" });
    if (gap && gap.total) list.push({ k: 'survey_ready', name: 'Ready for survey', how: 'Every required record in place and in date.', have: gap.met, need: gap.total, act: "go('s-gap')" });
    list.forEach(function (m) { m.done = m.need > 0 && m.have >= m.need; });
    return list;
  }

  // Announce anything newly earned, once. The first time a boat is seen its
  // current milestones are recorded quietly, so an existing user is not hit
  // with a burst of pop-ups.
  function check() {
    if (!window.Store) return;
    var vs = (Store.snapshot().vessels || []), s = seen(), fresh = [], changed = false;
    vs.forEach(function (v) {
      var list; try { list = forVessel(v); } catch (_) { return; }
      var first = !s[v.id], got = s[v.id] || [];
      list.forEach(function (m) {
        if (m.done && got.indexOf(m.k) < 0) { got.push(m.k); changed = true; if (!first) fresh.push({ v: v, m: m }); }
      });
      if (first || changed) { s[v.id] = got; changed = true; }
    });
    if (changed) saveSeen(s);
    if (fresh.length) {
      var f = fresh[fresh.length - 1];
      if (window.toast) toast('Milestone: ' + f.m.name + (fresh.length > 1 ? ' (+' + (fresh.length - 1) + ' more)' : ''));
      try { if (window.CodedokNative && CodedokNative.haptic) CodedokNative.haptic('success'); } catch (_) {}
    }
    return fresh.length;
  }

  var MEDAL = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 14.2 7 22l5-3 5 3-1.5-7.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

  // One line for Home: progress and the next thing to go for.
  function strip(v) {
    var list; try { list = forVessel(v); } catch (_) { return ''; }
    var done = list.filter(function (m) { return m.done; }).length;
    var next = list.filter(function (m) { return !m.done; })[0];
    return '<button type="button" class="ms-strip" onclick="CodedokMilestones.open(\'' + esc(v.id) + '\')" aria-label="Milestones, ' + done + ' of ' + list.length + ' earned">' +
      '<span class="ms-ic">' + MEDAL + '</span>' +
      '<span class="ms-tx"><strong>' + done + ' of ' + list.length + ' milestones</strong>' +
      '<small>' + (next ? 'Next: ' + esc(next.name) : 'All earned. Good work.') + '</small></span>' +
      '<em aria-hidden="true">›</em></button>';
  }

  function close() { var el = document.getElementById('ms-sheet'); if (el) el.remove(); }
  function open(vesselId) {
    var v = Store.getVessel(vesselId); if (!v) return;
    close();
    var list = forVessel(v), done = list.filter(function (m) { return m.done; }).length;
    var el = document.createElement('div');
    el.id = 'ms-sheet'; el.className = 'bdrop on';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Milestones');
    el.onclick = function (e) { if (e.target === el) close(); };
    el.innerHTML = '<div class="sheet" style="padding-bottom:calc(var(--safe) + 14px)"><div class="sh-pull"></div>' +
      '<div class="sh-head"><div class="sh-title">Milestones · ' + esc(v.name) + '</div><button class="sh-x" onclick="CodedokMilestones.close()" aria-label="Close">×</button></div>' +
      '<div class="ms-list"><p class="ms-lead">' + done + ' of ' + list.length + ' earned. Each one comes from your own records.</p>' +
      list.map(function (m) {
        var pct = Math.max(0, Math.min(100, Math.round(m.have / m.need * 100)));
        return '<button type="button" class="ms-row' + (m.done ? ' done' : '') + '"' + (m.done ? ' disabled' : ' onclick="CodedokMilestones.close();' + m.act + '"') + '>' +
          '<span class="ms-ic">' + (m.done ? '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' : MEDAL) + '</span>' +
          '<span class="ms-tx"><strong>' + esc(m.name) + '</strong><small>' + (m.done ? 'Earned' : esc(m.how)) + '</small>' +
          (!m.done && m.need > 1 ? '<span class="ms-bar" role="img" aria-label="' + m.have + ' of ' + m.need + '"><i style="width:' + pct + '%"></i></span><small class="ms-n">' + m.have + ' of ' + m.need + '</small>' : '') +
          '</span>' + (m.done ? '' : '<em aria-hidden="true">›</em>') + '</button>';
      }).join('') + '</div></div>';
    document.body.appendChild(el);
  }

  window.CodedokMilestones = { forVessel: forVessel, check: check, strip: strip, open: open, close: close };
})();
