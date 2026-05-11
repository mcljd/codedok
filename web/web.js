// CodedOK Web — desktop workspace for surveyors (and operator gateway).
// Reuses /app/store.js + /app/codes.js for the data layer.
(function () {
  'use strict';

  if (!window.Store) {
    console.error('Store not initialised. Did /app/store.js load?');
    return;
  }

  // ---------- Helpers ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function scoreColor(s) {
    if (s >= 85) return 'var(--green)';
    if (s >= 65) return 'var(--amber)';
    return 'var(--red)';
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function daysFromToday(iso) {
    if (!iso) return null;
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(iso); d.setHours(0,0,0,0);
    return Math.round((d - today) / 86400000);
  }
  function relDateLabel(iso) {
    const d = daysFromToday(iso);
    if (d == null) return '—';
    if (d < 0)  return `${Math.abs(d)}d overdue`;
    if (d === 0) return 'Today';
    if (d <= 30) return `In ${d}d`;
    if (d <= 60) return `In ${d}d`;
    return fmtDate(iso);
  }
  function nextRenewalForVessel(vesselId) {
    // Earliest upcoming or overdue cert/equipment renewal.
    const certs = Store.vesselCerts(vesselId);
    const equip = Store.vesselEquipment(vesselId);
    const all = [
      ...certs.map((c) => ({ label: c.name || c.kind, due: c.expires_at })),
      ...equip.map((e) => ({ label: e.name || e.kind, due: e.next_service_at }))
    ].filter((x) => x.due);
    if (all.length === 0) return null;
    all.sort((a, b) => a.due.localeCompare(b.due));
    return all[0];
  }

  // ---------- View state ----------
  const state = {
    view: 'portfolio',
    portfolioFilter: 'all', // 'all' | 'ready' | 'attention' | 'overdue'
    portfolioSearch: ''
  };

  // ---------- Login ----------
  function bindLogin() {
    $$('.w-role').forEach((btn) => {
      btn.addEventListener('click', () => {
        const role = btn.dataset.role;
        if (role === 'operator') {
          window.location.href = '../app/index.html';
          return;
        }
        Store.setMode('surveyor');
        enterApp();
      });
    });
  }

  function enterApp() {
    $('#w-login').classList.remove('on');
    $('#w-app').classList.add('on');
    const me = Store.getCurrentUser();
    if (me) {
      $('#w-user-name').textContent = me.name;
      $('#w-user-avatar').textContent = me.initials || (me.name || '').split(' ').map((p) => p[0]).join('').slice(0, 2);
      const sub = me.surveyor && me.surveyor.company ? me.surveyor.company : 'Surveyor';
      $('#w-user-sub').textContent = sub;
    }
    bindNav();
    refreshCounts();
    renderView();
  }

  function signOut() {
    $('#w-app').classList.remove('on');
    $('#w-login').classList.add('on');
  }

  // ---------- Nav ----------
  function bindNav() {
    $$('.w-sb-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.w-sb-item').forEach((b) => b.classList.toggle('on', b === btn));
        state.view = btn.dataset.view;
        renderView();
      });
    });
  }

  function refreshCounts() {
    const me = Store.getCurrentUser();
    if (!me) return;
    const portfolio = Store.surveyorVessels(me.id);
    const inbox = Store.jobsForSurveyor(me.id, 'requested');
    const active = Store.jobsForSurveyor(me.id).filter((j) => j.status === 'accepted' || j.status === 'in_progress' || j.status === 'quoted');
    $('#w-count-portfolio').textContent = portfolio.length || '';
    $('#w-count-inbox').textContent = inbox.length || '';
    $('#w-count-jobs').textContent = active.length || '';
  }

  function renderView() {
    const wrap = $('#w-view');
    if (state.view === 'portfolio') wrap.innerHTML = renderPortfolio();
    else if (state.view === 'inbox') wrap.innerHTML = renderInbox();
    else if (state.view === 'jobs')  wrap.innerHTML = renderJobs();
    else if (state.view === 'earnings') wrap.innerHTML = renderEarnings();
    bindPortfolioControls();
  }

  // ---------- Portfolio (the focus) ----------
  function renderPortfolio() {
    const me = Store.getCurrentUser();
    if (!me) return '';
    const grants = Store.surveyorVessels(me.id);

    // Build per-vessel summary so we can filter / sort.
    const rows = grants.map((g) => {
      const v = g.vessel;
      const counts = Store.urgencyCounts(v.id);
      const score = Store.complianceScore(v.id);
      const lastInsp = Store.vesselInspections(v.id)[0];
      const nextDue = nextRenewalForVessel(v.id);
      let status = 'ready';
      if (counts.overdue > 0) status = 'overdue';
      else if (counts.due30 > 0) status = 'attention';
      return { vessel: v, ownerOrg: g.ownerOrg, counts, score, lastInsp, nextDue, status };
    });

    // Stats across portfolio.
    const totalVessels = rows.length;
    const totalOverdue = rows.reduce((acc, r) => acc + r.counts.overdue, 0);
    const totalAttention = rows.reduce((acc, r) => acc + r.counts.due30, 0);
    const totalReady = rows.filter((r) => r.status === 'ready').length;
    const avgScore = totalVessels > 0 ? Math.round(rows.reduce((a, r) => a + r.score, 0) / totalVessels) : 0;

    // Apply filters.
    let visible = rows.slice();
    if (state.portfolioFilter === 'ready')     visible = visible.filter((r) => r.status === 'ready');
    if (state.portfolioFilter === 'attention') visible = visible.filter((r) => r.status === 'attention');
    if (state.portfolioFilter === 'overdue')   visible = visible.filter((r) => r.status === 'overdue');
    if (state.portfolioSearch) {
      const q = state.portfolioSearch.toLowerCase();
      visible = visible.filter((r) =>
        r.vessel.name.toLowerCase().includes(q) ||
        (r.ownerOrg && r.ownerOrg.name.toLowerCase().includes(q)) ||
        (r.vessel.type || '').toLowerCase().includes(q)
      );
    }

    // Group by owner org.
    const byOrg = {};
    visible.forEach((r) => {
      const key = r.ownerOrg ? r.ownerOrg.id : 'unknown';
      const name = r.ownerOrg ? r.ownerOrg.name : 'Unknown client';
      if (!byOrg[key]) byOrg[key] = { name, rows: [] };
      byOrg[key].rows.push(r);
    });

    const groupKeys = Object.keys(byOrg).sort((a, b) => byOrg[a].name.localeCompare(byOrg[b].name));

    let html = `
      <div class="w-view-h">
        <div>
          <div class="w-view-title">Your portfolio</div>
          <div class="w-view-sub">All vessels you survey, grouped by client. Click a card to open the vessel record.</div>
        </div>
        <div class="w-view-actions">
          <button class="w-btn w-btn-ghost" onclick="WebApp.openMobile()">Open mobile view</button>
          <button class="w-btn">+ Invite client</button>
        </div>
      </div>

      <div class="w-kpi-row">
        <div class="w-kpi">
          <div class="w-kpi-lbl">Vessels under survey</div>
          <div class="w-kpi-val">${totalVessels}</div>
          <div class="w-kpi-sub">Across ${groupKeys.length} client${groupKeys.length === 1 ? '' : 's'}</div>
        </div>
        <div class="w-kpi">
          <div class="w-kpi-lbl">Average compliance</div>
          <div class="w-kpi-val ${avgScore >= 85 ? 'gr' : avgScore >= 65 ? 'am' : 'rd'}">${avgScore}<span style="font-size:14px;font-weight:600;color:var(--lt);margin-left:2px">%</span></div>
          <div class="w-kpi-sub">${totalReady}/${totalVessels} inspection-ready</div>
        </div>
        <div class="w-kpi">
          <div class="w-kpi-lbl">Overdue items</div>
          <div class="w-kpi-val ${totalOverdue > 0 ? 'rd' : 'gr'}">${totalOverdue}</div>
          <div class="w-kpi-sub">Across the portfolio</div>
        </div>
        <div class="w-kpi">
          <div class="w-kpi-lbl">Due ≤30 days</div>
          <div class="w-kpi-val ${totalAttention > 0 ? 'am' : ''}">${totalAttention}</div>
          <div class="w-kpi-sub">Plan ahead</div>
        </div>
      </div>

      <div class="w-filter">
        <input type="text" class="w-filter-search" placeholder="Search vessel, client, or type…" id="w-search" value="${esc(state.portfolioSearch)}">
        <div class="w-chips">
          <button class="w-chip ${state.portfolioFilter === 'all' ? 'on' : ''}" data-filter="all">All</button>
          <button class="w-chip ${state.portfolioFilter === 'overdue' ? 'on' : ''}" data-filter="overdue">Overdue${totalOverdue > 0 ? ` · ${rows.filter((r) => r.status === 'overdue').length}` : ''}</button>
          <button class="w-chip ${state.portfolioFilter === 'attention' ? 'on' : ''}" data-filter="attention">≤30d${totalAttention > 0 ? ` · ${rows.filter((r) => r.status === 'attention').length}` : ''}</button>
          <button class="w-chip ${state.portfolioFilter === 'ready' ? 'on' : ''}" data-filter="ready">Ready · ${totalReady}</button>
        </div>
      </div>
    `;

    if (rows.length === 0) {
      html += `
        <div class="w-empty">
          <div class="w-empty-art">⛵</div>
          <div class="w-empty-h">No vessels assigned yet</div>
          <div class="w-empty-sub">Operators invite you per-vessel. Once invited, the full portfolio shows up here.</div>
        </div>`;
      return html;
    }

    if (visible.length === 0) {
      html += `
        <div class="w-empty">
          <div class="w-empty-art">🔍</div>
          <div class="w-empty-h">No matches</div>
          <div class="w-empty-sub">Try a different filter or search term.</div>
        </div>`;
      return html;
    }

    groupKeys.forEach((key) => {
      const g = byOrg[key];
      html += `
        <div class="w-client-group">
          <div class="w-client-h">
            <div class="w-client-name">${esc(g.name)}</div>
            <div class="w-client-meta">${g.rows.length} vessel${g.rows.length === 1 ? '' : 's'}</div>
          </div>
          <div class="w-vessel-grid">
            ${g.rows.map(vesselCard).join('')}
          </div>
        </div>`;
    });

    return html;
  }

  function vesselCard(r) {
    const v = r.vessel;
    const ringColor = scoreColor(r.score);
    const C = 2 * Math.PI * 20;
    const offset = C - (r.score / 100) * C;
    const statusChip = r.status === 'overdue'
      ? `<span class="chip chip-rd">${r.counts.overdue} overdue</span>`
      : r.status === 'attention'
      ? `<span class="chip chip-am">${r.counts.due30} due ≤30d</span>`
      : `<span class="chip chip-ok">Ready</span>`;
    const lastLabel = r.lastInsp ? fmtDate(r.lastInsp.completed_at || r.lastInsp.started_at) : '—';
    const nextLabel = r.nextDue ? `${relDateLabel(r.nextDue.due)} · ${esc(r.nextDue.label)}` : '—';
    const nextDaysCls = r.nextDue
      ? (daysFromToday(r.nextDue.due) < 0 ? 'rd' : daysFromToday(r.nextDue.due) <= 30 ? 'am' : '')
      : '';

    return `
      <div class="w-vessel-card" onclick="WebApp.openVessel('${v.id}')">
        <div class="w-vc-top">
          <div class="w-vc-icon">${v.icon || '⛵'}</div>
          <div class="w-vc-info">
            <div class="w-vc-name">${esc(v.name)} ${statusChip}</div>
            <div class="w-vc-meta">${esc(v.category)} · ${esc(v.type)}</div>
          </div>
          <div class="w-vc-ring">
            <svg width="48" height="48" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="var(--bdr)" stroke-width="4"/>
              <circle cx="24" cy="24" r="20" fill="none" stroke="${ringColor}" stroke-width="4"
                      stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
                      stroke-linecap="round" transform="rotate(-90 24 24)"/>
            </svg>
            <div class="w-vc-ring-pct" style="color:${ringColor}">${r.score}</div>
          </div>
        </div>
        <div class="w-vc-stats">
          <div>
            <div class="w-vc-stat">Last inspection</div>
            <div class="w-vc-stat-val">${lastLabel}</div>
          </div>
          <div>
            <div class="w-vc-stat">Next renewal</div>
            <div class="w-vc-stat-val ${nextDaysCls}">${nextLabel}</div>
          </div>
        </div>
        <div class="w-vc-cta">
          <button class="w-vc-cta-btn" onclick="event.stopPropagation(); WebApp.openVessel('${v.id}')">View record</button>
          <button class="w-vc-cta-btn primary" onclick="event.stopPropagation(); WebApp.openVessel('${v.id}')">Open inspection</button>
        </div>
      </div>`;
  }

  function bindPortfolioControls() {
    const search = $('#w-search');
    if (search) {
      search.addEventListener('input', (e) => {
        state.portfolioSearch = e.target.value;
        renderView();
        // Restore focus after re-render.
        const s = $('#w-search');
        if (s) {
          s.focus();
          s.setSelectionRange(s.value.length, s.value.length);
        }
      });
    }
    $$('.w-chip').forEach((c) => {
      c.addEventListener('click', () => {
        state.portfolioFilter = c.dataset.filter;
        renderView();
      });
    });
  }

  // ---------- Inbox ----------
  function renderInbox() {
    const me = Store.getCurrentUser();
    const requested = Store.jobsForSurveyor(me.id, 'requested');
    let html = `
      <div class="w-view-h">
        <div>
          <div class="w-view-title">Inbox</div>
          <div class="w-view-sub">New job requests from operators awaiting your response.</div>
        </div>
      </div>`;
    if (requested.length === 0) {
      html += `<div class="w-empty"><div class="w-empty-art">📥</div><div class="w-empty-h">Inbox clear</div><div class="w-empty-sub">When operators request a quote or survey, it'll appear here.</div></div>`;
      return html;
    }
    html += '<div style="display:flex;flex-direction:column;gap:10px">';
    requested.forEach((j) => {
      const v = Store.getVessel(j.vessel_id);
      html += `
        <div class="w-vessel-card" style="cursor:default">
          <div class="w-vc-top">
            <div class="w-vc-icon">🛠️</div>
            <div class="w-vc-info">
              <div class="w-vc-name">${esc(j.title || (j.type ? j.type.replace(/_/g, ' ') : 'Job'))} — ${esc(v ? v.name : '')}</div>
              <div class="w-vc-meta">Requested ${fmtDate(j.created_at)}${j.description ? ' · ' + esc(j.description) : ''}</div>
            </div>
          </div>
        </div>`;
    });
    html += '</div>';
    return html;
  }

  // ---------- Jobs (active) ----------
  function renderJobs() {
    const me = Store.getCurrentUser();
    const jobs = Store.jobsForSurveyor(me.id).filter((j) => j.status !== 'requested' && j.status !== 'completed' && j.status !== 'delivered');
    let html = `
      <div class="w-view-h">
        <div>
          <div class="w-view-title">Active jobs</div>
          <div class="w-view-sub">Quoted, accepted, or in-progress. Once delivered they move to Earnings.</div>
        </div>
      </div>`;
    if (jobs.length === 0) {
      html += `<div class="w-empty"><div class="w-empty-art">🛠️</div><div class="w-empty-h">No active jobs</div><div class="w-empty-sub">Accepted jobs and active quotes will show up here.</div></div>`;
      return html;
    }
    html += '<div style="display:flex;flex-direction:column;gap:10px">';
    jobs.forEach((j) => {
      const v = Store.getVessel(j.vessel_id);
      html += `
        <div class="w-vessel-card" style="cursor:default">
          <div class="w-vc-top">
            <div class="w-vc-icon">🛠️</div>
            <div class="w-vc-info">
              <div class="w-vc-name">${esc(j.title || (j.type ? j.type.replace(/_/g, ' ') : 'Job'))} — ${esc(v ? v.name : '')} <span class="chip chip-bl">${esc(j.status)}</span></div>
              <div class="w-vc-meta">Created ${fmtDate(j.created_at)}${j.quote_amount ? ' · £' + j.quote_amount : ''}</div>
            </div>
          </div>
        </div>`;
    });
    html += '</div>';
    return html;
  }

  // ---------- Earnings ----------
  function renderEarnings() {
    const me = Store.getCurrentUser();
    const earnings = Store.surveyorEarnings(me.id) || {};
    return `
      <div class="w-view-h">
        <div>
          <div class="w-view-title">Earnings</div>
          <div class="w-view-sub">Gross, net after platform fees, and outstanding totals.</div>
        </div>
      </div>
      <div class="w-kpi-row">
        <div class="w-kpi"><div class="w-kpi-lbl">Gross this year</div><div class="w-kpi-val gr">£${(earnings.grossThisYear || 0).toLocaleString()}</div><div class="w-kpi-sub">${earnings.paidCount || 0} invoice${earnings.paidCount === 1 ? '' : 's'} paid</div></div>
        <div class="w-kpi"><div class="w-kpi-lbl">Outstanding</div><div class="w-kpi-val ${earnings.pending > 0 ? 'am' : ''}">£${(earnings.pending || 0).toLocaleString()}</div><div class="w-kpi-sub">Sent &amp; awaiting payment</div></div>
        <div class="w-kpi"><div class="w-kpi-lbl">Net lifetime</div><div class="w-kpi-val">£${(earnings.netLifetime || 0).toLocaleString()}</div><div class="w-kpi-sub">After 8% platform fee</div></div>
        <div class="w-kpi"><div class="w-kpi-lbl">Platform fees</div><div class="w-kpi-val">£${(earnings.platformFees || 0).toLocaleString()}</div><div class="w-kpi-sub">All time</div></div>
      </div>
      <div class="w-placeholder">
        <div class="w-placeholder-h">Detailed earnings view coming next</div>
        <div class="w-placeholder-sub">Invoice list, monthly chart, and CSV export will land in a follow-up.</div>
      </div>`;
  }

  // ---------- Public API ----------
  window.WebApp = {
    openVessel(vesselId) {
      // Pass the vessel id via localStorage so /app can pick it up on load
      // and deep-link to the surveyor vessel detail.
      try { localStorage.setItem('codedok-deeplink', JSON.stringify({ vesselId: vesselId, view: 's-surveyor-vessel', ts: Date.now() })); } catch (_) {}
      window.open('../app/index.html', '_blank');
    },
    openMobile() {
      window.open('../app/index.html', '_blank');
    },
    signOut: signOut,
    refresh() { refreshCounts(); renderView(); }
  };

  // ---------- Init ----------
  bindLogin();
})();
