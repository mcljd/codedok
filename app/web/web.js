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
          window.location.href = '../index.html';
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
      const sub = me.surveyor && me.surveyor.company ? me.surveyor.company : 'Surveyor';
      $('#w-user-sub').textContent = sub;
      paintAvatar();
    }
    bindNav();
    bindLogoInput();
    refreshCounts();
    renderView();
  }

  function importDropZone() {
    return `
      <div id="w-drop" class="w-drop">
        <div class="w-drop-ic">📄</div>
        <div class="w-drop-info">
          <div class="w-drop-title">Bulk-onboard a client from a survey report</div>
          <div class="w-drop-sub">Drag a PDF here, or <a href="#" onclick="WebApp.pickImport(); return false">choose a file</a>. CodedOK extracts the vessel, certs &amp; equipment for review.</div>
        </div>
      </div>`;
  }

  function bindDropZone() {
    const dz = document.getElementById('w-drop');
    if (!dz || dz.dataset.bound) return;
    dz.dataset.bound = '1';
    ['dragenter','dragover'].forEach((evt) => dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.add('on'); }));
    ['dragleave','drop'].forEach((evt) => dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.remove('on'); }));
    dz.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) runImport(file);
    });
  }

  async function runImport(file) {
    if (!window.SurveyImport) { alert('Parser not loaded; reload the page.'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('PDF must be under 10 MB.'); return; }
    showSpinner(`Parsing ${file.name}…`);
    try {
      const parsed = await window.SurveyImport.parseSurveyReport(file);
      hideSpinner();
      openWebImportReview(parsed);
    } catch (err) {
      hideSpinner();
      console.error(err);
      alert('Could not read that PDF. Try a different file.');
    }
  }

  function showSpinner(label) {
    hideSpinner();
    const el = document.createElement('div');
    el.id = 'w-spinner';
    el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,22,40,.55);z-index:1000;font-family:var(--fn)';
    el.innerHTML = `<div style="background:white;padding:24px 28px;border-radius:14px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.35)">
      <div style="font-size:36px;margin-bottom:10px">📄</div>
      <div style="font-size:15px;font-weight:700;color:var(--text)">${esc(label)}</div>
      <div style="font-size:12px;color:var(--mid);margin-top:6px">This usually takes 2–5 seconds.</div>
    </div>`;
    document.body.appendChild(el);
  }
  function hideSpinner() {
    const el = document.getElementById('w-spinner');
    if (el) el.remove();
  }

  function openWebImportReview(parsed) {
    const total = (parsed.vessel ? 1 : 0) + parsed.certs.length + parsed.equipment.length + parsed.deficiencies.length;
    if (total === 0) {
      alert('Couldn\\'t find anything I recognised in that PDF. Try a different survey report.');
      return;
    }
    let html = `<div class="w-modal-backdrop" onclick="WebApp.closeImport()"></div>
      <div class="w-modal">
        <div class="w-modal-h">
          <div style="font-size:18px;font-weight:800">Review extracted items</div>
          <button onclick="WebApp.closeImport()" style="background:none;border:none;font-size:22px;color:var(--lt);cursor:pointer">×</button>
        </div>
        <div class="w-modal-body">
          <div style="font-size:13px;color:var(--mid);margin-bottom:14px">Untick anything CodedOK got wrong before importing. A new vessel will be created from the extracted particulars.</div>`;

    if (parsed.vessel) {
      html += `<div class="w-modal-sec">Vessel</div>
        <label class="w-imp-row"><input type="checkbox" checked id="wimp-v-on">
          <div style="flex:1"><input id="wimp-v-name" value="${esc(parsed.vessel.name)}" style="font-weight:700;font-size:14px;border:none;width:100%;padding:0">
            <div style="font-size:11px;color:var(--lt);margin-top:2px">${esc(parsed.vessel.category || '')} ${parsed.vessel.port ? '· ' + esc(parsed.vessel.port) : ''} ${parsed.vessel.length ? '· ' + parsed.vessel.length + 'm' : ''}</div>
          </div></label>`;
    }
    if (parsed.certs.length) {
      html += `<div class="w-modal-sec">Certificates · ${parsed.certs.length}</div>`;
      parsed.certs.forEach((c, i) => {
        html += `<label class="w-imp-row"><input type="checkbox" checked id="wimp-c-${i}">
          <span style="font-size:18px">${c.icon}</span>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:700">${esc(c.name)}</div>
            <div style="font-size:11px;color:var(--lt)">${esc(c.issuer || '—')}${c.number ? ' · ' + esc(c.number) : ''} · expires ${esc(c.expires_at)}</div>
          </div></label>`;
      });
    }
    if (parsed.equipment.length) {
      html += `<div class="w-modal-sec">Equipment · ${parsed.equipment.length}</div>`;
      parsed.equipment.forEach((e, i) => {
        html += `<label class="w-imp-row"><input type="checkbox" checked id="wimp-e-${i}">
          <span style="font-size:18px">${e.icon}</span>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:700">${esc(e.name)}</div>
            <div style="font-size:11px;color:var(--lt)">${esc(e.issuer || '—')}${e.number ? ' · ' + esc(e.number) : ''} · next service ${esc(e.next_service_at)}</div>
          </div></label>`;
      });
    }
    if (parsed.deficiencies.length) {
      html += `<div class="w-modal-sec">Deficiencies · ${parsed.deficiencies.length}</div>`;
      parsed.deficiencies.forEach((d, i) => {
        html += `<label class="w-imp-row"><input type="checkbox" checked id="wimp-d-${i}">
          <span style="font-size:18px">⚠️</span>
          <div style="flex:1;font-size:12px;color:var(--text);line-height:1.5">${esc(d.description)}</div></label>`;
      });
    }

    html += `<button class="w-btn" style="margin-top:14px;width:100%;justify-content:center" onclick="WebApp.commitImport()">Import ${total} item${total === 1 ? '' : 's'}</button>
        </div></div>`;

    const existing = document.getElementById('w-import-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'w-import-modal';
    modal.innerHTML = html;
    document.body.appendChild(modal);
    window.__webImportDraft = parsed;
  }

  function commitWebImport() {
    const parsed = window.__webImportDraft;
    if (!parsed) return;
    let imported = 0;
    let targetId = null;
    if (parsed.vessel && document.getElementById('wimp-v-on') && document.getElementById('wimp-v-on').checked) {
      const v = Store.addVessel({
        name: (document.getElementById('wimp-v-name') || {}).value || parsed.vessel.name,
        type: parsed.vessel.type || 'Vessel',
        category: parsed.vessel.category || 'Cat 2',
        ssr: parsed.vessel.ssr || '',
        length: parsed.vessel.length || null,
        persons: parsed.vessel.persons || 12,
        port: parsed.vessel.port || '',
        make: parsed.vessel.make || '',
        engine: parsed.vessel.engine || ''
      });
      targetId = v.id;
      imported++;
    } else {
      // If no vessel selected, attach to first vessel (or bail).
      const all = Store.snapshot().vessels;
      if (all.length === 0) { alert('Tick the vessel row to create one, or add a vessel first.'); return; }
      targetId = all[0].id;
    }
    parsed.certs.forEach((c, i) => {
      const cb = document.getElementById('wimp-c-' + i);
      if (!cb || !cb.checked) return;
      Store.addCert({ vessel_id: targetId, name: c.name, icon: c.icon, category: c.category, issuer: c.issuer, number: c.number, expires_at: c.expires_at });
      imported++;
    });
    parsed.equipment.forEach((e, i) => {
      const cb = document.getElementById('wimp-e-' + i);
      if (!cb || !cb.checked) return;
      Store.addEquipment({ vessel_id: targetId, name: e.name, icon: e.icon, make: e.issuer, serial: e.number, next_service_at: e.next_service_at });
      imported++;
    });
    parsed.deficiencies.forEach((d, i) => {
      const cb = document.getElementById('wimp-d-' + i);
      if (!cb || !cb.checked) return;
      if (Store.addDeficiency) Store.addDeficiency({ vessel_id: targetId, description: d.description, severity: 'medium' });
      imported++;
    });
    closeWebImport();
    alert(`Imported ${imported} item${imported === 1 ? '' : 's'}.`);
    refreshCounts();
    renderView();
  }
  function closeWebImport() {
    const m = document.getElementById('w-import-modal');
    if (m) m.remove();
    window.__webImportDraft = null;
  }

  function brandStrip(me) {
    const logo = me && me.surveyor && me.surveyor.logo;
    const company = (me && me.surveyor && me.surveyor.company) || (me && me.name) || 'Your business';
    if (logo) {
      return `
        <div class="w-brand">
          <div class="w-brand-logo"><img alt="${esc(company)} logo" src="${logo}"></div>
          <div class="w-brand-info">
            <div class="w-brand-name">${esc(company)}</div>
            <div class="w-brand-sub">This logo appears on every quote &amp; invoice you send.</div>
          </div>
          <div class="w-brand-actions">
            <button class="w-btn w-btn-ghost" onclick="WebApp.pickLogo()">Replace</button>
            <button class="w-btn w-btn-ghost" onclick="WebApp.removeLogo()" style="color:var(--red)">Remove</button>
          </div>
        </div>`;
    }
    return `
      <div class="w-brand w-brand-empty" onclick="WebApp.pickLogo()">
        <div class="w-brand-logo placeholder">+</div>
        <div class="w-brand-info">
          <div class="w-brand-name">Upload your company logo</div>
          <div class="w-brand-sub">It'll appear on every quote, invoice, and survey report you send through CodedOK. PNG or SVG, under 1 MB.</div>
        </div>
        <div class="w-brand-actions"><button class="w-btn">Choose file</button></div>
      </div>`;
  }

  function paintAvatar() {
    const me = Store.getCurrentUser();
    if (!me) return;
    const av = $('#w-user-avatar');
    const logo = me.surveyor && me.surveyor.logo;
    if (logo) {
      av.classList.add('has-logo');
      av.innerHTML = '<img alt="Company logo" src="' + logo + '">';
    } else {
      av.classList.remove('has-logo');
      av.textContent = me.initials || (me.name || '').split(' ').map((p) => p[0]).join('').slice(0, 2);
    }
  }

  function bindLogoInput() {
    const input = $('#w-logo-input');
    if (!input || input.dataset.bound) return;
    input.dataset.bound = '1';
    input.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 1024 * 1024) {
        alert('Logo must be under 1 MB. Try a smaller PNG or SVG.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        Store.setSurveyorLogo(reader.result);
        paintAvatar();
        // Re-render any view that uses the logo (the portfolio header strip).
        renderView();
      };
      reader.readAsDataURL(file);
    });
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
    bindDropZone();
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

    let html = brandStrip(me) + importDropZone() + `
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
      window.open('../index.html', '_blank');
    },
    openMobile() {
      window.open('../index.html', '_blank');
    },
    pickImport() {
      let input = document.getElementById('w-import-input');
      if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'w-import-input';
        input.accept = 'application/pdf';
        input.style.display = 'none';
        input.addEventListener('change', (e) => {
          const f = e.target.files && e.target.files[0];
          e.target.value = '';
          if (f) runImport(f);
        });
        document.body.appendChild(input);
      }
      input.click();
    },
    commitImport: commitWebImport,
    closeImport: closeWebImport,
    pickLogo() {
      const input = document.getElementById('w-logo-input');
      if (input) input.click();
    },
    removeLogo() {
      if (!confirm('Remove your company logo?')) return;
      Store.setSurveyorLogo(null);
      paintAvatar();
      renderView();
    },
    signOut: signOut,
    refresh() { refreshCounts(); renderView(); }
  };

  // ---------- Init ----------
  bindLogin();
})();
