// CodedOK — Home "Vessel Pass".
//
// The signature element of the Home screen: one pass per boat, styled like a
// boarding pass — Code + area category, a "route" from home port out to the
// category's limit, the compliance ring, and a tear-off stub with status,
// next deadline, survey date and crew. Swipe between boats. Below it, one
// clear action. Built only from the boat's real records.
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtShort(d) {
    if (!d) return '—';
    var x = new Date(d);
    return isNaN(x.getTime()) ? '—' : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  function days(d) { return Store.daysUntil(d); }

  // Area category → the "destination" on the pass (SPV/Workboat §3.10.1).
  var LIMIT = {
    cat0: ['Open', 'ocean', 'Unrestricted'],
    cat1: ['150', 'nm', 'From safe haven'],
    cat2: ['60', 'nm', 'From safe haven'],
    cat3: ['20', 'nm', 'From safe haven'],
    cat4: ['20', 'nm', 'Good weather'],
    cat5: ['3', 'nm', 'From land'],
    cat6: ['3', 'nm', 'Daylight only']
  };

  function portCode(port) {
    var p = String(port || '').replace(/[^A-Za-z ]/g, '').trim();
    if (!p) return 'HOME';
    var words = p.split(/\s+/);
    return (words.length > 1 ? words.map(function (w) { return w[0]; }).join('') : p).slice(0, 3).toUpperCase();
  }

  function vesselState(v) {
    var items = Store.vesselCerts(v.id).map(function (c) { return { name: c.name, d: days(c.expires_at), kind: c.kind, date: c.expires_at }; })
      .concat(Store.vesselEquipment(v.id).map(function (e) { return { name: e.name, d: days(e.next_service_at), kind: e.kind, date: e.next_service_at }; }))
      .filter(function (i) { return i.d !== Infinity && !isNaN(i.d); })
      .sort(function (a, b) { return a.d - b.d; });
    var overdue = items.filter(function (i) { return i.d < 0; }).length;
    var soon = items.filter(function (i) { return i.d >= 0 && i.d <= 30; }).length;
    var coding = Store.vesselCerts(v.id).filter(function (c) { return c.kind === 'coding'; })
      .sort(function (a, b) { return days(b.expires_at) - days(a.expires_at); })[0];
    var empty = !items.length && !Store.vesselCerts(v.id).length;
    return {
      next: items[0] || null, overdue: overdue, soon: soon, empty: empty,
      status: empty ? 'empty' : overdue ? 'bad' : soon ? 'warn' : 'good',
      score: Math.max(0, Math.min(100, Math.round(Store.complianceScore(v.id) || 0))),
      survey: coding ? coding.expires_at : null,
      crew: (Store.vesselCrew(v.id) || []).length
    };
  }

  function ring(pct, status) {
    if (status === 'empty') {
      return '<svg class="vp-ring vp-ring-empty" viewBox="0 0 56 56" role="img" aria-label="No records yet">' +
        '<circle cx="28" cy="28" r="22" class="vp-ring-bg" stroke-dasharray="4 5"/>' +
        '<path d="M28 20v16M20 28h16" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>';
    }
    var r = 22, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    return '<svg class="vp-ring vp-ring-' + status + '" viewBox="0 0 56 56" role="img" aria-label="' + pct + ' percent compliant">' +
      '<circle cx="28" cy="28" r="' + r + '" class="vp-ring-bg"/>' +
      '<circle cx="28" cy="28" r="' + r + '" class="vp-ring-fg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 28 28)"/>' +
      '<text x="28" y="33" text-anchor="middle">' + pct + '<tspan dy="-6" font-size="8">%</tspan></text></svg>';
  }

  function pass(v) {
    var C = window.Codes;
    var st = vesselState(v);
    var cat = C ? C.areaFor(v.category, v) : 'cat2';
    var lim = LIMIT[cat] || LIMIT.cat2;
    var wb = C && C.codeFor && C.codeFor(v) === 'workboat';
    var statusLabel = st.status === 'empty' ? 'Set up' : st.status === 'bad' ? 'Not ready' : st.status === 'warn' ? 'Due soon' : 'Ready';
    var next = st.next;
    var nextVal = !next ? 'None' : next.d < 0 ? Math.abs(next.d) + 'd late' : next.d === 0 ? 'Today' : next.d + ' days';
    return '<article class="vp vp-' + st.status + '" role="button" tabindex="0" aria-label="' + esc(v.name) + ' vessel pass, ' + statusLabel + '" data-vessel="' + esc(v.id) + '">' +
      '<div class="vp-main">' +
        '<svg class="vp-chart" viewBox="0 0 320 180" preserveAspectRatio="none" aria-hidden="true">' +
          '<path d="M-10 140 C 60 110, 120 160, 190 128 S 300 96, 340 120"/><path d="M-10 160 C 70 130, 130 178, 200 148 S 300 118, 340 140"/>' +
          '<path d="M-10 118 C 50 92, 110 140, 180 108 S 290 78, 340 98"/><circle cx="262" cy="46" r="34"/><circle cx="262" cy="46" r="22"/></svg>' +
        '<div class="vp-top"><span class="vp-kicker">Vessel pass</span>' +
          '<span class="vp-code">' + (wb ? 'Workboat Code' : 'SPV Code') + ' · Area ' + cat.slice(3) + '</span></div>' +
        '<div class="vp-head"><div class="vp-id"><div class="vp-name">' + esc(v.name) + '</div>' +
          '<div class="vp-sub">' + esc([v.type, v.ssr ? 'SSR ' + v.ssr : ''].filter(Boolean).join(' · ') || 'Coded vessel') + '</div></div>' +
          ring(st.score, st.status) + '</div>' +
        '<div class="vp-route">' +
          '<div class="vp-end"><span class="vp-lbl">From</span><span class="vp-big">' + esc(portCode(v.port)) + '</span><span class="vp-small">' + esc(v.port || 'Home port') + '</span></div>' +
          '<div class="vp-line" aria-hidden="true"><span class="vp-dot"></span><span class="vp-dash"></span>' +
            '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 3v13M12 3l6 10h-6M12 6 7 13h5M4 17h16l-2 3H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>' +
            '<span class="vp-dash"></span><span class="vp-dot"></span></div>' +
          '<div class="vp-end vp-end-r"><span class="vp-lbl">Limit</span><span class="vp-big">' + esc(lim[0]) + '<small>' + esc(lim[1]) + '</small></span><span class="vp-small">' + esc(lim[2]) + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="vp-tear" aria-hidden="true"></div>' +
      '<div class="vp-stub">' +
        '<div><span class="vp-lbl">Status</span><b class="vp-st">' + statusLabel + '</b></div>' +
        '<div><span class="vp-lbl">Next due</span><b>' + esc(nextVal) + '</b></div>' +
        '<div><span class="vp-lbl">Survey by</span><b>' + esc(fmtShort(st.survey)) + '</b></div>' +
        '<div><span class="vp-lbl">Crew</span><b>' + st.crew + '</b></div>' +
      '</div>' +
    '</article>';
  }

  function render() {
    var vs = (Store.snapshot().vessels || []).slice();
    // Team members only see the boats they were given access to.
    if (window.filterByVesselScope && Store.getCurrentUser && Store.getCurrentUser()) vs = filterByVesselScope(vs);
    if (!vs.length) return '';
    // Boat that needs attention first.
    var RANK = { bad: 0, warn: 1, empty: 2, good: 3 };
    var all = vs.map(function (v) { return vesselState(v); });
    var order = vs.map(function (_, i) { return i; }).sort(function (a, b) { return RANK[all[a].status] - RANK[all[b].status]; });
    vs = order.map(function (i) { return vs[i]; }); all = order.map(function (i) { return all[i]; });
    var overdue = all.reduce(function (n, s) { return n + s.overdue; }, 0);
    var nexts = all.map(function (s) { return s.next; }).filter(function (n) { return n && n.d >= 0; }).sort(function (a, b) { return a.d - b.d; });
    var empty = all.every(function (s) { return s.empty; });
    var chip = empty ? '<span class="vp-chip">No records yet</span>'
      : overdue
      ? '<span class="vp-chip vp-chip-bad">' + overdue + ' overdue</span>'
      : nexts.length ? '<span class="vp-chip">Next deadline in ' + (nexts[0].d === 0 ? 'today' : nexts[0].d + ' day' + (nexts[0].d === 1 ? '' : 's')) + '</span>'
      : '<span class="vp-chip vp-chip-good">All in date</span>';
    var cta = empty
      ? '<button type="button" class="vp-cta" onclick="scanCertWithAI()">Scan your first certificate</button>'
      : overdue
      ? '<button type="button" class="vp-cta" onclick="go(\'s-certs\')">Sort ' + overdue + ' overdue item' + (overdue === 1 ? '' : 's') + '</button>'
      : '<button type="button" class="vp-cta" onclick="go(\'s-inspection-pack\')">Create inspection pack</button>';
    return '<div class="vp-head-row"><span class="vp-section">' + (vs.length > 1 ? 'Your fleet' : 'Your boat') + '</span>' + chip + '</div>' +
      '<div class="vp-track' + (vs.length > 1 ? ' vp-multi' : '') + '">' + vs.map(pass).join('') + '</div>' +
      (vs.length > 1 ? '<div class="vp-dots" aria-hidden="true">' + vs.map(function (_, i) { return '<span class="' + (i === 0 ? 'on' : '') + '"></span>'; }).join('') + '</div>' : '') +
      cta +
      // Daily use: once a boat has its SMS, the pre-departure check is one tap away.
      (window.QuickSms && QuickSms.docFor(vs[0].id) ? '<button type="button" class="vp-cta vp-cta-2" onclick="QuickSms.log(\'check\', QuickSms.docFor(\'' + esc(vs[0].id) + '\').id)">Pre-departure check</button>' : '') +
      (empty ? '' : '<button type="button" class="vp-alt" onclick="scanCertWithAI()">Add a certificate</button>');
  }

  // Tap a pass → that boat. Keep the dots in step with the swipe.
  document.addEventListener('click', function (e) {
    var p = e.target.closest && e.target.closest('.vp[data-vessel]');
    if (!p) return;
    if (window.setActiveVessel) setActiveVessel(p.getAttribute('data-vessel'));
    if (window.go) go('s-vessel-detail');
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('vp')) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener('scroll', function (e) {
    var t = e.target;
    if (!t.classList || !t.classList.contains('vp-track')) return;
    var i = Math.round(t.scrollLeft / Math.max(1, t.firstElementChild ? t.firstElementChild.offsetWidth + 12 : t.clientWidth));
    var dots = t.parentElement.querySelectorAll('.vp-dots span');
    for (var k = 0; k < dots.length; k++) dots[k].classList.toggle('on', k === i);
  }, true);

  window.CodedokHome = { render: render };
})();
