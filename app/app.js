// CodedOK app shell — navigation, renderers, mode handling, PDF export.
//
// Architecture:
//   * `go(id)` swaps shells. Renderers run on entry to that shell.
//   * Operator and surveyor modes share screens but route differently from `go`.
//   * Store.js owns persistence; this file only renders + handles UI events.
//   * Codes.js provides MCA cert/equipment/crew schedules.

(function () {
  'use strict';

  // ---------- Active vessel context ----------
  // Many screens (vessel detail, equipment, hand-off) operate on a single
  // active vessel. We keep that on window for prototype simplicity.
  let activeVesselId = null;
  let activeEquipmentId = null;
  let activeInspectionId = null;
  window.setActiveVessel = function (id) { activeVesselId = id; };

  // ---------- File picker / attachments ----------
  // Hidden inputs in index.html: #cert-file-input, #eq-file-input.
  // Files are stored as base64 data URLs on the cert/equipment record.
  // Soft cap of 4 MB per file; warns if larger because localStorage caps near 5 MB total.

  const MAX_FILE_BYTES = 4 * 1024 * 1024;

  // Buffered file read pending review on s-scan-confirm.
  // { kind: 'cert'|'equipment', categoryHint, file: { name,type,size,data_url,added_at } }
  let pendingScan = null;
  // For attaching to existing items.
  let attachContext = null;  // { mode: 'cert'|'equipment', id }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function fmtBytes(n) {
    if (!n && n !== 0) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function handleCertFilePicked(file, categoryHint) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      alert(`That file is ${fmtBytes(file.size)}. Please choose one under ${fmtBytes(MAX_FILE_BYTES)} for the prototype.`);
      return;
    }
    const data_url = await readFileAsDataUrl(file);
    pendingScan = {
      kind: 'cert',
      categoryHint: categoryHint || 'vessel',
      file: { name: file.name, type: file.type, size: file.size, data_url, added_at: new Date().toISOString() }
    };
    // If this picker was opened to attach to an existing item, do that and exit.
    if (attachContext && attachContext.mode === 'cert') {
      Store.attachFileToCert(attachContext.id, pendingScan.file);
      attachContext = null;
      pendingScan = null;
      // Re-render whatever screen is showing.
      if (document.getElementById('s-vessel-detail').classList.contains('on')) renderVesselDetail();
      if (document.getElementById('s-surveyor-vessel').classList.contains('on')) renderSurveyorVessel();
      closeCertSheet();
      return;
    }
    go('s-scan-confirm');
  }

  async function handleEquipmentFilePicked(file) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      alert(`That file is ${fmtBytes(file.size)}. Please choose one under ${fmtBytes(MAX_FILE_BYTES)} for the prototype.`);
      return;
    }
    const data_url = await readFileAsDataUrl(file);
    const f = { name: file.name, type: file.type, size: file.size, data_url, added_at: new Date().toISOString() };
    if (attachContext && attachContext.mode === 'equipment') {
      Store.attachFileToEquipment(attachContext.id, f);
      attachContext = null;
      if (document.getElementById('s-equipment-detail').classList.contains('on')) renderEquipmentDetail();
      if (document.getElementById('s-vessel-detail').classList.contains('on')) renderVesselDetail();
      return;
    }
    // Otherwise, stash for the equipment-add form to pick up.
    pendingEquipmentFile = f;
    // Show a confirmation toast on the equipment-add screen.
    const note = document.getElementById('eq-file-note');
    if (note) note.innerHTML = `📎 <strong>${escapeHtml(f.name)}</strong> (${fmtBytes(f.size)}) attached — will be saved with equipment`;
  }

  let pendingEquipmentFile = null;

  function openCertFilePicker(categoryHint) {
    const input = document.getElementById('cert-file-input');
    if (!input) return;
    input.value = '';
    input.dataset.hint = categoryHint || 'vessel';
    input.click();
  }
  window.openCertFilePicker = openCertFilePicker;

  function openEquipmentFilePicker() {
    const input = document.getElementById('eq-file-input');
    if (!input) return;
    input.value = '';
    input.click();
  }
  window.openEquipmentFilePicker = openEquipmentFilePicker;

  function attachToExistingCert(certId) {
    attachContext = { mode: 'cert', id: certId };
    openCertFilePicker();
  }
  window.attachToExistingCert = attachToExistingCert;

  function attachToExistingEquipment(equipmentId) {
    attachContext = { mode: 'equipment', id: equipmentId };
    openEquipmentFilePicker();
  }
  window.attachToExistingEquipment = attachToExistingEquipment;

  // Open the stored data URL — works for PDFs and images.
  function viewAttachment(dataUrl, name) {
    if (!dataUrl) return;
    const w = window.open();
    if (!w) return;
    const safe = (name || 'attachment').replace(/[<>"']/g, '');
    w.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>${safe}</title>
      <style>body{margin:0;background:#0a1628;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui;color:white}
      iframe,img{max-width:100%;max-height:100vh;background:white}
      .dl{position:fixed;top:14px;right:14px;background:#0891b2;color:white;text-decoration:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600}</style></head>
      <body>${dataUrl.startsWith('data:application/pdf')
        ? `<iframe src="${dataUrl}" style="width:100vw;height:100vh;border:none"></iframe>`
        : `<img src="${dataUrl}" alt="${safe}">`}
      <a class="dl" href="${dataUrl}" download="${safe}">⬇ Download</a>
      </body></html>`);
    w.document.close();
  }
  window.viewAttachment = viewAttachment;

  // Wire the hidden file inputs at boot.
  function wireFileInputs() {
    const cert = document.getElementById('cert-file-input');
    if (cert) cert.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) handleCertFilePicked(f, cert.dataset.hint);
    });
    const eq = document.getElementById('eq-file-input');
    if (eq) eq.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) handleEquipmentFilePicked(f);
    });
  }

  // ---------- Helpers ----------

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function daysFmt(d) {
    if (d === Infinity) return 'No expiry';
    if (d < 0) return `Expired ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ago`;
    if (d === 0) return 'Expires today';
    return `Due in ${d} day${d === 1 ? '' : 's'}`;
  }

  function ringSvg(percent, color, size, animate) {
    size = size || 96;
    const r = size * 40 / 96;
    const C = 2 * Math.PI * r;
    const offset = C - (Math.max(0, Math.min(100, percent)) / 100) * C;
    const cx = size / 2, cy = size / 2;
    const cls = animate === false ? '' : 'ring-anim';
    return `
      <svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="8"
                stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" stroke-linecap="round"/>
      </svg>`;
  }

  // CodedOK icon mark — refined vector, scales cleanly from 22 to 1024.
  // Two stylised cyan waves above a green compliance circle with a white tick.
  // `tone`: 'color' (default), 'mono-light' (white on dark), 'mono-dark' (navy on light).
  function codedOkMark(size, tone) {
    size = size || 64;
    tone = tone || 'color';

    let topStroke, botStroke, circleFill, tickStroke;
    if (tone === 'mono-light') {
      topStroke = '#FFFFFF';
      botStroke = '#FFFFFF';
      circleFill = '#FFFFFF';
      tickStroke = '#0A1628';
    } else if (tone === 'mono-dark') {
      topStroke = '#0A1628';
      botStroke = '#0A1628';
      circleFill = '#0A1628';
      tickStroke = '#FFFFFF';
    } else {
      topStroke = '#0891B2';
      botStroke = '#0891B2';
      circleFill = '#16A34A';
      tickStroke = '#FFFFFF';
    }

    // ViewBox 64×64 means strokes/curves scale linearly with the requested size.
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M6 22 C 11 14, 17 14, 22 22 S 33 30, 38 22 S 49 14, 58 22"
              stroke="${topStroke}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M6 34 C 11 26, 17 26, 22 34 S 33 42, 38 34 S 49 26, 58 34"
              stroke="${botStroke}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"/>
        <circle cx="47" cy="49" r="13" fill="${circleFill}"/>
        <path d="M41 49 L45.5 53.5 L53 44.5"
              stroke="${tickStroke}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  }
  window.codedOkMark = codedOkMark;

  // McCollam Marine wordmark — inline SVG, no asset dependency.
  // Hull-line on left + "McCollam Marine" wordmark.
  function mmMark(size) {
    size = size || 28;
    const w = size, h = size;
    return `
      <svg class="mm-mark-svg" width="${w}" height="${h}" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M2 6 Q14 2 26 6 L26 18 Q23 22 14 22 Q5 22 2 18 Z" stroke="rgba(255,255,255,.45)" stroke-width="1.4" fill="none"/>
        <path d="M5 10 L23 10" stroke="rgba(255,255,255,.25)" stroke-width=".8"/>
        <path d="M7 14 L21 14" stroke="rgba(255,255,255,.25)" stroke-width=".8"/>
        <path d="M9 18 L19 18" stroke="rgba(255,255,255,.25)" stroke-width=".8"/>
        <path d="M14 4 L14 21" stroke="rgba(255,255,255,.5)" stroke-width=".8"/>
      </svg>`;
  }
  window.mmMark = mmMark;

  function scoreColor(score) {
    if (score >= 90) return '#16a34a';
    if (score >= 70) return '#d97706';
    return '#dc2626';
  }

  function progClass(score) {
    if (score >= 90) return 'ok';
    if (score >= 70) return 'am';
    return 'rd';
  }

  function chipForVessel(counts) {
    if (counts.overdue > 0) return `<span class="chip chip-rd">${counts.overdue} overdue</span>`;
    if (counts.due30 > 0) return `<span class="chip chip-am">${counts.due30} due soon</span>`;
    return `<span class="chip chip-ok">All clear</span>`;
  }

  function statusForDays(days) {
    if (days === Infinity) return 'ok';
    if (days < 0) return 'rd';
    if (days <= 30) return 'am';
    return 'ok';
  }

  function chipForDays(days) {
    if (days === Infinity) return '<span class="chip chip-ok">No expiry</span>';
    if (days < 0) return `<span class="chip chip-rd">Expired</span>`;
    if (days <= 30) return `<span class="chip chip-am">${days}d</span>`;
    if (days <= 60) return `<span class="chip chip-am">${days}d</span>`;
    return `<span class="chip chip-ok">Valid</span>`;
  }

  function actionLine(item) {
    if (item.cert) {
      const v = item.vessel ? ` — ${escapeHtml(item.vessel.name)}` : '';
      if (item.days < 0) {
        return {
          sev: 'rd', icon: '🚨',
          title: `${escapeHtml(item.cert.name)}${v}`,
          sub: `Expired ${Math.abs(item.days)} day${Math.abs(item.days) === 1 ? '' : 's'} ago`,
          btn: '<button class="btn btn-xs btn-red">Fix</button>'
        };
      }
      return {
        sev: 'am', icon: item.cert.icon || '📋',
        title: `${escapeHtml(item.cert.name)}${v}`,
        sub: `Due in ${item.days} day${item.days === 1 ? '' : 's'}`,
        btn: '<button class="btn btn-xs btn-out" onclick="go(\'s-surveys\')">Book</button>'
      };
    }
    if (item.equipment) {
      const v = item.vessel ? ` — ${escapeHtml(item.vessel.name)}` : '';
      const sev = item.days < 0 ? 'rd' : 'am';
      return {
        sev, icon: item.equipment.icon || '🔧',
        title: `${escapeHtml(item.equipment.name)} service${v}`,
        sub: item.days < 0 ? `Service overdue ${Math.abs(item.days)} days` : `Service due in ${item.days} days`,
        btn: '<button class="btn btn-xs btn-out" onclick="go(\'s-equipment-list\')">View</button>'
      };
    }
    if (item.crewCert) {
      const p = item.person ? ` — ${escapeHtml(item.person.name)}` : '';
      return {
        sev: item.days < 0 ? 'rd' : 'am', icon: '👤',
        title: `${escapeHtml(item.crewCert.name)}${p}`,
        sub: item.days < 0 ? `Expired ${Math.abs(item.days)} days ago` : `Due in ${item.days} days`,
        btn: '<button class="btn btn-xs btn-out" onclick="go(\'s-crew\')">View</button>'
      };
    }
    return null;
  }

  // ---------- Navigation ----------

  function go(id) {
    document.querySelectorAll('.shell').forEach(s => s.classList.remove('on'));
    const t = document.getElementById(id);
    if (t) {
      t.classList.add('on');
      const sc = t.querySelector('.scroll');
      if (sc) sc.scrollTop = 0;
    }
    if (id === 's-home')               renderHome();
    if (id === 's-vessels')            renderVesselsList();
    if (id === 's-vessel-detail')      renderVesselDetail();
    if (id === 's-certs')              renderRecords();
    if (id === 's-tools')              renderTools();
    if (id === 's-equipment-list')     renderEquipmentList();
    if (id === 's-equipment-detail')   renderEquipmentDetail();
    if (id === 's-equipment-add')      resetEquipmentAddForm();
    if (id === 's-handoff')            renderHandoff();
    if (id === 's-surveyor-home')      renderSurveyorHome();
    if (id === 's-surveyor-vessel')    renderSurveyorVessel();
    if (id === 's-surveyor-inspect')   renderSurveyorInspect();
    if (id === 's-sms')                renderSmsHub();
    if (id === 's-sms-builder')        renderSmsBuilder();
    if (id === 's-account')            renderAccount();
    if (id === 's-onboard-jur')        renderOnboardingJurisdiction();
    if (id === 's-scan-confirm')       renderScanConfirm();
    if (id === 's-surveyor-job')       renderSurveyorJob();
    if (id === 's-surveyor-quote')     renderSurveyorQuote();
    if (id === 's-invoice-view')       renderInvoiceView();
    if (id === 's-admin-home')         renderAdminHome();
    if (id === 's-admin-review')       renderAdminReview();
  }
  window.go = go;

  function selectJur(el, type) {
    document.querySelectorAll('.jur-opt').forEach((o) => o.classList.remove('on'));
    el.classList.add('on');
    const uk = document.getElementById('jur-info-uk');
    const ie = document.getElementById('jur-info-ie');
    const iee = document.getElementById('ie-exemption-panel');
    if (uk) uk.style.display = (type === 'uk' || type === 'both') ? 'block' : 'none';
    if (ie) ie.style.display = (type === 'ie' || type === 'both') ? 'block' : 'none';
    if (iee) iee.style.display = (type === 'ie' || type === 'both') ? 'block' : 'none';
  }
  window.selectJur = selectJur;

  function selectIEClass(el) {
    el.closest('.card').querySelectorAll('.row').forEach((r) => (r.style.background = ''));
    el.style.background = 'var(--seap)';
  }
  window.selectIEClass = selectIEClass;

  function switchTab(btn, tabId) {
    const screen = btn.closest('.shell');
    screen.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
    btn.classList.add('on');
    screen.querySelectorAll('.tc').forEach(t => t.classList.remove('on'));
    const target = document.getElementById(tabId);
    if (target) target.classList.add('on');
  }
  window.switchTab = switchTab;

  // ---------- Mode switching ----------

  // ---------- Desktop surveyor layout ----------
  // When in surveyor mode AND the viewport is wide (≥1024px), we add
  // body.desktop-surveyor which swaps the phone-frame for a full-viewport
  // workspace with a left sidebar. Sidebar HTML lives in index.html.

  const DESKTOP_SURVEYOR_MIN = 1024;

  function applyDesktopSurveyor() {
    const isSurveyor = Store && Store.getMode() === 'surveyor';
    const wideEnough = window.innerWidth >= DESKTOP_SURVEYOR_MIN;
    document.body.classList.toggle('desktop-surveyor', isSurveyor && wideEnough);
    refreshSurveyorSidebar();
  }

  function refreshSurveyorSidebar() {
    if (!Store) return;
    const me = Store.getCurrentUser();
    if (!me || me.kind !== 'surveyor') return;

    // Brand mark (inline)
    const markEl = document.getElementById('sv-sb-mark');
    if (markEl && typeof mmMark === 'function') {
      markEl.innerHTML = `${mmMark(28)}
        <div class="mm-mark-words">
          <div class="mm-mark-name">McCollam Marine</div>
          <div class="mm-mark-tag">Naval Architects · Marine Surveyors</div>
        </div>`;
    }

    // Footer user line
    const userEl = document.getElementById('sv-sb-user');
    if (userEl) userEl.textContent = `${me.name} · ${me.surveyor && me.surveyor.regions ? me.surveyor.regions[0] : ''}`;

    // Active tab + inbox count
    const inbox = Store.jobsForSurveyor(me.id, 'requested');
    const cnt = document.getElementById('sv-sb-inbox-count');
    if (cnt) {
      if (inbox.length > 0) { cnt.style.display = ''; cnt.textContent = inbox.length; }
      else cnt.style.display = 'none';
    }
    document.querySelectorAll('.sv-sb-item').forEach((el) => {
      const t = el.dataset.tab;
      el.classList.toggle('on', t === surveyorTab);
    });
  }

  function enterSurveyorMode() {
    if (!window.Store) return;
    Store.setMode('surveyor');
    applyDesktopSurveyor();
    go('s-surveyor-home');
  }
  window.enterSurveyorMode = enterSurveyorMode;

  function exitSurveyorMode() {
    if (!window.Store) return;
    Store.setMode('operator');
    document.body.classList.remove('desktop-surveyor');
    go('s-home');
  }
  window.exitSurveyorMode = exitSurveyorMode;

  // Re-apply on resize (so rotating to landscape on iPad triggers desktop layout)
  window.addEventListener('resize', () => {
    if (!Store) return;
    if (Store.getMode() === 'surveyor') applyDesktopSurveyor();
    if (Store.getMode() === 'admin') applyDesktopAdmin();
  });

  // ---------- Admin workspace (Joe's CodedOK admin) ----------
  // Joe sees customer SMS submissions, walks through section-by-section,
  // edits the polished version, adds notes, sends back to the operator.

  let adminTab = 'inbox';
  let activeReviewDocId = null;
  let activeReviewSectionIdx = 0;

  function applyDesktopAdmin() {
    const isAdmin = Store && Store.getMode() === 'admin';
    const wide = window.innerWidth >= DESKTOP_SURVEYOR_MIN;
    document.body.classList.toggle('desktop-admin', isAdmin && wide);
    refreshAdminSidebar();
  }

  function refreshAdminSidebar() {
    if (!Store) return;
    const me = Store.getCurrentUser();
    if (!me || me.kind !== 'admin') return;
    const userEl = document.getElementById('ad-sb-user');
    if (userEl) userEl.textContent = `${me.name} · ${me.email}`;
    const inbox = Store.smsSubmissions('submitted');
    const cnt = document.getElementById('ad-sb-inbox-count');
    if (cnt) {
      if (inbox.length > 0) { cnt.style.display = ''; cnt.textContent = inbox.length; }
      else cnt.style.display = 'none';
    }
    document.querySelectorAll('.ad-sb-item').forEach((el) => {
      el.classList.toggle('on', el.dataset.tab === adminTab);
    });
  }

  function enterAdminMode() {
    if (!window.Store) return;
    Store.setMode('admin');
    applyDesktopAdmin();
    go('s-admin-home');
  }
  window.enterAdminMode = enterAdminMode;

  function exitAdminMode() {
    document.body.classList.remove('desktop-admin');
    if (Store) Store.setMode('operator');
    clearSession();
    renderDemoBadge();
    go('s-login');
  }
  window.exitAdminMode = exitAdminMode;

  function setAdminTab(tab) {
    adminTab = tab;
    if (!document.getElementById('s-admin-home').classList.contains('on')) {
      go('s-admin-home');
      return;
    }
    renderAdminHome();
    refreshAdminSidebar();
  }
  window.setAdminTab = setAdminTab;

  function renderAdminHome() {
    const wrap = document.getElementById('ad-home-scroll');
    if (!wrap) return;

    const submitted = Store.smsSubmissions('submitted');
    const inProgress = Store.smsSubmissions('in_progress');
    const delivered = Store.smsSubmissions('delivered');

    const counts = { inbox: submitted.length, active: inProgress.length, delivered: delivered.length };
    const list = adminTab === 'inbox' ? submitted
                : adminTab === 'active' ? inProgress
                : adminTab === 'delivered' ? delivered
                : [];

    let html = `
      <div style="background:white;border-bottom:1px solid var(--bdr);padding:24px 32px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div>
            <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em">CodedOK · Admin workspace</div>
            <div style="font-size:24px;font-weight:800;color:var(--text);letter-spacing:-.4px;margin-top:2px">${adminTab === 'inbox' ? 'Inbox' : adminTab === 'active' ? 'In progress' : adminTab === 'delivered' ? 'Delivered' : 'Customers'}</div>
          </div>
          <div style="display:flex;gap:14px">
            <div style="text-align:right"><div style="font-size:18px;font-weight:800">${counts.inbox}</div><div style="font-size:10px;color:var(--lt);text-transform:uppercase;letter-spacing:.07em">In inbox</div></div>
            <div style="text-align:right"><div style="font-size:18px;font-weight:800;color:var(--amber)">${counts.active}</div><div style="font-size:10px;color:var(--lt);text-transform:uppercase;letter-spacing:.07em">Active</div></div>
            <div style="text-align:right"><div style="font-size:18px;font-weight:800;color:var(--green)">${counts.delivered}</div><div style="font-size:10px;color:var(--lt);text-transform:uppercase;letter-spacing:.07em">Delivered</div></div>
          </div>
        </div>
      </div>
      <div style="padding:24px 32px">`;

    if (adminTab === 'customers') {
      const orgs = Store.snapshot().organizations || [];
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px">`;
      orgs.forEach((o) => {
        const opvessels = Store.snapshot().vessels.filter((v) => v.org_id === o.id);
        const docs = (Store.snapshot().sms_documents || []).filter((d) => d.org_id === o.id);
        html += `
          <div class="card" style="padding:18px">
            <div style="font-size:14px;font-weight:700;color:var(--text)">${escapeHtml(o.name)}</div>
            <div style="font-size:11px;color:var(--lt);margin-top:2px">Plan: ${escapeHtml(o.plan)} · ${opvessels.length} vessel${opvessels.length === 1 ? '' : 's'}</div>
            <div style="margin-top:10px;font-size:11px;color:var(--mid)">${docs.length} SMS document${docs.length === 1 ? '' : 's'}</div>
          </div>`;
      });
      html += `</div>`;
    } else if (list.length === 0) {
      const blurb = adminTab === 'inbox' ? 'When operators submit an SMS for review, it lands here.'
                  : adminTab === 'active' ? 'Reviews you\'ve started but not yet delivered show here.'
                  : 'Sent reviews are archived here.';
      html += `<div class="empty"><div class="empty-art">${adminTab === 'inbox' ? '📥' : adminTab === 'active' ? '✏️' : '✓'}</div><div class="empty-h">Nothing ${adminTab === 'inbox' ? 'in inbox' : adminTab === 'active' ? 'in progress' : 'delivered yet'}</div><div class="empty-sub">${blurb}</div></div>`;
    } else {
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:12px">`;
      list.forEach((d) => {
        const v = Store.getVessel(d.vessel_id);
        const op = Store.snapshot().users.find((u) => u.id === (d.submitted_by_user_id || 'u_jm')) || { name: 'Operator' };
        const sectionsFilled = d.sections ? Object.keys(d.sections).filter((k) => Object.values(d.sections[k] || {}).some((v) => v && String(v).trim())).length : 0;
        const totalSections = (window.Codes && window.Codes.SMS_SCHEMA) ? window.Codes.SMS_SCHEMA.length : 11;
        const submittedAt = d.submitted_at || d.last_reviewed_at;
        html += `
          <div class="card" style="padding:18px;cursor:pointer;border-radius:12px" onclick="openAdminReview('${d.id}')">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
              <div style="min-width:0">
                <div style="font-size:14px;font-weight:700;color:var(--text)">${escapeHtml(d.title || 'Safety Management System')}</div>
                <div style="font-size:11px;color:var(--lt);margin-top:2px">${escapeHtml(v ? v.name : '—')} · ${escapeHtml(v ? v.category : '')}</div>
              </div>
              <span class="chip ${d.status === 'submitted' ? 'chip-bl' : d.status === 'in_progress' ? 'chip-am' : 'chip-ok'}">${escapeHtml(d.status)}</span>
            </div>
            <div style="font-size:11px;color:var(--lt);margin-bottom:12px">${escapeHtml(op.name)} · ${submittedAt ? 'submitted ' + fmtDate(submittedAt) : ''}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--lt);margin-bottom:4px">
              <span>${sectionsFilled}/${totalSections} sections completed</span>
              <span style="font-weight:700;color:${sectionsFilled === totalSections ? 'var(--green)' : 'var(--amber)'}">${Math.round(sectionsFilled / totalSections * 100)}%</span>
            </div>
            <div class="prog"><div class="prog-fill ${sectionsFilled === totalSections ? 'ok' : 'am'}" style="width:${sectionsFilled / totalSections * 100}%"></div></div>
            <div style="margin-top:14px;font-size:12px;font-weight:600;color:var(--purp)">${d.status === 'submitted' ? 'Open & start review →' : d.status === 'in_progress' ? 'Resume editing →' : 'View delivered →'}</div>
          </div>`;
      });
      html += `</div>`;
    }

    html += `</div>`;
    wrap.innerHTML = html;
    refreshAdminSidebar();
  }

  function openAdminReview(docId) {
    activeReviewDocId = docId;
    activeReviewSectionIdx = 0;
    // If submitted, mark in_progress so we know Joe started.
    const d = Store.snapshot().sms_documents.find((x) => x.id === docId);
    if (d && d.status === 'submitted') {
      Store.updateSmsDocument(docId, { status: 'in_progress' });
    }
    go('s-admin-review');
  }
  window.openAdminReview = openAdminReview;

  function renderAdminReview() {
    const wrap = document.getElementById('ad-review-scroll');
    if (!wrap) return;
    const d = Store.snapshot().sms_documents.find((x) => x.id === activeReviewDocId);
    if (!d || !window.Codes) {
      wrap.innerHTML = '<div class="empty"><div class="empty-h">Document not found</div><button class="btn btn-sm btn-out" onclick="go(\'s-admin-home\')">Back to inbox</button></div>';
      return;
    }
    const v = Store.getVessel(d.vessel_id);
    const schema = window.Codes.SMS_SCHEMA;
    const section = schema[activeReviewSectionIdx];

    // Build the section list pane
    const sectionListHtml = schema.map((sec, i) => {
      const opSec = (d.sections || {})[sec.id] || {};
      const opFilled = Object.values(opSec).some((v) => v && String(v).trim());
      const polished = ((d.polished_sections || {})[sec.id] || {});
      const polFilled = Object.values(polished).some((v) => v && String(v).trim());
      const isActive = i === activeReviewSectionIdx;
      return `
        <button class="ad-section-item ${isActive ? 'on' : ''} ${polFilled ? 'done' : ''}" onclick="setAdminSection(${i})">
          <div class="ic">${polFilled ? '✓' : sec.icon}</div>
          <div class="body">
            <div class="ttl">${i + 1}. ${escapeHtml(sec.title)}</div>
            <div class="ref">${opFilled ? 'Operator answered' : 'Empty'}</div>
          </div>
        </button>`;
    }).join('');

    // Build the editor pane
    const opSec = (d.sections || {})[section.id] || {};
    const polishedSec = (d.polished_sections || {})[section.id] || {};
    let editorFieldsHtml = '';
    section.fields.forEach((f) => {
      const opVal = opSec[f.id] || '';
      const polVal = polishedSec[f.id] || opVal;  // pre-fill with operator answer if no polish yet
      const noteVal = (polishedSec.__notes || {})[f.id] || '';
      editorFieldsHtml += `
        <div style="margin-bottom:24px">
          <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">${escapeHtml(f.label)}</div>
          ${opVal ? `
            <div style="font-size:10px;color:var(--lt);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Operator wrote</div>
            <div class="ad-input-readonly">${escapeHtml(opVal)}</div>` : `
            <div style="font-size:11px;color:var(--lt);font-style:italic;margin-bottom:8px">Operator left this blank.</div>`}
          <div style="font-size:10px;color:var(--purp);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Your polished version</div>
          <textarea class="ad-textarea" id="ad-pol-${section.id}-${f.id}">${escapeHtml(polVal)}</textarea>
          <div style="margin-top:8px">
            <div style="font-size:10px;color:var(--amber);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Note for operator (optional)</div>
            <textarea class="ad-notes" id="ad-note-${section.id}-${f.id}" placeholder="e.g. consider expanding this for your specific area">${escapeHtml(noteVal)}</textarea>
          </div>
        </div>`;
    });

    // Two-pane on desktop, stacked on mobile
    const sectionsFilled = schema.filter((sec) => {
      const ps = (d.polished_sections || {})[sec.id];
      return ps && Object.values(ps).some((v) => v && String(v).trim() && v !== ((d.sections || {})[sec.id] || {})[Object.keys(ps)[0]]);
    }).length;
    const overallNotes = d.admin_notes || '';

    wrap.innerHTML = `
      <div class="ad-editor-grid">
        <!-- LEFT: Section list -->
        <div class="col" style="background:#fafbfc">
          <div style="padding:18px 20px 6px;border-bottom:1px solid var(--bdr)">
            <button class="btn btn-xs btn-out" onclick="go('s-admin-home')" style="margin-bottom:10px">‹ Back to inbox</button>
            <div style="font-size:13px;font-weight:700;color:var(--text)">${escapeHtml(d.title || 'SMS')}</div>
            <div style="font-size:11px;color:var(--lt);margin-top:1px">${escapeHtml(v ? v.name : '')} · ${escapeHtml(v ? v.category : '')}</div>
            <div style="font-size:10px;color:var(--purp);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-top:8px">${sectionsFilled}/${schema.length} sections polished</div>
          </div>
          <div class="ad-section-list">${sectionListHtml}</div>
        </div>

        <!-- CENTER: Editor for active section -->
        <div class="col">
          <div class="ad-pane">
            <div style="font-size:10px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em">Section ${activeReviewSectionIdx + 1} of ${schema.length} · ${escapeHtml(section.ref)}</div>
            <h1>${section.icon} ${escapeHtml(section.title)}</h1>
            <div style="font-size:13px;color:var(--mid);line-height:1.6;margin:6px 0 18px">${escapeHtml(section.blurb)}</div>

            <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap">
              <button class="btn btn-sm" style="height:34px;font-size:12px;background:linear-gradient(135deg,#7c3aed,#3b5fff);color:white;border:none;font-weight:700" onclick="generateAiVersion()">✨ Generate AI version</button>
              <button class="btn btn-sm btn-out" style="height:34px;font-size:12px" onclick="copyOperatorAnswer()">↩ Copy operator's answer</button>
              <button class="btn btn-sm btn-out" style="height:34px;font-size:12px" onclick="saveAdminProgress()">💾 Save progress</button>
            </div>

            ${editorFieldsHtml}

            <div style="display:flex;justify-content:space-between;margin-top:24px">
              <button class="btn btn-out" onclick="navAdminSection(-1)" ${activeReviewSectionIdx === 0 ? 'disabled style="opacity:.4"' : ''}>‹ Previous</button>
              ${activeReviewSectionIdx < schema.length - 1
                ? `<button class="btn btn-sea" onclick="navAdminSection(1)">Save &amp; next →</button>`
                : `<button class="btn btn-sea" onclick="goToFinalReview()">Review &amp; send →</button>`}
            </div>
          </div>
        </div>

        <!-- RIGHT: Vessel info + actions -->
        <div class="col" style="background:#fafbfc">
          <div style="padding:18px 20px">
            <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Submission</div>
            ${v ? `
              <div class="card" style="padding:14px;margin-bottom:14px">
                <div style="font-size:14px;font-weight:700;color:var(--text)">${escapeHtml(v.name)}</div>
                <div style="font-size:11px;color:var(--lt);margin-top:2px">${escapeHtml(v.category)} · ${escapeHtml(v.type)}</div>
                <div style="margin-top:8px;font-size:11px;color:var(--mid);line-height:1.7">
                  SSR: ${escapeHtml(v.ssr || '—')}<br>
                  Persons: ${v.persons || '—'}<br>
                  Port: ${escapeHtml(v.port || '—')}<br>
                  Length: ${v.length ? v.length + 'm' : '—'}
                </div>
              </div>` : ''}

            <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Status</div>
            <div style="font-size:13px;color:var(--text);margin-bottom:16px">${escapeHtml(d.status)} · ${d.submitted_at ? 'submitted ' + fmtDate(d.submitted_at) : ''}</div>

            <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Overall notes for operator</div>
            <textarea class="ad-textarea" id="ad-overall-notes" style="min-height:120px;font-size:13px" placeholder="A short message that goes with the delivered document — e.g. 'Polished and tightened. Pay attention to the cyber-security section, you'll want to review with your IT support.'">${escapeHtml(overallNotes)}</textarea>

            <div style="margin-top:14px">
              <button class="btn btn-sea btn-full" onclick="sendDelivery()" style="background:linear-gradient(135deg,#7c3aed,#3b5fff);border:none">📤 Send polished SMS to operator</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function snapshotAdminSection() {
    if (!window.Codes) return;
    const schema = window.Codes.SMS_SCHEMA;
    const section = schema[activeReviewSectionIdx];
    if (!section) return;
    const d = Store.snapshot().sms_documents.find((x) => x.id === activeReviewDocId);
    if (!d) return;
    const polished = d.polished_sections || {};
    if (!polished[section.id]) polished[section.id] = {};
    if (!polished[section.id].__notes) polished[section.id].__notes = {};
    section.fields.forEach((f) => {
      const polEl = document.getElementById(`ad-pol-${section.id}-${f.id}`);
      const noteEl = document.getElementById(`ad-note-${section.id}-${f.id}`);
      if (polEl) polished[section.id][f.id] = polEl.value;
      if (noteEl) polished[section.id].__notes[f.id] = noteEl.value;
    });
    const overallEl = document.getElementById('ad-overall-notes');
    Store.updateSmsDocument(activeReviewDocId, {
      polished_sections: polished,
      admin_notes: overallEl ? overallEl.value : (d.admin_notes || '')
    });
  }

  function setAdminSection(idx) {
    snapshotAdminSection();
    activeReviewSectionIdx = idx;
    renderAdminReview();
  }
  window.setAdminSection = setAdminSection;

  function navAdminSection(delta) {
    snapshotAdminSection();
    activeReviewSectionIdx += delta;
    if (activeReviewSectionIdx < 0) activeReviewSectionIdx = 0;
    if (window.Codes && activeReviewSectionIdx >= window.Codes.SMS_SCHEMA.length) activeReviewSectionIdx = window.Codes.SMS_SCHEMA.length - 1;
    renderAdminReview();
  }
  window.navAdminSection = navAdminSection;

  function copyOperatorAnswer() {
    if (!window.Codes) return;
    const schema = window.Codes.SMS_SCHEMA;
    const section = schema[activeReviewSectionIdx];
    const d = Store.snapshot().sms_documents.find((x) => x.id === activeReviewDocId);
    if (!d || !section) return;
    const opSec = (d.sections || {})[section.id] || {};
    section.fields.forEach((f) => {
      const polEl = document.getElementById(`ad-pol-${section.id}-${f.id}`);
      if (polEl && opSec[f.id]) polEl.value = opSec[f.id];
    });
  }
  window.copyOperatorAnswer = copyOperatorAnswer;

  // Mock AI generation — wraps the operator's answer with a polished frame.
  // Production will call Anthropic API with the section context + operator answers.
  function generateAiVersion() {
    if (!window.Codes) return;
    const schema = window.Codes.SMS_SCHEMA;
    const section = schema[activeReviewSectionIdx];
    const d = Store.snapshot().sms_documents.find((x) => x.id === activeReviewDocId);
    if (!d || !section) return;
    const v = Store.getVessel(d.vessel_id);
    const opSec = (d.sections || {})[section.id] || {};

    section.fields.forEach((f) => {
      const polEl = document.getElementById(`ad-pol-${section.id}-${f.id}`);
      if (!polEl) return;
      const opVal = opSec[f.id] || '';
      // Build a "polished" version: take operator's text, add a structured frame.
      const polished = polishField(section, f, opVal, v);
      polEl.value = polished;
    });
  }
  window.generateAiVersion = generateAiVersion;

  function polishField(section, field, opText, vessel) {
    const v = vessel || {};
    if (field.type === 'date') return opText || new Date().toISOString().slice(0, 10);
    if (field.type === 'short') return opText || (field.default || '').replace(/\[VESSEL_NAME\]/g, v.name || 'the vessel');

    const baseTemplate = (field.default || '').replace(/\[VESSEL_NAME\]/g, v.name || 'the vessel').replace(/\[CATEGORY\]/g, v.category || '');

    if (!opText || opText.trim().length < 30) {
      // Operator left it blank or sparse — return the polished template
      return baseTemplate || `[CodedOK Pro draft — please tailor to ${v.name || 'your vessel'} and your operation]`;
    }
    // Otherwise: take operator's answer and frame it as a polished SMS paragraph
    return [
      `On ${v.name || 'this vessel'} (${v.category || ''}, ${v.type || 'commercial'}):`,
      '',
      opText.trim(),
      '',
      'This procedure has been reviewed against the SPV Code 2025 / Workboat Code Edition 3 requirements. The Master is responsible for implementing it on board. Reviewed by CodedOK.'
    ].join('\n');
  }

  function saveAdminProgress() {
    snapshotAdminSection();
    const btn = event && event.target;
    if (btn) {
      const o = btn.textContent;
      btn.textContent = '✓ Saved';
      setTimeout(() => { btn.textContent = o; }, 1200);
    }
  }
  window.saveAdminProgress = saveAdminProgress;

  function goToFinalReview() {
    snapshotAdminSection();
    sendDelivery();
  }
  window.goToFinalReview = goToFinalReview;

  function sendDelivery() {
    snapshotAdminSection();
    const d = Store.snapshot().sms_documents.find((x) => x.id === activeReviewDocId);
    if (!d) return;
    if (!confirm(`Send the polished SMS to the operator?\n\nThey'll get a notification on their next open. Status will become "delivered" and your work archived.`)) return;
    Store.deliverSmsToOperator(d.id, d.polished_sections || {}, d.admin_notes || '');
    alert('Delivered. The operator will see it on their home screen.');
    activeReviewDocId = null;
    adminTab = 'delivered';
    go('s-admin-home');
  }
  window.sendDelivery = sendDelivery;

  // ---------- Home (operator) ----------

  function renderHome() {
    if (!window.Store) return;
    const s = Store.snapshot();

    const hr = new Date().getHours();
    const part = hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening';
    const greeting = document.getElementById('home-greeting');
    if (greeting) {
      const firstName = (s.user && s.user.name) ? s.user.name.split(' ')[0] : '';
      greeting.innerHTML = `
        <div style="font-size:12px;color:rgba(255,255,255,.5);margin-bottom:3px;font-weight:500">Good ${part}${firstName ? ', ' + escapeHtml(firstName) : ''}</div>
        <div class="h-display" style="font-size:24px">Fleet command</div>
      `;
    }
    const av = document.getElementById('home-avatar');
    if (av && s.user) av.textContent = s.user.initials || '';

    const statusEl = document.getElementById('home-status');
    if (statusEl) {
      // Convert the static container into a hero-styled element.
      statusEl.className = 'hero';
      statusEl.style.cssText = '';
      if (s.vessels.length === 0) {
        statusEl.innerHTML = `
          <div class="empty">
            <div class="empty-art">⛵</div>
            <div class="empty-h" style="color:white">Add your first vessel</div>
            <div class="empty-sub" style="color:rgba(255,255,255,.55)">CodedOK will auto-suggest the certs and equipment you need based on your MCA category.</div>
            <button class="btn btn-sea btn-sm" onclick="go('s-onboard')">+ Add vessel</button>
          </div>`;
      } else {
        const fleetScore = Store.complianceScore();
        const counts = Store.urgencyCounts();
        const ready = counts.overdue === 0;
        const badgeHtml = ready
          ? `<span class="insp-pill rdy">✓ Inspection-ready</span>`
          : `<span class="insp-pill notready pulse-rd">⚠ ${counts.overdue} urgent item${counts.overdue === 1 ? '' : 's'}</span>`;
        const sub = ready
          ? 'All certificates &amp; equipment current. Keep on top of upcoming renewals.'
          : `${counts.overdue} item${counts.overdue === 1 ? '' : 's'} need${counts.overdue === 1 ? 's' : ''} attention before your next MCA visit.`;
        statusEl.innerHTML = `
          <div style="display:flex;align-items:flex-start;gap:18px;position:relative;z-index:1">
            <div class="ring-wrap">
              ${ringSvg(fleetScore, scoreColor(fleetScore), 96, true)}
              <div class="ring-val">
                <div class="ring-pct" style="color:white;font-size:26px;letter-spacing:-.6px;font-weight:800">${fleetScore}<span style="font-size:14px;font-weight:600;color:rgba(255,255,255,.6)">%</span></div>
                <div class="ring-pct-lbl" style="color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.07em">FLEET</div>
              </div>
            </div>
            <div style="flex:1">
              <div style="margin-bottom:8px">${badgeHtml}</div>
              <div style="font-size:12px;color:rgba(255,255,255,.55);line-height:1.55;margin-bottom:12px">${sub}</div>
              <button class="btn btn-sea btn-sm" style="height:32px;font-size:12px;padding:0 14px" onclick="exportFleetInspectionPack()">📄 Inspection pack →</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px;position:relative;z-index:1">
            <div class="tile"><div class="tile-num ${counts.overdue ? 'rd' : ''}">${counts.overdue}</div><div class="tile-lbl">Overdue</div></div>
            <div class="tile"><div class="tile-num ${counts.due30 ? 'am' : ''}">${counts.due30}</div><div class="tile-lbl">≤30 days</div></div>
            <div class="tile"><div class="tile-num ${counts.due60 ? 'am' : ''}">${counts.due60}</div><div class="tile-lbl">30–60 days</div></div>
            <div class="tile"><div class="tile-num ok">${counts.valid}</div><div class="tile-lbl">All clear</div></div>
          </div>`;
      }
    }

    // Inject pending banners (incoming quotes + recent deliveries).
    const orgId = (Store.snapshot().organizations[0] || {}).id;
    const openInvoices = orgId ? Store.invoicesForOperator(orgId, 'sent') : [];
    const recentDeliveries = orgId ? Store.recentDeliveriesForOperator(orgId, 14) : [];
    let banner = document.getElementById('home-quotes-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'home-quotes-banner';
      const homeEl = document.getElementById('s-home');
      const scroll = homeEl && homeEl.querySelector('.scroll');
      if (scroll) scroll.insertBefore(banner, scroll.firstChild);
    }
    let bannerHtml = '';
    if (openInvoices.length > 0) {
      const totalDue = openInvoices.reduce((s, i) => s + i.total, 0);
      bannerHtml += `
        <div style="padding:14px 16px 0">
          <div class="card" style="padding:14px;border-radius:14px;border-left:4px solid var(--sea);cursor:pointer" onclick="openInvoice('${openInvoices[0].id}')">
            <div style="display:flex;align-items:center;gap:12px">
              <div class="qa-icon bl">🧾</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:700;color:var(--text)">${openInvoices.length} quote${openInvoices.length === 1 ? '' : 's'} from your surveyor</div>
                <div style="font-size:12px;color:var(--lt);margin-top:1px">£${totalDue} awaiting payment · tap to review</div>
              </div>
              <span class="chev">›</span>
            </div>
          </div>
        </div>`;
    }
    if (recentDeliveries.length > 0) {
      const d = recentDeliveries[0];
      const targetVessel = Store.getVessel(d.metadata.vessel_id);
      const docTypeLabel = d.metadata.doc_type === 'coding_cert' ? 'Coding Certificate'
        : d.metadata.doc_type === 'sms_signed' ? 'signed SMS'
        : d.metadata.doc_type === 'survey_report' ? 'Survey report'
        : 'Document';
      const onClick = d.metadata.cert_id
        ? `openCertSheet('${d.metadata.cert_id}')`
        : d.metadata.sms_doc_id ? `go('s-sms')` : `go('s-vessel-detail')`;
      bannerHtml += `
        <div style="padding:14px 16px 0">
          <div class="card" style="padding:14px;border-radius:14px;border-left:4px solid var(--green);cursor:pointer" onclick="setActiveVessel('${d.metadata.vessel_id}');${onClick}">
            <div style="display:flex;align-items:center;gap:12px">
              <div class="qa-icon ok">📎</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:700;color:var(--text)">${recentDeliveries.length === 1 ? 'New ' + escapeHtml(docTypeLabel) + ' delivered' : recentDeliveries.length + ' new deliveries'}</div>
                <div style="font-size:12px;color:var(--lt);margin-top:1px">${escapeHtml(d.metadata.surveyor || 'Surveyor')} · ${escapeHtml(targetVessel ? targetVessel.name : '')} · ${fmtDate(d.at)}</div>
              </div>
              <span class="chev">›</span>
            </div>
          </div>
        </div>`;
    }
    banner.innerHTML = bannerHtml;

    const actionsEl = document.getElementById('home-actions');
    if (actionsEl) {
      const items = Store.topActions(3);
      if (items.length === 0) {
        actionsEl.innerHTML = `
          <div class="qa-tile">
            <div class="qa-icon ok">✓</div>
            <div style="flex:1"><div class="qa-title">All caught up</div><div class="qa-sub">No items due in the next 60 days</div></div>
          </div>`;
      } else {
        actionsEl.innerHTML = items.map((it) => {
          const a = actionLine(it); if (!a) return '';
          return `
            <div class="qa-tile" onclick="${it.cert ? "go('s-vessel-detail')" : it.equipment ? "go('s-equipment-list')" : "go('s-crew')"}">
              <div class="qa-icon ${a.sev}">${a.icon}</div>
              <div style="flex:1;min-width:0">
                <div class="qa-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.title}</div>
                <div class="qa-sub">${a.sub}</div>
              </div>
              <span class="chev">›</span>
            </div>`;
        }).join('');
      }
    }

    const urgEl = document.getElementById('home-urgency');
    if (urgEl) {
      // Replaced by the tile strip in the hero — clear the old strip.
      urgEl.innerHTML = '';
      urgEl.style.display = 'none';
    }

    // Safety Management — featured card on Home
    const smsCardEl = document.getElementById('home-sms-card');
    if (smsCardEl) {
      const draft = (function () { try { return JSON.parse(localStorage.getItem('codedok-sms-draft-v1') || 'null'); } catch (e) { return null; }})();
      const smsDocs = Store.snapshot().sms_documents || [];
      const smsDelivered = smsDocs.find((d) => d.status === 'delivered');
      const smsSubmitted = smsDocs.find((d) => d.status === 'submitted' || d.status === 'in_progress');
      const smsActive = smsDocs.find((d) => d.status === 'signed') || smsDocs.find((d) => d.status === 'active');
      let cta, line, color, icon;
      if (smsDelivered) {
        icon = '✨'; color = 'var(--purp)';
        line = `Polished SMS ready · delivered ${fmtDate(smsDelivered.delivered_at)} by CodedOK`;
        cta = 'Open my SMS →';
      } else if (smsSubmitted) {
        icon = '⏳'; color = 'var(--amber)';
        line = `With CodedOK · submitted ${fmtDate(smsSubmitted.submitted_at || smsSubmitted.last_reviewed_at)} · we'll be in touch`;
        cta = 'View status →';
      } else if (smsActive && smsActive.status === 'signed') {
        icon = '✓'; color = 'var(--green)';
        line = `Signed${smsActive.signed_by_user_id ? ' by your surveyor' : ''} · in your inspection pack`;
        cta  = 'View signed SMS →';
      } else if (smsActive) {
        icon = '📋'; color = 'var(--sea)';
        line = `Active · v${smsActive.version} · send to a surveyor for sign-off`;
        cta  = 'Open SMS →';
      } else if (draft) {
        const pct = (function () { if (!window.Codes) return 0; let total=0,done=0; window.Codes.SMS_SCHEMA.forEach((sec)=>{sec.fields.forEach((f)=>{total++;const v=draft.sections&&draft.sections[sec.id]&&draft.sections[sec.id][f.id];if(v&&String(v).trim())done++;});}); return total?Math.round(done/total*100):0; })();
        icon = '📝'; color = 'var(--amber)';
        line = `Draft · ${pct}% complete · pick up where you left off`;
        cta  = 'Resume SMS →';
      } else {
        icon = '🛡️'; color = 'var(--purp)';
        line = 'MCA-aligned in 11 guided sections · submit to CodedOK for AI polish';
        cta  = 'Build your SMS →';
      }
      smsCardEl.innerHTML = `
        <div class="card" style="padding:14px;border-radius:14px;cursor:pointer;border-left:4px solid ${color}" onclick="go('s-sms')">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:42px;height:42px;border-radius:11px;background:${color === 'var(--green)' ? 'var(--grnp)' : color === 'var(--sea)' ? 'var(--seap)' : color === 'var(--amber)' ? 'var(--ampp)' : 'var(--purpp)'};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${icon}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px"><div style="font-size:14px;font-weight:700;color:var(--text)">Safety Management System</div><span style="font-size:9px;font-weight:700;color:white;background:var(--purp);padding:2px 6px;border-radius:4px;letter-spacing:.04em">SMS</span></div>
              <div style="font-size:12px;color:var(--lt);margin-top:2px">${escapeHtml(line)}</div>
            </div>
            <span style="font-size:11px;font-weight:700;color:var(--sea)">${cta}</span>
          </div>
        </div>`;
    }

    const vesselsEl = document.getElementById('home-vessels');
    if (vesselsEl) {
      // Convert the static container — drop card chrome on this one.
      vesselsEl.className = '';
      vesselsEl.style.cssText = 'padding:0 16px;display:flex;flex-direction:column;gap:10px';
      if (s.vessels.length === 0) {
        vesselsEl.innerHTML = `
          <div class="qa-tile" onclick="go('s-onboard')">
            <div class="qa-icon bl">+</div>
            <div style="flex:1"><div class="qa-title">Add a vessel</div><div class="qa-sub">Start tracking compliance for any MCA-coded boat</div></div>
          </div>`;
      } else {
        vesselsEl.innerHTML = s.vessels.map((v) => vesselCoverHtml(v, { compact: true })).join('');
      }
    }
  }

  function vesselCoverHtml(v, opts) {
    opts = opts || {};
    const score = Store.complianceScore(v.id);
    const counts = Store.urgencyCounts(v.id);
    const ready = counts.overdue === 0;
    const total = Store.vesselCerts(v.id).length + Store.vesselEquipment(v.id).length;
    const ringColor = scoreColor(score);
    return `
      <div class="vcover" onclick="setActiveVessel('${v.id}'); go('s-vessel-detail')">
        <div class="vc-pattern"></div>
        <div class="vcover-head">
          <div style="display:flex;align-items:center;gap:14px;min-width:0">
            <div class="vcover-emoji">${v.icon || '⛵'}</div>
            <div style="min-width:0">
              <div class="vcover-name">${escapeHtml(v.name)}</div>
              <div class="vcover-meta">${escapeHtml(v.type || '')}${v.port ? ' · ' + escapeHtml(v.port) : ''}</div>
              <div style="margin-top:4px;display:flex;gap:5px;align-items:center">
                <span class="cat-pill">${escapeHtml(v.category || '')}</span>
                ${v.ssr ? `<span class="cat-pill" style="background:rgba(255,255,255,.04)">SSR ${escapeHtml(v.ssr)}</span>` : ''}
              </div>
            </div>
          </div>
          <div style="position:relative;width:54px;height:54px;flex-shrink:0">
            ${ringSvg(score, ringColor, 54, true)}
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:white;letter-spacing:-.4px">${score}</div>
          </div>
        </div>
        <div class="vcover-body">
          <div class="vcover-stats">
            <div class="vcover-stat ${counts.overdue ? 'rd' : 'ok'}"><div class="num">${counts.overdue}</div><div class="lbl">Overdue</div></div>
            <div class="vcover-stat ${counts.due30 ? 'am' : 'ok'}"><div class="num">${counts.due30}</div><div class="lbl">Due soon</div></div>
            <div class="vcover-stat ok"><div class="num">${counts.valid}</div><div class="lbl">Valid</div></div>
            <div class="vcover-stat bl"><div class="num">${total}</div><div class="lbl">Tracked</div></div>
          </div>
          ${opts.compact ? '' : `
            <div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between">
              ${ready ? '<span class="insp-pill rdy">✓ Inspection-ready</span>' : `<span class="insp-pill notready">⚠ Not ready</span>`}
              <span style="font-size:11px;color:var(--lt)">Tap to open →</span>
            </div>`}
        </div>
      </div>`;
  }

  // ---------- Vessels list ----------

  function renderVesselsList() {
    if (!window.Store) return;
    const screen = document.getElementById('s-vessels');
    if (!screen) return;
    const scroll = screen.querySelector('.scroll');
    if (!scroll) return;

    if (!scroll.dataset.staticHidden) {
      scroll.querySelectorAll(':scope > .card.mx').forEach((n) => { n.style.display = 'none'; });
      scroll.dataset.staticHidden = '1';
    }
    scroll.querySelectorAll('[data-dyn="vessel-card"]').forEach((n) => n.remove());

    const s = Store.snapshot();
    const html = s.vessels.length === 0
      ? `<div class="card mx empty" data-dyn="vessel-card" style="margin-bottom:12px">
           <div class="empty-art">⛵</div>
           <div class="empty-h">No vessels yet</div>
           <div class="empty-sub">Add your first vessel to start tracking compliance.</div>
           <button class="btn btn-sea btn-sm" onclick="go('s-onboard')">+ Add vessel</button>
         </div>`
      : s.vessels.map((v) => `
          <div data-dyn="vessel-card" style="padding:0 16px;margin-bottom:12px">
            ${vesselCoverHtml(v, { compact: false })}
          </div>`).join('');

    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const frag = document.createDocumentFragment();
    while (tmp.firstChild) frag.appendChild(tmp.firstChild);
    scroll.insertBefore(frag, scroll.firstChild);
  }

  // ---------- Tools hub ----------

  function renderTools() {
    const wrap = document.getElementById('tools-scroll');
    if (!wrap) return;
    const me = Store.snapshot().user || {};
    const av = document.getElementById('tools-avatar');
    if (av) av.textContent = me.initials || 'JM';

    const draft = (function () { try { return JSON.parse(localStorage.getItem('codedok-sms-draft-v1') || 'null'); } catch (e) { return null; }})();
    const smsDocs = Store.snapshot().sms_documents || [];
    const smsActive = smsDocs.find((d) => d.status === 'signed') || smsDocs.find((d) => d.status === 'active');
    const smsState = smsActive ? 'active' : draft ? 'draft' : 'empty';
    const smsSub = smsState === 'active' ? `Active · v${smsActive.version}${smsActive.signed_by_user_id ? ' · signed' : ''}`
                 : smsState === 'draft' ? `Draft · last edited ${fmtDate(draft.updated_at)}`
                 : 'Build your MCA-aligned SMS · 11 sections';

    const def = Store.snapshot().deficiencies || [];
    const openDef = def.filter((d) => d.status === 'open').length;
    const critDef = def.filter((d) => d.status === 'open' && d.severity === 'critical').length;

    wrap.innerHTML = `
      <!-- Hero feature: SMS -->
      <div style="padding:14px 16px 6px">
        <div class="hero" style="padding:18px;border-radius:14px;cursor:pointer" onclick="go('s-sms')">
          <div style="position:relative;z-index:1">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div style="font-size:11px;font-weight:700;color:var(--seal);text-transform:uppercase;letter-spacing:.07em">${smsState === 'active' ? 'Live' : smsState === 'draft' ? 'In progress' : 'Featured · £29 to generate'}</div>
              <span style="background:var(--purp);color:white;font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px">SMS</span>
            </div>
            <div style="font-size:18px;font-weight:800;color:white;letter-spacing:-.3px;margin-bottom:4px">Safety Management System</div>
            <div style="font-size:12px;color:rgba(255,255,255,.6);line-height:1.5;margin-bottom:12px">${escapeHtml(smsSub)}</div>
            <button class="btn btn-sea btn-sm" style="height:34px;font-size:12px;padding:0 14px">${smsState === 'active' ? 'Open SMS →' : smsState === 'draft' ? 'Resume building →' : 'Start building →'}</button>
          </div>
        </div>
      </div>

      <div class="h-section">Compliance tools</div>
      <div style="padding:0 16px;display:flex;flex-direction:column;gap:8px">
        <div class="qa-tile" onclick="go('s-calendar')">
          <div class="qa-icon bl">📆</div>
          <div style="flex:1"><div class="qa-title">Compliance calendar</div><div class="qa-sub">Every deadline by month</div></div>
          <span class="chev">›</span>
        </div>
        <div class="qa-tile" onclick="go('s-gap')">
          <div class="qa-icon pu">🤖</div>
          <div style="flex:1"><div class="qa-title">AI gap analysis</div><div class="qa-sub">Check vessel against full MCA Code</div></div>
          <span class="chev">›</span>
        </div>
        <div class="qa-tile" onclick="go('s-deficiencies')">
          <div class="qa-icon ${openDef ? 'rd' : 'ok'}">⚠️</div>
          <div style="flex:1"><div class="qa-title">Deficiency log</div><div class="qa-sub">${openDef} open${critDef ? ' · ' + critDef + ' critical' : ''}</div></div>
          <span class="chev">›</span>
        </div>
        <div class="qa-tile" onclick="go('s-jur-dash')">
          <div class="qa-icon bl">🌍</div>
          <div style="flex:1"><div class="qa-title">Legal readiness</div><div class="qa-sub">UK &amp; Ireland jurisdiction status</div></div>
          <span class="chev">›</span>
        </div>
      </div>

      <div class="h-section">Surveys &amp; export</div>
      <div style="padding:0 16px;display:flex;flex-direction:column;gap:8px">
        <div class="qa-tile" onclick="go('s-surveys')">
          <div class="qa-icon bl">🔍</div>
          <div style="flex:1"><div class="qa-title">Surveys</div><div class="qa-sub">Book, history, upcoming</div></div>
          <span class="chev">›</span>
        </div>
        <div class="qa-tile" onclick="exportFleetInspectionPack()">
          <div class="qa-icon ok">📄</div>
          <div style="flex:1"><div class="qa-title">Inspection pack PDF</div><div class="qa-sub">One-tap, surveyor-ready</div></div>
          <span class="chev">›</span>
        </div>
        <div class="qa-tile" onclick="go('s-export-pack')">
          <div class="qa-icon bl">📦</div>
          <div style="flex:1"><div class="qa-title">Export packs</div><div class="qa-sub">UK, Ireland, or combined</div></div>
          <span class="chev">›</span>
        </div>
      </div>

      <div class="h-section">Team &amp; sharing</div>
      <div style="padding:0 16px;display:flex;flex-direction:column;gap:8px">
        <div class="qa-tile" onclick="go('s-crew')">
          <div class="qa-icon pu">👥</div>
          <div style="flex:1"><div class="qa-title">Manage crew</div><div class="qa-sub">All crew across vessels</div></div>
          <span class="chev">›</span>
        </div>
        <div class="qa-tile" onclick="go('s-handoff')">
          <div class="qa-icon bl">🔗</div>
          <div style="flex:1"><div class="qa-title">Skipper hand-off QR</div><div class="qa-sub">Time-limited read-only access</div></div>
          <span class="chev">›</span>
        </div>
      </div>

      <div class="spacer"></div>`;
  }

  // ---------- Records hub (s-certs) ----------

  function crewCertHtml(cc, person) {
    const days = Store.daysUntil(cc.expires_at);
    const stripe = cc.expires_at == null ? 'bl' : statusForDays(days);
    const cb = days === Infinity
      ? '<span class="cb ok"><span class="cb-num">∞</span><span class="cb-lbl">No exp</span></span>'
      : days < 0
        ? `<span class="cb rd"><span class="cb-num">${Math.abs(days)}</span><span class="cb-lbl">days late</span></span>`
        : `<span class="cb ${days <= 30 ? 'rd' : days <= 60 ? 'am' : 'ok'}"><span class="cb-num">${days}</span><span class="cb-lbl">days left</span></span>`;
    const subParts = [];
    if (person) subParts.push(escapeHtml(person.role) + ' · ' + escapeHtml(person.name));
    if (cc.issuer) subParts.push(escapeHtml(cc.issuer));
    if (cc.expires_at) subParts.push('Expires ' + fmtDate(cc.expires_at));
    return `
      <div class="ticket" onclick="go('s-crew')">
        <div class="ticket-stripe ${stripe}"></div>
        <div class="ticket-body">
          <div class="ticket-ic">🎓</div>
          <div class="ticket-text">
            <div class="ticket-name">${escapeHtml(cc.name)}</div>
            <div class="ticket-sub">${subParts.join(' · ')}</div>
          </div>
          <div class="ticket-end">${cb}</div>
        </div>
      </div>`;
  }

  function recordsTabBody(tabId) {
    const s = Store.snapshot();
    const allCerts = s.certs.slice();
    const allEquipment = s.equipment.slice();
    const allCrewCerts = s.crewCerts.slice();
    const personById = (id) => s.crew.find((p) => p.id === id);

    function emptyState(art, h, sub) {
      return `<div class="empty"><div class="empty-art">${art}</div><div class="empty-h">${h}</div><div class="empty-sub">${sub}</div></div>`;
    }

    if (tabId === 'cr-urgent') {
      const overdueCerts = allCerts.filter((c) => Store.daysUntil(c.expires_at) < 0).sort((a, b) => Store.daysUntil(a.expires_at) - Store.daysUntil(b.expires_at));
      const overdueEquip = allEquipment.filter((e) => e.next_service_at && Store.daysUntil(e.next_service_at) < 0).sort((a, b) => Store.daysUntil(a.next_service_at) - Store.daysUntil(b.next_service_at));
      const due30Certs = allCerts.filter((c) => { const d = Store.daysUntil(c.expires_at); return d >= 0 && d <= 30; }).sort((a, b) => Store.daysUntil(a.expires_at) - Store.daysUntil(b.expires_at));
      const due30Equip = allEquipment.filter((e) => { const d = Store.daysUntil(e.next_service_at); return d >= 0 && d <= 30; }).sort((a, b) => Store.daysUntil(a.next_service_at) - Store.daysUntil(b.next_service_at));
      const due30Crew = allCrewCerts.filter((cc) => { const d = Store.daysUntil(cc.expires_at); return d >= 0 && d <= 30; });
      const overdueCount = overdueCerts.length + overdueEquip.length;
      const due30Count = due30Certs.length + due30Equip.length + due30Crew.length;

      let html = '';
      if (overdueCount === 0 && due30Count === 0) {
        html += emptyState('✅', 'All caught up', 'No overdue or imminent expiries across the fleet.');
      }
      if (overdueCount > 0) {
        html += `<div class="h-section" style="color:var(--red)">🚨 Overdue · ${overdueCount}</div>`;
        html += `<div style="padding:0 16px">`;
        overdueCerts.forEach((c) => { html += ticketHtml(c, 'cert'); });
        overdueEquip.forEach((e) => { html += ticketHtml(e, 'equipment'); });
        html += `</div>`;
      }
      if (due30Count > 0) {
        html += `<div class="h-section" style="color:var(--amber)">⏰ Due within 30 days · ${due30Count}</div>`;
        html += `<div style="padding:0 16px">`;
        due30Certs.forEach((c) => { html += ticketHtml(c, 'cert'); });
        due30Equip.forEach((e) => { html += ticketHtml(e, 'equipment'); });
        due30Crew.forEach((cc) => { html += crewCertHtml(cc, personById(cc.person_id)); });
        html += `</div>`;
      }
      html += `<div style="padding:14px 16px"><button class="btn btn-sea btn-full" onclick="exportFleetInspectionPack()">📄 Export inspection pack</button></div>`;
      html += '<div class="spacer"></div>';
      return html;
    }

    if (tabId === 'cr-vessel') {
      const list = allCerts.filter((c) => c.category === 'vessel').sort((a, b) => Store.daysUntil(a.expires_at) - Store.daysUntil(b.expires_at));
      let html = '<div style="padding:14px 16px 4px">';
      if (list.length === 0) html += emptyState('📋', 'No vessel certificates yet', 'Scan your Coding cert, radio licence, stability book or any vessel-level document.');
      else list.forEach((c) => { html += ticketHtml(c, 'cert'); });
      html += `<div style="padding:6px 0 14px"><button class="btn btn-sea btn-full" onclick="go('s-scan')">📷 Scan certificate</button></div></div><div class="spacer"></div>`;
      return html;
    }

    if (tabId === 'cr-equipment') {
      const list = allEquipment.slice().sort((a, b) => Store.daysUntil(a.next_service_at) - Store.daysUntil(b.next_service_at));
      let html = '<div style="padding:14px 16px 4px">';
      if (list.length === 0) html += emptyState('🦺', 'No equipment logged', 'Add liferaft, lifejackets, EPIRB, fire extinguishers and other safety gear with their service dates.');
      else list.forEach((e) => { html += ticketHtml(e, 'equipment'); });
      html += '</div><div class="spacer"></div>';
      return html;
    }

    if (tabId === 'cr-crew') {
      let html = '<div style="padding:14px 16px 4px">';
      if (allCrewCerts.length === 0) {
        html += emptyState('🎓', 'No crew certs yet', 'Add crew members and their qualifications from the Crew tab.');
      } else {
        const ordered = allCrewCerts.slice().sort((a, b) => Store.daysUntil(a.expires_at) - Store.daysUntil(b.expires_at));
        ordered.forEach((cc) => { html += crewCertHtml(cc, personById(cc.person_id)); });
      }
      html += `<div style="padding:6px 0 14px"><button class="btn btn-sea btn-full" onclick="go('s-crew')">Manage crew →</button></div></div><div class="spacer"></div>`;
      return html;
    }

    if (tabId === 'cr-insurance') {
      const list = allCerts.filter((c) => c.category === 'insurance').sort((a, b) => Store.daysUntil(a.expires_at) - Store.daysUntil(b.expires_at));
      let html = '<div style="padding:14px 16px 4px">';
      if (list.length === 0) html += emptyState('🛡️', 'No insurance docs', 'Scan your PLI, P&I or hull insurance certificate so renewals never lapse.');
      else list.forEach((c) => { html += ticketHtml(c, 'cert'); });
      html += '</div><div class="spacer"></div>';
      return html;
    }
    return '';
  }

  function renderRecords() {
    if (!window.Store) return;
    const screen = document.getElementById('s-certs');
    if (!screen) return;
    ['cr-urgent', 'cr-vessel', 'cr-equipment', 'cr-crew', 'cr-insurance'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = recordsTabBody(id);
    });
    // Update the Urgent tab counter.
    const s = Store.snapshot();
    const overdueCnt = s.certs.filter((c) => Store.daysUntil(c.expires_at) < 0).length
      + s.equipment.filter((e) => e.next_service_at && Store.daysUntil(e.next_service_at) < 0).length;
    const due30Cnt = s.certs.filter((c) => { const d = Store.daysUntil(c.expires_at); return d >= 0 && d <= 30; }).length
      + s.equipment.filter((e) => { const d = Store.daysUntil(e.next_service_at); return d >= 0 && d <= 30; }).length
      + s.crewCerts.filter((cc) => { const d = Store.daysUntil(cc.expires_at); return d >= 0 && d <= 30; }).length;
    const totalUrgent = overdueCnt + due30Cnt;
    const urgentTab = screen.querySelector('.tab.on') ? screen.querySelector('.tabbar .tab') : null;
    const tabs = screen.querySelectorAll('.tabbar .tab');
    if (tabs[0]) tabs[0].textContent = `Urgent (${totalUrgent})`;
  }

  // ---------- Vessel detail ----------

  function renderVesselDetail() {
    if (!window.Store) return;
    const v = Store.getVessel(activeVesselId) || Store.snapshot().vessels[0];
    if (!v) return;
    activeVesselId = v.id;

    // Hero header
    const screen = document.getElementById('s-vessel-detail');
    if (!screen) return;
    const header = screen.querySelector('div[style*="background:var(--ink)"]');
    if (header) {
      const ready = Store.isInspectionReady(v.id);
      const score = Store.complianceScore(v.id);
      const badgeHtml = ready
        ? '<span class="insp-pill rdy">✓ Inspection-ready</span>'
        : '<span class="insp-pill notready pulse-rd">⚠ Not ready</span>';
      header.style.cssText = '';
      header.classList.add('hero');
      header.style.borderRadius = '0';
      header.style.padding = '12px 18px 18px';
      header.innerHTML = `
        <button class="back" onclick="go('s-vessels')" style="color:rgba(255,255,255,.6);margin-bottom:8px">‹ Vessels</button>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;position:relative;z-index:1">
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
              <div class="vcover-emoji" style="width:42px;height:42px;font-size:20px">${v.icon || '⛵'}</div>
              <div style="min-width:0">
                <div class="h-display" style="font-size:24px">${escapeHtml(v.name)}</div>
                <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:2px">${escapeHtml(v.type || '')}${v.port ? ' · ' + escapeHtml(v.port) : ''}</div>
              </div>
            </div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">
              <span class="cat-pill">${escapeHtml(v.category || '')}</span>
              ${v.ssr ? `<span class="cat-pill" style="background:rgba(255,255,255,.04)">SSR ${escapeHtml(v.ssr)}</span>` : ''}
              ${v.length ? `<span class="cat-pill" style="background:rgba(255,255,255,.04)">${escapeHtml(v.length)}m</span>` : ''}
              ${v.certifier ? `<span class="cat-pill" style="background:rgba(255,255,255,.04)">${escapeHtml(v.certifier)}</span>` : ''}
              <span class="cat-pill" style="background:rgba(255,255,255,.04)">${v.persons || '—'} pax</span>
            </div>
            <div style="margin-top:10px">${badgeHtml}</div>
          </div>
          <div style="position:relative;width:64px;height:64px;flex-shrink:0">
            ${ringSvg(score, scoreColor(score), 64, true)}
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
              <div style="font-size:16px;font-weight:800;color:white;letter-spacing:-.4px;line-height:1">${score}<span style="font-size:9px;font-weight:600;color:rgba(255,255,255,.6)">%</span></div>
              <div style="font-size:8px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.07em;margin-top:2px">SCORE</div>
            </div>
          </div>
        </div>`;
    }

    // Compliance breakdown card on overview tab
    const sgrid = document.querySelector('#vd-overview .sgrid');
    if (sgrid) {
      const certs = Store.vesselCerts(v.id);
      const equipment = Store.vesselEquipment(v.id);
      const crew = Store.vesselCrew(v.id);
      const certCounts = countByDays(certs.map((c) => Store.daysUntil(c.expires_at)));
      const equipCounts = countByDays(equipment.map((e) => Store.daysUntil(e.next_service_at)));
      const allCrewCerts = [];
      crew.forEach((p) => {
        const ccs = Store.snapshot().crewCerts.filter((cc) => cc.person_id === p.id);
        ccs.forEach((cc) => allCrewCerts.push(Store.daysUntil(cc.expires_at)));
      });
      const crewCounts = countByDays(allCrewCerts);
      const insurance = certs.filter((c) => c.category === 'insurance');
      const insOk = insurance.every((c) => Store.daysUntil(c.expires_at) >= 0);

      sgrid.innerHTML = `
        <div class="scard"><div class="scard-lbl">Vessel certs</div><div class="scard-val ${certCounts.overdue ? 'rd' : (certCounts.due30 ? 'am' : 'ok')}">${certCounts.valid + certCounts.due30 + certCounts.due60}/${certs.length}</div><div class="scard-sub">${certCounts.overdue} overdue</div></div>
        <div class="scard"><div class="scard-lbl">Equipment</div><div class="scard-val ${equipCounts.overdue ? 'rd' : (equipCounts.due30 ? 'am' : 'ok')}">${equipCounts.valid + equipCounts.due30 + equipCounts.due60}/${equipment.length}</div><div class="scard-sub">${equipCounts.overdue} ${equipCounts.overdue === 1 ? 'issue' : 'issues'}</div></div>
        <div class="scard"><div class="scard-lbl">Crew certs</div><div class="scard-val ${crewCounts.overdue ? 'rd' : (crewCounts.due30 ? 'am' : 'ok')}">${crewCounts.valid + crewCounts.due30 + crewCounts.due60}/${allCrewCerts.length}</div><div class="scard-sub">${crewCounts.due30 ? crewCounts.due30 + ' due soon' : 'All current'}</div></div>
        <div class="scard"><div class="scard-lbl">Insurance</div><div class="scard-val ${insOk ? 'ok' : 'rd'}">${insOk ? '✓' : '✗'}</div><div class="scard-sub">${insurance.length ? 'Valid policy' : 'Missing'}</div></div>`;
    }

    // Replace certs tab body with live data
    const certsTab = document.getElementById('vd-certs');
    if (certsTab) {
      const certs = Store.vesselCerts(v.id).slice().sort((a, b) => Store.daysUntil(a.expires_at) - Store.daysUntil(b.expires_at));
      certsTab.innerHTML = `
        <div style="padding:14px 16px 4px">
          ${certs.length === 0 ? `
            <div class="empty">
              <div class="empty-art">📋</div>
              <div class="empty-h">No certificates yet</div>
              <div class="empty-sub">Scan a cert with your camera and CodedOK reads the expiry, issuer and number for you.</div>
              <button class="btn btn-sea btn-sm" onclick="go('s-scan')">📷 Scan certificate</button>
            </div>` : certs.map((c) => ticketHtml(c, 'cert')).join('')}
        </div>
        ${certs.length > 0 ? `<div style="padding:6px 16px 14px"><button class="btn btn-sea btn-full" onclick="go('s-scan')">📷 Scan new certificate</button></div>` : ''}
        <div class="spacer"></div>`;
    }

    // Equipment tab — live render
    const equipTab = document.getElementById('vd-equipment-body');
    if (equipTab) {
      equipTab.innerHTML = renderVesselEquipmentList(v.id);
    }

    // Crew tab — live render
    const crewTab = document.getElementById('vd-crew-body');
    if (crewTab) {
      crewTab.innerHTML = renderVesselCrewTab(v.id);
    }
  }

  // Cert/equipment as a ticket-style row.
  function ticketHtml(item, kind) {
    const expIso = kind === 'cert' ? item.expires_at : item.next_service_at;
    const days = Store.daysUntil(expIso);
    const stripe = expIso == null ? 'bl' : statusForDays(days);
    const cb = days === Infinity
      ? '<span class="cb ok"><span class="cb-num">∞</span><span class="cb-lbl">No exp</span></span>'
      : days < 0
        ? `<span class="cb rd"><span class="cb-num">${Math.abs(days)}</span><span class="cb-lbl">days late</span></span>`
        : days <= 60
          ? `<span class="cb ${days <= 30 ? 'rd' : 'am'}"><span class="cb-num">${days}</span><span class="cb-lbl">days left</span></span>`
          : `<span class="cb ok"><span class="cb-num">✓</span><span class="cb-lbl">Valid</span></span>`;

    const subParts = [];
    if (kind === 'cert') {
      if (item.issuer) subParts.push(escapeHtml(item.issuer));
      if (item.number) subParts.push(escapeHtml(item.number));
      if (expIso) subParts.push('Expires ' + fmtDate(expIso));
    } else {
      if (item.qty > 1) subParts.push('×' + item.qty);
      if (item.make || item.model) subParts.push(escapeHtml(`${item.make || ''} ${item.model || ''}`.trim()));
      if (expIso) subParts.push('Service ' + fmtDate(expIso));
    }
    const hasFile = !!(item.file && item.file.data_url);
    const clip = hasFile ? '<span title="File attached" style="font-size:11px;color:var(--sea);margin-left:4px">📎</span>' : '';
    const issuedBy = (kind === 'cert' && item.issued_by_user_id) ? (() => {
      const u = (Store.snapshot().users || []).find((x) => x.id === item.issued_by_user_id);
      const co = u && u.surveyor && u.surveyor.company ? u.surveyor.company : (u && u.name);
      return co ? `<span title="Issued by surveyor" style="font-size:9px;font-weight:700;color:white;background:var(--mm-blue);padding:2px 6px;border-radius:4px;margin-left:6px;letter-spacing:.04em">✓ ${escapeHtml(co)}</span>` : '';
    })() : '';
    const clickAttr = kind === 'equipment'
      ? `onclick="setActiveEquipment('${item.id}'); go('s-equipment-detail')"`
      : `onclick="openCertSheet('${item.id}')"`;
    return `
      <div class="ticket" ${clickAttr}>
        <div class="ticket-stripe ${stripe}"></div>
        <div class="ticket-body">
          <div class="ticket-ic">${item.icon || (kind === 'cert' ? '📋' : '🔧')}</div>
          <div class="ticket-text">
            <div class="ticket-name">${escapeHtml(item.name)}${clip}${issuedBy}</div>
            <div class="ticket-sub">${subParts.join(' · ')}</div>
          </div>
          <div class="ticket-end">${cb}</div>
        </div>
      </div>`;
  }

  function renderVesselCrewTab(vesselId) {
    const assigned = Store.vesselCrew(vesselId);
    const all = Store.snapshot().crew;
    const unassigned = all.filter((p) => !(p.vessel_ids || []).includes(vesselId));
    const v = Store.getVessel(vesselId);
    const codes = window.Codes;
    const reqs = codes ? codes.requiredCrewQuals(v.category) : [];

    let html = '<div style="padding:14px 16px 4px">';

    if (assigned.length === 0) {
      html += `
        <div class="empty">
          <div class="empty-art">👥</div>
          <div class="empty-h">No crew assigned to ${escapeHtml(v.name)}</div>
          <div class="empty-sub">Crew can be assigned to multiple vessels. Pick from your team or add someone new.</div>
        </div>`;
    } else {
      html += `<div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Crew on this vessel (${assigned.length})</div>`;
      assigned.forEach((p) => {
        const certs = Store.snapshot().crewCerts.filter((cc) => cc.person_id === p.id);
        const otherVessels = (p.vessel_ids || []).filter((id) => id !== vesselId).map((id) => Store.getVessel(id)).filter(Boolean);
        html += `
          <div class="crewc">
            <div class="crewc-head">
              <div class="crewc-av" style="background:var(--${p.avatar_color || 'sea'})">${escapeHtml(p.initials)}</div>
              <div style="flex:1;min-width:0">
                <div class="crewc-name">${escapeHtml(p.name)}</div>
                <div class="crewc-role">${escapeHtml(p.role)}${otherVessels.length ? ' · also on ' + otherVessels.map((vv) => escapeHtml(vv.name)).join(', ') : ''}</div>
              </div>
              <button class="btn btn-xs btn-out" onclick="event.stopPropagation();unassignCrew('${p.id}','${vesselId}')">Remove</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px">
              ${certs.map((cc) => {
                const days = Store.daysUntil(cc.expires_at);
                const cls = days === Infinity ? 'chip-ok' : days < 0 ? 'chip-rd' : days <= 30 ? 'chip-am' : 'chip-ok';
                const label = days === Infinity ? 'Valid' : days < 0 ? 'Expired' : days <= 30 ? days + 'd' : 'Valid';
                return `<div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:13px;color:var(--mid)">${escapeHtml(cc.name)}</span><span class="chip ${cls}">${label}</span></div>`;
              }).join('') || '<div style="font-size:12px;color:var(--lt)">No certificates on file</div>'}
            </div>
          </div>`;
      });
    }

    if (unassigned.length > 0) {
      html += `<div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin:18px 0 8px">Add from your team</div>`;
      html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">`;
      unassigned.forEach((p) => {
        html += `<span class="vchip add" onclick="assignCrew('${p.id}','${vesselId}')">+ ${escapeHtml(p.name)}</span>`;
      });
      html += `</div>`;
    }

    if (reqs.length > 0) {
      html += `<div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin:14px 0 8px">Required for ${escapeHtml(v.category)}</div>`;
      html += '<div class="card">';
      reqs.forEach((r) => {
        html += `
          <div class="row">
            <div class="row-ic bl">${r.role === 'Skipper' ? '🧑‍✈️' : '👥'}</div>
            <div class="row-body">
              <div class="row-name">${escapeHtml(r.cert)}</div>
              <div class="row-sub">${escapeHtml(r.role)} · ${r.mandatory ? 'Mandatory' : 'Recommended'}</div>
            </div>
          </div>`;
      });
      html += '</div>';
    }

    html += `
      <div style="padding:14px 0 0">
        <button class="btn btn-sea btn-full" onclick="addCrewMember()">+ Add new crew member</button>
      </div>
      <div class="spacer"></div></div>`;
    return html;
  }

  function assignCrew(crewId, vesselId) {
    Store.assignCrewToVessel(crewId, vesselId);
    renderVesselDetail();
  }
  window.assignCrew = assignCrew;

  function unassignCrew(crewId, vesselId) {
    Store.removeCrewFromVessel(crewId, vesselId);
    renderVesselDetail();
  }
  window.unassignCrew = unassignCrew;

  function addCrewMember() {
    const name = prompt('Crew member name:');
    if (!name) return;
    const role = prompt('Role (e.g. Skipper, Deck crew, Mate):', 'Deck crew') || 'Crew';
    const colors = ['sea', 'purp', 'amber', 'green'];
    const c = Store.addCrew({ name, role, vessel_ids: [activeVesselId], avatar_color: colors[Math.floor(Math.random() * colors.length)] });
    renderVesselDetail();
    return c;
  }
  window.addCrewMember = addCrewMember;

  function countByDays(arr) {
    const out = { overdue: 0, due30: 0, due60: 0, valid: 0 };
    arr.forEach((d) => {
      if (d === Infinity) { out.valid++; return; }
      if (d < 0) out.overdue++;
      else if (d <= 30) out.due30++;
      else if (d <= 60) out.due60++;
      else out.valid++;
    });
    return out;
  }

  function certRowHtml(c) {
    const days = Store.daysUntil(c.expires_at);
    const status = statusForDays(days);
    const sub = c.expires_at ? `${fmtDate(c.expires_at)} · ${daysFmt(days)}` : 'No expiry';
    return `
      <div class="row">
        <div class="row-ic ${status}">${c.icon || '📋'}</div>
        <div class="row-body">
          <div class="row-name">${escapeHtml(c.name)}</div>
          <div class="row-sub">${escapeHtml(sub)}</div>
        </div>
        ${chipForDays(days)}
        <span class="chev">›</span>
      </div>`;
  }

  function renderVesselEquipmentList(vesselId) {
    const equipment = Store.vesselEquipment(vesselId).slice().sort((a, b) => Store.daysUntil(a.next_service_at) - Store.daysUntil(b.next_service_at));
    const codes = window.Codes;
    const v = Store.getVessel(vesselId);
    const required = codes ? codes.requiredEquipment(v.category, v) : [];
    const heldKinds = new Set(equipment.map((e) => e.kind));
    const missing = required.filter((r) => r.mandatory && !heldKinds.has(r.kind));

    let html = '<div style="padding:14px 16px 4px">';

    if (missing.length > 0) {
      html += `
        <div style="background:linear-gradient(135deg,rgba(220,38,38,.08) 0%,rgba(220,38,38,.02) 100%);border:1px solid rgba(220,38,38,.18);border-radius:14px;padding:14px 16px;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <span style="font-size:18px">⚠️</span>
            <div style="font-size:13px;font-weight:700;color:var(--red)">Missing required equipment for ${escapeHtml(v.category)}</div>
          </div>
          <div style="font-size:11px;color:var(--mid);line-height:1.7">${missing.map((m) => '• ' + escapeHtml(m.name)).join('<br>')}</div>
        </div>`;
    }

    if (equipment.length === 0) {
      html += `
        <div class="empty">
          <div class="empty-art">🦺</div>
          <div class="empty-h">No equipment logged</div>
          <div class="empty-sub">Add equipment to track service intervals and surface what's missing for your category.</div>
          <button class="btn btn-sea btn-sm" onclick="go('s-equipment-add')">+ Add equipment</button>
        </div>`;
    } else {
      equipment.forEach((e) => { html += ticketHtml(e, 'equipment'); });
      html += `
        <div style="padding:6px 0 14px">
          <button class="btn btn-sea btn-full" onclick="go('s-equipment-add')">+ Add equipment</button>
        </div>`;
    }
    html += '<div class="spacer"></div></div>';
    return html;
  }

  // ---------- Equipment list (full screen) ----------

  function renderEquipmentList() {
    if (!window.Store) return;
    const v = Store.getVessel(activeVesselId);
    const wrap = document.getElementById('eq-list-scroll');
    if (!wrap) return;
    if (!v) {
      wrap.innerHTML = `<div style="padding:24px;text-align:center;color:var(--lt);font-size:13px">Pick a vessel from the Vessels list first.</div>`;
      return;
    }
    wrap.innerHTML = `
      <div style="padding:14px 16px 4px">
        <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em">${escapeHtml(v.name)}</div>
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-top:2px">Equipment register</div>
      </div>
      ${renderVesselEquipmentList(v.id)}`;
  }

  // ---------- Equipment detail ----------

  window.setActiveEquipment = function (id) { activeEquipmentId = id; };

  function renderEquipmentDetail() {
    const wrap = document.getElementById('eq-detail-scroll');
    if (!wrap) return;
    const e = Store.snapshot().equipment.find((x) => x.id === activeEquipmentId);
    if (!e) {
      wrap.innerHTML = `<div style="padding:24px;text-align:center;color:var(--lt)">Equipment not found</div>`;
      return;
    }
    const v = Store.getVessel(e.vessel_id);
    const days = Store.daysUntil(e.next_service_at);
    const status = e.next_service_at ? statusForDays(days) : 'ok';

    wrap.innerHTML = `
      <div style="background:var(--ink);padding:16px 20px 18px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
          <div style="width:50px;height:50px;background:rgba(255,255,255,.08);border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:24px">${e.icon || '🔧'}</div>
          <div>
            <div style="font-size:18px;font-weight:700;color:white">${escapeHtml(e.name)}</div>
            <div style="font-size:12px;color:rgba(255,255,255,.5)">${escapeHtml(v ? v.name : '')} · ${e.qty > 1 ? '×' + e.qty + ' · ' : ''}${escapeHtml(e.make || '')} ${escapeHtml(e.model || '')}</div>
          </div>
        </div>
        ${e.next_service_at ? `
          <div style="background:rgba(255,255,255,.06);border-radius:10px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:11px;color:rgba(255,255,255,.4);font-weight:600;text-transform:uppercase;letter-spacing:.07em">Next service</div>
              <div style="font-size:14px;font-weight:600;color:white">${fmtDate(e.next_service_at)}</div>
            </div>
            <span class="chip ${status==='rd'?'chip-rd':status==='am'?'chip-am':'chip-ok'}">${daysFmt(days)}</span>
          </div>` : ''}
      </div>

      <div class="slbl">Details</div>
      <div class="card mx">
        <div class="row"><div class="row-body"><div class="row-name">Make</div><div class="row-sub">${escapeHtml(e.make || '—')}</div></div></div>
        <div class="row"><div class="row-body"><div class="row-name">Model</div><div class="row-sub">${escapeHtml(e.model || '—')}</div></div></div>
        <div class="row"><div class="row-body"><div class="row-name">Serial</div><div class="row-sub">${escapeHtml(e.serial || '—')}</div></div></div>
        <div class="row"><div class="row-body"><div class="row-name">Quantity</div><div class="row-sub">×${e.qty || 1}</div></div></div>
        <div class="row"><div class="row-body"><div class="row-name">Installed</div><div class="row-sub">${fmtDate(e.installed_at)}</div></div></div>
        <div class="row"><div class="row-body"><div class="row-name">Last serviced</div><div class="row-sub">${fmtDate(e.last_service_at)}</div></div></div>
        ${e.notes ? `<div class="row"><div class="row-body"><div class="row-name">Notes</div><div class="row-sub">${escapeHtml(e.notes)}</div></div></div>` : ''}
      </div>

      <div class="slbl">Service certificate</div>
      <div style="padding:0 16px">
        ${e.file ? `
          <div class="qa-tile" style="cursor:pointer" onclick="viewAttachment('${e.file.data_url}','${escapeHtml(e.file.name).replace(/'/g, '&#39;')}')">
            <div class="qa-icon bl">📎</div>
            <div style="flex:1;min-width:0">
              <div class="qa-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(e.file.name)}</div>
              <div class="qa-sub">${escapeHtml(e.file.type || '')} · ${fmtBytes(e.file.size)} · added ${fmtDate(e.file.added_at)}</div>
            </div>
            <span class="chev">›</span>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-sm btn-out" style="flex:1" onclick="attachToExistingEquipment('${e.id}')">↻ Replace</button>
            <button class="btn btn-sm btn-out" style="flex:1;color:var(--red);border-color:rgba(220,38,38,.3)" onclick="removeEquipmentFile('${e.id}')">✕ Remove</button>
          </div>` : `
          <button class="btn btn-out btn-full" onclick="attachToExistingEquipment('${e.id}')">📎 Attach service certificate / photo</button>`}
      </div>

      <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-sea btn-full" onclick="markEquipmentServiced('${e.id}')">✓ Mark serviced today</button>
      </div>
      <div class="spacer"></div>`;
  }

  function removeEquipmentFile(equipmentId) {
    if (!confirm('Remove the attached file? The equipment record stays.')) return;
    Store.detachFileFromEquipment(equipmentId);
    renderEquipmentDetail();
  }
  window.removeEquipmentFile = removeEquipmentFile;

  function markEquipmentServiced(equipmentId) {
    const e = Store.snapshot().equipment.find((x) => x.id === equipmentId);
    if (!e) return;
    // Default next-service at +12 months unless equipment kind suggests otherwise.
    const next = new Date(); next.setHours(0,0,0,0); next.setMonth(next.getMonth() + 12);
    Store.recordEquipmentService(equipmentId, { serviced_at: new Date().toISOString().slice(0,10), next_service_at: next.toISOString().slice(0,10) });
    renderEquipmentDetail();
  }
  window.markEquipmentServiced = markEquipmentServiced;

  // ---------- Scan confirm (dynamic, real file) ----------

  function renderScanConfirm() {
    const wrap = document.getElementById('scan-confirm-scroll');
    if (!wrap) return;
    if (!pendingScan || !pendingScan.file) {
      wrap.innerHTML = `
        <div class="empty">
          <div class="empty-art">📷</div>
          <div class="empty-h">No file selected</div>
          <div class="empty-sub">Pick a photo or PDF from the previous screen.</div>
          <button class="btn btn-sea btn-sm" onclick="go('s-scan')">‹ Back to scan</button>
        </div>`;
      return;
    }
    const f = pendingScan.file;
    const v = Store.getVessel(activeVesselId) || Store.snapshot().vessels[0];
    const isImage = f.type && f.type.startsWith('image/');
    const isPdf = f.type === 'application/pdf';
    const today = new Date().toISOString().slice(0, 10);

    // Best-guess defaults from filename.
    const guessFromName = (f.name || '').toLowerCase();
    let defaultName = 'Certificate';
    let defaultIcon = '📋';
    let defaultKind = 'other';
    let defaultCategory = pendingScan.categoryHint || 'vessel';
    if (/(coding|ydsa)/.test(guessFromName))            { defaultName = 'MCA Coding Certificate';    defaultKind = 'coding';    defaultCategory = 'vessel'; }
    else if (/(insurance|pli|p&i|hull)/.test(guessFromName)) { defaultName = 'Public Liability Insurance'; defaultKind = 'pli';      defaultCategory = 'insurance'; defaultIcon = '🛡️'; }
    else if (/(life.?raft)/.test(guessFromName))        { defaultName = 'Life raft service';          defaultKind = 'liferaft';   defaultCategory = 'equipment'; defaultIcon = '🛟'; }
    else if (/(flare|pyro|solas)/.test(guessFromName))  { defaultName = 'SOLAS A pyrotechnics';       defaultKind = 'pyrotechnics';defaultCategory = 'equipment'; defaultIcon = '🧨'; }
    else if (/(fire)/.test(guessFromName))              { defaultName = 'Fire extinguisher service'; defaultKind = 'fire_ext';   defaultCategory = 'equipment'; defaultIcon = '🧯'; }
    else if (/(life.?jacket)/.test(guessFromName))      { defaultName = 'Lifejackets';                defaultKind = 'lifejacket'; defaultCategory = 'equipment'; defaultIcon = '🦺'; }
    else if (/(vhf|radio)/.test(guessFromName))         { defaultName = 'Ship Radio Licence (VHF)';  defaultKind = 'radio';      defaultCategory = 'vessel';   defaultIcon = '📡'; }
    else if (/(stab)/.test(guessFromName))              { defaultName = 'Stability information book';defaultKind = 'stability';  defaultCategory = 'vessel'; }
    else if (/(eng1|medical|ml5)/.test(guessFromName))  { defaultName = 'ENG1 Medical';               defaultKind = 'medical';    defaultCategory = 'crew';     defaultIcon = '🏥'; }
    else if (/(skipper|yachtmaster|day.?skipper)/.test(guessFromName)) { defaultName = 'RYA Day Skipper'; defaultKind = 'skipper'; defaultCategory = 'crew'; defaultIcon = '🎓'; }

    wrap.innerHTML = `
      <!-- File preview -->
      <div style="padding:14px 16px 0">
        <div style="background:var(--slate);border-radius:14px;padding:14px;display:flex;gap:12px;align-items:center">
          <div style="width:56px;height:56px;border-radius:11px;background:var(--card);border:1px solid var(--bdr);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
            ${isImage ? `<img src="${f.data_url}" style="width:100%;height:100%;object-fit:cover" alt="">` : `<span style="font-size:24px">${isPdf ? '📄' : '📎'}</span>`}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(f.name)}</div>
            <div style="font-size:11px;color:var(--lt);margin-top:2px">${escapeHtml(f.type || 'unknown')} · ${fmtBytes(f.size)}</div>
          </div>
          <button class="btn btn-xs btn-out" onclick="viewAttachment('${f.data_url}','${escapeHtml(f.name).replace(/'/g, '&#39;')}')">View</button>
        </div>
        <div style="background:var(--grnp);border:1px solid rgba(22,163,74,.2);border-radius:10px;padding:10px 12px;display:flex;gap:8px;align-items:center;margin-top:10px">
          <span style="font-size:14px">📎</span>
          <div style="font-size:11px;color:var(--mid);line-height:1.5">File attached. We've taken a guess at the details from the filename — review and correct anything wrong.</div>
        </div>
      </div>

      <!-- Form -->
      <div class="card mx" style="margin-top:12px">
        <div class="fg"><label class="fl">Document type</label>
          <input class="fi" id="sc-name" value="${escapeHtml(defaultName)}">
        </div>
        <div class="divider"></div>
        <div class="fg"><label class="fl">Vessel</label>
          <select class="fs" id="sc-vessel">
            ${Store.snapshot().vessels.map((vv) => `<option value="${vv.id}" ${vv.id === (v && v.id) ? 'selected' : ''}>${escapeHtml(vv.name)}</option>`).join('')}
          </select>
        </div>
        <div class="divider"></div>
        <div class="fg"><label class="fl">Category</label>
          <select class="fs" id="sc-category">
            <option value="vessel" ${defaultCategory === 'vessel' ? 'selected' : ''}>Vessel certificate</option>
            <option value="equipment" ${defaultCategory === 'equipment' ? 'selected' : ''}>Equipment</option>
            <option value="insurance" ${defaultCategory === 'insurance' ? 'selected' : ''}>Insurance</option>
            <option value="crew" ${defaultCategory === 'crew' ? 'selected' : ''}>Crew qualification</option>
          </select>
        </div>
        <div class="divider"></div>
        <div class="fg"><label class="fl">Issuer / authority</label>
          <input class="fi" id="sc-issuer" placeholder="e.g. YDSA / Pantaenius / Survitec">
        </div>
        <div class="divider"></div>
        <div class="fg"><label class="fl">Certificate number</label>
          <input class="fi" id="sc-number" placeholder="Optional">
        </div>
        <div class="divider"></div>
        <div class="fg"><label class="fl">Issue date</label>
          <input class="fi" id="sc-issued" type="date" value="${today}">
        </div>
        <div class="divider"></div>
        <div class="fg"><label class="fl">Expiry date</label>
          <input class="fi" id="sc-expires" type="date">
        </div>
      </div>

      <div style="padding:16px 16px 0;display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-sea btn-full" onclick="saveScanCert('${defaultIcon}','${defaultKind}')">✓ Save to records</button>
        <button class="btn btn-out btn-full" onclick="cancelScanConfirm()">Cancel</button>
      </div>
      <div class="spacer"></div>`;
  }

  function saveScanCert(defaultIcon, defaultKind) {
    if (!pendingScan) return;
    const name = (document.getElementById('sc-name') || {}).value || 'Certificate';
    const vesselId = (document.getElementById('sc-vessel') || {}).value;
    const category = (document.getElementById('sc-category') || {}).value || 'vessel';
    const issuer = (document.getElementById('sc-issuer') || {}).value || '';
    const number = (document.getElementById('sc-number') || {}).value || '';
    const issued_at = (document.getElementById('sc-issued') || {}).value || null;
    const expires_at = (document.getElementById('sc-expires') || {}).value || null;
    Store.addCert({
      vessel_id: vesselId,
      kind: defaultKind || 'other',
      name,
      icon: defaultIcon || '📋',
      category,
      issuer,
      number,
      issued_at,
      expires_at,
      file: pendingScan.file
    });
    pendingScan = null;
    activeVesselId = vesselId;
    go('s-vessel-detail');
  }
  window.saveScanCert = saveScanCert;

  function cancelScanConfirm() {
    pendingScan = null;
    go('s-scan');
  }
  window.cancelScanConfirm = cancelScanConfirm;

  // ---------- Cert detail sheet ----------

  function openCertSheet(certId) {
    const c = Store.getCert(certId);
    if (!c) return;
    const v = Store.getVessel(c.vessel_id);
    const days = Store.daysUntil(c.expires_at);
    const cls = days === Infinity ? 'chip-ok' : days < 0 ? 'chip-rd' : days <= 30 ? 'chip-am' : 'chip-ok';
    const label = days === Infinity ? 'No expiry' : days < 0 ? `Expired ${Math.abs(days)}d` : days <= 30 ? `${days}d left` : 'Valid';

    let existing = document.getElementById('cert-sheet');
    if (existing) existing.remove();
    const sheet = document.createElement('div');
    sheet.id = 'cert-sheet';
    sheet.className = 'bdrop on';
    const f = c.file;
    sheet.innerHTML = `
      <div class="sheet" style="padding-bottom:calc(var(--safe) + 14px)">
        <div class="sh-pull"></div>
        <div class="sh-head">
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            <div style="width:40px;height:40px;border-radius:11px;background:var(--slate);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${c.icon || '📋'}</div>
            <div style="min-width:0">
              <div class="sh-title" style="font-size:16px">${escapeHtml(c.name)}</div>
              <div style="font-size:11px;color:var(--lt)">${escapeHtml(v ? v.name : '')} · ${escapeHtml(c.category || '')}</div>
            </div>
          </div>
          <button class="sh-x" onclick="closeCertSheet()">×</button>
        </div>

        <div style="padding:0 20px 14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <div>
              <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em">Status</div>
              <div style="font-size:14px;font-weight:600;color:var(--text);margin-top:2px">${escapeHtml(c.expires_at ? fmtDate(c.expires_at) : 'No expiry')}</div>
            </div>
            <span class="chip ${cls}">${label}</span>
          </div>

          <div style="background:var(--slate);border-radius:12px;padding:14px 16px;margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span style="color:var(--mid)">Issuer</span><span style="font-weight:600;color:var(--text)">${escapeHtml(c.issuer || '—')}</span></div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span style="color:var(--mid)">Number</span><span style="font-weight:600;color:var(--text)">${escapeHtml(c.number || '—')}</span></div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span style="color:var(--mid)">Issued</span><span style="font-weight:600;color:var(--text)">${escapeHtml(c.issued_at ? fmtDate(c.issued_at) : '—')}</span></div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span style="color:var(--mid)">Expires</span><span style="font-weight:600;color:var(--text)">${escapeHtml(c.expires_at ? fmtDate(c.expires_at) : 'No expiry')}</span></div>
          </div>

          ${f ? `
            <div style="background:var(--seap);border:1px solid rgba(8,145,178,.2);border-radius:12px;padding:12px 14px;margin-bottom:14px">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                <span style="font-size:18px">📎</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(f.name)}</div>
                  <div style="font-size:11px;color:var(--lt)">${escapeHtml(f.type || 'unknown')} · ${fmtBytes(f.size)} · added ${fmtDate(f.added_at)}</div>
                </div>
              </div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-xs btn-sea" style="flex:1" onclick="viewAttachment('${f.data_url}','${escapeHtml(f.name).replace(/'/g, '&#39;')}')">👁 View</button>
                <button class="btn btn-xs btn-out" style="flex:1" onclick="attachToExistingCert('${c.id}')">↻ Replace</button>
                <button class="btn btn-xs btn-out" style="flex:1;color:var(--red);border-color:rgba(220,38,38,.3)" onclick="removeCertFile('${c.id}')">✕ Remove</button>
              </div>
            </div>` : `
            <div style="background:var(--ampp);border:1px solid rgba(217,119,6,.2);border-radius:12px;padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
              <span style="font-size:18px">📎</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:700;color:var(--amber)">No file attached</div>
                <div style="font-size:11px;color:var(--mid)">Add a PDF or photo for the inspection pack.</div>
              </div>
              <button class="btn btn-xs btn-sea" onclick="attachToExistingCert('${c.id}')">📎 Add file</button>
            </div>`}

          <div class="sheet-actions">
            <button class="sheet-act" onclick="renewCert('${c.id}')"><span style="font-size:18px">↻</span><span>Mark renewed (today + 12 months)</span></button>
            <button class="sheet-act" onclick="closeCertSheet();go('s-scan')"><span style="font-size:18px">📷</span><span>Scan replacement</span></button>
            <button class="sheet-act danger" onclick="confirmDeleteCert('${c.id}')"><span style="font-size:18px">🗑</span><span>Delete certificate</span></button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeCertSheet(); });
  }
  window.openCertSheet = openCertSheet;

  function closeCertSheet() {
    const s = document.getElementById('cert-sheet');
    if (s) s.remove();
  }
  window.closeCertSheet = closeCertSheet;

  function removeCertFile(certId) {
    if (!confirm('Remove the attached file? The certificate record stays.')) return;
    Store.detachFileFromCert(certId);
    closeCertSheet();
    openCertSheet(certId);
  }
  window.removeCertFile = removeCertFile;

  function renewCert(certId) {
    const c = Store.getCert(certId);
    if (!c) return;
    const next = new Date(); next.setHours(0, 0, 0, 0); next.setMonth(next.getMonth() + 12);
    Store.updateCert(certId, { expires_at: next.toISOString().slice(0, 10), issued_at: new Date().toISOString().slice(0, 10) });
    closeCertSheet();
    if (document.getElementById('s-vessel-detail').classList.contains('on')) renderVesselDetail();
    if (document.getElementById('s-surveyor-vessel').classList.contains('on')) renderSurveyorVessel();
  }
  window.renewCert = renewCert;

  function confirmDeleteCert(certId) {
    if (!confirm('Delete this certificate record? This cannot be undone.')) return;
    Store.deleteCert(certId);
    closeCertSheet();
    if (document.getElementById('s-vessel-detail').classList.contains('on')) renderVesselDetail();
    if (document.getElementById('s-surveyor-vessel').classList.contains('on')) renderSurveyorVessel();
  }
  window.confirmDeleteCert = confirmDeleteCert;

  // ---------- Equipment add ----------

  function resetEquipmentAddForm() {
    ['eq-add-name','eq-add-make','eq-add-model','eq-add-serial','eq-add-qty','eq-add-last','eq-add-next','eq-add-notes']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.value = id === 'eq-add-qty' ? '1' : ''; });
    const sel = document.getElementById('eq-add-kind'); if (sel) sel.selectedIndex = 0;
    pendingEquipmentFile = null;
    const note = document.getElementById('eq-file-note');
    if (note) note.innerHTML = '';
  }

  function saveNewEquipment() {
    if (!activeVesselId) {
      const v = Store.snapshot().vessels[0];
      if (v) activeVesselId = v.id;
    }
    if (!activeVesselId) { alert('Pick a vessel first'); return; }

    const kind = (document.getElementById('eq-add-kind') || {}).value || 'other';
    const name = (document.getElementById('eq-add-name') || {}).value || '';
    const make = (document.getElementById('eq-add-make') || {}).value || '';
    const model = (document.getElementById('eq-add-model') || {}).value || '';
    const serial = (document.getElementById('eq-add-serial') || {}).value || '';
    const qty = parseInt((document.getElementById('eq-add-qty') || {}).value || '1', 10);
    const last = (document.getElementById('eq-add-last') || {}).value || null;
    const next = (document.getElementById('eq-add-next') || {}).value || null;
    const notes = (document.getElementById('eq-add-notes') || {}).value || '';

    const iconMap = { liferaft:'🛟', lifejacket:'🦺', epirb:'📡', plb:'📡', vhf_fixed:'📻', vhf_handheld:'📻', pyro_solas_a:'🧨', pyro_inshore:'🧨', fire_ext:'🧯', fire_blanket:'🧯', first_aid_c:'🩹', anchor:'⚓', bilge_pump:'💧', nav_lights:'💡', other:'🔧' };
    const nameMap = { liferaft:'Liferaft', lifejacket:'Lifejackets', epirb:'EPIRB', plb:'PLB', vhf_fixed:'VHF DSC fixed', vhf_handheld:'VHF handheld', pyro_solas_a:'SOLAS A pyro pack', pyro_inshore:'Inshore pyro pack', fire_ext:'Fire extinguisher', fire_blanket:'Fire blanket', first_aid_c:'First aid kit Cat C', anchor:'Anchor & cable', bilge_pump:'Bilge pump', nav_lights:'Nav lights', other:'Equipment' };

    Store.addEquipment({
      vessel_id: activeVesselId,
      kind,
      name: name || nameMap[kind] || 'Equipment',
      icon: iconMap[kind] || '🔧',
      make, model, serial, qty,
      installed_at: null,
      last_service_at: last,
      next_service_at: next,
      notes,
      file: pendingEquipmentFile
    });
    pendingEquipmentFile = null;
    go('s-equipment-list');
  }
  window.saveNewEquipment = saveNewEquipment;

  // ---------- Hand-off QR ----------

  function renderHandoff() {
    const wrap = document.getElementById('ho-scroll');
    if (!wrap) return;
    const v = Store.getVessel(activeVesselId) || Store.snapshot().vessels[0];
    if (!v) { wrap.innerHTML = '<div style="padding:24px">Pick a vessel first</div>'; return; }
    activeVesselId = v.id;

    // Find existing active hand-offs
    const existing = Store.snapshot().handoff_links.filter((h) => h.vessel_id === v.id && new Date(h.expires_at) > new Date());

    wrap.innerHTML = `
      <div style="padding:18px 20px 6px">
        <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em">${escapeHtml(v.name)}</div>
        <div style="font-size:22px;font-weight:700;color:var(--text);margin:4px 0 6px;letter-spacing:-.3px">Skipper hand-off</div>
        <div style="font-size:13px;color:var(--mid);line-height:1.6">Generate a temporary read-only link so a relief skipper, yard, or surveyor can review this vessel without a CodedOK login.</div>
      </div>

      <div class="slbl">Active links</div>
      <div class="card mx" id="ho-active">
        ${existing.length === 0 ? '<div style="padding:18px;text-align:center;color:var(--lt);font-size:13px">No active hand-off links</div>' : existing.map((h) => `
          <div style="padding:14px 16px;border-bottom:1px solid var(--bdr)">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:8px">
              ${qrSvg(h.token, 64)}
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:700;color:var(--text)">Token: ${escapeHtml(h.token)}</div>
                <div style="font-size:11px;color:var(--lt);margin-top:2px">Expires ${fmtDate(h.expires_at)} · ${escapeHtml(h.id)}</div>
                <div style="font-size:11px;color:var(--sea);margin-top:4px;word-break:break-all">codedok.app/ho/${escapeHtml(h.token)}</div>
              </div>
            </div>
          </div>`).join('')}
      </div>

      <div class="slbl">Generate new</div>
      <div class="card mx">
        <div class="fg"><label class="fl">Valid for</label>
          <select class="fs" id="ho-hours">
            <option value="2">2 hours</option>
            <option value="24">24 hours</option>
            <option value="48" selected>48 hours</option>
            <option value="168">1 week</option>
          </select>
        </div>
        <div class="divider"></div>
        <div class="fg" style="padding-bottom:13px">
          <label class="fl">What they'll see</label>
          <div style="font-size:12px;color:var(--mid);line-height:1.6;margin-top:2px">Vessel details, certificate list, equipment register, last inspection. They cannot edit, raise deficiencies, or see other vessels.</div>
        </div>
      </div>

      <div style="padding:14px 16px">
        <button class="btn btn-sea btn-full" onclick="generateHandoff()">🔗 Generate hand-off link</button>
      </div>
      <div class="spacer"></div>`;
  }

  function generateHandoff() {
    const v = Store.getVessel(activeVesselId);
    if (!v) return;
    const hours = parseInt((document.getElementById('ho-hours') || {}).value || '48', 10);
    Store.createHandoff(v.id, hours);
    renderHandoff();
  }
  window.generateHandoff = generateHandoff;

  // Lightweight deterministic-pattern SVG that *looks* like a QR, no library required.
  // Real production app uses a proper QR encoder; for prototype demo this is enough.
  function qrSvg(seedStr, size) {
    size = size || 80;
    const grid = 21;
    const cell = size / grid;
    let h1 = 0, h2 = 0;
    for (let i = 0; i < seedStr.length; i++) {
      h1 = (h1 * 31 + seedStr.charCodeAt(i)) >>> 0;
      h2 = (h2 * 17 + seedStr.charCodeAt(i)) >>> 0;
    }
    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="background:white;border-radius:6px;flex-shrink:0">`;
    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < grid; x++) {
        const finder = (x < 7 && y < 7) || (x > grid - 8 && y < 7) || (x < 7 && y > grid - 8);
        const finderInner = ((x >= 1 && x <= 5 && y >= 1 && y <= 5) ||
                             (x >= grid - 6 && x <= grid - 2 && y >= 1 && y <= 5) ||
                             (x >= 1 && x <= 5 && y >= grid - 6 && y <= grid - 2));
        const finderCore = ((x >= 2 && x <= 4 && y >= 2 && y <= 4) ||
                            (x >= grid - 5 && x <= grid - 3 && y >= 2 && y <= 4) ||
                            (x >= 2 && x <= 4 && y >= grid - 5 && y <= grid - 3));
        let on;
        if (finder) on = !finderInner || finderCore;
        else {
          const v = (h1 ^ (x * 2654435761) ^ (y * 40503) ^ h2) >>> 0;
          on = (v & 1) === 1;
        }
        if (on) svg += `<rect x="${(x*cell).toFixed(2)}" y="${(y*cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="#0a1628"/>`;
      }
    }
    svg += '</svg>';
    return svg;
  }

  // ---------- Surveyor home ----------

  // ---------- Surveyor workspace (tabs: vessels / inbox / jobs / earnings) ----------

  let surveyorTab = 'inbox';  // default landing tab for surveyors
  function setSurveyorTab(tab) {
    surveyorTab = tab;
    // If we're not on the surveyor home, navigate there.
    if (!document.getElementById('s-surveyor-home').classList.contains('on')) {
      go('s-surveyor-home');
      return;
    }
    renderSurveyorHome();
    refreshSurveyorSidebar();
  }
  window.setSurveyorTab = setSurveyorTab;

  function renderSurveyorHome() {
    const me = Store.getCurrentUser();
    const wrap = document.getElementById('sv-home-scroll');
    const heroEl = document.querySelector('#s-surveyor-home > div[style*="background:var(--ink)"]');
    if (heroEl) {
      heroEl.classList.add('sv-hero');
      heroEl.style.cssText = 'padding:0 20px 18px;flex-shrink:0;position:relative';
    }
    if (!wrap) return;
    if (!me || me.kind !== 'surveyor') {
      wrap.innerHTML = `
        <div class="empty">
          <div class="empty-art">🔍</div>
          <div class="empty-h">Surveyor mode</div>
          <div class="empty-sub">Switch to McCollam Marine's surveyor view to see all vessels you've been granted, raise deficiencies, and sign inspections.</div>
          <button class="btn btn-sm btn-sea" onclick="enterSurveyorMode()">Enter surveyor mode</button>
        </div>`;
      return;
    }

    const inbox = Store.jobsForSurveyor(me.id, 'requested');
    const earnings = Store.surveyorEarnings(me.id);

    // Update bnav active state + inbox dot
    ['vessels','inbox','jobs','earn'].forEach((tab) => {
      const el = document.getElementById('sv-nav-' + tab);
      if (el) el.classList.remove('on');
    });
    const navMap = { vessels: 'sv-nav-vessels', inbox: 'sv-nav-inbox', jobs: 'sv-nav-jobs', earnings: 'sv-nav-earn' };
    const navEl = document.getElementById(navMap[surveyorTab]);
    if (navEl) navEl.classList.add('on');
    const dot = document.getElementById('sv-inbox-dot');
    if (dot) dot.style.display = inbox.length > 0 ? 'block' : 'none';

    // Update brand header — same on all tabs
    if (heroEl) {
      heroEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 16px;position:relative;z-index:1">
          <div class="mm-mark">
            ${mmMark(36)}
            <div class="mm-mark-words">
              <div class="mm-mark-name">McCollam Marine</div>
              <div class="mm-mark-tag">Naval Architects · Marine Surveyors</div>
            </div>
          </div>
          <button onclick="exitSurveyorMode()" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.8);font-size:11px;font-weight:600;padding:6px 10px;border-radius:8px;cursor:pointer;font-family:var(--fn)">↩ Exit</button>
        </div>
        <div style="position:relative;z-index:1;margin-bottom:14px">
          <div style="font-size:11px;color:rgba(255,255,255,.5);font-weight:600;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">Surveyor workspace · ${me.surveyor && me.surveyor.regions ? escapeHtml(me.surveyor.regions[0]) : ''}</div>
          <div class="h-display" style="font-size:24px">${escapeHtml(me.name.split(' ')[0])}'s ${escapeHtml(surveyorTab === 'earnings' ? 'earnings' : surveyorTab)}</div>
        </div>
        <div style="display:flex;gap:8px;position:relative;z-index:1">
          <div class="tile"><div class="tile-num">${inbox.length}</div><div class="tile-lbl">In inbox</div></div>
          <div class="tile"><div class="tile-num">£${(earnings.pending || 0).toLocaleString()}</div><div class="tile-lbl">Awaiting pay</div></div>
          <div class="tile"><div class="tile-num ok">£${(earnings.grossLifetime || 0).toLocaleString()}</div><div class="tile-lbl">Lifetime</div></div>
        </div>`;
    }

    // Tab content
    if (surveyorTab === 'vessels')   wrap.innerHTML = renderSurveyorVesselsTab(me);
    else if (surveyorTab === 'inbox')   wrap.innerHTML = renderSurveyorInboxTab(me);
    else if (surveyorTab === 'jobs')    wrap.innerHTML = renderSurveyorJobsTab(me);
    else if (surveyorTab === 'earnings') wrap.innerHTML = renderSurveyorEarningsTab(me);
  }

  function renderSurveyorVesselsTab(me) {
    const grants = Store.surveyorVessels(me.id);
    if (grants.length === 0) {
      return `
        <div class="empty">
          <div class="empty-art">⛵</div>
          <div class="empty-h">No vessels assigned</div>
          <div class="empty-sub">Operators invite you per-vessel. Once invited, vessels appear here across all your clients.</div>
        </div>`;
    }
    const byOrg = {};
    grants.forEach((g) => {
      const orgName = g.ownerOrg ? g.ownerOrg.name : 'Unknown';
      if (!byOrg[orgName]) byOrg[orgName] = [];
      byOrg[orgName].push(g);
    });
    let html = '';
    Object.keys(byOrg).forEach((orgName) => {
      html += `<div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;padding:18px 16px 8px">${escapeHtml(orgName)} · ${byOrg[orgName].length} vessel${byOrg[orgName].length === 1 ? '' : 's'}</div>`;
      html += '<div style="padding:0 16px;display:flex;flex-direction:column;gap:10px">';
      byOrg[orgName].forEach((g) => {
        const v = g.vessel;
        const score = Store.complianceScore(v.id);
        const counts = Store.urgencyCounts(v.id);
        const ready = counts.overdue === 0;
        const last = Store.vesselInspections(v.id)[0];
        const ringColor = scoreColor(score);
        html += `
          <div class="card" style="cursor:pointer;border-radius:14px;overflow:hidden" onclick="setActiveVessel('${v.id}'); go('s-surveyor-vessel')">
            <div style="padding:14px 16px;display:flex;align-items:center;gap:14px">
              <div style="width:46px;height:46px;background:var(--slate);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${v.icon || '⛵'}</div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
                  <div style="font-size:15px;font-weight:700;color:var(--text)">${escapeHtml(v.name)}</div>
                  ${ready ? '<span class="chip chip-ok">Ready</span>' : `<span class="chip chip-rd">${counts.overdue} ov.</span>`}
                </div>
                <div style="font-size:11px;color:var(--lt)">${escapeHtml(v.category)} · ${escapeHtml(v.type)} · Last inspection ${last ? fmtDate(last.completed_at) : '—'}</div>
              </div>
              <div style="position:relative;width:44px;height:44px;flex-shrink:0">
                <svg width="44" height="44" viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="18" fill="none" stroke="var(--bdr)" stroke-width="4"/>
                  <circle cx="22" cy="22" r="18" fill="none" stroke="${ringColor}" stroke-width="4" stroke-dasharray="${(2*Math.PI*18).toFixed(1)}" stroke-dashoffset="${(2*Math.PI*18*(1-score/100)).toFixed(1)}" stroke-linecap="round" transform="rotate(-90 22 22)"/>
                </svg>
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:${ringColor}">${score}</div>
              </div>
            </div>
          </div>`;
      });
      html += '</div>';
    });
    html += '<div class="spacer"></div>';
    return html;
  }

  function jobTypeLabel(t) {
    return ({ sms_review: 'SMS review', annual_survey: 'Annual survey', mid_term: 'Mid-term survey', renewal_survey: '5-year renewal', other: 'Other' })[t] || t;
  }

  function jobIcon(t) {
    return ({ sms_review: '📋', annual_survey: '🔍', mid_term: '🔍', renewal_survey: '🏗️', other: '🛠️' })[t] || '🛠️';
  }

  function renderSurveyorInboxTab(me) {
    const requested = Store.jobsForSurveyor(me.id, 'requested');
    if (requested.length === 0) {
      return `
        <div class="empty">
          <div class="empty-art">📥</div>
          <div class="empty-h">Inbox empty</div>
          <div class="empty-sub">When operators send you a job (an SMS review, an inspection booking), it appears here.</div>
        </div>`;
    }
    let html = `<div style="padding:14px 16px 6px;font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em">Awaiting your quote · ${requested.length}</div>`;
    html += '<div style="padding:0 16px;display:flex;flex-direction:column;gap:10px">';
    requested.forEach((j) => {
      const v = Store.getVessel(j.vessel_id);
      const op = Store.snapshot().users.find((u) => u.id === j.requested_by_user_id) || { name: 'Operator' };
      html += `
        <div class="card" style="cursor:pointer;border-radius:14px;overflow:hidden;border:2px solid var(--sea)" onclick="openSurveyorJob('${j.id}')">
          <div style="padding:14px 16px">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
              <div style="display:flex;align-items:center;gap:10px;min-width:0">
                <div style="width:40px;height:40px;border-radius:11px;background:var(--seap);color:var(--sea);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${jobIcon(j.type)}</div>
                <div style="min-width:0">
                  <div style="font-size:14px;font-weight:700;color:var(--text)">${escapeHtml(j.title)}</div>
                  <div style="font-size:11px;color:var(--lt);margin-top:1px">${escapeHtml(jobTypeLabel(j.type))} · ${escapeHtml((op && op.name) || 'Operator')} · ${fmtDate(j.created_at)}</div>
                </div>
              </div>
              <span class="chip chip-bl">New</span>
            </div>
            <div style="font-size:12px;color:var(--mid);line-height:1.55;margin-bottom:10px">${escapeHtml(j.description || '')}</div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-sm btn-sea" style="flex:1" onclick="event.stopPropagation();openSurveyorJob('${j.id}')">Review &amp; quote</button>
            </div>
          </div>
        </div>`;
    });
    html += '</div><div class="spacer"></div>';
    return html;
  }

  function renderSurveyorJobsTab(me) {
    const all = Store.jobsForSurveyor(me.id);
    const active = all.filter((j) => ['quoted', 'paid', 'in_progress'].includes(j.status));
    const completed = all.filter((j) => j.status === 'completed');
    const declined = all.filter((j) => j.status === 'declined');

    if (all.length === 0) {
      return `
        <div class="empty">
          <div class="empty-art">🛠️</div>
          <div class="empty-h">No jobs yet</div>
          <div class="empty-sub">Quoted, paid, and completed jobs appear here.</div>
        </div>`;
    }

    function jobRow(j) {
      const v = Store.getVessel(j.vessel_id);
      const inv = j.invoice_id ? Store.getInvoice(j.invoice_id) : null;
      const statusChip = ({
        quoted:      '<span class="chip chip-am">Quote sent</span>',
        paid:        '<span class="chip chip-bl">Paid · do work</span>',
        in_progress: '<span class="chip chip-am">In progress</span>',
        completed:   '<span class="chip chip-ok">Completed</span>',
        declined:    '<span class="chip chip-rd">Declined</span>'
      })[j.status] || '';
      return `
        <div class="card" style="cursor:pointer;border-radius:14px;overflow:hidden;margin-bottom:8px" onclick="openSurveyorJob('${j.id}')">
          <div style="padding:12px 14px;display:flex;align-items:center;gap:12px">
            <div style="width:38px;height:38px;border-radius:10px;background:var(--slate);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${jobIcon(j.type)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;color:var(--text)">${escapeHtml(j.title)}</div>
              <div style="font-size:11px;color:var(--lt);margin-top:1px">${escapeHtml(jobTypeLabel(j.type))} · ${v ? escapeHtml(v.name) : ''}${j.quote_amount ? ' · £' + j.quote_amount : ''}</div>
            </div>
            ${statusChip}
          </div>
        </div>`;
    }

    let html = '<div style="padding:14px 16px">';
    if (active.length) {
      html += `<div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Active · ${active.length}</div>`;
      active.forEach((j) => html += jobRow(j));
    }
    if (completed.length) {
      html += `<div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin:14px 0 8px">Completed · ${completed.length}</div>`;
      completed.forEach((j) => html += jobRow(j));
    }
    if (declined.length) {
      html += `<div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin:14px 0 8px">Declined · ${declined.length}</div>`;
      declined.forEach((j) => html += jobRow(j));
    }
    html += '</div><div class="spacer"></div>';
    return html;
  }

  function renderSurveyorEarningsTab(me) {
    const earn = Store.surveyorEarnings(me.id);
    const paidInvoices = Store.invoicesForSurveyor(me.id, 'paid');
    const sentInvoices = Store.invoicesForSurveyor(me.id, 'sent');

    return `
      <div style="padding:14px 16px">
        <div class="card" style="padding:18px;border-radius:14px;margin-bottom:12px">
          <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">This year</div>
          <div style="font-size:34px;font-weight:800;color:var(--text);letter-spacing:-1px;line-height:1">£${earn.grossThisYear.toLocaleString()}</div>
          <div style="font-size:12px;color:var(--lt);margin-top:6px">${earn.paidCount} paid invoice${earn.paidCount === 1 ? '' : 's'} · platform fee 8%</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          <div class="card" style="padding:14px"><div style="font-size:10px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.06em">Awaiting payment</div><div style="font-size:20px;font-weight:800;color:var(--amber);margin-top:4px">£${earn.pending.toLocaleString()}</div></div>
          <div class="card" style="padding:14px"><div style="font-size:10px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.06em">Net lifetime</div><div style="font-size:20px;font-weight:800;color:var(--green);margin-top:4px">£${earn.netLifetime.toLocaleString()}</div></div>
        </div>

        ${sentInvoices.length ? `
          <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin:14px 0 8px">Awaiting payment · ${sentInvoices.length}</div>
          ${sentInvoices.map((inv) => invoiceRow(inv)).join('')}` : ''}

        ${paidInvoices.length ? `
          <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin:14px 0 8px">Paid · ${paidInvoices.length}</div>
          ${paidInvoices.map((inv) => invoiceRow(inv)).join('')}` : ''}

        <div style="margin-top:16px;padding:12px 14px;background:var(--seap);border-radius:10px;font-size:11px;color:var(--mid);line-height:1.6">💷 Payouts arrive in your linked bank account within 2 working days of an invoice being paid. Configure your bank in Profile.</div>
      </div>
      <div class="spacer"></div>`;
  }

  let activeJobId = null;
  function openSurveyorJob(jobId) {
    activeJobId = jobId;
    go('s-surveyor-job');
  }
  window.openSurveyorJob = openSurveyorJob;

  function renderSurveyorJob() {
    const wrap = document.getElementById('sv-job-scroll');
    if (!wrap) return;
    const j = Store.getJob(activeJobId);
    if (!j) { wrap.innerHTML = '<div class="empty"><div class="empty-h">Job not found</div></div>'; return; }
    const v = Store.getVessel(j.vessel_id);
    const op = Store.snapshot().users.find((u) => u.id === j.requested_by_user_id) || {};
    const inv = j.invoice_id ? Store.getInvoice(j.invoice_id) : null;
    const sms = j.sms_doc_id ? Store.snapshot().sms_documents.find((d) => d.id === j.sms_doc_id) : null;

    const statusBadge = ({
      requested: '<span class="insp-pill" style="background:rgba(8,145,178,.15);color:var(--sea);border:1px solid rgba(8,145,178,.3)">📥 New request</span>',
      quoted:    '<span class="insp-pill" style="background:rgba(217,119,6,.15);color:var(--amber);border:1px solid rgba(217,119,6,.3)">⏳ Quote sent</span>',
      paid:      '<span class="insp-pill" style="background:rgba(8,145,178,.15);color:var(--sea);border:1px solid rgba(8,145,178,.3)">💷 Paid · ready to do work</span>',
      in_progress:'<span class="insp-pill" style="background:rgba(217,119,6,.15);color:var(--amber);border:1px solid rgba(217,119,6,.3)">🛠️ In progress</span>',
      completed: '<span class="insp-pill rdy">✓ Completed</span>',
      declined:  '<span class="insp-pill notready">✕ Declined</span>'
    })[j.status] || '';

    let actionBar = '';
    if (j.status === 'requested') {
      actionBar = `
        <div style="padding:14px 16px;display:flex;gap:8px">
          <button class="btn btn-sea" style="flex:2" onclick="go('s-surveyor-quote')">Quote &amp; invoice →</button>
          <button class="btn btn-out" style="flex:1;color:var(--red);border-color:rgba(220,38,38,.3)" onclick="declineJobFlow('${j.id}')">Decline</button>
        </div>`;
    } else if (j.status === 'paid') {
      actionBar = `
        <div style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-sea btn-full" onclick="markJobInProgress('${j.id}')">▶ Start work</button>
          <button class="btn btn-out btn-full" onclick="completeJobFlow('${j.id}')">✓ Mark complete</button>
        </div>`;
    } else if (j.status === 'in_progress') {
      actionBar = `
        <div style="padding:14px 16px">
          <button class="btn btn-sea btn-full" onclick="completeJobFlow('${j.id}')">✓ Mark complete &amp; deliver</button>
        </div>`;
    }

    wrap.innerHTML = `
      <div class="hero hero-mm" style="border-radius:0;padding:14px 18px 18px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;position:relative;z-index:1">
          <button class="back" onclick="go('s-surveyor-home')" style="color:rgba(255,255,255,.6)">‹ Back</button>
          <div class="mm-mark"><div class="mm-mark-words"><div class="mm-mark-name" style="font-size:13px">McCollam Marine</div></div></div>
        </div>
        <div style="position:relative;z-index:1">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <div style="width:42px;height:42px;border-radius:11px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-size:20px">${jobIcon(j.type)}</div>
            <div style="min-width:0">
              <div class="h-display" style="font-size:20px">${escapeHtml(j.title)}</div>
              <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:1px">${escapeHtml(jobTypeLabel(j.type))} · ${escapeHtml(v ? v.name : '')} · ${escapeHtml(op.name || 'Operator')}</div>
            </div>
          </div>
          <div style="margin-top:10px">${statusBadge}</div>
        </div>
      </div>

      <div class="h-section">Job description</div>
      <div style="padding:0 16px">
        <div class="card" style="padding:14px 16px;font-size:13px;color:var(--mid);line-height:1.6">${escapeHtml(j.description || '')}</div>
      </div>

      ${sms ? `
        <div class="h-section">Submitted SMS</div>
        <div style="padding:0 16px">
          <div class="qa-tile" onclick="alert('In production this opens the SMS preview side-by-side. For prototype: download or print from operator side.')">
            <div class="qa-icon bl">📋</div>
            <div style="flex:1"><div class="qa-title">${escapeHtml(sms.title || 'Safety Management System')}</div><div class="qa-sub">v${sms.version || 1} · ${escapeHtml(sms.status)}</div></div>
            <span class="chev">›</span>
          </div>
        </div>` : ''}

      ${j.delivery && j.delivery.file ? `
        <div class="h-section">Delivered ${fmtDate(j.delivery.delivered_at)}</div>
        <div style="padding:0 16px">
          <div class="qa-tile" style="cursor:pointer;border:2px solid var(--green);background:var(--grnp)" onclick="viewAttachment('${j.delivery.file.data_url}','${escapeHtml(j.delivery.file.name).replace(/'/g, '&#39;')}')">
            <div class="qa-icon ok">📎</div>
            <div style="flex:1;min-width:0">
              <div class="qa-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(j.delivery.file.name)}</div>
              <div class="qa-sub">${escapeHtml(j.delivery.doc_type === 'coding_cert' ? 'MCA Coding Certificate' : j.delivery.doc_type === 'sms_signed' ? 'Signed SMS' : j.delivery.doc_type === 'survey_report' ? 'Survey report' : 'Attachment')} · ${fmtBytes(j.delivery.file.size)}${j.delivery.notes ? ' · ' + escapeHtml(j.delivery.notes.slice(0, 60)) : ''}</div>
            </div>
            <span class="chev">›</span>
          </div>
        </div>` : ''}

      ${inv ? `
        <div class="h-section">Invoice ${inv.id}</div>
        <div style="padding:0 16px">
          <div class="card" style="padding:14px 16px">
            ${inv.line_items.map((li) => `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px"><span style="color:var(--mid)">${escapeHtml(li.description)}${li.qty > 1 ? ' × ' + li.qty : ''}</span><span style="font-weight:600;color:var(--text)">£${(li.qty * li.unit_price).toFixed(2)}</span></div>`).join('')}
            <div style="height:1px;background:var(--bdr);margin:8px 0"></div>
            <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:var(--lt)"><span>Subtotal</span><span>£${inv.subtotal}</span></div>
            <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:var(--lt)"><span>VAT (20%)</span><span>£${inv.vat}</span></div>
            <div style="display:flex;justify-content:space-between;padding:6px 0 0;font-size:15px;font-weight:700"><span>Total</span><span>£${inv.total}</span></div>
            <div style="margin-top:10px;display:flex;align-items:center;gap:6px"><span class="chip ${inv.status === 'paid' ? 'chip-ok' : 'chip-am'}">${escapeHtml(inv.status)}</span>${inv.paid_at ? `<span style="font-size:11px;color:var(--lt)">paid ${fmtDate(inv.paid_at)}</span>` : `<span style="font-size:11px;color:var(--lt)">due ${fmtDate(inv.due_at)}</span>`}</div>
          </div>
        </div>` : ''}

      ${actionBar}
      <div class="spacer"></div>`;
  }

  function declineJobFlow(jobId) {
    const reason = prompt('Reason for declining (optional):') || '';
    Store.declineJob(jobId, reason);
    alert('Job declined. The operator has been notified.');
    go('s-surveyor-home');
  }
  window.declineJobFlow = declineJobFlow;

  function markJobInProgress(jobId) {
    Store.startJob(jobId);
    renderSurveyorJob();
  }
  window.markJobInProgress = markJobInProgress;

  // Delivery sheet — surveyor uploads the signed deliverable and we apply it
  // to the operator's record (cert / SMS / inspection).
  let pendingDeliveryFile = null;
  function completeJobFlow(jobId) {
    pendingDeliveryFile = null;
    showDeliverySheet(jobId);
  }
  window.completeJobFlow = completeJobFlow;

  function showDeliverySheet(jobId) {
    const j = Store.getJob(jobId);
    if (!j) return;
    const v = Store.getVessel(j.vessel_id);

    // Pick a sensible default doc_type based on job type.
    const defaultDocType = j.type === 'sms_review' ? 'sms_signed' : 'coding_cert';
    const defaultExpiry = (() => {
      const d = new Date(); d.setHours(0,0,0,0);
      d.setMonth(d.getMonth() + (j.type === 'renewal_survey' ? 60 : 12));
      return d.toISOString().slice(0, 10);
    })();

    let existing = document.getElementById('delivery-sheet');
    if (existing) existing.remove();
    const sheet = document.createElement('div');
    sheet.id = 'delivery-sheet';
    sheet.className = 'bdrop on';
    sheet.innerHTML = `
      <div class="sheet" style="padding-bottom:calc(var(--safe) + 14px)">
        <div class="sh-pull"></div>
        <div class="sh-head">
          <div>
            <div class="sh-title">Deliver to operator</div>
            <div style="font-size:11px;color:var(--lt);margin-top:2px">${escapeHtml(j.title)} · ${escapeHtml(v ? v.name : '')}</div>
          </div>
          <button class="sh-x" onclick="closeDeliverySheet()">×</button>
        </div>

        <div style="padding:0 20px 14px">
          <div style="background:var(--seap);border:1px solid rgba(8,145,178,.2);border-radius:10px;padding:10px 12px;font-size:11px;color:var(--mid);line-height:1.55;margin-bottom:14px">
            📎 Upload your signed PDF — it lands directly on the operator's vessel record. ${defaultDocType === 'coding_cert' ? 'A new MCA Coding Certificate will be created with this file attached.' : defaultDocType === 'sms_signed' ? 'The operator\'s SMS will be marked Signed with your version replacing the draft.' : 'The file will be attached to this job.'}
          </div>

          <!-- File picker tile -->
          <div id="delivery-file-tile" class="qa-tile" style="cursor:pointer" onclick="openDeliveryFilePicker()">
            <div class="qa-icon bl">📎</div>
            <div style="flex:1;min-width:0" id="delivery-file-text">
              <div class="qa-title">Choose signed PDF</div>
              <div class="qa-sub">Tap to upload — PDF or image, up to 4 MB</div>
            </div>
            <span class="chev">›</span>
          </div>

          <div class="card" style="padding:0;margin-top:14px">
            <div class="fg"><label class="fl">Document type</label>
              <select class="fs" id="delivery-doc-type">
                <option value="coding_cert" ${defaultDocType === 'coding_cert' ? 'selected' : ''}>MCA Coding Certificate</option>
                <option value="sms_signed" ${defaultDocType === 'sms_signed' ? 'selected' : ''}>Signed Safety Management System</option>
                <option value="survey_report">Survey report (with cert)</option>
                <option value="other">Other (attach to job only)</option>
              </select>
            </div>
            <div class="divider"></div>
            <div class="fg"><label class="fl">Cert expiry (if applicable)</label>
              <input class="fi" id="delivery-expiry" type="date" value="${defaultExpiry}">
            </div>
            <div class="divider"></div>
            <div class="fg" style="padding-bottom:13px"><label class="fl">Notes for operator</label>
              <textarea class="fta" id="delivery-notes" placeholder="Optional — e.g. one minor deficiency raised, see notes." style="min-height:70px"></textarea>
            </div>
          </div>

          <div style="margin-top:14px;display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-sea btn-full" onclick="confirmDelivery('${jobId}')">📤 Deliver &amp; mark job complete</button>
            <button class="btn btn-out btn-full" onclick="closeDeliverySheet()">Cancel</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeDeliverySheet(); });
  }
  function closeDeliverySheet() {
    const s = document.getElementById('delivery-sheet');
    if (s) s.remove();
    pendingDeliveryFile = null;
  }
  window.closeDeliverySheet = closeDeliverySheet;

  function openDeliveryFilePicker() {
    // Reuse the cert file input — it already has the right MIME types.
    const input = document.getElementById('cert-file-input');
    if (!input) return;
    input.value = '';
    // One-shot listener that captures the picked file for delivery, then re-binds the default.
    const onceHandler = async (ev) => {
      input.removeEventListener('change', onceHandler);
      // Re-bind the default cert listener so the rest of the app keeps working.
      wireFileInputs();
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      if (f.size > MAX_FILE_BYTES) {
        alert(`That file is ${fmtBytes(f.size)}. Please choose one under ${fmtBytes(MAX_FILE_BYTES)}.`);
        return;
      }
      const data_url = await readFileAsDataUrl(f);
      pendingDeliveryFile = { name: f.name, type: f.type, size: f.size, data_url, added_at: new Date().toISOString() };
      const tile = document.getElementById('delivery-file-text');
      if (tile) {
        tile.innerHTML = `
          <div class="qa-title">📎 ${escapeHtml(f.name)}</div>
          <div class="qa-sub">${escapeHtml(f.type || '')} · ${fmtBytes(f.size)} · ready to deliver</div>`;
      }
    };
    // Replace the existing change listener for this single pick.
    input.removeEventListener('change', input._defaultHandler || (() => {}));
    input.addEventListener('change', onceHandler);
    input.click();
  }
  window.openDeliveryFilePicker = openDeliveryFilePicker;

  function confirmDelivery(jobId) {
    if (!pendingDeliveryFile) {
      alert('Please choose a PDF or image to deliver.');
      return;
    }
    const docType = (document.getElementById('delivery-doc-type') || {}).value || 'coding_cert';
    const expires_at = (document.getElementById('delivery-expiry') || {}).value || null;
    const notes = (document.getElementById('delivery-notes') || {}).value || '';
    const result = Store.deliverJob(jobId, {
      file: pendingDeliveryFile,
      doc_type: docType,
      expires_at,
      notes
    });
    closeDeliverySheet();
    if (result) {
      let msg = 'Delivered to the operator.';
      if (result.certs && result.certs.length) msg += ` A new "${result.certs[0].name}" was added to ${escapeText((Store.getVessel(result.certs[0].vessel_id) || {}).name || 'the vessel')}.`;
      if (result.smsDoc) msg += ' The operator\'s SMS is now marked Signed.';
      alert(msg);
    }
    go('s-surveyor-home');
  }
  window.confirmDelivery = confirmDelivery;

  function escapeText(s) { return String(s == null ? '' : s); }

  // ---------- Surveyor quote builder ----------

  let quoteLineItems = [];

  function renderSurveyorQuote() {
    const wrap = document.getElementById('sv-quote-scroll');
    if (!wrap) return;
    const j = Store.getJob(activeJobId);
    if (!j) { wrap.innerHTML = '<div class="empty"><div class="empty-h">Job not found</div></div>'; return; }
    const v = Store.getVessel(j.vessel_id);

    if (quoteLineItems.length === 0) {
      // Sensible defaults per job type.
      const presets = {
        sms_review:     [{ description: 'SMS technical review &amp; sign-off', qty: 1, unit_price: 165 }],
        annual_survey:  [{ description: 'Annual renewal survey', qty: 1, unit_price: 235 }, { description: 'Travel', qty: 1, unit_price: 50 }],
        mid_term:       [{ description: 'Mid-term survey', qty: 1, unit_price: 295 }, { description: 'Travel', qty: 1, unit_price: 50 }],
        renewal_survey: [{ description: '5-year renewal survey (out of water)', qty: 1, unit_price: 595 }, { description: 'Travel', qty: 1, unit_price: 80 }]
      };
      quoteLineItems = (presets[j.type] || [{ description: 'Surveyor work', qty: 1, unit_price: 200 }]).map((p) => Object.assign({}, p));
    }

    const subtotal = quoteLineItems.reduce((s, li) => s + (li.qty * li.unit_price), 0);
    const vat = Math.round(subtotal * 0.2);
    const total = subtotal + vat;

    wrap.innerHTML = `
      <div style="padding:14px 16px 6px">
        <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em">${escapeHtml(j.title)}</div>
        <div class="h-display" style="font-size:22px;color:var(--text);margin-top:2px">Build your quote</div>
        <div style="font-size:12px;color:var(--lt);margin-top:4px;line-height:1.6">Your quote becomes an invoice the moment you send it. Operator pays through CodedOK Pay; net lands in your bank within 2 working days.</div>
      </div>

      <div class="h-section">Line items</div>
      <div style="padding:0 16px" id="quote-items">
        ${quoteLineItems.map((li, i) => `
          <div class="card" style="padding:12px 14px;margin-bottom:8px">
            <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
              <input class="fi" id="ql-desc-${i}" value="${escapeHtml(li.description.replace(/&amp;/g, '&'))}" style="flex:1;height:38px">
              <button class="btn btn-xs btn-out" style="color:var(--red);border-color:rgba(220,38,38,.3)" onclick="removeQuoteItem(${i})">✕</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div>
                <div style="font-size:10px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Qty</div>
                <input class="fi" id="ql-qty-${i}" type="number" min="1" value="${li.qty}" style="height:38px" oninput="updateQuoteItem(${i})">
              </div>
              <div>
                <div style="font-size:10px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Unit price (£)</div>
                <input class="fi" id="ql-price-${i}" type="number" min="0" step="5" value="${li.unit_price}" style="height:38px" oninput="updateQuoteItem(${i})">
              </div>
            </div>
          </div>`).join('')}
        <button class="btn btn-out btn-full btn-sm" onclick="addQuoteItem()">+ Add line item</button>
      </div>

      <div class="h-section">Total</div>
      <div style="padding:0 16px">
        <div class="card" style="padding:14px 16px">
          <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px"><span style="color:var(--mid)">Subtotal</span><span style="font-weight:600">£${subtotal}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px"><span style="color:var(--mid)">VAT (20%)</span><span style="font-weight:600">£${vat}</span></div>
          <div style="height:1px;background:var(--bdr);margin:8px 0"></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:18px;font-weight:800"><span>Operator pays</span><span>£${total}</span></div>
          <div style="margin-top:10px;padding:10px 12px;background:var(--seap);border-radius:8px;font-size:11px;color:var(--mid);line-height:1.6">CodedOK platform fee 8% (£${Math.round(total * 0.08)}) is deducted before payout. <strong>You receive £${total - Math.round(total * 0.08)}.</strong></div>
        </div>
      </div>

      <div class="h-section">Notes to operator (optional)</div>
      <div style="padding:0 16px">
        <textarea class="fta" id="quote-notes" placeholder="e.g. Estimated turnaround 5 working days. One round of revisions included."></textarea>
      </div>

      <div style="padding:14px 16px 0">
        <button class="btn btn-sea btn-full" onclick="sendQuote('${j.id}')">📩 Send quote &amp; invoice</button>
      </div>
      <div class="spacer"></div>`;
  }

  function updateQuoteItem(i) {
    const desc = (document.getElementById('ql-desc-' + i) || {}).value || quoteLineItems[i].description;
    const qty = parseInt((document.getElementById('ql-qty-' + i) || {}).value || '1', 10);
    const price = parseFloat((document.getElementById('ql-price-' + i) || {}).value || '0');
    quoteLineItems[i] = { description: desc, qty: qty || 1, unit_price: price || 0 };
    renderSurveyorQuote();
  }
  window.updateQuoteItem = updateQuoteItem;

  function addQuoteItem() {
    quoteLineItems.push({ description: 'New line item', qty: 1, unit_price: 0 });
    renderSurveyorQuote();
  }
  window.addQuoteItem = addQuoteItem;

  function removeQuoteItem(i) {
    quoteLineItems.splice(i, 1);
    if (quoteLineItems.length === 0) quoteLineItems.push({ description: 'Surveyor work', qty: 1, unit_price: 200 });
    renderSurveyorQuote();
  }
  window.removeQuoteItem = removeQuoteItem;

  function sendQuote(jobId) {
    // Capture latest line item values from DOM in case user typed but didn't blur.
    quoteLineItems.forEach((_, i) => {
      const desc = (document.getElementById('ql-desc-' + i) || {}).value;
      const qty = parseInt((document.getElementById('ql-qty-' + i) || {}).value || '1', 10);
      const price = parseFloat((document.getElementById('ql-price-' + i) || {}).value || '0');
      if (desc != null) quoteLineItems[i] = { description: desc, qty: qty || 1, unit_price: price || 0 };
    });
    const notes = (document.getElementById('quote-notes') || {}).value || '';
    const total = quoteLineItems.reduce((s, li) => s + (li.qty * li.unit_price), 0);
    Store.quoteJob(jobId, total, quoteLineItems.slice(), notes);
    quoteLineItems = [];
    alert('Quote sent. The operator gets a push notification.');
    go('s-surveyor-home');
  }
  window.sendQuote = sendQuote;

  // ---------- Operator: invoice view & pay ----------

  let activeInvoiceId = null;
  function openInvoice(invoiceId) {
    activeInvoiceId = invoiceId;
    go('s-invoice-view');
  }
  window.openInvoice = openInvoice;

  function renderInvoiceView() {
    const wrap = document.getElementById('invoice-view-scroll');
    if (!wrap) return;
    const inv = Store.getInvoice(activeInvoiceId);
    if (!inv) { wrap.innerHTML = '<div class="empty"><div class="empty-h">Invoice not found</div></div>'; return; }
    const j = inv.job_id ? Store.getJob(inv.job_id) : null;
    const v = Store.getVessel(inv.vessel_id);
    const surveyor = Store.snapshot().users.find((u) => u.id === inv.surveyor_user_id) || {};

    wrap.innerHTML = `
      <div class="hero" style="border-radius:0;padding:14px 18px 18px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;position:relative;z-index:1">
          <button class="back" onclick="go('s-home')" style="color:rgba(255,255,255,.6)">‹ Home</button>
          <span class="cat-pill">Invoice</span>
        </div>
        <div style="position:relative;z-index:1">
          <div style="font-size:11px;color:rgba(255,255,255,.5);font-weight:600;text-transform:uppercase;letter-spacing:.07em">${escapeHtml(inv.id)}</div>
          <div class="h-display" style="font-size:32px;margin-top:4px">£${inv.total}</div>
          <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:2px">From ${escapeHtml((surveyor.surveyor && surveyor.surveyor.company) || surveyor.name || 'Surveyor')}</div>
        </div>
      </div>

      ${j ? `
        <div class="h-section">For</div>
        <div style="padding:0 16px">
          <div class="qa-tile" style="cursor:default">
            <div class="qa-icon bl">${jobIcon(j.type)}</div>
            <div style="flex:1"><div class="qa-title">${escapeHtml(j.title)}</div><div class="qa-sub">${v ? escapeHtml(v.name) : ''} · ${escapeHtml(jobTypeLabel(j.type))}</div></div>
          </div>
        </div>` : ''}

      <div class="h-section">Line items</div>
      <div style="padding:0 16px">
        <div class="card" style="padding:14px 16px">
          ${inv.line_items.map((li) => `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px"><span style="color:var(--mid)">${escapeHtml(li.description)}${li.qty > 1 ? ' × ' + li.qty : ''}</span><span style="font-weight:600;color:var(--text)">£${(li.qty * li.unit_price).toFixed(2)}</span></div>`).join('')}
          <div style="height:1px;background:var(--bdr);margin:8px 0"></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:var(--lt)"><span>Subtotal</span><span>£${inv.subtotal}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:var(--lt)"><span>VAT (20%)</span><span>£${inv.vat}</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0 0;font-size:18px;font-weight:800"><span>Total due</span><span>£${inv.total}</span></div>
        </div>
      </div>

      ${inv.notes ? `
        <div class="h-section">From the surveyor</div>
        <div style="padding:0 16px">
          <div class="card" style="padding:14px 16px;font-size:13px;color:var(--mid);line-height:1.6">${escapeHtml(inv.notes)}</div>
        </div>` : ''}

      ${inv.status === 'sent' ? `
        <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
          <button class="btn btn-sea btn-full" onclick="payInvoiceFlow('${inv.id}')">💷 Pay £${inv.total} now</button>
          <button class="btn btn-out btn-full" onclick="alert('Decline flow — would notify the surveyor')">Decline this quote</button>
        </div>
        <div style="padding:0 16px">
          <div style="background:var(--seap);border-radius:10px;padding:12px 14px;font-size:11px;color:var(--mid);line-height:1.6">🔒 Paid securely via CodedOK Pay (Stripe). Funds are held until the surveyor delivers the work — they're released to the surveyor on completion.</div>
        </div>` : `
        <div style="padding:14px 16px">
          <div class="card" style="padding:14px 16px;text-align:center">
            <div style="font-size:30px">${inv.status === 'paid' ? '✓' : '⏳'}</div>
            <div style="font-size:14px;font-weight:700;color:${inv.status === 'paid' ? 'var(--green)' : 'var(--amber)'};margin-top:6px">${inv.status === 'paid' ? 'Paid ' + fmtDate(inv.paid_at) : 'Status: ' + escapeHtml(inv.status)}</div>
          </div>
        </div>`}

      <div class="spacer"></div>`;
  }

  function payInvoiceFlow(invoiceId) {
    const inv = Store.getInvoice(invoiceId);
    if (!inv) return;
    showCheckoutSheet({
      title: 'Pay invoice',
      price: '£' + inv.total,
      lineItems: [
        ['Subtotal', '£' + inv.subtotal],
        ['VAT (20%)', '£' + inv.vat],
        ['Platform fee', 'paid by surveyor']
      ],
      onConfirm: () => {
        Store.payInvoice(invoiceId, 'stripe');
        alert('Paid. The surveyor gets a notification and starts work.');
        go('s-home');
      }
    });
  }
  window.payInvoiceFlow = payInvoiceFlow;

  function invoiceRow(inv) {
    const v = Store.getVessel(inv.vessel_id);
    const j = inv.job_id ? Store.getJob(inv.job_id) : null;
    return `
      <div class="card" style="padding:12px 14px;border-radius:12px;margin-bottom:8px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="openSurveyorJob('${inv.job_id}')">
        <div style="width:38px;height:38px;border-radius:10px;background:var(--slate);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">🧾</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${escapeHtml(j ? j.title : 'Invoice')}</div>
          <div style="font-size:11px;color:var(--lt);margin-top:1px">${v ? escapeHtml(v.name) : ''} · ${escapeHtml(inv.id)} · ${fmtDate(inv.issued_at)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:14px;font-weight:800;color:var(--text)">£${inv.total}</div>
          <span class="chip ${inv.status === 'paid' ? 'chip-ok' : 'chip-am'}" style="margin-top:2px">${escapeHtml(inv.status)}</span>
        </div>
      </div>`;
  }

  // ---------- Surveyor vessel detail ----------

  function renderSurveyorVessel() {
    const wrap = document.getElementById('sv-vessel-scroll');
    if (!wrap) return;
    const v = Store.getVessel(activeVesselId);
    if (!v) { wrap.innerHTML = '<div style="padding:24px">No vessel selected</div>'; return; }
    const certs = Store.vesselCerts(v.id).slice().sort((a, b) => Store.daysUntil(a.expires_at) - Store.daysUntil(b.expires_at));
    const equipment = Store.vesselEquipment(v.id).slice().sort((a, b) => Store.daysUntil(a.next_service_at) - Store.daysUntil(b.next_service_at));
    const defs = Store.vesselDeficiencies(v.id, { openOnly: true });
    const inspections = Store.vesselInspections(v.id);
    const score = Store.complianceScore(v.id);
    const me = Store.getCurrentUser();

    wrap.innerHTML = `
      <div class="hero hero-mm" style="border-radius:0;padding:14px 18px 18px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;position:relative;z-index:1">
          <button class="back" onclick="go('s-surveyor-home')" style="color:rgba(255,255,255,.6)">‹ My vessels</button>
          <div class="mm-mark">
            ${mmMark(22)}
            <div class="mm-mark-words"><div class="mm-mark-name" style="font-size:13px">McCollam Marine</div></div>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;position:relative;z-index:1">
          <div style="min-width:0;flex:1">
            <div class="h-display" style="font-size:24px">${escapeHtml(v.name)}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:2px">${escapeHtml(v.type)} · SSR ${escapeHtml(v.ssr || '—')}</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px">
              <span class="cat-pill">${escapeHtml(v.category)}</span>
              <span class="cat-pill" style="background:rgba(30,64,175,.3)">Surveyor view</span>
            </div>
          </div>
          <div style="position:relative;width:60px;height:60px;flex-shrink:0">
            ${ringSvg(score, scoreColor(score), 60, true)}
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:white;letter-spacing:-.3px">${score}<span style="font-size:9px;font-weight:600;color:rgba(255,255,255,.6);margin-left:1px">%</span></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;position:relative;z-index:1">
          <button class="btn btn-sea btn-sm" style="flex:1" onclick="surveyorStartInspection()">▶ Start inspection</button>
          <button class="btn btn-sm" style="flex:1;background:rgba(255,255,255,.08);color:white;border:1px solid rgba(255,255,255,.12)" onclick="surveyorRaiseDeficiency()">+ Deficiency</button>
        </div>
      </div>

      ${defs.length ? `
        <div class="h-section-row"><div style="font-size:14px;font-weight:700;color:var(--red)">Open deficiencies · ${defs.length}</div></div>
        <div style="padding:0 16px">
          ${defs.map((d) => `
            <div class="ticket">
              <div class="ticket-stripe ${d.severity === 'critical' ? 'rd' : d.severity === 'major' ? 'am' : 'bl'}"></div>
              <div class="ticket-body">
                <div class="ticket-ic">${d.severity === 'critical' ? '🚨' : '⚠️'}</div>
                <div class="ticket-text">
                  <div class="ticket-name">${escapeHtml(d.title)}</div>
                  <div class="ticket-sub">${escapeHtml(d.severity)} · raised ${fmtDate(d.raised_at)}</div>
                </div>
              </div>
            </div>`).join('')}
        </div>` : ''}

      <div class="h-section">Certificates · ${certs.length}</div>
      <div style="padding:0 16px">${certs.map((c) => ticketHtml(c, 'cert')).join('') || '<div class="empty"><div class="empty-art">📋</div><div class="empty-h">No certificates</div></div>'}</div>

      <div class="h-section">Equipment register · ${equipment.length}</div>
      <div style="padding:0 16px">${equipment.map((e) => ticketHtml(e, 'equipment')).join('') || '<div class="empty"><div class="empty-art">🦺</div><div class="empty-h">No equipment logged</div></div>'}</div>

      <div class="h-section">Inspection history</div>
      <div class="card mx">
        ${inspections.length === 0 ? '<div class="empty" style="padding:20px"><div class="empty-h">No inspections yet</div></div>' : `
          <div class="tl" style="padding:14px 16px">
            ${inspections.map((i) => `
              <div class="tli"><div class="tl-dot ${i.status === 'signed' ? 'ok' : 'am'}">${i.status === 'signed' ? '✓' : ''}</div>
                <div>
                  <div class="tl-title">${escapeHtml(i.summary || (i.status === 'signed' ? 'Inspection — signed' : 'Inspection in progress'))}</div>
                  <div class="tl-date">${fmtDate(i.completed_at || i.started_at)}${i.status === 'signed' && me ? ' · ' + escapeHtml(me.surveyor && me.surveyor.company ? me.surveyor.company : me.name) : ''}</div>
                </div>
              </div>`).join('')}
          </div>`}
      </div>

      <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-out btn-full" onclick="exportInspectionPack()">📄 Export inspection pack PDF</button>
      </div>

      <div class="spacer"></div>`;
  }

  function surveyorStartInspection() {
    const v = Store.getVessel(activeVesselId);
    if (!v) return;
    const i = Store.startInspection(v.id);
    if (!i) return;
    activeInspectionId = i.id;
    go('s-surveyor-inspect');
  }
  window.surveyorStartInspection = surveyorStartInspection;

  function surveyorRaiseDeficiency() {
    const v = Store.getVessel(activeVesselId);
    if (!v) return;
    const title = prompt('Deficiency title:');
    if (!title) return;
    const sev = prompt('Severity — critical / major / minor:', 'major');
    Store.addDeficiency({ vessel_id: v.id, title, severity: (sev || 'major').toLowerCase(), source: 'surveyor' });
    renderSurveyorVessel();
  }
  window.surveyorRaiseDeficiency = surveyorRaiseDeficiency;

  // ---------- Surveyor inspection workflow ----------

  function renderSurveyorInspect() {
    const wrap = document.getElementById('sv-insp-scroll');
    if (!wrap) return;
    const v = Store.getVessel(activeVesselId);
    if (!v || !window.Codes) {
      wrap.innerHTML = '<div style="padding:24px">Pick a vessel first</div>';
      return;
    }
    const certs = window.Codes.requiredVesselCerts(v.category);
    const equipment = window.Codes.requiredEquipment(v.category, v);
    const crew = window.Codes.requiredCrewQuals(v.category);
    const totalChecks = certs.length + equipment.length + crew.length;

    if (!window._inspectionState) window._inspectionState = {};
    if (!window._inspectionState[activeInspectionId]) window._inspectionState[activeInspectionId] = {};
    const state = window._inspectionState[activeInspectionId];

    function progressCount() {
      return Object.values(state).filter((v) => v).length;
    }
    document.getElementById('sv-insp-progress').textContent = `${progressCount()}/${totalChecks}`;

    function checkRow(prefix, idx, label, sub) {
      const key = `${prefix}-${idx}`;
      const value = state[key];
      const colorClass = value === 'pass' ? 'ok' : value === 'fail' ? 'rd' : value === 'na' ? 'bl' : '';
      return `
        <div class="row" style="cursor:default">
          <div class="row-ic ${colorClass || ''}" style="${colorClass ? '' : 'background:rgba(0,0,0,.04)'}">${value === 'pass' ? '✓' : value === 'fail' ? '✗' : value === 'na' ? '—' : '○'}</div>
          <div class="row-body">
            <div class="row-name">${escapeHtml(label)}</div>
            <div class="row-sub">${escapeHtml(sub || '')}</div>
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn btn-xs btn-out" style="${value==='pass'?'background:var(--green);color:white;border-color:var(--green)':''}" onclick="setCheck('${key}','pass')">Pass</button>
            <button class="btn btn-xs btn-out" style="${value==='fail'?'background:var(--red);color:white;border-color:var(--red)':''}" onclick="setCheck('${key}','fail')">Fail</button>
            <button class="btn btn-xs btn-out" style="${value==='na'?'background:var(--sea);color:white;border-color:var(--sea)':''}" onclick="setCheck('${key}','na')">N/A</button>
          </div>
        </div>`;
    }

    wrap.innerHTML = `
      <div style="padding:14px 16px 4px">
        <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em">${escapeHtml(v.name)} · ${escapeHtml(v.category)}</div>
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-top:2px">Code-driven inspection</div>
        <div style="font-size:12px;color:var(--lt);margin-top:4px;line-height:1.6">Walk the vessel and confirm each required item.</div>
      </div>

      <div class="slbl">Vessel certificates (${certs.length})</div>
      <div class="card mx">${certs.map((c, i) => checkRow('cert', i, c.name, c.required ? 'Required' : 'Recommended')).join('')}</div>

      <div class="slbl">Safety equipment (${equipment.length})</div>
      <div class="card mx">${equipment.map((e, i) => checkRow('equip', i, e.name, `Min: ${e.qty_resolved || e.qty || 1}${e.note ? ' · ' + e.note : ''}`)).join('')}</div>

      <div class="slbl">Crew qualifications (${crew.length})</div>
      <div class="card mx">${crew.map((c, i) => checkRow('crew', i, `${c.role}: ${c.cert}`, c.mandatory ? 'Mandatory' : 'Recommended')).join('')}</div>

      <div style="padding:16px 16px 0;display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-sea btn-full" onclick="completeInspectionFlow()">✅ Complete &amp; sign inspection</button>
        <button class="btn btn-out btn-full" onclick="go('s-surveyor-vessel')">Save draft &amp; exit</button>
      </div>
      <div class="spacer"></div>`;
  }

  function setCheck(key, value) {
    if (!window._inspectionState) return;
    const insp = window._inspectionState[activeInspectionId] || {};
    insp[key] = value;
    window._inspectionState[activeInspectionId] = insp;
    renderSurveyorInspect();
  }
  window.setCheck = setCheck;

  function completeInspectionFlow() {
    const summary = prompt('Summary of inspection:', 'Annual renewal — passed') || '';
    Store.completeInspection(activeInspectionId, summary);
    alert('Inspection signed and saved.');
    go('s-surveyor-vessel');
  }
  window.completeInspectionFlow = completeInspectionFlow;

  // ---------- SMS hub & builder (full SMS document) ----------

  // SMS draft state — persisted in localStorage between sessions.
  // Shape: { vessel_id, sections: { [sectionId]: { [fieldId]: value } }, started_at, updated_at }
  const SMS_DRAFT_KEY = 'codedok-sms-draft-v1';

  function loadSmsDraft() {
    try {
      const raw = localStorage.getItem(SMS_DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveSmsDraft(draft) {
    draft.updated_at = new Date().toISOString();
    localStorage.setItem(SMS_DRAFT_KEY, JSON.stringify(draft));
  }
  function clearSmsDraft() { localStorage.removeItem(SMS_DRAFT_KEY); }

  function smsCompletionPct(draft) {
    if (!draft || !window.Codes) return 0;
    const schema = window.Codes.SMS_SCHEMA;
    let total = 0, done = 0;
    schema.forEach((sec) => {
      sec.fields.forEach((f) => {
        total++;
        const v = draft.sections && draft.sections[sec.id] && draft.sections[sec.id][f.id];
        if (v && String(v).trim().length > 0) done++;
      });
    });
    return total ? Math.round((done / total) * 100) : 0;
  }

  function renderSmsHub() {
    if (!window.Store || !window.Codes) return;
    const screen = document.getElementById('s-sms');
    if (!screen) return;
    const scroll = screen.querySelector('.scroll');
    if (!scroll) return;
    const docs = Store.snapshot().sms_documents;
    const draft = loadSmsDraft();
    const draftPct = smsCompletionPct(draft);

    if (!scroll.dataset.smsHidden) {
      scroll.querySelectorAll(':scope > .slbl, :scope > .card.mx, :scope > div').forEach((n) => { n.style.display = 'none'; });
      scroll.dataset.smsHidden = '1';
    }
    scroll.querySelectorAll('[data-dyn="sms"]').forEach((n) => n.remove());

    const html = `
      <div data-dyn="sms" style="padding:14px 16px 6px">
        <div class="hero" style="padding:18px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;position:relative;z-index:1">
            <div style="font-size:11px;font-weight:700;color:var(--seal);text-transform:uppercase;letter-spacing:.07em">Premium · MCA-aligned</div>
            <span style="background:var(--purp);color:white;font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px">£29 to generate · review billed by surveyor</span>
          </div>
          <div class="h-display" style="font-size:22px;margin-bottom:4px">Safety Management System</div>
          <div style="font-size:12px;color:rgba(255,255,255,.6);line-height:1.6;position:relative;z-index:1">A guided, 11-section SMS builder based on the Sport or Pleasure Vessel Code 2025 (Appendix 7) and Workboat Code Ed 3. Build it free, pay £29 to unlock Word + PDF, then send it to your surveyor for sign-off.</div>
        </div>
      </div>

      ${draft ? `
        <div data-dyn="sms" style="padding:0 16px;margin-bottom:12px">
          <div class="qa-tile" onclick="go('s-sms-builder')" style="border:2px solid var(--sea);background:var(--seap)">
            <div class="qa-icon bl">▶</div>
            <div style="flex:1">
              <div class="qa-title">Resume in-progress SMS</div>
              <div class="qa-sub">${draftPct}% complete · last edited ${fmtDate(draft.updated_at)}</div>
              <div class="prog" style="margin-top:6px"><div class="prog-fill bl" style="width:${draftPct}%"></div></div>
            </div>
            <span class="chev">›</span>
          </div>
        </div>` : ''}

      <div data-dyn="sms" class="h-section">Your SMS documents</div>
      <div data-dyn="sms" style="padding:0 16px 6px">
        ${docs.length === 0 && !draft ? `
          <div class="qa-tile" onclick="startNewSms()">
            <div class="qa-icon bl">+</div>
            <div style="flex:1"><div class="qa-title">Start a new SMS</div><div class="qa-sub">~30 minutes guided · saves as you go</div></div>
            <span class="chev">›</span>
          </div>` : docs.map((d) => `
          <div class="qa-tile" onclick="openSmsDoc('${d.id}')">
            <div class="qa-icon ${d.status === 'signed' ? 'ok' : d.status === 'review' ? 'pu' : 'bl'}">${d.status === 'signed' ? '✓' : d.status === 'review' ? '⏳' : '📝'}</div>
            <div style="flex:1"><div class="qa-title">${escapeHtml(d.title || 'SMS document')}</div><div class="qa-sub">v${d.version} · ${escapeHtml(d.status)}${d.built_by_codedok ? ' · Reviewed by CodedOK' : ''}</div></div>
            <span class="chev">›</span>
          </div>`).join('')}
      </div>

      <div data-dyn="sms" style="padding:14px 16px">
        <button class="btn btn-sea btn-full" onclick="startNewSms()">${draft ? '+ Start fresh SMS (discards current draft)' : '+ Start new SMS'}</button>
      </div>

      <div data-dyn="sms" class="h-section">What goes in an SMS</div>
      <div data-dyn="sms" style="padding:0 16px 12px">
        ${window.Codes.SMS_SCHEMA.map((s) => `
          <div class="qa-tile" style="cursor:default">
            <div class="qa-icon bl">${s.icon}</div>
            <div style="flex:1"><div class="qa-title">${escapeHtml(s.title)}</div><div class="qa-sub">${escapeHtml(s.blurb)}</div></div>
          </div>`).join('')}
      </div>
      <div data-dyn="sms" class="spacer"></div>`;

    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    while (tmp.firstChild) scroll.appendChild(tmp.firstChild);
  }

  function startNewSms() {
    const existing = loadSmsDraft();
    if (existing && !confirm('Start fresh? Your current SMS draft will be discarded.')) return;
    clearSmsDraft();
    smsActiveSection = 0;
    go('s-sms-builder');
  }
  window.startNewSms = startNewSms;

  function openSmsDoc(docId) {
    const d = Store.snapshot().sms_documents.find((x) => x.id === docId);
    if (!d) return;
    // For prototype: re-download the doc.
    downloadSmsAsWord(d.title || 'SMS', d.body || '');
  }
  window.openSmsDoc = openSmsDoc;

  let smsActiveSection = 0;

  function getOrInitDraft() {
    let d = loadSmsDraft();
    if (!d) {
      const v = Store.getVessel(activeVesselId) || Store.snapshot().vessels[0];
      d = {
        vessel_id: v ? v.id : null,
        sections: {},
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      // Pre-populate the meta section from the vessel's existing data.
      if (v) {
        d.sections.meta = {
          vessel_name: v.name,
          vessel_ssr: v.ssr || '',
          vessel_type: v.type || '',
          vessel_cat: v.category || '',
          company_name: 'McLaughlin Charters',
          sms_version: '1.0 (initial issue)',
          sms_review_date: new Date().toISOString().slice(0, 10)
        };
      }
      saveSmsDraft(d);
    }
    return d;
  }

  function renderSmsBuilder() {
    const wrap = document.getElementById('sms-builder-scroll');
    if (!wrap || !window.Codes) return;
    const schema = window.Codes.SMS_SCHEMA;
    const draft = getOrInitDraft();
    if (smsActiveSection < 0) smsActiveSection = 0;
    if (smsActiveSection >= schema.length) smsActiveSection = schema.length - 1;
    const sec = schema[smsActiveSection];
    const v = draft.vessel_id ? Store.getVessel(draft.vessel_id) : Store.snapshot().vessels[0];
    if (v && !draft.vessel_id) draft.vessel_id = v.id;

    // Resolve template defaults — substitute [VESSEL_NAME] etc.
    function resolveDefault(text) {
      if (!text) return '';
      return text
        .replace(/\[VESSEL_NAME\]/g, v ? v.name : 'the vessel')
        .replace(/\[CATEGORY\]/g, v ? v.category : '');
    }

    function valueFor(field) {
      const stored = (draft.sections[sec.id] || {})[field.id];
      if (stored != null && stored !== '') return stored;
      if (field.default) return resolveDefault(field.default);
      return '';
    }

    const pct = smsCompletionPct(draft);

    // Stepper dots
    const stepperHtml = `
      <div style="display:flex;gap:4px;margin-bottom:12px;align-items:center;overflow-x:auto;padding-bottom:4px">
        ${schema.map((s, i) => {
          const filled = (draft.sections[s.id] && Object.values(draft.sections[s.id]).some((v) => v && String(v).trim())) ? true : false;
          const active = i === smsActiveSection;
          const bg = active ? 'var(--sea)' : filled ? 'var(--green)' : 'var(--bdr)';
          const w = active ? '24px' : '8px';
          return `<div onclick="jumpSmsSection(${i})" style="height:6px;width:${w};border-radius:3px;background:${bg};cursor:pointer;transition:width .2s,background .2s;flex-shrink:0"></div>`;
        }).join('')}
      </div>`;

    const fieldsHtml = sec.fields.map((f) => {
      const val = valueFor(f);
      if (f.type === 'date') {
        return `
          <div class="fg">
            <label class="fl">${escapeHtml(f.label)}</label>
            <input class="fi" id="sms-${sec.id}-${f.id}" type="date" value="${escapeHtml(val)}">
          </div>
          <div class="divider"></div>`;
      }
      if (f.type === 'short') {
        return `
          <div class="fg">
            <label class="fl">${escapeHtml(f.label)}</label>
            <input class="fi" id="sms-${sec.id}-${f.id}" placeholder="${escapeHtml(f.placeholder || '')}" value="${escapeHtml(val)}">
          </div>
          <div class="divider"></div>`;
      }
      return `
        <div class="fg">
          <label class="fl" style="display:flex;align-items:center;justify-content:space-between">
            ${escapeHtml(f.label)}
            ${f.default ? `<span style="font-size:10px;font-weight:600;color:var(--sea);text-transform:none;letter-spacing:0;cursor:pointer" onclick="resetSmsField('${sec.id}','${f.id}')">↺ Reset to template</span>` : ''}
          </label>
          <textarea class="fta" id="sms-${sec.id}-${f.id}" placeholder="${escapeHtml(f.placeholder || '')}" style="min-height:120px">${escapeHtml(val)}</textarea>
        </div>
        <div class="divider"></div>`;
    }).join('');

    wrap.innerHTML = `
      <div style="padding:14px 16px 0">
        ${stepperHtml}
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px">
          <div style="min-width:0">
            <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em">Section ${smsActiveSection + 1} of ${schema.length} · ${escapeHtml(sec.ref)}</div>
            <div style="font-size:18px;font-weight:700;color:var(--text);margin-top:3px;letter-spacing:-.2px">${sec.icon} ${escapeHtml(sec.title)}</div>
          </div>
          <span class="chip chip-bl">${pct}% done</span>
        </div>
        <div style="font-size:12px;color:var(--mid);line-height:1.6;margin-bottom:12px">${escapeHtml(sec.blurb)}</div>
      </div>

      <div class="card mx">
        ${fieldsHtml.replace(/<div class="divider"><\/div>$/, '')}
      </div>

      <div style="padding:14px 16px 0;display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <button class="btn btn-out" onclick="navSms(-1)" ${smsActiveSection === 0 ? 'disabled style="opacity:.4"' : ''}>‹ Previous</button>
        ${smsActiveSection < schema.length - 1
          ? `<button class="btn btn-sea" onclick="navSms(1)">Save &amp; next →</button>`
          : `<button class="btn btn-sea" onclick="finishSms()">✓ Finish &amp; export</button>`}
      </div>
      <div style="padding:10px 16px 0">
        <button class="btn btn-sm btn-out btn-full" onclick="exitSmsBuilder()" style="font-size:12px;color:var(--lt);border:none">Save and exit</button>
      </div>
      <div class="spacer"></div>`;
  }

  function snapshotSectionFromDom() {
    if (!window.Codes) return;
    const schema = window.Codes.SMS_SCHEMA;
    const sec = schema[smsActiveSection];
    if (!sec) return;
    const draft = getOrInitDraft();
    if (!draft.sections[sec.id]) draft.sections[sec.id] = {};
    sec.fields.forEach((f) => {
      const el = document.getElementById(`sms-${sec.id}-${f.id}`);
      if (el) draft.sections[sec.id][f.id] = el.value;
    });
    saveSmsDraft(draft);
  }

  function navSms(delta) {
    snapshotSectionFromDom();
    smsActiveSection += delta;
    renderSmsBuilder();
    const sc = document.getElementById('sms-builder-scroll');
    if (sc) sc.scrollTop = 0;
  }
  window.navSms = navSms;

  function jumpSmsSection(idx) {
    snapshotSectionFromDom();
    smsActiveSection = idx;
    renderSmsBuilder();
    const sc = document.getElementById('sms-builder-scroll');
    if (sc) sc.scrollTop = 0;
  }
  window.jumpSmsSection = jumpSmsSection;

  function exitSmsBuilder() {
    snapshotSectionFromDom();
    go('s-sms');
  }
  window.exitSmsBuilder = exitSmsBuilder;

  function resetSmsField(sectionId, fieldId) {
    if (!window.Codes) return;
    const sec = window.Codes.SMS_SCHEMA.find((s) => s.id === sectionId);
    const field = sec && sec.fields.find((f) => f.id === fieldId);
    if (!field) return;
    const draft = getOrInitDraft();
    const v = draft.vessel_id ? Store.getVessel(draft.vessel_id) : Store.snapshot().vessels[0];
    const text = (field.default || '').replace(/\[VESSEL_NAME\]/g, v ? v.name : 'the vessel').replace(/\[CATEGORY\]/g, v ? v.category : '');
    if (!draft.sections[sectionId]) draft.sections[sectionId] = {};
    draft.sections[sectionId][fieldId] = text;
    saveSmsDraft(draft);
    const el = document.getElementById(`sms-${sectionId}-${fieldId}`);
    if (el) el.value = text;
  }
  window.resetSmsField = resetSmsField;

  function finishSms() {
    snapshotSectionFromDom();
    const draft = loadSmsDraft();
    if (!draft) return;
    const v = draft.vessel_id ? Store.getVessel(draft.vessel_id) : Store.snapshot().vessels[0];
    const title = `Safety Management System — ${v ? v.name : 'Vessel'}`;
    const body = serializeSmsAsText(draft);

    // Save the document record
    const stored = Store.addSmsDocument({
      vessel_id: draft.vessel_id,
      type: 'full_sms',
      title,
      body,
      status: 'draft',
      built_by_codedok: false,
      version: 1
    });

    // Show finish screen — download + review options
    showSmsFinishSheet(stored, draft);
  }
  window.finishSms = finishSms;

  // The doc is "purchased" when the operator pays the small generation fee.
  // After purchase: download + send-to-surveyor unlocked.
  const SMS_GEN_FEE = 29;

  function showSmsFinishSheet(doc, draft) {
    const v = draft.vessel_id ? Store.getVessel(draft.vessel_id) : null;
    const wrap = document.getElementById('sms-builder-scroll');
    if (!wrap) return;
    const purchased = !!doc.paid_at;

    wrap.innerHTML = `
      <div style="padding:24px 20px;text-align:center">
        <div style="width:72px;height:72px;margin:0 auto 14px;border-radius:50%;background:linear-gradient(135deg,var(--grnp) 0%,rgba(22,163,74,.05) 100%);display:flex;align-items:center;justify-content:center;font-size:36px">✓</div>
        <div class="h-display" style="font-size:22px;color:var(--text);margin-bottom:6px">Your SMS is ready</div>
        <div style="font-size:13px;color:var(--lt);line-height:1.6;max-width:280px;margin:0 auto">${escapeHtml(v ? v.name : 'Your vessel')} · 11 sections completed · MCA-aligned</div>
      </div>

      ${!purchased ? `
        <div style="padding:0 16px 6px">
          <div style="background:white;border:1px solid var(--bdr);border-radius:14px;padding:14px;margin-bottom:14px">
            <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Quick downloads</div>
            <div class="qa-tile" onclick="downloadSmsAsWordFromDraft()" style="margin-bottom:6px">
              <div class="qa-icon bl">📄</div>
              <div style="flex:1"><div class="qa-title">Download my draft as Word</div><div class="qa-sub">Your answers, exported as a Word document</div></div>
              <span class="chev">›</span>
            </div>
            <div class="qa-tile" onclick="downloadSmsAsPdf()">
              <div class="qa-icon ok">🖨️</div>
              <div style="flex:1"><div class="qa-title">Print or save as PDF</div><div class="qa-sub">Branded cover + sign-off block</div></div>
              <span class="chev">›</span>
            </div>
          </div>

          <div class="hero" style="padding:18px;border-radius:14px;color:white">
            <div style="position:relative;z-index:1">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
                <span style="font-size:11px;font-weight:700;color:var(--seal);text-transform:uppercase;letter-spacing:.07em">Premium</span>
                <span style="background:linear-gradient(135deg,#7c3aed,#3b5fff);color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px">AI-written</span>
              </div>
              <div style="font-size:16px;font-weight:700;margin-bottom:4px">Submit to CodedOK for a polished SMS</div>
              <div style="font-size:12px;color:rgba(255,255,255,.7);line-height:1.6;margin-bottom:14px">We'll take your answers and produce a full, AI-written, MCA-aligned Safety Management System tailored to your vessel. You'll be able to edit it and send it to a surveyor for sign-off when it's back. Typical turnaround 5 working days.</div>
              <button class="btn btn-sea btn-full" onclick="submitSmsForAdminReview('${doc.id}')">📤 Submit for review</button>
              <div style="font-size:11px;color:rgba(255,255,255,.5);text-align:center;margin-top:10px">No payment in app yet — we'll be in touch with pricing when we receive your draft.</div>
            </div>
          </div>
        </div>` : `
        <div style="padding:0 16px 6px">
          <div style="background:var(--grnp);border:1px solid rgba(22,163,74,.2);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;margin-bottom:14px">
            <span style="font-size:18px">✓</span>
            <div style="font-size:12px;color:var(--mid);line-height:1.5">SMS unlocked. Download below or send to a surveyor for review and sign-off.</div>
          </div>

          <div class="qa-tile" onclick="downloadSmsAsWordFromDraft()">
            <div class="qa-icon bl">📄</div>
            <div style="flex:1"><div class="qa-title">Download as Word document</div><div class="qa-sub">Editable .doc — keep on board, print, or share</div></div>
            <span class="chev">›</span>
          </div>

          <div class="qa-tile" onclick="downloadSmsAsPdf()">
            <div class="qa-icon ok">🖨️</div>
            <div style="flex:1"><div class="qa-title">Print or save as PDF</div><div class="qa-sub">Opens print dialog with branded cover</div></div>
            <span class="chev">›</span>
          </div>
        </div>

        <div class="h-section">Send to a surveyor</div>
        <div style="padding:0 16px">
          <div style="background:var(--card);border:1px solid var(--bdr);border-radius:14px;padding:14px 16px">
            <div style="font-size:13px;color:var(--mid);line-height:1.55;margin-bottom:14px">Pick a surveyor and they'll receive your SMS, send back a quote (their fee, not ours), and sign it off when paid.</div>
            <div id="surveyor-picker">
              ${renderSurveyorPicker(doc.id, draft.vessel_id)}
            </div>
          </div>
        </div>`}

      <div style="padding:14px 16px 0">
        <button class="btn btn-out btn-full" onclick="clearSmsDraft();go('s-sms')">Done</button>
      </div>
      <div class="spacer"></div>`;
  }

  function renderSurveyorPicker(docId, vesselId) {
    // Existing surveyors that the org has invited / could invite.
    // For prototype: list known surveyor users + a free-text email invite.
    const surveyors = Store.snapshot().users.filter((u) => u.kind === 'surveyor');
    let html = '';
    surveyors.forEach((s) => {
      const company = s.surveyor && s.surveyor.company ? s.surveyor.company : s.name;
      const region = s.surveyor && s.surveyor.regions ? s.surveyor.regions.join(' · ') : '';
      html += `
        <div class="qa-tile" onclick="sendSmsToSurveyor('${docId}','${vesselId}','${s.id}')" style="margin-bottom:8px;cursor:pointer">
          <div class="qa-icon pu">🔍</div>
          <div style="flex:1;min-width:0">
            <div class="qa-title">${escapeHtml(company)}</div>
            <div class="qa-sub">${escapeHtml(region)}${s.surveyor && s.surveyor.qualifications ? ' · ' + escapeHtml(s.surveyor.qualifications[0] || '') : ''}</div>
          </div>
          <span class="chev">›</span>
        </div>`;
    });
    html += `
      <div style="border-top:1px solid var(--bdr);margin:6px 0 10px"></div>
      <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Or invite by email</div>
      <div style="display:flex;gap:8px">
        <input class="fi" id="invite-surveyor-email" type="email" placeholder="surveyor@example.com" style="flex:1;height:42px">
        <button class="btn btn-sm btn-sea" onclick="inviteSurveyorByEmail('${docId}','${vesselId}')">Invite</button>
      </div>`;
    return html;
  }

  // Submit to CodedOK admin queue (Joe). No payment yet.
  function submitSmsForAdminReview(docId) {
    const draft = loadSmsDraft();
    const sections = draft ? draft.sections : {};
    Store.updateSmsDocument(docId, {
      status: 'submitted',
      submitted_at: new Date().toISOString().slice(0, 10),
      submitted_by_user_id: 'u_jm',
      sections: sections   // preserve operator's section data on the doc itself
    });
    alert('Submitted to CodedOK. We\'ll be in touch within 5 working days with your polished SMS and pricing.');
    clearSmsDraft();
    go('s-sms');
  }
  window.submitSmsForAdminReview = submitSmsForAdminReview;

  function sendSmsToSurveyor(docId, vesselId, surveyorUserId) {
    const v = Store.getVessel(vesselId);
    const j = Store.createJob({
      vessel_id: vesselId,
      surveyor_user_id: surveyorUserId,
      type: 'sms_review',
      title: `SMS review — ${v ? v.name : 'Vessel'}`,
      description: 'Operator has built an SMS in CodedOK and asks for technical review and sign-off.',
      sms_doc_id: docId
    });
    // Also ensure the surveyor has a grant on this vessel so they can read it.
    const existing = Store.vesselGrants(vesselId).find((g) => g.surveyor_user_id === surveyorUserId);
    if (!existing) {
      Store.inviteSurveyor({ vessel_id: vesselId, surveyor_user_id: surveyorUserId, scopes: ['view','deficiency','inspect','issue_cert'] });
    }
    alert('Sent. The surveyor receives it in their Inbox and will reply with a quote.');
    clearSmsDraft();
    go('s-sms');
  }
  window.sendSmsToSurveyor = sendSmsToSurveyor;

  function inviteSurveyorByEmail(docId, vesselId) {
    const email = (document.getElementById('invite-surveyor-email') || {}).value || '';
    if (!email.includes('@')) { alert('Please enter a valid email.'); return; }
    alert(`Invite sent to ${email}. Once they accept, your SMS will be in their Inbox.`);
    // For prototype: also create the job against McCollam (the only seeded surveyor) so the demo flows.
    sendSmsToSurveyor(docId, vesselId, 'u_sv1');
  }
  window.inviteSurveyorByEmail = inviteSurveyorByEmail;
  window.downloadSmsAsWordFromDraft = function () {
    const draft = loadSmsDraft();
    if (!draft) return;
    const v = draft.vessel_id ? Store.getVessel(draft.vessel_id) : null;
    downloadSmsAsWord(`Safety Management System - ${v ? v.name : 'Vessel'}`, draft);
  };
  window.downloadSmsAsPdf = function () {
    const draft = loadSmsDraft();
    if (!draft) return;
    renderSmsPrintDoc(draft);
    setTimeout(() => window.print(), 80);
  };
  window.clearSmsDraft = clearSmsDraft;

  function sendSmsForReview(docId) {
    const draft = loadSmsDraft();
    if (!draft) return;
    showCheckoutSheet({
      title: 'McCollam Marine — SMS Review',
      price: '£195.00',
      lineItems: [
        ['SMS technical review (annotated)', '£165.00'],
        ['Signed sign-off PDF', 'included'],
        ['1 revision round', 'included'],
        ['VAT (20%)', '£30.00']
      ],
      onConfirm: () => {
        // Mark the doc as sent for review.
        const docs = Store.snapshot().sms_documents;
        const d = docs.find((x) => x.id === docId);
        if (d) {
          d.status = 'review';
          d.last_reviewed_at = null;
        }
        // Persist by saving via a no-op mutation
        Store.addSmsDocument({ vessel_id: draft.vessel_id, type: 'review_request', title: 'Review request sent', body: 'Sent to McCollam Marine', status: 'review', built_by_codedok: false, version: 1 });
        alert('Sent to McCollam Marine. They\'ll be in touch within 1 working day with confirmation and ETA.');
        clearSmsDraft();
        go('s-sms');
      }
    });
  }
  window.sendSmsForReview = sendSmsForReview;

  function showCheckoutSheet(opts) {
    // Create an inline modal for the prototype.
    const existing = document.getElementById('checkout-sheet');
    if (existing) existing.remove();
    const sheet = document.createElement('div');
    sheet.id = 'checkout-sheet';
    sheet.className = 'bdrop on';
    sheet.innerHTML = `
      <div class="sheet" style="padding-bottom:calc(var(--safe) + 14px)">
        <div class="sh-pull"></div>
        <div class="sh-head">
          <div class="sh-title">${escapeHtml(opts.title)}</div>
          <button class="sh-x" onclick="document.getElementById('checkout-sheet').remove()">×</button>
        </div>
        <div style="padding:0 20px 14px">
          <div style="background:var(--slate);border-radius:12px;padding:14px 16px">
            ${opts.lineItems.map(([label, price]) => `
              <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px">
                <span style="color:var(--mid)">${escapeHtml(label)}</span>
                <span style="font-weight:600;color:var(--text)">${escapeHtml(price)}</span>
              </div>`).join('')}
            <div style="height:1px;background:var(--bdr);margin:8px 0"></div>
            <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700">
              <span>Total</span>
              <span>${escapeHtml(opts.price)}</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:14px;padding:10px 12px;background:var(--seap);border-radius:10px">
            <span style="font-size:14px">🔒</span>
            <div style="font-size:11px;color:var(--mid);line-height:1.5">Mock checkout for prototype. Production will use Stripe Checkout — secure card entry, instant receipt, McCollam Marine paid out after sign-off delivered.</div>
          </div>
          <div style="margin-top:14px;display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-sea btn-full" id="checkout-confirm">Pay ${escapeHtml(opts.price)} (mock)</button>
            <button class="btn btn-out btn-full" onclick="document.getElementById('checkout-sheet').remove()">Cancel</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.remove(); });
    document.getElementById('checkout-confirm').addEventListener('click', () => {
      sheet.remove();
      if (typeof opts.onConfirm === 'function') opts.onConfirm();
    });
  }

  // ---------- SMS document export ----------

  function serializeSmsAsText(draft) {
    if (!window.Codes) return '';
    const v = draft.vessel_id ? Store.getVessel(draft.vessel_id) : null;
    let text = `Safety Management System\n${v ? v.name : 'Vessel'}\n\n`;
    window.Codes.SMS_SCHEMA.forEach((sec, i) => {
      text += `\n${i + 1}. ${sec.title}\n${'-'.repeat(sec.title.length + 4)}\n`;
      sec.fields.forEach((f) => {
        const val = (draft.sections[sec.id] || {})[f.id] || '';
        if (val) text += `\n${f.label}:\n${val}\n`;
      });
    });
    return text;
  }

  function downloadSmsAsWord(title, draftOrText) {
    if (!window.Codes) return;
    let sectionsHtml = '';
    let v = null;

    if (typeof draftOrText === 'string') {
      // Plain text fallback (legacy doc).
      sectionsHtml = `<pre style="font-family:'Times New Roman',serif">${escapeHtml(draftOrText)}</pre>`;
    } else {
      const draft = draftOrText;
      v = draft.vessel_id ? Store.getVessel(draft.vessel_id) : null;
      window.Codes.SMS_SCHEMA.forEach((sec, i) => {
        sectionsHtml += `<h2>${i + 1}. ${escapeHtml(sec.title)}</h2>`;
        sectionsHtml += `<p style="font-size:10pt;color:#475569;font-style:italic">${escapeHtml(sec.ref)}</p>`;
        sec.fields.forEach((f) => {
          const val = (draft.sections[sec.id] || {})[f.id] || '';
          if (val) {
            sectionsHtml += `<h3>${escapeHtml(f.label)}</h3>`;
            sectionsHtml += `<div style="white-space:pre-wrap;margin-bottom:12pt">${escapeHtml(val)}</div>`;
          }
        });
      });
    }

    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    const html = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml>
<![endif]-->
<style>
@page { size: A4; margin: 25mm 22mm; }
body { font-family: 'Times New Roman', Cambria, Georgia, serif; font-size: 11pt; line-height: 1.5; color: #0f172a; }
h1 { font-size: 22pt; font-weight: 700; color: #0a1628; margin: 0 0 6pt 0; letter-spacing: -.5pt; }
h2 { font-size: 14pt; font-weight: 700; color: #0a1628; margin: 18pt 0 6pt 0; border-bottom: 1pt solid #cbd5e1; padding-bottom: 3pt; page-break-after: avoid; }
h3 { font-size: 11pt; font-weight: 700; color: #1e3454; margin: 12pt 0 4pt 0; page-break-after: avoid; }
.cover { text-align: center; padding: 60pt 0 40pt; }
.cover-title { font-size: 30pt; font-weight: 700; color: #0a1628; letter-spacing: -1pt; margin-bottom: 10pt; }
.cover-vessel { font-size: 18pt; color: #1e3454; font-style: italic; margin-bottom: 30pt; }
.cover-meta { font-size: 11pt; color: #475569; }
.foot { font-size: 9pt; color: #94a3b8; text-align: center; margin-top: 30pt; padding-top: 12pt; border-top: 1pt solid #cbd5e1; }
.signoff { margin-top: 24pt; padding: 14pt; border: 1pt solid #cbd5e1; }
.signoff-row { display: flex; gap: 24pt; margin-top: 18pt; }
.signoff-cell { flex: 1; }
.signoff-line { border-bottom: 1pt solid #0a1628; height: 24pt; }
</style>
</head>
<body>

<div class="cover">
  <div class="cover-title">Safety Management System</div>
  <div class="cover-vessel">${escapeHtml(v ? v.name : 'Vessel')}</div>
  <div class="cover-meta">
    ${v ? `${escapeHtml(v.category || '')} · ${escapeHtml(v.type || '')}<br>SSR ${escapeHtml(v.ssr || '—')} · ${escapeHtml(v.port || '')}<br><br>` : ''}
    Issue date: ${escapeHtml(today)}<br>
    Generated by CodedOK · codedok.app
  </div>
</div>

<p style="font-size:10pt;color:#475569;font-style:italic;border-left:3pt solid #0891b2;padding:6pt 12pt;margin:18pt 0">
This Safety Management System is built on the requirements of the Sport or Pleasure Vessel Code 2025 (Appendix 7) and the Workboat Code Edition 3 (Appendix on Safety Management). It is the responsibility of the vessel owner/operator to ensure the SMS is implemented, maintained, and reviewed.
</p>

${sectionsHtml}

<div class="signoff">
  <h3 style="margin-top:0">Approval &amp; Sign-off</h3>
  <p>I confirm that this Safety Management System has been prepared in accordance with the relevant Code, that I have read and understood it, and that I will implement it on board ${v ? escapeHtml(v.name) : 'the vessel'}.</p>
  <div class="signoff-row">
    <div class="signoff-cell">
      <div class="signoff-line"></div>
      <div style="font-size:9pt;color:#475569">Signed (Owner/Operator)</div>
    </div>
    <div class="signoff-cell">
      <div class="signoff-line"></div>
      <div style="font-size:9pt;color:#475569">Date</div>
    </div>
  </div>
  <div class="signoff-row">
    <div class="signoff-cell">
      <div class="signoff-line"></div>
      <div style="font-size:9pt;color:#475569">Signed (Master)</div>
    </div>
    <div class="signoff-cell">
      <div class="signoff-line"></div>
      <div style="font-size:9pt;color:#475569">Date</div>
    </div>
  </div>
</div>

<div class="foot">
  Generated by CodedOK · ${escapeHtml(today)} · This SMS is the property of the vessel owner. Confidential.
</div>

</body>
</html>`;

    // Word reads HTML with the .doc extension and `application/msword` MIME.
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = title.replace(/[^a-z0-9\-_ ]/gi, '_');
    a.href = url;
    a.download = `${safe}.doc`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }

  function renderSmsPrintDoc(draft) {
    if (!window.Codes) return;
    const target = document.getElementById('print-pack');
    if (!target) return;
    const v = draft.vessel_id ? Store.getVessel(draft.vessel_id) : null;
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    let html = `
      <div class="pp-head">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M3,9 Q7,4 11,9 Q15,14 19,9" stroke="#0891b2" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M3,14 Q7,9 11,14 Q15,19 19,14" stroke="#0891b2" stroke-width="2.2" stroke-linecap="round" opacity="0.4"/>
            <circle cx="20" cy="18" r="5" fill="#16a34a"/>
            <path d="M17.5,18 L19.2,19.8 L23,15.5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
          <span style="font-size:12px;color:#94a3b8;font-weight:600;letter-spacing:.05em">CODEDOK</span>
        </div>
        <h1>Safety Management System</h1>
        <div class="pp-meta">${escapeHtml(v ? v.name : 'Vessel')} · ${escapeHtml(v ? v.category : '')} · Issued ${escapeHtml(today)}</div>
      </div>`;

    window.Codes.SMS_SCHEMA.forEach((sec, i) => {
      const data = draft.sections[sec.id] || {};
      const hasContent = sec.fields.some((f) => data[f.id]);
      if (!hasContent) return;
      html += `<div class="pp-section"><h2>${i + 1}. ${escapeHtml(sec.title)}</h2>`;
      html += `<div style="font-size:10px;color:#94a3b8;font-style:italic;margin-bottom:8px">${escapeHtml(sec.ref)}</div>`;
      sec.fields.forEach((f) => {
        const val = data[f.id] || '';
        if (val) {
          html += `<div style="margin-bottom:8px"><div style="font-size:10px;color:#475569;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">${escapeHtml(f.label)}</div>`;
          html += `<div style="white-space:pre-wrap;font-size:11px;line-height:1.5">${escapeHtml(val)}</div></div>`;
        }
      });
      html += `</div>`;
    });

    html += `
      <div class="pp-section" style="margin-top:18pt">
        <h2>Approval &amp; Sign-off</h2>
        <p style="font-size:11px">I confirm that this Safety Management System has been prepared in accordance with the relevant Code, and that I will implement it on board ${escapeHtml(v ? v.name : 'the vessel')}.</p>
        <table style="margin-top:14px"><tr>
          <td style="width:50%;border-bottom:1px solid #0a1628;height:30px"></td>
          <td style="width:50%;border-bottom:1px solid #0a1628;height:30px"></td>
        </tr><tr>
          <td><div style="font-size:9px;color:#475569">Signed (Owner/Operator)</div></td>
          <td><div style="font-size:9px;color:#475569">Date</div></td>
        </tr></table>
      </div>
      <div class="pp-foot">Generated by CodedOK · codedok.app · ${escapeHtml(today)}</div>`;
    target.innerHTML = html;
  }

  // ---------- Account ----------

  function renderAccount() {
    // Lightweight live update for the trial banner.
    const s = Store.snapshot();
    if (!s.user || !s.user.trialEndsAt) return;
    const days = Store.daysUntil(s.user.trialEndsAt);
    const bar = document.querySelector('#s-account [style*="width:35%"]');
    if (bar) bar.style.width = Math.max(5, Math.min(100, Math.round((14 - days) / 14 * 100))) + '%';
  }

  // ---------- Onboarding jurisdiction screen — wire codes-driven cert preview ----------

  function renderOnboardingJurisdiction() {
    if (!window.Codes) return;
    // After saving a vessel, show what certs/equipment will be required.
    const lastVessel = Store.snapshot().vessels[Store.snapshot().vessels.length - 1];
    if (!lastVessel) return;

    const screen = document.getElementById('s-onboard-jur');
    if (!screen) return;

    const required = Codes.requiredVesselCerts(lastVessel.category);
    const equipment = Codes.requiredEquipment(lastVessel.category, lastVessel);

    // Add a one-time preview block
    let preview = screen.querySelector('[data-dyn="codes-preview"]');
    if (!preview) {
      preview = document.createElement('div');
      preview.setAttribute('data-dyn', 'codes-preview');
      preview.style.cssText = 'padding:12px 16px 0';
      const scroll = screen.querySelector('.scroll');
      if (scroll) scroll.insertBefore(preview, scroll.firstChild);
    }

    preview.innerHTML = `
      <div style="background:var(--seap);border:1px solid rgba(8,145,178,.2);border-radius:12px;padding:14px 16px">
        <div style="font-size:12px;font-weight:700;color:var(--sea);margin-bottom:6px">📋 Based on your category — ${escapeHtml(lastVessel.category)}</div>
        <div style="font-size:11px;color:var(--mid);line-height:1.6;margin-bottom:8px">CodedOK will track these on your behalf:</div>
        <div style="font-size:11px;color:var(--mid);line-height:1.7">
          <strong>Certificates (${required.length}):</strong> ${required.slice(0, 5).map((c) => escapeHtml(c.name)).join(', ')}${required.length > 5 ? ', …' : ''}<br>
          <strong>Equipment (${equipment.length}):</strong> ${equipment.slice(0, 5).map((c) => escapeHtml(c.name)).join(', ')}${equipment.length > 5 ? ', …' : ''}
        </div>
      </div>`;
  }

  // ---------- Onboarding save ----------

  function saveOnboardVessel() {
    const name = (document.getElementById('onb-name') || {}).value;
    const type = (document.getElementById('onb-type') || {}).value;
    const cat = (document.getElementById('onb-cat') || {}).value;
    const ssr = (document.getElementById('onb-ssr') || {}).value;
    const port = (document.getElementById('onb-port') || {}).value;

    if (!name || !name.trim()) { go('s-onboard-jur'); return; }
    const catShort = (cat || '').match(/Category \d/);
    Store.addVessel({
      name: name.trim(),
      type: (type || '').replace(/\s*\(.*\)/, ''),
      category: catShort ? catShort[0].replace('Category', 'Cat') : 'Cat 2',
      ssr: (ssr || '').trim(),
      port: (port || '').trim(),
      icon: '⛵'
    });
    go('s-onboard-jur');
  }
  window.saveOnboardVessel = saveOnboardVessel;

  // ---------- Inspection pack PDF ----------

  function exportInspectionPack() {
    const v = Store.getVessel(activeVesselId) || Store.snapshot().vessels[0];
    if (!v) return;
    renderPrintPack(v.id);
    setTimeout(() => window.print(), 80);
  }
  window.exportInspectionPack = exportInspectionPack;

  function exportFleetInspectionPack() {
    const vessels = Store.snapshot().vessels;
    if (vessels.length === 0) return;
    renderPrintPack(null);
    setTimeout(() => window.print(), 80);
  }
  window.exportFleetInspectionPack = exportFleetInspectionPack;

  function renderPrintPack(vesselId) {
    const target = document.getElementById('print-pack');
    if (!target) return;
    const vessels = vesselId ? [Store.getVessel(vesselId)] : Store.snapshot().vessels;
    const operator = Store.snapshot().users.find((u) => u.kind === 'operator') || {};
    const surveyor = Store.snapshot().users.find((u) => u.kind === 'surveyor') || {};
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const issuedBySurveyor = Store.getMode() === 'surveyor';
    const org = (Store.snapshot().organizations || [])[0] || { name: 'McLaughlin Charters' };

    let html = `
      <div class="pp-head">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px">
          <div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M3,9 Q7,4 11,9 Q15,14 19,9" stroke="#0891b2" stroke-width="2.2" stroke-linecap="round"/>
                <path d="M3,14 Q7,9 11,14 Q15,19 19,14" stroke="#0891b2" stroke-width="2.2" stroke-linecap="round" opacity="0.4"/>
                <circle cx="20" cy="18" r="5" fill="#16a34a"/>
                <path d="M17.5,18 L19.2,19.8 L23,15.5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              </svg>
              <span style="font-size:12px;color:#94a3b8;font-weight:600;letter-spacing:.05em">CODEDOK</span>
            </div>
            <h1>${issuedBySurveyor ? 'Survey Report' : 'Inspection Pack'}</h1>
            <div class="pp-meta">Generated ${escapeHtml(today)}${issuedBySurveyor && surveyor ? ' by ' + escapeHtml(surveyor.surveyor && surveyor.surveyor.company ? surveyor.surveyor.company : surveyor.name) : ' · ' + escapeHtml(operator.name || '')}</div>
          </div>
          ${issuedBySurveyor ? `
            <div style="text-align:right;border-left:2px solid #0a1628;padding-left:14px">
              <div style="font-family:'Times New Roman',serif;font-size:18px;font-weight:700;color:#0a1628;letter-spacing:.5px">McCollam Marine</div>
              <div style="font-family:'Times New Roman',serif;font-size:9px;color:#475569;letter-spacing:.15em;text-transform:uppercase;margin-top:2px">Naval Architects · Marine Surveyors</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:6px">${escapeHtml((surveyor.surveyor && surveyor.surveyor.regions || []).join(' · '))}</div>
              ${surveyor.surveyor && surveyor.surveyor.phone ? `<div style="font-size:11px;color:#475569;margin-top:2px">${escapeHtml(surveyor.surveyor.phone)}</div>` : ''}
            </div>` : `
            <div style="text-align:right">
              <div style="font-size:11px;color:#94a3b8">Operator</div>
              <div style="font-size:13px;font-weight:700">${escapeHtml(org.name)}</div>
            </div>`}
        </div>
      </div>`;

    vessels.forEach((v) => {
      if (!v) return;
      const certs = Store.vesselCerts(v.id);
      const equipment = Store.vesselEquipment(v.id);
      const crew = Store.vesselCrew(v.id);
      const defs = Store.vesselDeficiencies(v.id, { openOnly: true });
      const score = Store.complianceScore(v.id);
      const ready = Store.isInspectionReady(v.id);
      const allCrewCerts = [];
      crew.forEach((p) => Store.snapshot().crewCerts.filter((cc) => cc.person_id === p.id).forEach((cc) => allCrewCerts.push({ person: p, cc })));

      html += `
        <div class="pp-section">
          <h2>${escapeHtml(v.name)} — Vessel particulars</h2>
          <table>
            <tr><th style="width:30%">Vessel name</th><td>${escapeHtml(v.name)}</td></tr>
            <tr><th>Type</th><td>${escapeHtml(v.type || '')}</td></tr>
            <tr><th>SSR / Official No.</th><td>${escapeHtml(v.ssr || '—')}</td></tr>
            <tr><th>Coding category</th><td>${escapeHtml(v.category || '')}</td></tr>
            <tr><th>Length</th><td>${v.length ? v.length + ' m' : '—'}</td></tr>
            <tr><th>Persons capacity</th><td>${v.persons || '—'}</td></tr>
            <tr><th>Port of registry</th><td>${escapeHtml(v.port || '—')}</td></tr>
            <tr><th>Certifying authority</th><td>${escapeHtml(v.certifier || '—')}</td></tr>
            <tr><th>Compliance score</th><td><span class="${ready ? 'pp-status-ok' : 'pp-status-bad'}">${score}% — ${ready ? 'Inspection-ready' : 'NOT inspection-ready'}</span></td></tr>
          </table>
        </div>`;

      if (defs.length > 0) {
        html += `
          <div class="pp-section">
            <div class="pp-banner-bad">
              <div style="font-weight:700;color:#dc2626;font-size:13px">⚠ ${defs.length} open deficiency${defs.length === 1 ? '' : 'ies'} — must be resolved before commercial operation</div>
            </div>
            <table>
              <tr><th style="width:60%">Deficiency</th><th>Severity</th><th>Raised</th></tr>
              ${defs.map((d) => `<tr><td>${escapeHtml(d.title)}</td><td><span class="pp-status-${d.severity === 'critical' ? 'bad' : 'warn'}">${escapeHtml(d.severity)}</span></td><td>${fmtDate(d.raised_at)}</td></tr>`).join('')}
            </table>
          </div>`;
      }

      const attachedCerts = certs.filter((c) => c.file);
      const attachedEquip = equipment.filter((e) => e.file);

      html += `
        <div class="pp-section">
          <h2>Vessel certificates (${certs.length})</h2>
          <table>
            <tr><th style="width:35%">Certificate</th><th>Issuer</th><th>Number</th><th>Expires</th><th>Status</th><th style="width:8%">File</th></tr>
            ${certs.map((c) => {
              const days = Store.daysUntil(c.expires_at);
              const cls = days === Infinity ? 'pp-status-ok' : days < 0 ? 'pp-status-bad' : days <= 30 ? 'pp-status-warn' : 'pp-status-ok';
              const label = days === Infinity ? 'No expiry' : days < 0 ? 'EXPIRED' : days <= 30 ? `${days}d` : 'Valid';
              const fileMark = c.file ? '<span style="color:#0891b2;font-weight:700">📎 Attached</span>' : '<span style="color:#94a3b8">—</span>';
              return `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.issuer || '—')}</td><td>${escapeHtml(c.number || '—')}</td><td>${fmtDate(c.expires_at)}</td><td><span class="${cls}">${label}</span></td><td>${fileMark}</td></tr>`;
            }).join('')}
          </table>
        </div>

        <div class="pp-section">
          <h2>Safety equipment register (${equipment.length})</h2>
          <table>
            <tr><th style="width:25%">Item</th><th>Make / Model</th><th>Qty</th><th>Last serviced</th><th>Next service</th><th>Status</th><th style="width:8%">File</th></tr>
            ${equipment.map((e) => {
              const days = Store.daysUntil(e.next_service_at);
              const cls = e.next_service_at == null ? 'pp-status-ok' : days < 0 ? 'pp-status-bad' : days <= 30 ? 'pp-status-warn' : 'pp-status-ok';
              const label = e.next_service_at == null ? '—' : days < 0 ? 'OVERDUE' : days <= 30 ? `${days}d` : 'OK';
              const fileMark = e.file ? '<span style="color:#0891b2;font-weight:700">📎 Attached</span>' : '<span style="color:#94a3b8">—</span>';
              return `<tr><td>${escapeHtml(e.name)}</td><td>${escapeHtml((e.make || '') + ' ' + (e.model || ''))}</td><td>${e.qty || 1}</td><td>${fmtDate(e.last_service_at)}</td><td>${fmtDate(e.next_service_at)}</td><td><span class="${cls}">${label}</span></td><td>${fileMark}</td></tr>`;
            }).join('')}
          </table>
        </div>

        ${(attachedCerts.length + attachedEquip.length) > 0 ? `
          <div class="pp-section">
            <h2>Supporting documents on file</h2>
            <table>
              <tr><th style="width:50%">Item</th><th>File</th><th>Size</th><th>Added</th></tr>
              ${attachedCerts.map((c) => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.file.name)}</td><td>${fmtBytes(c.file.size)}</td><td>${fmtDate(c.file.added_at)}</td></tr>`).join('')}
              ${attachedEquip.map((e) => `<tr><td>${escapeHtml(e.name)} (equipment)</td><td>${escapeHtml(e.file.name)}</td><td>${fmtBytes(e.file.size)}</td><td>${fmtDate(e.file.added_at)}</td></tr>`).join('')}
            </table>
            <div style="font-size:10px;color:#94a3b8;margin-top:6px;font-style:italic">Files are stored against the operator's CodedOK record. Surveyors with active grants can view them in-app.</div>
          </div>` : ''}

        <div class="pp-section">
          <h2>Crew &amp; qualifications</h2>
          <table>
            <tr><th style="width:25%">Person</th><th>Role</th><th>Certificate</th><th>Issuer</th><th>Expires</th></tr>
            ${crew.length === 0 ? '<tr><td colspan="5" style="color:#94a3b8;font-style:italic">No crew assigned</td></tr>' :
              allCrewCerts.map(({ person, cc }) => {
                const days = Store.daysUntil(cc.expires_at);
                const cls = days === Infinity ? 'pp-status-ok' : days < 0 ? 'pp-status-bad' : days <= 30 ? 'pp-status-warn' : 'pp-status-ok';
                const label = days === Infinity ? 'No expiry' : days < 0 ? 'EXPIRED' : `${fmtDate(cc.expires_at)}`;
                return `<tr><td>${escapeHtml(person.name)}</td><td>${escapeHtml(person.role)}</td><td>${escapeHtml(cc.name)}</td><td>${escapeHtml(cc.issuer || '—')}</td><td><span class="${cls}">${label}</span></td></tr>`;
              }).join('')}
          </table>
        </div>`;
    });

    if (issuedBySurveyor) {
      html += `
        <div class="pp-section" style="margin-top:24px">
          <h2>Surveyor sign-off</h2>
          <div style="display:flex;gap:32px;align-items:flex-end;margin-top:18px">
            <div style="flex:1">
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:24px">Surveyor signature</div>
              <div style="border-bottom:1px solid #0a1628;height:1px;margin-bottom:6px"></div>
              <div style="font-family:'Times New Roman',serif;font-size:13px;font-weight:700;color:#0a1628">${escapeHtml((surveyor.surveyor && surveyor.surveyor.company) || surveyor.name || '')}</div>
              <div style="font-size:10px;color:#475569">${escapeHtml((surveyor.surveyor && surveyor.surveyor.qualifications || []).join(' · '))}</div>
            </div>
            <div style="flex:1">
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:24px">Date</div>
              <div style="border-bottom:1px solid #0a1628;height:1px;margin-bottom:6px"></div>
              <div style="font-size:13px;font-weight:600">${escapeHtml(today)}</div>
            </div>
          </div>
        </div>`;
    }

    html += `
      <div class="pp-foot">
        Generated by CodedOK · codedok.app · This pack is a snapshot of the operator's record at the time of generation.
      </div>`;

    target.innerHTML = html;
  }

  // ---------- Demo data controls ----------

  function resetDemoData() {
    if (!confirm('Restore the demo data (Silver Sands & Cormorant)? This will wipe any vessels you added.')) return;
    Store.resetToSeed();
    const sv = document.getElementById('s-vessels');
    if (sv) {
      const scroll = sv.querySelector('.scroll');
      if (scroll) delete scroll.dataset.staticHidden;
    }
    const sms = document.getElementById('s-sms');
    if (sms) {
      const scroll = sms.querySelector('.scroll');
      if (scroll) delete scroll.dataset.smsHidden;
    }
    activeVesselId = null;
    renderHome();
    go('s-home');
  }
  window.resetDemoData = resetDemoData;

  function clearAllData() {
    if (!confirm('Clear all data? You will start with no vessels, no certificates, and no crew.')) return;
    Store.clearAll();
    const sv = document.getElementById('s-vessels');
    if (sv) {
      const scroll = sv.querySelector('.scroll');
      if (scroll) delete scroll.dataset.staticHidden;
    }
    activeVesselId = null;
    renderHome();
    go('s-home');
  }
  window.clearAllData = clearAllData;

  // ---------- Boot ----------

  // ---------- Auth / demo-mode wiring ----------
  // The prototype has no real backend. We mock auth via a localStorage key.
  // 'live'    -> user has signed in via the login page (email/Apple/Google)
  // 'demo'    -> user clicked "Try the live demo" — same data, demo badge shown
  // 'logged_out' -> show login screen on boot
  const SESSION_KEY = 'codedok-session-v1';

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  function renderDemoBadge() {
    const session = loadSession();
    let badge = document.getElementById('demo-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'demo-badge';
      badge.className = 'demo-badge';
      badge.title = 'Demo mode — tap to sign out';
      badge.addEventListener('click', signOut);
      document.body.appendChild(badge);
    }
    badge.textContent = '⌖ Demo mode · sign out';
    badge.style.display = (session && session.mode === 'demo') ? 'block' : 'none';
  }

  // Login form handlers
  function submitLoginEmail() {
    const email = (document.getElementById('login-email') || {}).value || '';
    if (!email.includes('@')) {
      const input = document.getElementById('login-email');
      if (input) {
        input.style.borderColor = '#ef4444';
        input.focus();
        setTimeout(() => { input.style.borderColor = ''; }, 1200);
      }
      return;
    }
    const lineEl = document.getElementById('login-sent-line');
    if (lineEl) lineEl.innerHTML = `We've sent a sign-in link to <strong style="color:white">${escapeHtml(email)}</strong>. The link expires in 15 minutes.`;
    document.getElementById('login-step-email').style.display = 'none';
    document.getElementById('login-step-sent').style.display = 'block';
  }
  window.submitLoginEmail = submitLoginEmail;

  function resetLoginStep() {
    document.getElementById('login-step-email').style.display = '';
    document.getElementById('login-step-sent').style.display = 'none';
  }
  window.resetLoginStep = resetLoginStep;

  // Admin emails route into the admin workspace; everything else → operator.
  function isAdminEmail(email) {
    if (!email) return false;
    const e = email.toLowerCase();
    return e === 'admin@codedok.com' || e === 'joe@codedok.com' || e.startsWith('admin@') || e.startsWith('joe+admin@');
  }

  function mockMagicLinkArrived() {
    const email = (document.getElementById('login-email') || {}).value || 'joseph@codedok.com';
    saveSession({ mode: 'live', email, signed_in_at: new Date().toISOString() });
    renderDemoBadge();
    if (isAdminEmail(email)) {
      enterAdminMode();
    } else {
      go('s-home');
    }
  }
  window.mockMagicLinkArrived = mockMagicLinkArrived;

  function mockOauthSignIn(provider) {
    saveSession({ mode: 'live', provider, signed_in_at: new Date().toISOString() });
    renderDemoBadge();
    go('s-home');
  }
  window.mockOauthSignIn = mockOauthSignIn;

  function enterDemo() {
    saveSession({ mode: 'demo', signed_in_at: new Date().toISOString() });
    renderDemoBadge();
    go('s-home');
  }
  window.enterDemo = enterDemo;

  function signOut() {
    if (!confirm('Sign out and return to the login screen?')) return;
    clearSession();
    renderDemoBadge();
    go('s-login');
  }
  window.signOut = signOut;

  document.addEventListener('DOMContentLoaded', () => {
    wireFileInputs();
    // Inject the icon into the login mark
    const mark = document.getElementById('login-mark');
    if (mark) mark.innerHTML = codedOkMark(38);

    renderDemoBadge();

    // Boot routing
    const session = loadSession();
    if (!session) {
      go('s-login');
      return;
    }
    if (Store.getMode() === 'surveyor') {
      applyDesktopSurveyor();
      go('s-surveyor-home');
    } else if (Store.getMode() === 'admin') {
      applyDesktopAdmin();
      go('s-admin-home');
    } else {
      go('s-home');
    }
  });
})();
