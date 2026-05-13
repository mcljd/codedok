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

  // ---------- Edit / delete vessel ----------
  function openEditVessel(vesselId) {
    const v = Store.getVessel(vesselId);
    if (!v) return;
    const existing = document.getElementById('vessel-edit-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'vessel-edit-modal';
    modal.className = 'bdrop on';
    modal.onclick = function (e) { if (e.target === modal) closeEditVessel(); };
    document.body.appendChild(modal);

    const categories = ['Cat 0', 'Cat 1', 'Cat 2', 'Cat 3', 'Cat 4', 'Cat 5', 'Cat 6', 'Workboat'];
    modal.innerHTML = `
      <div class="sheet" style="padding-bottom:calc(var(--safe) + 14px)">
        <div class="sh-pull"></div>
        <div class="sh-head">
          <div class="sh-title">Edit vessel</div>
          <button class="sh-x" onclick="closeEditVessel()">×</button>
        </div>
        <div style="padding:0 20px 14px;overflow-y:auto;max-height:70vh">
          <div class="fg"><label class="fl">Vessel name</label><input class="fi" id="ev-name" value="${escapeHtml(v.name || '')}"></div>
          <div class="fg"><label class="fl">Type</label><input class="fi" id="ev-type" value="${escapeHtml(v.type || '')}" placeholder="e.g. Open RIB charter"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="fg"><label class="fl">Category</label>
              <select class="fi" id="ev-cat">
                ${categories.map((c) => `<option value="${c}" ${c === v.category ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
            <div class="fg"><label class="fl">Persons</label><input class="fi" id="ev-persons" type="number" min="1" value="${v.persons || 12}"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="fg"><label class="fl">Length (m)</label><input class="fi" id="ev-length" type="number" step="0.1" value="${v.length || ''}"></div>
            <div class="fg"><label class="fl">SSR / reg.</label><input class="fi" id="ev-ssr" value="${escapeHtml(v.ssr || '')}"></div>
          </div>
          <div class="fg"><label class="fl">Home port</label><input class="fi" id="ev-port" value="${escapeHtml(v.port || '')}"></div>
          <div class="fg"><label class="fl">Make / model</label><input class="fi" id="ev-make" value="${escapeHtml(v.make || '')}" placeholder="e.g. Redbay Stormforce"></div>
          <div class="fg"><label class="fl">Engine</label><input class="fi" id="ev-engine" value="${escapeHtml(v.engine || '')}" placeholder="e.g. Suzuki 300hp 4-stroke"></div>
          <button class="btn btn-sea btn-full" onclick="submitEditVessel('${v.id}')" style="margin-top:8px">Save changes</button>
          <button class="btn btn-out btn-full" onclick="confirmDeleteVessel('${v.id}')" style="margin-top:8px;color:var(--red);border-color:rgba(220,38,38,.3)">🗑️ Delete vessel</button>
        </div>
      </div>`;
  }
  window.openEditVessel = openEditVessel;

  function closeEditVessel() {
    const modal = document.getElementById('vessel-edit-modal');
    if (modal) modal.remove();
  }
  window.closeEditVessel = closeEditVessel;

  function submitEditVessel(vesselId) {
    const patch = {
      name: (document.getElementById('ev-name') || {}).value || '',
      type: (document.getElementById('ev-type') || {}).value || '',
      category: (document.getElementById('ev-cat') || {}).value || '',
      persons: parseInt((document.getElementById('ev-persons') || {}).value || '12', 10),
      length: parseFloat((document.getElementById('ev-length') || {}).value || '0') || null,
      ssr: (document.getElementById('ev-ssr') || {}).value || '',
      port: (document.getElementById('ev-port') || {}).value || '',
      make: (document.getElementById('ev-make') || {}).value || '',
      engine: (document.getElementById('ev-engine') || {}).value || ''
    };
    if (!patch.name.trim()) { alert('Vessel name is required.'); return; }
    Store.updateVessel(vesselId, patch);
    closeEditVessel();
    renderHome();
    if (document.getElementById('s-vessels').classList.contains('on')) renderVesselsList();
    if (document.getElementById('s-vessel-detail').classList.contains('on')) renderVesselDetail();
  }
  window.submitEditVessel = submitEditVessel;

  function confirmDeleteVessel(vesselId) {
    const v = Store.getVessel(vesselId);
    if (!v) return;
    const ok = confirm(`Delete \"${v.name}\"?\n\nThis removes the vessel and all its certs, equipment, deficiencies, inspections, jobs, and invoices. Cannot be undone.`);
    if (!ok) return;
    Store.deleteVessel(vesselId);
    closeEditVessel();
    activeVesselId = null;
    go('s-vessels');
    renderHome();
  }
  window.confirmDeleteVessel = confirmDeleteVessel;

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

  // Three entry points to the same add-cert form:
  //   - openCertCamera:  opens the iOS camera (capture="environment")
  //   - openCertFilePicker: opens the Photos / Files picker (no capture)
  //   - openCertManual:  skips the file step entirely and jumps to the
  //                       form so the user can type details by hand.
  function openCertFilePicker(categoryHint) {
    const input = document.getElementById('cert-file-input');
    if (!input) return;
    input.value = '';
    input.dataset.hint = categoryHint || 'vessel';
    input.click();
  }
  window.openCertFilePicker = openCertFilePicker;

  function openCertCamera(categoryHint) {
    const input = document.getElementById('cert-camera-input');
    if (!input) return;
    input.value = '';
    input.dataset.hint = categoryHint || 'vessel';
    input.click();
  }
  window.openCertCamera = openCertCamera;

  function openCertManual(categoryHint) {
    pendingScan = {
      kind: 'cert',
      categoryHint: categoryHint || 'vessel',
      manual: true,
      file: null
    };
    go('s-scan-confirm');
  }
  window.openCertManual = openCertManual;

  function openEquipmentFilePicker() {
    const input = document.getElementById('eq-file-input');
    if (!input) return;
    input.value = '';
    input.click();
  }
  window.openEquipmentFilePicker = openEquipmentFilePicker;

  function openEquipmentCamera() {
    const input = document.getElementById('eq-camera-input');
    if (!input) return;
    input.value = '';
    input.click();
  }
  window.openEquipmentCamera = openEquipmentCamera;

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

  // Wire the hidden file inputs at boot. Camera vs file-picker variants
  // funnel into the same handler — the only difference is which native
  // sheet iOS opens.
  function wireFileInputs() {
    const cert = document.getElementById('cert-file-input');
    if (cert) cert.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) handleCertFilePicked(f, cert.dataset.hint);
    });
    const certCam = document.getElementById('cert-camera-input');
    if (certCam) certCam.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) handleCertFilePicked(f, certCam.dataset.hint);
    });
    const eq = document.getElementById('eq-file-input');
    if (eq) eq.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) handleEquipmentFilePicked(f);
    });
    const eqCam = document.getElementById('eq-camera-input');
    if (eqCam) eqCam.addEventListener('change', (e) => {
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

  // Generic surveyor brand block — uses the surveyor's uploaded logo from
  // user.surveyor.logo if set, otherwise an initials placeholder. Replaces
  // the old hardcoded McCollam Marine wordmark.
  function surveyorMark(size) {
    size = size || 28;
    const me = (window.Store && Store.getCurrentUser()) || {};
    const logo = me.surveyor && me.surveyor.logo;
    const company = (me.surveyor && me.surveyor.company) || me.name || 'Your business';
    if (logo) {
      return `<img class="sv-brand-logo" alt="${escapeHtml(company)} logo" src="${logo}" style="width:${size}px;height:${size}px;border-radius:6px;object-fit:contain;background:white;padding:2px;flex-shrink:0">`;
    }
    const initials = me.initials || company.split(/\s+/).map((p) => p[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || 'S';
    return `<div class="sv-brand-placeholder" style="width:${size}px;height:${size}px;border-radius:6px;background:rgba(255,255,255,.1);color:rgba(255,255,255,.8);display:flex;align-items:center;justify-content:center;font-size:${Math.max(10, Math.round(size * 0.4))}px;font-weight:700;flex-shrink:0;border:1px solid rgba(255,255,255,.12)">${escapeHtml(initials)}</div>`;
  }
  // Back-compat alias — legacy callers used mmMark.
  function mmMark(size) { return surveyorMark(size); }
  window.mmMark = mmMark;
  window.surveyorMark = surveyorMark;

  function surveyorCompanyName() {
    const me = (window.Store && Store.getCurrentUser()) || {};
    return (me.surveyor && me.surveyor.company) || me.name || 'Your business';
  }
  function surveyorTagline() {
    const me = (window.Store && Store.getCurrentUser()) || {};
    if (me.surveyor && me.surveyor.qualifications && me.surveyor.qualifications.length > 0) return me.surveyor.qualifications[0];
    if (me.surveyor && me.surveyor.regions && me.surveyor.regions.length > 0) return me.surveyor.regions[0];
    return 'Marine surveyor';
  }

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
      const itemIcon = item.cert.icon || '📋';
      if (item.days < 0) {
        return {
          sev: 'rd', icon: itemIcon,
          title: `${escapeHtml(item.cert.name)}${v}`,
          sub: `Expired ${Math.abs(item.days)} day${Math.abs(item.days) === 1 ? '' : 's'} ago`,
          btn: '<button class="btn btn-xs btn-red">Fix</button>'
        };
      }
      return {
        sev: 'am', icon: itemIcon,
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
    // Desktop surveyor experience lives at /web/ now. In the main /app,
    // surveyor mode always uses the standard mobile phone frame so the
    // mobile UI doesn't drift out of sync with what the operator sees.
    document.body.classList.remove('desktop-surveyor');
    refreshSurveyorSidebar();
  }

  function refreshSurveyorSidebar() {
    if (!Store) return;
    const me = Store.getCurrentUser();
    if (!me || me.kind !== 'surveyor') return;

    // Brand mark (inline)
    const markEl = document.getElementById('sv-sb-mark');
    if (markEl && typeof mmMark === 'function') {
      markEl.innerHTML = `${surveyorMark(28)}
        <div class="mm-mark-words">
          <div class="mm-mark-name">${escapeHtml(surveyorCompanyName())}</div>
          <div class="mm-mark-tag">${escapeHtml(surveyorTagline())}</div>
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
        <div class="h-display" style="font-size:24px">Your boats</div>
      `;
    }
    const av = document.getElementById('home-avatar');
    if (av && s.user) av.textContent = s.user.initials || '';

    // First-time experience: show a full-screen onboarding instead of the
    // normal home layout when there are no vessels. Sets a flag for the
    // section toggling below.
    const isFirstTime = s.vessels.length === 0;

    const statusEl = document.getElementById('home-status');
    if (statusEl) {
      // Convert the static container into a hero-styled element.
      statusEl.className = 'hero hero-home';
      statusEl.style.cssText = 'padding:18px 16px 16px';
      if (isFirstTime) {
        const firstName = (s.user && s.user.name) ? s.user.name.split(' ')[0] : 'there';
        statusEl.innerHTML = `
          <div class="hero-stars" aria-hidden="true"></div>
          <div style="position:relative;z-index:1;padding:6px 2px 2px">
            <div style="font-size:13px;font-weight:700;color:var(--seal);text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Welcome to CodedOK</div>
            <div style="font-size:22px;font-weight:800;color:white;letter-spacing:-.4px;line-height:1.15;margin-bottom:8px">Hi ${escapeHtml(firstName)} — let's set your boat up in 90 seconds.</div>
            <div style="font-size:13px;color:rgba(255,255,255,.65);line-height:1.55">Add one vessel. We'll suggest the certificates and gear you need based on your MCA category, and remind you before anything expires.</div>
          </div>`;
      } else {
        const fleetScore = Store.complianceScore();
        const counts = Store.urgencyCounts();
        const ready = counts.overdue === 0;
        const ringColor = scoreColor(fleetScore);
        const badgeHtml = ready
          ? `<span class="insp-pill rdy">✓ Ready for survey</span>`
          : `<span class="insp-pill notready pulse-rd">⚠ ${counts.overdue} urgent item${counts.overdue === 1 ? '' : 's'}</span>`;
        const headlineText = ready
          ? 'On course'
          : counts.overdue === 1 ? 'One item adrift' : `${counts.overdue} items adrift`;
        const subText = ready
          ? 'All certificates and gear current — keep an eye on the horizon.'
          : `Tackle the urgent items first, then we'll line up the rest for survey day.`;
        statusEl.innerHTML = `
          <div class="hero-stars" aria-hidden="true"></div>
          <div class="hero-top-row">
            <div class="hero-ring-wrap">
              ${ringSvg(fleetScore, ringColor, 124)}
              <div class="hero-ring-num">
                <span class="hero-ring-pct">${fleetScore}</span><span class="hero-ring-percent">%</span>
              </div>
            </div>
            <div class="hero-summary">
              <div class="hero-label">Fleet compliance</div>
              <div class="hero-headline">${escapeHtml(headlineText)}</div>
              <div class="hero-sub">${subText}</div>
              ${badgeHtml}
            </div>
          </div>
          <div class="home-tile-row" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:14px">
            <div class="tile tile-sm"><div class="tile-num rd">${counts.overdue}</div><div class="tile-lbl">Overdue</div></div>
            <div class="tile tile-sm"><div class="tile-num am">${counts.due30}</div><div class="tile-lbl">Due 30d</div></div>
            <div class="tile tile-sm"><div class="tile-num ok">${counts.valid}</div><div class="tile-lbl">Valid</div></div>
          </div>
          <button class="hero-cta" onclick="exportFleetInspectionPack()">
            <span class="hero-cta-ic">📄</span>
            <span class="hero-cta-lbl">Inspection pack</span>
            <span class="hero-cta-arrow">→</span>
          </button>`;
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

    // ---- PWA install + reminders nudge ----
    // Replaces the iOS-only banner with a cross-platform card:
    //   - Android / desktop Chrome: real Install button via beforeinstallprompt.
    //   - iOS Safari: manual "Share → Add to Home Screen" tip.
    //   - Hides automatically once installed, dismissed, or already standalone.
    // Also shows an "Enable reminders" button when push is supported and the
    // user hasn't subscribed yet (handled by ensurePushUi).
    (function () {
      const old = document.getElementById('home-pwa-install');
      if (old) old.remove();
      const dismissed = localStorage.getItem('codedok-pwa-installed-dismissed');
      const isStandalone = (window.navigator.standalone === true) || window.matchMedia('(display-mode: standalone)').matches;
      if (isStandalone || dismissed === '1') {
        // Skip the install card entirely once installed/dismissed, but the
        // reminders card still needs a host on home — render it on its own.
        ensurePushUi();
        return;
      }
      const ua = navigator.userAgent || '';
      const isIOS = /iPhone|iPad|iPod/.test(ua);
      const canPrompt = !!window.__codedokInstallEvent;
      const homeEl = document.getElementById('s-home');
      const scroll = homeEl && homeEl.querySelector('.scroll');
      if (!scroll) { ensurePushUi(); return; }
      const tip = isIOS
        ? `Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>. Removes Safari's bars, works fully offline, real app icon.`
        : `One tap to install. Removes the address bar, works offline, real app icon.`;
      const cta = canPrompt
        ? `<button class="btn btn-sea" onclick="installPwa()" style="height:36px;padding:0 14px;font-weight:700;font-size:12px">Install</button>`
        : ``;
      const banner = document.createElement('div');
      banner.id = 'home-pwa-install';
      banner.innerHTML = `
        <div style="padding:14px 16px 0">
          <div class="card" style="padding:12px 14px;display:flex;align-items:center;gap:12px;border-left:4px solid var(--sea)">
            <div style="font-size:22px;flex-shrink:0">📲</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;color:var(--text)">Add CodedOK to your home screen</div>
              <div style="font-size:11px;color:var(--mid);margin-top:2px;line-height:1.5">${tip}</div>
            </div>
            ${cta}
            <button onclick="dismissPwaInstall()" aria-label="Dismiss" style="background:none;border:none;color:var(--lt);font-size:18px;cursor:pointer;padding:4px 6px">×</button>
          </div>
        </div>`;
      scroll.insertBefore(banner, scroll.firstChild);
      ensurePushUi();
    })();

    // ---- First-time onboarding flow ----
    // When there are no vessels we hide the normal sections (Top 3 actions,
    // SMS card, My vessels) and show one clear 3-step guide instead. This
    // is the first 30 seconds for a fresh user — must read as obvious.
    const onbHostId = 'home-onboarding';
    let onbEl = document.getElementById(onbHostId);
    const sectionLabels = document.querySelectorAll('#s-home .scroll > .slbl');
    const homeActionsHost = document.getElementById('home-actions');
    const homeSmsHost = document.getElementById('home-sms-card');
    const homeVesselsHost = document.getElementById('home-vessels');
    if (isFirstTime) {
      if (!onbEl) {
        onbEl = document.createElement('div');
        onbEl.id = onbHostId;
        const scroll = document.querySelector('#s-home .scroll');
        if (scroll) scroll.insertBefore(onbEl, scroll.firstChild);
      }
      onbEl.innerHTML = `
        <div style="padding:16px">
          <div class="card" style="padding:18px;border-radius:16px;border-left:4px solid var(--sea)">
            <div style="font-size:11px;font-weight:700;color:var(--sea);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Step 1 of 3</div>
            <div style="font-size:18px;font-weight:800;color:var(--text);letter-spacing:-.3px;margin-bottom:6px">Add your boat</div>
            <div style="font-size:14px;color:var(--mid);line-height:1.55;margin-bottom:14px">Name, length, persons, MCA category. About 60 seconds. We'll auto-suggest every certificate and piece of gear you need.</div>
            <button class="btn btn-sea btn-full" onclick="go('s-onboard')" style="height:50px;font-weight:700">+ Add your first vessel →</button>
          </div>
          <div class="card" style="padding:18px;border-radius:16px;margin-top:12px;opacity:.55">
            <div style="font-size:11px;font-weight:700;color:var(--lt);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Step 2 of 3</div>
            <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px">Upload your last survey report</div>
            <div style="font-size:13px;color:var(--mid);line-height:1.55">Drop one PDF — CodedOK extracts every cert and piece of gear automatically. <strong>You'll do this after adding the vessel.</strong></div>
          </div>
          <div class="card" style="padding:18px;border-radius:16px;margin-top:12px;opacity:.55">
            <div style="font-size:11px;font-weight:700;color:var(--lt);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Step 3 of 3</div>
            <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px">One tap before survey day</div>
            <div style="font-size:13px;color:var(--mid);line-height:1.55">Tap the Inspection pack button. Get a signed PDF your surveyor opens on their iPad. Done.</div>
          </div>
        </div>`;
      sectionLabels.forEach((el) => { el.style.display = 'none'; });
      if (homeActionsHost) homeActionsHost.style.display = 'none';
      if (homeSmsHost) homeSmsHost.style.display = 'none';
      if (homeVesselsHost) homeVesselsHost.style.display = 'none';
    } else {
      if (onbEl) onbEl.remove();
      sectionLabels.forEach((el) => { el.style.display = ''; });
      if (homeActionsHost) homeActionsHost.style.display = '';
      if (homeSmsHost) homeSmsHost.style.display = '';
      if (homeVesselsHost) homeVesselsHost.style.display = '';
    }

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
          // Speed-dial: overdue items get a one-tap "Get a quote" button
          // that drops the operator into a pre-filled job request to the
          // preferred surveyor (McCollam). Closes the loop the app was
          // built to close — see action without leaving CodedOK.
          const isOverdue = (it.days != null && it.days < 0);
          const child = it.cert || it.equipment || it.crewCert;
          const vesselId = child && child.vessel_id;
          const itemLabel = child ? (child.name || child.label || '') : '';
          const quoteBtn = isOverdue
            ? `<button class="btn btn-sm btn-sea" style="height:36px;padding:0 12px;font-size:12px;font-weight:700;flex-shrink:0" onclick="event.stopPropagation(); quickQuoteForItem('${vesselId || ''}','${escapeHtml(itemLabel).replace(/'/g, '&#39;')}')">📞 Get a quote</button>`
            : '';
          return `
            <div class="qa-tile" onclick="${it.cert ? "go('s-vessel-detail')" : it.equipment ? "go('s-equipment-list')" : "go('s-crew')"}">
              <div class="qa-icon ${a.sev}">${a.icon}</div>
              <div style="flex:1;min-width:0">
                <div class="qa-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.title}</div>
                <div class="qa-sub">${a.sub}</div>
              </div>
              ${quoteBtn}
              ${quoteBtn ? '' : '<span class="chev">›</span>'}
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

    // Incident -> SMS update suggestion (set when a deficiency is raised).
    (function () {
      let raw = null;
      try { raw = localStorage.getItem('codedok-sms-update-suggested'); } catch (_) {}
      const homeEl = document.getElementById('s-home');
      const scroll = homeEl && homeEl.querySelector('.scroll');
      const old = document.getElementById('home-sms-update-banner');
      if (old) old.remove();
      if (!raw || !scroll) return;
      let payload;
      try { payload = JSON.parse(raw); } catch (_) { return; }
      if (!payload || !payload.sms_doc_id) return;
      const banner = document.createElement('div');
      banner.id = 'home-sms-update-banner';
      banner.innerHTML = `
        <div style="padding:14px 16px 0">
          <div class="card" style="padding:14px;border-left:4px solid var(--purp);cursor:pointer" onclick="openSmsDoc('${payload.sms_doc_id}')">
            <div style="display:flex;gap:12px;align-items:flex-start">
              <div style="font-size:22px">🔁</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:700;color:var(--text)">Update your SMS to prevent recurrence?</div>
                <div style="font-size:12px;color:var(--mid);margin-top:2px;line-height:1.55">A new deficiency was logged: <em>${escapeHtml(payload.incident || 'unspecified')}</em>. Add a control to the relevant SMS section so this doesn't happen again.</div>
                <div style="display:flex;gap:8px;margin-top:8px">
                  <button class="btn btn-sm btn-sea" style="height:32px;padding:0 12px;font-size:12px" onclick="event.stopPropagation(); openSmsDoc('${payload.sms_doc_id}')">Update SMS</button>
                  <button class="btn btn-sm btn-out" style="height:32px;padding:0 12px;font-size:12px" onclick="event.stopPropagation(); dismissSmsUpdateSuggestion()">Dismiss</button>
                </div>
              </div>
            </div>
          </div>
        </div>`;
      scroll.insertBefore(banner, scroll.firstChild);
    })();

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
          <div style="display:flex;align-items:center;gap:14px">
            <div style="width:48px;height:48px;border-radius:13px;background:${color === 'var(--green)' ? 'var(--grnp)' : color === 'var(--sea)' ? 'var(--seap)' : color === 'var(--amber)' ? 'var(--ampp)' : 'var(--purpp)'};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${icon}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:15px;font-weight:700;color:var(--text);line-height:1.25">Safety Management System</div>
              <div style="font-size:13px;color:var(--mid);margin-top:3px;line-height:1.4">${escapeHtml(line)}</div>
              <div style="font-size:13px;font-weight:700;color:var(--sea);margin-top:8px">${cta}</div>
            </div>
            <span class="chev" style="flex-shrink:0">›</span>
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
            ${v.photo
              ? `<div class="vcover-emoji vcover-photo" onclick="event.stopPropagation(); pickVesselPhoto('${v.id}')" title="Replace photo"><img alt="${escapeHtml(v.name)}" src="${escapeHtml(v.photo)}" onerror="this.parentNode.classList.remove('vcover-photo'); this.replaceWith(document.createTextNode('${v.icon || '⛵'}'))"></div>`
              : `<div class="vcover-emoji vcover-photo-empty" onclick="event.stopPropagation(); pickVesselPhoto('${v.id}')" title="Add photo">${v.icon || '⛵'}<span class="vcover-cam">📷</span></div>`}
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
              ${ready ? '<span class="insp-pill rdy">✓ Ready for survey</span>' : `<span class="insp-pill notready">⚠ Not ready</span>`}
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

    const smsStatusPill = smsState === 'active'
      ? '<span style="background:rgba(22,163,74,.18);color:#bbf7d0;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;letter-spacing:.02em">● Live</span>'
      : smsState === 'draft'
      ? '<span style="background:rgba(8,145,178,.22);color:#67e8f9;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;letter-spacing:.02em">● In progress</span>'
      : '<span style="background:rgba(124,58,237,.22);color:#c4b5fd;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;letter-spacing:.02em">Featured</span>';

    wrap.innerHTML = `
      <!-- Hero feature: SMS -->
      <div style="padding:16px 16px 4px">
        <div class="hero" style="padding:22px;border-radius:18px;cursor:pointer" onclick="go('s-sms')">
          <div style="position:relative;z-index:1">
            <div style="margin-bottom:14px">${smsStatusPill}</div>
            <div style="font-size:22px;font-weight:800;color:white;letter-spacing:-.5px;margin-bottom:6px;line-height:1.15">Safety Management System</div>
            <div style="font-size:14px;color:rgba(255,255,255,.65);line-height:1.5;margin-bottom:18px;max-width:300px">${escapeHtml(smsSub)}</div>
            <button class="btn btn-sea btn-sm" style="height:42px;font-size:14px;padding:0 18px;font-weight:700">${smsState === 'active' ? 'Open SMS →' : smsState === 'draft' ? 'Resume building →' : 'Start building →'}</button>
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
      if (list.length === 0) html += emptyState('📋', 'No vessel certificates yet', 'Coding cert, radio licence, stability book — snap, upload or type it in.');
      else list.forEach((c) => { html += ticketHtml(c, 'cert'); });
      html += `<div style="padding:6px 0 14px"><button class="btn btn-sea btn-full" onclick="go('s-scan')">+ Add certificate</button></div></div><div class="spacer"></div>`;
      return html;
    }

    if (tabId === 'cr-equipment') {
      const list = allEquipment.slice().sort((a, b) => Store.daysUntil(a.next_service_at) - Store.daysUntil(b.next_service_at));
      let html = '<div style="padding:14px 16px 4px">';
      if (list.length === 0) html += emptyState('🦺', 'No equipment logged', 'Liferaft, lifejackets, EPIRB, fire extinguishers — log each with its service date.');
      else list.forEach((e) => { html += ticketHtml(e, 'equipment'); });
      html += `<div style="padding:6px 0 14px"><button class="btn btn-sea btn-full" onclick="openCertManual('equipment')">+ Add equipment</button></div></div><div class="spacer"></div>`;
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
      if (list.length === 0) html += emptyState('🛡️', 'No insurance docs', 'PLI, P&I, hull insurance — keep your policy doc here so renewals never lapse.');
      else list.forEach((c) => { html += ticketHtml(c, 'cert'); });
      html += `<div style="padding:6px 0 14px"><button class="btn btn-sea btn-full" onclick="openCertManual('insurance')">+ Add insurance</button></div></div><div class="spacer"></div>`;
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
        ? '<span class="insp-pill rdy">✓ Ready for survey</span>'
        : '<span class="insp-pill notready pulse-rd">⚠ Not ready</span>';
      header.style.cssText = '';
      header.classList.add('hero');
      header.style.borderRadius = '0';
      header.style.padding = '12px 18px 18px';
      header.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <button class="back" onclick="go('s-vessels')" style="color:rgba(255,255,255,.6)">‹ Vessels</button>
          <button onclick="openEditVessel('${v.id}')" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.8);font-size:11px;font-weight:600;padding:6px 10px;border-radius:8px;cursor:pointer;font-family:var(--fn)">✎ Edit</button>
        </div>
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
    if (!pendingScan) {
      wrap.innerHTML = `
        <div class="empty">
          <div class="empty-art">📷</div>
          <div class="empty-h">Nothing to add yet</div>
          <div class="empty-sub">Choose one of the options on the previous screen.</div>
          <button class="btn btn-sea btn-sm" onclick="go('s-scan')">‹ Back</button>
        </div>`;
      return;
    }
    const isManual = !!pendingScan.manual;
    const f = pendingScan.file;
    const v = Store.getVessel(activeVesselId) || Store.snapshot().vessels[0];
    const isImage = f && f.type && f.type.startsWith('image/');
    const isPdf = f && f.type === 'application/pdf';
    const today = new Date().toISOString().slice(0, 10);

    // Best-guess defaults from filename (only useful when a file is present).
    const guessFromName = ((f && f.name) || '').toLowerCase();
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

    const filePreviewHtml = f ? `
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
      </div>` : `
      <div style="padding:14px 16px 0">
        <div style="background:var(--ampp);border:1px solid rgba(217,119,6,.15);border-radius:12px;padding:12px 14px;display:flex;gap:10px;align-items:flex-start">
          <span style="font-size:18px;flex-shrink:0">✎</span>
          <div style="font-size:12px;color:var(--mid);line-height:1.5">Manual entry — type the details by hand. You can attach a PDF or photo later from the record's detail screen.</div>
        </div>
      </div>`;

    wrap.innerHTML = `
      ${filePreviewHtml}

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
    if (!vesselId) {
      alert('Pick a vessel first.');
      return;
    }
    const category = (document.getElementById('sc-category') || {}).value || 'vessel';
    const issuer = (document.getElementById('sc-issuer') || {}).value || '';
    const number = (document.getElementById('sc-number') || {}).value || '';
    const issued_at = (document.getElementById('sc-issued') || {}).value || null;
    const expires_at = (document.getElementById('sc-expires') || {}).value || null;

    // Equipment lives in its own table — service date, qty, make/model.
    // The form is shared with certs so we map the cert-shaped fields over.
    if (category === 'equipment') {
      Store.addEquipment({
        vessel_id: vesselId,
        kind: defaultKind || 'other',
        name,
        icon: defaultIcon || '🔧',
        make: issuer || '',
        serial: number || '',
        installed_at: issued_at,
        next_service_at: expires_at,
        file: pendingScan.file || null
      });
    } else {
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
        file: pendingScan.file || null
      });
    }
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
          <div class="empty-sub">Switch to your surveyor workspace to see all vessels you've been granted, raise deficiencies, and sign inspections.</div>
          <button class="btn btn-sm btn-sea" onclick="enterSurveyorMode()">Enter surveyor mode</button>
        </div>`;
      return;
    }

    const inbox = Store.jobsForSurveyor(me.id, 'requested');
    const earnings = Store.surveyorEarnings(me.id);

    // Update bnav active state + inbox dot
    ['vessels','inbox','jobs','earn','account'].forEach((tab) => {
      const el = document.getElementById('sv-nav-' + tab);
      if (el) el.classList.remove('on');
    });
    const navMap = { vessels: 'sv-nav-vessels', inbox: 'sv-nav-inbox', jobs: 'sv-nav-jobs', earnings: 'sv-nav-earn', account: 'sv-nav-account' };
    const navEl = document.getElementById(navMap[surveyorTab]);
    if (navEl) navEl.classList.add('on');
    const dot = document.getElementById('sv-inbox-dot');
    if (dot) dot.style.display = inbox.length > 0 ? 'block' : 'none';

    // Update brand header — same on all tabs
    if (heroEl) {
      heroEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 16px;position:relative;z-index:1">
          <div class="mm-mark" onclick="setSurveyorTab('account')" style="cursor:pointer">
            ${surveyorMark(36)}
            <div class="mm-mark-words">
              <div class="mm-mark-name">${escapeHtml(surveyorCompanyName())}</div>
              <div class="mm-mark-tag">${escapeHtml(surveyorTagline())}</div>
            </div>
          </div>
          <button onclick="setSurveyorTab('account')" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.8);font-size:11px;font-weight:600;padding:6px 10px;border-radius:8px;cursor:pointer;font-family:var(--fn)">⚙ Account</button>
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

    // Desktop nudge — shown on wide viewports so a surveyor browsing on
    // a laptop can jump to the full workspace at /web/.
    const desktopBanner = window.innerWidth >= 1024 ? `
      <div style="padding:14px 16px 0">
        <div class="card" onclick="window.open('web/index.html', '_blank')" style="padding:12px 14px;display:flex;align-items:center;gap:12px;cursor:pointer;border-left:4px solid var(--sea)">
          <div style="font-size:22px">🖥️</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;color:var(--text)">Open the desktop workspace</div>
            <div style="font-size:11px;color:var(--lt);margin-top:1px">Full portfolio view, bigger cards, side-by-side filters.</div>
          </div>
          <span class="chev">›</span>
        </div>
      </div>` : '';

    // Tab content
    let tabHtml = '';
    if (surveyorTab === 'vessels')   tabHtml = renderSurveyorVesselsTab(me);
    else if (surveyorTab === 'inbox')   tabHtml = renderSurveyorInboxTab(me);
    else if (surveyorTab === 'jobs')    tabHtml = renderSurveyorJobsTab(me);
    else if (surveyorTab === 'earnings') tabHtml = renderSurveyorEarningsTab(me);
    else if (surveyorTab === 'account')  tabHtml = renderSurveyorAccountTab(me);
    wrap.innerHTML = desktopBanner + tabHtml;
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

  function renderSurveyorAccountTab(me) {
    const logo = me.surveyor && me.surveyor.logo;
    const company = (me.surveyor && me.surveyor.company) || me.name || '';
    const phone = (me.surveyor && me.surveyor.phone) || '';
    const email = me.email || '';
    const quals = (me.surveyor && me.surveyor.qualifications) || [];
    const regions = (me.surveyor && me.surveyor.regions) || [];

    const brandCard = logo
      ? `<div class="card" style="padding:14px;display:flex;align-items:center;gap:14px">
           <div style="width:64px;height:64px;border-radius:12px;background:white;border:1px solid var(--bdr);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
             <img alt="${escapeHtml(company)} logo" src="${logo}" style="max-width:100%;max-height:100%;object-fit:contain;padding:4px">
           </div>
           <div style="flex:1;min-width:0">
             <div style="font-size:14px;font-weight:700;color:var(--text)">Your company logo</div>
             <div style="font-size:12px;color:var(--lt);margin-top:2px;line-height:1.5">Appears on every quote, invoice &amp; survey report you send.</div>
           </div>
           <div style="display:flex;flex-direction:column;gap:6px">
             <button class="btn btn-sm btn-out" onclick="pickSurveyorLogo()" style="height:30px;padding:0 10px;font-size:12px">Replace</button>
             <button class="btn btn-sm btn-out" onclick="removeSurveyorLogo()" style="height:30px;padding:0 10px;font-size:12px;color:var(--red);border-color:rgba(220,38,38,.3)">Remove</button>
           </div>
         </div>`
      : `<div class="card" onclick="pickSurveyorLogo()" style="padding:18px;text-align:center;cursor:pointer;border:1.5px dashed var(--bdr);background:transparent">
           <div style="font-size:36px;margin-bottom:6px">📷</div>
           <div style="font-size:14px;font-weight:700;color:var(--text)">Upload your company logo</div>
           <div style="font-size:12px;color:var(--lt);margin-top:4px;line-height:1.5;max-width:280px;margin-left:auto;margin-right:auto">Appears on every quote, invoice &amp; survey report you send. PNG or SVG, under 1 MB.</div>
           <button class="btn btn-sm btn-sea" style="margin-top:12px;height:32px;padding:0 14px;font-size:12px">Choose file</button>
         </div>`;

    return `
      <input type="file" id="sv-logo-input" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="display:none" onchange="handleSurveyorLogoUpload(event)">

      <div class="slbl">Brand</div>
      <div style="padding:0 16px">${brandCard}</div>

      <div class="slbl">Business details</div>
      <div style="padding:0 16px">
        <div class="card">
          <div class="row" style="cursor:default">
            <div class="row-body">
              <div class="row-name">Company name</div>
              <div class="row-sub">${escapeHtml(company) || 'Not set'}</div>
            </div>
          </div>
          <div class="row" style="cursor:default">
            <div class="row-body">
              <div class="row-name">Email</div>
              <div class="row-sub">${escapeHtml(email) || 'Not set'}</div>
            </div>
          </div>
          <div class="row" style="cursor:default">
            <div class="row-body">
              <div class="row-name">Phone</div>
              <div class="row-sub">${escapeHtml(phone) || 'Not set'}</div>
            </div>
          </div>
        </div>
      </div>

      ${quals.length ? `
        <div class="slbl">Qualifications</div>
        <div style="padding:0 16px">
          <div class="card" style="padding:14px 16px">
            ${quals.map((q) => `<div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:13px;color:var(--mid)"><span style="color:var(--green)">✓</span><span>${escapeHtml(q)}</span></div>`).join('')}
          </div>
        </div>` : ''}

      ${regions.length ? `
        <div class="slbl">Regions covered</div>
        <div style="padding:0 16px">
          <div class="card" style="padding:14px 16px;display:flex;flex-wrap:wrap;gap:6px">
            ${regions.map((r) => `<span class="chip chip-bl">${escapeHtml(r)}</span>`).join('')}
          </div>
        </div>` : ''}

      <div class="slbl">Bulk-import a client</div>
      <div style="padding:0 16px">
        <div class="card">
          <div class="row" onclick="pickSurveyReport()">
            <div class="row-ic bl">📄</div>
            <div class="row-body">
              <div class="row-name">Import from survey report (PDF)</div>
              <div class="row-sub">Drop your own report PDF — creates the vessel, certs &amp; equipment in one go</div>
            </div>
            <span class="chev">›</span>
          </div>
        </div>
      </div>

      <div class="slbl">Desktop workspace</div>
      <div style="padding:0 16px">
        <div class="card">
          <div class="row" onclick="window.open('web/index.html', '_blank')">
            <div class="row-ic bl">🖥️</div>
            <div class="row-body">
              <div class="row-name">Open desktop workspace</div>
              <div class="row-sub">Bigger screen, portfolio grid, side-by-side filters</div>
            </div>
            <span class="chev">›</span>
          </div>
        </div>
      </div>

      <div class="slbl">Session</div>
      <div style="padding:0 16px">
        <div class="card">
          <div class="row" onclick="exitSurveyorMode()">
            <div class="row-ic">↩️</div>
            <div class="row-body">
              <div class="row-name">Exit surveyor mode</div>
              <div class="row-sub">Back to operator view</div>
            </div>
            <span class="chev">›</span>
          </div>
        </div>
      </div>

      <div class="spacer"></div>`;
  }

  // ---------- Vessel photo upload ----------
  let pendingVesselPhotoId = null;
  function pickVesselPhoto(vesselId) {
    pendingVesselPhotoId = vesselId;
    let input = document.getElementById('vessel-photo-input');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'vessel-photo-input';
      input.accept = 'image/png,image/jpeg,image/webp';
      input.style.display = 'none';
      input.addEventListener('change', handleVesselPhotoUpload);
      document.body.appendChild(input);
    }
    input.click();
  }
  window.pickVesselPhoto = pickVesselPhoto;

  function handleVesselPhotoUpload(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !pendingVesselPhotoId) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Vessel photo must be under 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      Store.setVesselPhoto(pendingVesselPhotoId, reader.result);
      pendingVesselPhotoId = null;
      renderHome();
      if (document.getElementById('s-vessels').classList.contains('on')) renderVesselsList();
      if (document.getElementById('s-vessel-detail').classList.contains('on')) renderVesselDetail();
    };
    reader.readAsDataURL(file);
  }

  function dismissPwaInstall() {
    try { localStorage.setItem('codedok-pwa-installed-dismissed', '1'); } catch (_) {}
    const el = document.getElementById('home-pwa-install');
    if (el) el.remove();
  }
  window.dismissPwaInstall = dismissPwaInstall;

  // ─────────────────────────────────────────────────────────────
  // PWA install via beforeinstallprompt (Android / Chrome / Edge).
  // The event is captured once, then replayed on user click. iOS
  // Safari never fires this — those users see the manual tip in
  // the banner instead.
  // ─────────────────────────────────────────────────────────────
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__codedokInstallEvent = e;
    // Re-render the home banner so the Install button appears.
    if (typeof renderHome === 'function' && document.getElementById('s-home')) {
      try { renderHome(); } catch (_) {}
    }
  });

  window.addEventListener('appinstalled', () => {
    window.__codedokInstallEvent = null;
    try { localStorage.setItem('codedok-pwa-installed-dismissed', '1'); } catch (_) {}
    const el = document.getElementById('home-pwa-install');
    if (el) el.remove();
  });

  async function installPwa() {
    const ev = window.__codedokInstallEvent;
    if (!ev) return;
    try {
      ev.prompt();
      const { outcome } = await ev.userChoice;
      if (outcome === 'accepted') {
        const el = document.getElementById('home-pwa-install');
        if (el) el.remove();
      }
    } catch (err) {
      console.warn('installPwa failed:', err);
    } finally {
      window.__codedokInstallEvent = null;
    }
  }
  window.installPwa = installPwa;

  // ─────────────────────────────────────────────────────────────
  // Web push reminders — opt-in flow.
  // VAPID public key is safe to ship in the client.
  // ─────────────────────────────────────────────────────────────
  const VAPID_PUBLIC_KEY = 'BESwTm9pizzS1pXWoABM-oQH2p0ZN6ZGWGc_IAmFgCn7-ZMnxCnQhGRgiIv039pVWtdlt2TrThY0K_9OXi2q6_Y';

  function pushSupported() {
    return 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
  }

  // Standard helper for VAPID base64url → Uint8Array.
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function ensurePushUi() {
    const host = document.querySelector('#s-home .scroll');
    if (!host) return;
    let card = document.getElementById('home-push-card');
    if (card) card.remove();

    if (!pushSupported()) return;
    if (Notification.permission === 'denied') return;
    if (localStorage.getItem('codedok-push-dismissed') === '1') return;

    // Demo mode has no real user_id to attach a subscription to — skip.
    const session = (function () { try { return JSON.parse(localStorage.getItem('codedok-session') || 'null'); } catch (_) { return null; } })();
    if (!session || session.mode === 'demo') return;
    if (!window.Supa || !window.Supa.ready) {
      // Supabase still loading — try again in a moment.
      setTimeout(ensurePushUi, 1500);
      return;
    }

    // Already subscribed on this device?
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) return;
    } catch (_) {}

    card = document.createElement('div');
    card.id = 'home-push-card';
    card.innerHTML = `
      <div style="padding:14px 16px 0">
        <div class="card" style="padding:12px 14px;display:flex;align-items:center;gap:12px;border-left:4px solid var(--sea)">
          <div style="font-size:22px;flex-shrink:0">🔔</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;color:var(--text)">Turn on expiry reminders</div>
            <div style="font-size:11px;color:var(--mid);margin-top:2px;line-height:1.5">A nudge 30 days and 7 days before any certificate, equipment service or crew qualification expires.</div>
          </div>
          <button class="btn btn-sea" onclick="enablePushReminders()" style="height:36px;padding:0 14px;font-weight:700;font-size:12px">Enable</button>
          <button onclick="dismissPushCard()" aria-label="Dismiss" style="background:none;border:none;color:var(--lt);font-size:18px;cursor:pointer;padding:4px 6px">×</button>
        </div>
      </div>`;
    const installCard = document.getElementById('home-pwa-install');
    if (installCard && installCard.nextSibling) {
      installCard.parentNode.insertBefore(card, installCard.nextSibling);
    } else {
      host.insertBefore(card, host.firstChild);
    }
  }
  window.ensurePushUi = ensurePushUi;

  function dismissPushCard() {
    try { localStorage.setItem('codedok-push-dismissed', '1'); } catch (_) {}
    const el = document.getElementById('home-push-card');
    if (el) el.remove();
  }
  window.dismissPushCard = dismissPushCard;

  async function enablePushReminders() {
    if (!pushSupported()) { alert('This browser doesn’t support push notifications.'); return; }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        if (perm === 'denied') alert('Notifications are blocked. Enable them in browser settings, then come back.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      const client = await window.Supa.getClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) throw new Error('Not signed in');

      // Map auth user → public users row.
      const { data: profile, error: profErr } = await client
        .from('users').select('id').eq('auth_user_id', user.id).maybeSingle();
      if (profErr) throw profErr;
      if (!profile) throw new Error('No user profile row yet');

      const json = sub.toJSON();
      const row = {
        id: 'ps_' + Math.random().toString(36).slice(2, 12),
        user_id: profile.id,
        endpoint: sub.endpoint,
        p256dh: json.keys && json.keys.p256dh,
        auth: json.keys && json.keys.auth,
        user_agent: navigator.userAgent || null
      };
      const { error: insErr } = await client
        .from('push_subscriptions')
        .upsert(row, { onConflict: 'endpoint' });
      if (insErr) throw insErr;

      const el = document.getElementById('home-push-card');
      if (el) el.remove();
      try { localStorage.setItem('codedok-push-dismissed', '1'); } catch (_) {}
      // Confirm with a local notification.
      reg.showNotification('Reminders on', {
        body: 'We’ll nudge you 30 and 7 days before anything expires.',
        icon: './icons/icon-180.png',
        tag: 'codedok-welcome'
      });
    } catch (err) {
      console.error('enablePushReminders failed:', err);
      alert('Could not enable reminders: ' + (err && err.message ? err.message : err));
    }
  }
  window.enablePushReminders = enablePushReminders;

  // ---------- Speed-dial: quick quote from an overdue item ----------
  // One-tap path from an overdue cert/equipment line to a job request
  // to the preferred surveyor. Pre-fills the vessel + the item title so
  // the operator doesn't have to retype anything.
  function quickQuoteForItem(vesselId, itemLabel) {
    if (!window.Store) return;
    const v = vesselId ? Store.getVessel(vesselId) : Store.snapshot().vessels[0];
    if (!v) { alert('Vessel not found. Open the item directly instead.'); return; }
    const surveyors = (Store.snapshot().users || []).filter((u) => u.kind === 'surveyor');
    const preferred = surveyors[0];
    if (!preferred) {
      alert('No surveyor on file yet. Add one under Account → Switch view → Surveyors.');
      return;
    }
    setActiveVessel(v.id);
    // Reuse the existing job-request flow. The job title is the overdue
    // item so the surveyor sees exactly what's being asked for.
    const job = Store.createJob({
      vessel_id: v.id,
      surveyor_user_id: preferred.id,
      type: 'other',
      title: itemLabel ? `Service / renew — ${itemLabel}` : 'Service request',
      description: itemLabel ? `${itemLabel} is overdue on ${v.name}. Please quote for the work.` : '',
      status: 'requested'
    });
    const surveyorName = (preferred.surveyor && preferred.surveyor.company) || preferred.name;
    alert(`Quote request sent to ${surveyorName}.\n\nThey'll be in touch with a price and the next available date.`);
    renderHome();
  }
  window.quickQuoteForItem = quickQuoteForItem;

  // ---------- Global search ----------
  // Search across vessels, certs, equipment, deficiencies, surveyors,
  // crew. Opens as a full-screen overlay from the home header. Results
  // are tap-to-jump.
  function openSearch() {
    const existing = document.getElementById('search-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'search-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:var(--page);display:flex;flex-direction:column;font-family:var(--fn)';
    overlay.innerHTML = `
      <div style="background:var(--card);border-bottom:1px solid var(--bdr);padding:14px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--lt)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="search-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Search vessels, certs, equipment…" style="flex:1;border:none;background:transparent;font-size:17px;font-family:var(--fn);color:var(--text);outline:none">
        <button onclick="closeSearch()" style="background:none;border:none;font-size:14px;color:var(--sea);font-weight:600;cursor:pointer">Cancel</button>
      </div>
      <div id="search-results" style="flex:1;overflow-y:auto;padding:8px 0"></div>`;
    document.body.appendChild(overlay);
    const input = document.getElementById('search-input');
    input.addEventListener('input', renderSearchResults);
    setTimeout(() => input.focus(), 50);
    renderSearchResults();
  }
  window.openSearch = openSearch;
  function closeSearch() {
    const o = document.getElementById('search-overlay');
    if (o) o.remove();
  }
  window.closeSearch = closeSearch;

  function renderSearchResults() {
    const out = document.getElementById('search-results');
    if (!out) return;
    const q = ((document.getElementById('search-input') || {}).value || '').trim().toLowerCase();
    if (!q) {
      out.innerHTML = `
        <div style="padding:32px 24px;text-align:center;color:var(--lt);font-size:13px;line-height:1.55">
          Try "Tsunami", "liferaft", "MMSI", "McCollam" — searches every vessel, certificate, equipment item, deficiency and surveyor.
        </div>`;
      return;
    }
    const s = Store.snapshot();
    const matches = [];
    (s.vessels || []).filter((v) => !v.deleted_at).forEach((v) => {
      const haystack = [v.name, v.type, v.category, v.port, v.ssr, v.make, v.engine, v.hull_number].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(q)) matches.push({ kind:'vessel', label:v.name, sub:`${v.type || ''}${v.port ? ' · ' + v.port : ''}`, icon:v.icon || '⛵', act:() => { setActiveVessel(v.id); go('s-vessel-detail'); } });
    });
    (s.certs || []).filter((c) => !c.deleted_at).forEach((c) => {
      const haystack = [c.name, c.issuer, c.number, c.kind, c.category].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(q)) {
        const v = (s.vessels || []).find((x) => x.id === c.vessel_id);
        matches.push({ kind:'cert', label:c.name, sub:`${v ? v.name + ' · ' : ''}${c.issuer || ''}${c.expires_at ? ' · expires ' + fmtDate(c.expires_at) : ''}`, icon:c.icon || '📋', act:() => { setActiveVessel(c.vessel_id); go('s-vessel-detail'); } });
      }
    });
    (s.equipment || []).filter((e) => !e.deleted_at).forEach((e) => {
      const haystack = [e.name, e.make, e.model, e.serial, e.kind].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(q)) {
        const v = (s.vessels || []).find((x) => x.id === e.vessel_id);
        matches.push({ kind:'equipment', label:e.name, sub:`${v ? v.name + ' · ' : ''}${e.make || ''}${e.next_service_at ? ' · next service ' + fmtDate(e.next_service_at) : ''}`, icon:e.icon || '🛠️', act:() => { setActiveVessel(e.vessel_id); go('s-equipment-list'); } });
      }
    });
    (s.deficiencies || []).filter((d) => d.status === 'open').forEach((d) => {
      const haystack = [d.title, d.description].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(q)) {
        const v = (s.vessels || []).find((x) => x.id === d.vessel_id);
        matches.push({ kind:'deficiency', label:d.title, sub:`${v ? v.name + ' · ' : ''}${d.severity}`, icon:'⚠️', act:() => { setActiveVessel(d.vessel_id); go('s-vessel-detail'); } });
      }
    });
    (s.users || []).filter((u) => u.kind === 'surveyor' || u.kind === 'builder').forEach((u) => {
      const haystack = [u.name, u.email, u.surveyor && u.surveyor.company, u.builder && u.builder.company].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(q)) {
        matches.push({ kind:'person', label:u.name, sub:`${u.kind === 'surveyor' ? 'Surveyor' : 'Boat builder'}${u.email ? ' · ' + u.email : ''}`, icon: u.kind === 'surveyor' ? '🛠️' : '🏗️', act:() => alert(`${u.name}\n${u.email || ''}`) });
      }
    });

    if (matches.length === 0) {
      out.innerHTML = `<div style="padding:32px 24px;text-align:center;color:var(--lt);font-size:14px">No matches for "${escapeHtml(q)}"</div>`;
      return;
    }

    // Group by kind for cleaner display.
    const groupOrder = ['vessel','cert','equipment','deficiency','person'];
    const groupLabels = { vessel:'Vessels', cert:'Certificates', equipment:'Equipment', deficiency:'Deficiencies', person:'People' };
    let html = '';
    groupOrder.forEach((g) => {
      const inGroup = matches.filter((m) => m.kind === g);
      if (inGroup.length === 0) return;
      html += `<div style="padding:14px 16px 8px;font-size:11px;font-weight:700;color:var(--lt);text-transform:uppercase;letter-spacing:.07em">${groupLabels[g]} · ${inGroup.length}</div>`;
      inGroup.slice(0, 20).forEach((m, i) => {
        const id = 'sr-' + g + '-' + i;
        html += `
          <div id="${id}" class="search-row" style="padding:14px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;border-bottom:1px solid var(--bdr);background:var(--card)">
            <div style="width:44px;height:44px;border-radius:11px;background:var(--slate);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${m.icon}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:15px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(m.label)}</div>
              <div style="font-size:13px;color:var(--mid);margin-top:2px">${escapeHtml(m.sub)}</div>
            </div>
            <span class="chev">›</span>
          </div>`;
        // Defer the click binding so the act closure resolves correctly.
        setTimeout(() => {
          const el = document.getElementById(id);
          if (el) el.onclick = () => { closeSearch(); m.act(); };
        }, 0);
      });
    });
    out.innerHTML = html;
  }

  // ---------- Help / first-run explainer ----------
  function openHelp() {
    const existing = document.getElementById('help-sheet');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'help-sheet';
    modal.className = 'bdrop on';
    modal.onclick = function (e) { if (e.target === modal) closeHelp(); };
    document.body.appendChild(modal);
    modal.innerHTML = `
      <div class="sheet" style="padding-bottom:calc(var(--safe) + 18px)">
        <div class="sh-pull"></div>
        <div class="sh-head">
          <div class="sh-title">How CodedOK works</div>
          <button class="sh-x" onclick="closeHelp()">×</button>
        </div>
        <div style="padding:0 22px 6px">
          <div style="display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--bdr)">
            <div style="font-size:30px;flex-shrink:0;width:48px;text-align:center">1️⃣</div>
            <div>
              <div style="font-size:16px;font-weight:700;color:var(--text)">Your boats &amp; their paperwork</div>
              <div style="font-size:14px;color:var(--mid);margin-top:3px;line-height:1.55">Add each boat once. We track every certificate and piece of safety gear and remind you before anything expires.</div>
            </div>
          </div>
          <div style="display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--bdr)">
            <div style="font-size:30px;flex-shrink:0;width:48px;text-align:center">2️⃣</div>
            <div>
              <div style="font-size:16px;font-weight:700;color:var(--text)">Upload your survey report</div>
              <div style="font-size:14px;color:var(--mid);margin-top:3px;line-height:1.55">Got a PDF from your surveyor? Upload it once and we fill in every cert and piece of gear automatically. Find it in <strong>Account → Import from survey report</strong>.</div>
            </div>
          </div>
          <div style="display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--bdr)">
            <div style="font-size:30px;flex-shrink:0;width:48px;text-align:center">3️⃣</div>
            <div>
              <div style="font-size:16px;font-weight:700;color:var(--text)">One tap before a survey</div>
              <div style="font-size:14px;color:var(--mid);margin-top:3px;line-height:1.55">Tap <strong>Inspection pack</strong> on the home screen. You get one PDF with every cert, ready to show the surveyor.</div>
            </div>
          </div>
          <div style="display:flex;gap:14px;align-items:flex-start;padding:14px 0">
            <div style="font-size:30px;flex-shrink:0;width:48px;text-align:center">4️⃣</div>
            <div>
              <div style="font-size:16px;font-weight:700;color:var(--text)">Stuck? Tap the surveyor</div>
              <div style="font-size:14px;color:var(--mid);margin-top:3px;line-height:1.55">Book McCollam Marine right in the app for a quote, survey, or signed SMS. Pay through the app — no chasing invoices.</div>
            </div>
          </div>
          <button class="btn btn-sea btn-full" onclick="closeHelp()" style="margin-top:14px">Got it</button>
        </div>
      </div>`;
  }
  window.openHelp = openHelp;
  function closeHelp() {
    const m = document.getElementById('help-sheet');
    if (m) m.remove();
  }
  window.closeHelp = closeHelp;

  // ---------- Survey-report import ----------
  let importDraft = null;            // { vessel, certs, equipment, deficiencies }
  let importTargetVesselId = null;   // if set, items go onto this vessel; else we create one

  // ---------- Cert photo capture → Claude Vision → review → save ----------
  // Surveyor (or operator) taps a button, snaps a photo of one certificate,
  // the extract-cert edge function reads it with Claude vision and returns
  // structured fields. The review modal lets the user verify before save.

  let pendingCertVesselId = null;

  // Open the iOS camera by default — used by the operator's "Snap a cert"
  // button on vessel detail. Accepts image, PDF or DOCX.
  function pickCertPhoto(vesselId) {
    openCertPicker(vesselId, { camera: true });
  }
  window.pickCertPhoto = pickCertPhoto;

  // Open a file picker for PDF / DOCX / image. Used by the surveyor's
  // "Upload certificate" flow — most surveyor docs come as PDFs.
  function pickCertDocument(vesselId) {
    openCertPicker(vesselId, { camera: false });
  }
  window.pickCertDocument = pickCertDocument;

  function openCertPicker(vesselId, opts) {
    pendingCertVesselId = vesselId || null;
    // Two separate inputs so the camera flag doesn't stick on the
    // document-picker path.
    const id = (opts && opts.camera) ? 'cert-photo-input' : 'cert-doc-input';
    let input = document.getElementById(id);
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = id;
      input.accept = (opts && opts.camera)
        ? 'image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*';
      if (opts && opts.camera) input.capture = 'environment';
      input.style.display = 'none';
      input.addEventListener('change', handleCertPhotoUpload);
      document.body.appendChild(input);
    }
    input.click();
  }

  async function handleCertPhotoUpload(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('That file is too big (over 10 MB). Try compressing it or saving as a smaller PDF.');
      return;
    }
    if (!window.Supa || !window.Supa.ready) {
      alert("CodedOK isn't connected to the cloud yet. Reload, sign in, and try again.");
      return;
    }

    const kind = /pdf/i.test(file.type) ? 'PDF' : /word|officedocument/i.test(file.type) ? 'Word document' : 'photo';
    showCertSpinner(`Reading your ${kind}…`);
    try {
      const base64 = await readFileAsBase64(file);
      const { data, error } = await Supa.client.functions.invoke('extract-cert', {
        body: { image: base64, mimeType: file.type || 'image/jpeg' }
      });
      hideCertSpinner();
      if (error) throw new Error(error.message || 'extraction failed');
      if (!data || !data.extraction) throw new Error('No extraction returned');
      openCertReviewModal(data.extraction, pendingCertVesselId);
    } catch (err) {
      hideCertSpinner();
      console.error('cert extract failed', err);
      alert("Couldn't read that certificate: " + (err.message || err) + "\n\nYou can still add it manually under + Add cert.");
    }
  }
  window.handleCertPhotoUpload = handleCertPhotoUpload;

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function showCertSpinner(label) {
    hideCertSpinner();
    const el = document.createElement('div');
    el.id = 'cert-spinner';
    el.className = 'bdrop on';
    el.innerHTML = `
      <div class="sheet" style="padding:36px 24px;text-align:center">
        <div style="font-size:36px;margin-bottom:10px">📷</div>
        <div style="font-size:15px;font-weight:700">${escapeHtml(label)}</div>
        <div style="font-size:12px;color:var(--mid);margin-top:6px">Claude vision extracting fields — usually 3-6 seconds.</div>
      </div>`;
    document.body.appendChild(el);
  }
  function hideCertSpinner() {
    const el = document.getElementById('cert-spinner');
    if (el) el.remove();
  }

  function openCertReviewModal(ex, vesselId) {
    const existing = document.getElementById('cert-review-sheet');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'cert-review-sheet';
    modal.className = 'bdrop on';
    modal.onclick = function (e) { if (e.target === modal) closeCertReview(); };
    document.body.appendChild(modal);

    const v = vesselId ? Store.getVessel(vesselId) : null;
    const isEquip = ex.kind === 'equipment';
    const confColor = ex.confidence === 'high' ? 'var(--green)' : ex.confidence === 'medium' ? 'var(--amber)' : 'var(--red)';

    modal.innerHTML = `
      <div class="sheet" style="padding-bottom:calc(var(--safe) + 14px)">
        <div class="sh-pull"></div>
        <div class="sh-head">
          <div class="sh-title">Review extracted ${isEquip ? 'equipment' : 'certificate'}</div>
          <button class="sh-x" onclick="closeCertReview()">×</button>
        </div>
        <div style="padding:0 20px 14px;overflow-y:auto;max-height:72vh">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
            <div style="width:8px;height:8px;border-radius:50%;background:${confColor}"></div>
            <div style="font-size:12px;color:var(--mid)">Confidence: <strong style="color:${confColor}">${escapeHtml(ex.confidence || 'unknown')}</strong>${ex.notes ? ' · ' + escapeHtml(ex.notes) : ''}</div>
          </div>

          ${v ? `<div style="font-size:12px;color:var(--mid);margin-bottom:14px">Adding to <strong>${escapeHtml(v.name)}</strong></div>` : ''}

          <div class="fg"><label class="fl">Type</label><input class="fi" id="cer-name" value="${escapeHtml(ex.name || '')}"></div>
          <div class="fg"><label class="fl">Issuer</label><input class="fi" id="cer-issuer" value="${escapeHtml(ex.issuer || '')}"></div>
          <div class="fg"><label class="fl">Number / serial</label><input class="fi" id="cer-number" value="${escapeHtml(ex.number || '')}"></div>
          ${isEquip ? `
            <div class="fg"><label class="fl">Next service date</label><input class="fi" id="cer-next" type="date" value="${ex.next_service_at || ''}"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div class="fg"><label class="fl">Make</label><input class="fi" id="cer-make" value="${escapeHtml(ex.make || '')}"></div>
              <div class="fg"><label class="fl">Model</label><input class="fi" id="cer-model" value="${escapeHtml(ex.model || '')}"></div>
            </div>` : `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div class="fg"><label class="fl">Issued</label><input class="fi" id="cer-issued" type="date" value="${ex.issued_at || ''}"></div>
              <div class="fg"><label class="fl">Expires</label><input class="fi" id="cer-expires" type="date" value="${ex.expires_at || ''}"></div>
            </div>`}

          <button class="btn btn-sea btn-full" onclick="saveExtractedCert('${escapeHtml(isEquip ? 'equipment' : 'cert')}','${vesselId || ''}','${escapeHtml(ex.type_hint || '')}')" style="margin-top:10px">${isEquip ? 'Add to equipment' : 'Add to certificates'}</button>
          <button class="btn btn-out btn-full" onclick="closeCertReview()" style="margin-top:8px">Cancel</button>
        </div>
      </div>`;
  }
  window.openCertReviewModal = openCertReviewModal;

  function closeCertReview() {
    const m = document.getElementById('cert-review-sheet');
    if (m) m.remove();
    pendingCertVesselId = null;
  }
  window.closeCertReview = closeCertReview;

  function saveExtractedCert(kind, vesselId, typeHint) {
    const name = (document.getElementById('cer-name') || {}).value || '';
    const issuer = (document.getElementById('cer-issuer') || {}).value || '';
    const number = (document.getElementById('cer-number') || {}).value || '';
    if (!name) { alert('Type / name is required.'); return; }
    if (!vesselId) {
      const v = (Store.snapshot().vessels || [])[0];
      vesselId = v && v.id;
    }
    if (!vesselId) { alert('No vessel to add this to. Add a vessel first.'); return; }

    if (kind === 'equipment') {
      const next_service_at = (document.getElementById('cer-next') || {}).value || null;
      const make = (document.getElementById('cer-make') || {}).value || '';
      const model = (document.getElementById('cer-model') || {}).value || '';
      Store.addEquipment({
        vessel_id: vesselId, name, kind: typeHint || 'other',
        make, model, serial: number, next_service_at,
        icon: iconForType(typeHint)
      });
    } else {
      const issued_at = (document.getElementById('cer-issued') || {}).value || null;
      const expires_at = (document.getElementById('cer-expires') || {}).value || null;
      Store.addCert({
        vessel_id: vesselId, name, kind: typeHint || 'other',
        issuer, number, issued_at, expires_at,
        category: certCategoryForType(typeHint),
        icon: iconForType(typeHint)
      });
    }

    closeCertReview();
    alert(`${kind === 'equipment' ? 'Equipment' : 'Certificate'} added.`);
    renderHome();
    if (document.getElementById('s-vessel-detail').classList.contains('on')) renderVesselDetail();
  }
  window.saveExtractedCert = saveExtractedCert;

  function iconForType(t) {
    return ({ coding:'📋', liferaft:'🛟', pyrotechnics:'🧨', epirb:'📡', pli:'🛡️',
      p_and_i:'🛡️', radio:'📡', stability:'📋', lifejacket:'🦺', fire_ext:'🧯',
      first_aid:'🩹', vhf_fixed:'📻', anchor:'⚓', mmsi:'📡' })[t] || '📋';
  }
  function certCategoryForType(t) {
    if (!t) return 'vessel';
    if (['liferaft','pyrotechnics','epirb','lifejacket','fire_ext','first_aid','anchor'].includes(t)) return 'equipment';
    if (['pli','p_and_i'].includes(t)) return 'insurance';
    return 'vessel';
  }

  function pickSurveyReport(vesselId) {
    importTargetVesselId = vesselId || null;
    let input = document.getElementById('survey-report-input');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'survey-report-input';
      input.accept = 'application/pdf';
      input.style.display = 'none';
      input.addEventListener('change', handleSurveyReportUpload);
      document.body.appendChild(input);
    }
    input.click();
  }
  window.pickSurveyReport = pickSurveyReport;

  async function handleSurveyReportUpload(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('Survey report must be under 10 MB.');
      return;
    }
    if (!window.SurveyImport) {
      alert('Import parser not loaded. Reload the app and try again.');
      return;
    }
    showImportSpinner(`Parsing ${file.name}…`);
    try {
      const parsed = await window.SurveyImport.parseSurveyReport(file);
      importDraft = parsed;
      hideImportSpinner();
      openImportReview();
    } catch (err) {
      console.error('Import parse failed', err);
      hideImportSpinner();
      alert('Could not read that PDF. Try a different file or fill in the vessel manually.');
    }
  }
  window.handleSurveyReportUpload = handleSurveyReportUpload;

  function showImportSpinner(label) {
    hideImportSpinner();
    const el = document.createElement('div');
    el.id = 'import-spinner';
    el.className = 'bdrop on';
    el.innerHTML = `
      <div class="sheet" style="padding:32px 22px;text-align:center">
        <div style="font-size:36px;margin-bottom:10px">📄</div>
        <div style="font-size:15px;font-weight:700">${escapeHtml(label)}</div>
        <div style="font-size:12px;color:var(--lt);margin-top:6px">This usually takes 2–5 seconds.</div>
      </div>`;
    document.body.appendChild(el);
  }
  function hideImportSpinner() {
    const el = document.getElementById('import-spinner');
    if (el) el.remove();
  }

  function openImportReview() {
    const d = importDraft || { vessel: null, certs: [], equipment: [], deficiencies: [] };
    const existing = document.getElementById('import-review');
    if (existing) existing.remove();
    const total = (d.vessel ? 1 : 0) + d.certs.length + d.equipment.length + d.deficiencies.length;
    if (total === 0) {
      alert("Couldn't find anything I recognised in that PDF. Try a different survey report, or add the vessel manually.");
      return;
    }
    const modal = document.createElement('div');
    modal.id = 'import-review';
    modal.className = 'bdrop on';
    modal.onclick = function (e) { if (e.target === modal) closeImportReview(); };
    document.body.appendChild(modal);

    const targetVessel = importTargetVesselId ? Store.getVessel(importTargetVesselId) : null;

    let html = `
      <div class="sheet" style="padding-bottom:calc(var(--safe) + 14px)">
        <div class="sh-pull"></div>
        <div class="sh-head">
          <div class="sh-title">Review extracted items</div>
          <button class="sh-x" onclick="closeImportReview()">×</button>
        </div>
        <div style="padding:0 20px 14px;overflow-y:auto;max-height:72vh">
          <div style="font-size:12px;color:var(--lt);line-height:1.55;margin-bottom:12px">
            ${targetVessel
              ? `Items will be added to <strong>${escapeHtml(targetVessel.name)}</strong>.`
              : 'A new vessel will be created from the extracted particulars.'}
            Untick anything CodedOK got wrong before importing.
          </div>`;

    // VESSEL
    if (d.vessel && !targetVessel) {
      html += `
        <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin:6px 0 8px">Vessel</div>
        <div class="card" style="padding:12px 14px;margin-bottom:8px">
          <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
            <input type="checkbox" checked id="imp-v-on" style="margin-top:3px;width:18px;height:18px;accent-color:var(--sea)">
            <div style="flex:1;min-width:0">
              <input class="fi" id="imp-v-name" value="${escapeHtml(d.vessel.name || '')}" style="font-size:14px;font-weight:700;border:none;background:transparent;padding:0;margin-bottom:4px">
              <div style="font-size:11px;color:var(--lt)">
                ${escapeHtml(d.vessel.type || 'Vessel')}${d.vessel.category ? ' · ' + escapeHtml(d.vessel.category) : ''}${d.vessel.port ? ' · ' + escapeHtml(d.vessel.port) : ''}${d.vessel.length ? ' · ' + d.vessel.length + 'm' : ''}
              </div>
            </div>
          </label>
        </div>`;
    }

    // CERTS
    if (d.certs.length > 0) {
      html += `<div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin:12px 0 8px">Certificates · ${d.certs.length}</div>`;
      d.certs.forEach((c, i) => {
        html += `
          <div class="card" style="padding:10px 12px;margin-bottom:6px">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
              <input type="checkbox" checked id="imp-c-${i}" style="width:18px;height:18px;accent-color:var(--sea);flex-shrink:0">
              <div style="font-size:18px">${c.icon || '📋'}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:700;color:var(--text)">${escapeHtml(c.name)}</div>
                <div style="font-size:11px;color:var(--lt);margin-top:1px">${escapeHtml(c.issuer || 'Unknown issuer')}${c.number ? ' · ' + escapeHtml(c.number) : ''} · expires ${fmtDate(c.expires_at)}</div>
              </div>
            </label>
          </div>`;
      });
    }

    // EQUIPMENT
    if (d.equipment.length > 0) {
      html += `<div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin:12px 0 8px">Equipment · ${d.equipment.length}</div>`;
      d.equipment.forEach((eq, i) => {
        html += `
          <div class="card" style="padding:10px 12px;margin-bottom:6px">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
              <input type="checkbox" checked id="imp-e-${i}" style="width:18px;height:18px;accent-color:var(--sea);flex-shrink:0">
              <div style="font-size:18px">${eq.icon || '🛠️'}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:700;color:var(--text)">${escapeHtml(eq.name)}</div>
                <div style="font-size:11px;color:var(--lt);margin-top:1px">${escapeHtml(eq.issuer || 'Unknown maker')}${eq.number ? ' · ' + escapeHtml(eq.number) : ''} · next service ${fmtDate(eq.next_service_at)}</div>
              </div>
            </label>
          </div>`;
      });
    }

    // DEFICIENCIES
    if (d.deficiencies.length > 0) {
      html += `<div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin:12px 0 8px">Deficiencies · ${d.deficiencies.length}</div>`;
      d.deficiencies.forEach((df, i) => {
        html += `
          <div class="card" style="padding:10px 12px;margin-bottom:6px">
            <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
              <input type="checkbox" checked id="imp-d-${i}" style="margin-top:3px;width:18px;height:18px;accent-color:var(--sea);flex-shrink:0">
              <div style="font-size:18px">⚠️</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;color:var(--text);line-height:1.5">${escapeHtml(df.description)}</div>
              </div>
            </label>
          </div>`;
      });
    }

    html += `
          <button class="btn btn-sea btn-full" onclick="commitImport()" style="margin-top:14px">Import ${total} item${total === 1 ? '' : 's'}</button>
          <button class="btn btn-out btn-full" onclick="closeImportReview()" style="margin-top:8px">Cancel</button>
        </div>
      </div>`;
    modal.innerHTML = html;
  }
  window.openImportReview = openImportReview;

  function closeImportReview() {
    const m = document.getElementById('import-review');
    if (m) m.remove();
    importDraft = null;
    importTargetVesselId = null;
  }
  window.closeImportReview = closeImportReview;

  function commitImport() {
    const d = importDraft;
    if (!d) return;

    // 1) Resolve target vessel (existing or newly created).
    let targetId = importTargetVesselId;
    if (!targetId) {
      const vOn = document.getElementById('imp-v-on');
      if (vOn && vOn.checked && d.vessel) {
        const editedName = (document.getElementById('imp-v-name') || {}).value || d.vessel.name;
        const v = Store.addVessel({
          name: editedName,
          type: d.vessel.type || 'Vessel',
          category: d.vessel.category || 'Cat 2',
          ssr: d.vessel.ssr || '',
          length: d.vessel.length || null,
          persons: d.vessel.persons || 12,
          port: d.vessel.port || '',
          make: d.vessel.make || '',
          engine: d.vessel.engine || ''
        });
        targetId = v.id;
      }
    }
    if (!targetId) {
      alert('Pick a vessel to attach these items to, or tick the vessel row to create one.');
      return;
    }

    // 2) Bulk import certs / equipment / deficiencies.
    let imported = 0;
    d.certs.forEach((c, i) => {
      const cb = document.getElementById('imp-c-' + i);
      if (!cb || !cb.checked) return;
      Store.addCert({
        vessel_id: targetId,
        name: c.name,
        icon: c.icon,
        category: c.category,
        issuer: c.issuer,
        number: c.number,
        expires_at: c.expires_at
      });
      imported++;
    });
    d.equipment.forEach((eq, i) => {
      const cb = document.getElementById('imp-e-' + i);
      if (!cb || !cb.checked) return;
      Store.addEquipment({
        vessel_id: targetId,
        name: eq.name,
        icon: eq.icon,
        make: eq.issuer,
        serial: eq.number,
        next_service_at: eq.next_service_at
      });
      imported++;
    });
    d.deficiencies.forEach((df, i) => {
      const cb = document.getElementById('imp-d-' + i);
      if (!cb || !cb.checked) return;
      if (Store.addDeficiency) {
        Store.addDeficiency({ vessel_id: targetId, description: df.description, severity: 'medium' });
      }
      imported++;
    });

    closeImportReview();
    alert(`Imported ${imported} item${imported === 1 ? '' : 's'}.`);
    setActiveVessel(targetId);
    renderHome();
    if (document.getElementById('s-vessels').classList.contains('on')) renderVesselsList();
    if (document.getElementById('s-vessel-detail').classList.contains('on')) renderVesselDetail();
  }
  window.commitImport = commitImport;

  function pickSurveyorLogo() {
    const input = document.getElementById('sv-logo-input');
    if (input) input.click();
  }
  window.pickSurveyorLogo = pickSurveyorLogo;

  function removeSurveyorLogo() {
    if (!confirm('Remove your company logo?')) return;
    Store.setSurveyorLogo(null);
    renderSurveyorHome();
  }
  window.removeSurveyorLogo = removeSurveyorLogo;

  function handleSurveyorLogoUpload(e) {
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
      renderSurveyorHome();
    };
    reader.readAsDataURL(file);
  }
  window.handleSurveyorLogoUpload = handleSurveyorLogoUpload;

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
          <div class="mm-mark">${surveyorMark(22)}<div class="mm-mark-words"><div class="mm-mark-name" style="font-size:13px">${escapeHtml(surveyorCompanyName())}</div></div></div>
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

    const surveyorLogo = surveyor.surveyor && surveyor.surveyor.logo;
    const surveyorCompany = (surveyor.surveyor && surveyor.surveyor.company) || surveyor.name || 'Surveyor';
    wrap.innerHTML = `
      <div class="hero" style="border-radius:0;padding:14px 18px 18px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;position:relative;z-index:1">
          <button class="back" onclick="go('s-home')" style="color:rgba(255,255,255,.6)">‹ Home</button>
          <span class="cat-pill">Invoice</span>
        </div>
        <div style="position:relative;z-index:1;display:flex;align-items:center;gap:14px">
          ${surveyorLogo ? `<div class="invoice-logo"><img alt="${escapeHtml(surveyorCompany)} logo" src="${surveyorLogo}"></div>` : ''}
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:rgba(255,255,255,.5);font-weight:600;text-transform:uppercase;letter-spacing:.07em">${escapeHtml(inv.id)}</div>
            <div class="h-display" style="font-size:32px;margin-top:4px">£${inv.total}</div>
            <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:2px">From ${escapeHtml(surveyorCompany)}</div>
          </div>
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
            ${surveyorMark(22)}
            <div class="mm-mark-words"><div class="mm-mark-name" style="font-size:13px">${escapeHtml(surveyorCompanyName())}</div></div>
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
        <div style="display:flex;gap:8px;position:relative;z-index:1;flex-wrap:wrap">
          <button class="btn btn-sea btn-sm" style="flex:1;min-width:140px" onclick="surveyorStartInspection()">▶ Start inspection</button>
          <button class="btn btn-sm" style="flex:1;min-width:140px;background:rgba(255,255,255,.08);color:white;border:1px solid rgba(255,255,255,.12)" onclick="surveyorRaiseDeficiency()">+ Deficiency</button>
          <button class="btn btn-sm" style="flex:1;min-width:140px;background:rgba(255,255,255,.08);color:white;border:1px solid rgba(255,255,255,.12)" onclick="pickCertDocument('${v.id}')">📄 Upload cert</button>
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

      <div class="h-section-row" style="margin:18px 16px 8px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div class="h-section" style="margin:0">Certificates · ${certs.length}</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-out" onclick="pickCertPhoto('${v.id}')" style="height:36px;padding:0 12px;font-size:13px;font-weight:700">📷 Snap</button>
          <button class="btn btn-sm btn-out" onclick="pickCertDocument('${v.id}')" style="height:36px;padding:0 12px;font-size:13px;font-weight:700">📄 Upload</button>
        </div>
      </div>
      <div style="padding:0 16px">${certs.map((c) => ticketHtml(c, 'cert')).join('') || '<div class="empty"><div class="empty-art">📋</div><div class="empty-h">No certificates</div><div class="empty-sub">Tap <strong>📷 Snap</strong> to add from a phone photo, or <strong>📄 Upload</strong> a PDF / DOCX.</div></div>'}</div>

      <div class="h-section-row" style="margin:18px 16px 8px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div class="h-section" style="margin:0">Equipment register · ${equipment.length}</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-out" onclick="pickCertPhoto('${v.id}')" style="height:36px;padding:0 12px;font-size:13px;font-weight:700">📷 Snap</button>
          <button class="btn btn-sm btn-out" onclick="pickCertDocument('${v.id}')" style="height:36px;padding:0 12px;font-size:13px;font-weight:700">📄 Upload</button>
        </div>
      </div>
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
    // Incident -> SMS loop. If this vessel has an active SMS, prompt the
    // operator (next time they open the app) to update the SMS so the
    // same issue can't recur.
    maybePromptSmsUpdate(v.id, title);
  }
  window.surveyorRaiseDeficiency = surveyorRaiseDeficiency;

  // Suggest an SMS update after an incident or deficiency is logged. The
  // suggestion lives in localStorage until the operator acknowledges it.
  function dismissSmsUpdateSuggestion() {
    try { localStorage.removeItem('codedok-sms-update-suggested'); } catch (_) {}
    const el = document.getElementById('home-sms-update-banner');
    if (el) el.remove();
  }
  window.dismissSmsUpdateSuggestion = dismissSmsUpdateSuggestion;

  function maybePromptSmsUpdate(vesselId, incidentText) {
    const docs = (Store.snapshot().sms_documents || []).filter((d) => d.vessel_id === vesselId && (d.status === 'active' || d.status === 'signed'));
    if (docs.length === 0) return;
    try {
      localStorage.setItem('codedok-sms-update-suggested', JSON.stringify({
        vessel_id: vesselId,
        sms_doc_id: docs[0].id,
        incident: incidentText,
        at: new Date().toISOString()
      }));
    } catch (_) {}
  }
  window.maybePromptSmsUpdate = maybePromptSmsUpdate;

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
            <span style="background:var(--purp);color:white;font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px">£10 to generate · review billed by surveyor</span>
          </div>
          <div class="h-display" style="font-size:22px;margin-bottom:4px">Safety Management System</div>
          <div style="font-size:12px;color:rgba(255,255,255,.6);line-height:1.6;position:relative;z-index:1">A guided, 11-section SMS builder based on the Sport or Pleasure Vessel Code 2025 (Appendix 7) and Workboat Code Ed 3. Build it free, pay £10 to unlock Word + PDF, then send it to your surveyor for sign-off.</div>
        </div>
      </div>

      ${(function () {
        // Annual review banner — surfaces on the hub for any signed SMS
        // that's within 30 days of its review-due date.
        if (!docs || !Store.isSmsReviewDue) return '';
        const dueDoc = docs.find((d) => Store.isSmsReviewDue(d));
        if (!dueDoc) return '';
        const days = Store.smsReviewDays(dueDoc);
        const label = days != null && days < 0 ? `Overdue by ${Math.abs(days)} days` : `Due in ${days} days`;
        return `
        <div data-dyn="sms" style="padding:0 16px 8px">
          <div class="card" onclick="openSmsDoc('${dueDoc.id}')" style="padding:14px;cursor:pointer;border-left:4px solid var(--amber);background:var(--ampp)">
            <div style="display:flex;align-items:center;gap:14px">
              <div style="font-size:28px">📅</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:800;color:var(--text)">Annual SMS review ${label.toLowerCase()}</div>
                <div style="font-size:12px;color:var(--mid);margin-top:2px;line-height:1.5">5-minute walkthrough to confirm nothing has changed in your operation. Updates your SMS to v${(dueDoc.version || 1) + 1}.</div>
              </div>
              <span class="chev">›</span>
            </div>
          </div>
        </div>`;
      })()}

      <div data-dyn="sms" style="padding:0 16px 6px">
        <div class="card" onclick="openSmsAiWizard()" style="padding:16px;cursor:pointer;border-left:4px solid var(--purp);background:linear-gradient(135deg, rgba(124,58,237,.06), rgba(8,145,178,.06))">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="font-size:28px">✨</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:15px;font-weight:800;color:var(--text);letter-spacing:-.2px">Generate with AI — £10 one-off</div>
              <div style="font-size:12px;color:var(--mid);margin-top:3px;line-height:1.55">Answer 6 questions about your operation. We generate a tailored 11-section SMS, you edit and sign. McCollam Marine reviews if you want.</div>
            </div>
            <span class="chev">›</span>
          </div>
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

  let openSmsDocId = null;
  function openSmsDoc(docId) {
    const d = Store.snapshot().sms_documents.find((x) => x.id === docId);
    if (!d) return;
    openSmsDocId = docId;
    showSmsDocSheet(d);
  }
  window.openSmsDoc = openSmsDoc;

  function showSmsDocSheet(d) {
    const existing = document.getElementById('sms-doc-sheet');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'sms-doc-sheet';
    modal.className = 'bdrop on';
    modal.onclick = function (e) { if (e.target === modal) closeSmsDoc(); };
    document.body.appendChild(modal);

    const v = d.vessel_id ? Store.getVessel(d.vessel_id) : null;
    const crew = (Store.snapshot().crew || []).filter((c) => !v || (c.vessel_ids || []).includes(v.id));
    const acks = d.acknowledgements || [];
    const ackedIds = new Set(acks.map((a) => a.crew_id));
    const edits = (d.edit_log || []).slice(-5).reverse();
    const reviewDays = Store.smsReviewDays ? Store.smsReviewDays(d) : null;
    const reviewDue = Store.isSmsReviewDue ? Store.isSmsReviewDue(d) : false;
    const shareToken = d.share_token;
    const shareValid = shareToken && d.share_token_expires_at && new Date(d.share_token_expires_at).getTime() > Date.now();
    const shareUrl = shareToken ? `${window.location.origin}${window.location.pathname.replace(/[^\/]*$/, '')}#sms-view?t=${shareToken}` : '';

    modal.innerHTML = `
      <div class="sheet" style="padding-bottom:calc(var(--safe) + 14px);max-height:88vh">
        <div class="sh-pull"></div>
        <div class="sh-head">
          <div class="sh-title">${escapeHtml(d.title || 'Safety Management System')}</div>
          <button class="sh-x" onclick="closeSmsDoc()">×</button>
        </div>
        <div style="padding:0 20px 14px;overflow-y:auto;max-height:75vh">
          <div style="font-size:12px;color:var(--mid);margin-bottom:14px">
            v${d.version} · ${escapeHtml(d.status)}${d.signed_at ? ' · signed ' + fmtDate(d.signed_at) : ''}${v ? ' · ' + escapeHtml(v.name) : ''}
          </div>

          ${reviewDue ? `
            <div style="background:var(--ampp);border:1px solid rgba(217,119,6,.25);border-radius:12px;padding:14px;margin-bottom:14px;display:flex;gap:12px;align-items:flex-start">
              <div style="font-size:24px">📅</div>
              <div style="flex:1">
                <div style="font-size:14px;font-weight:700;color:var(--text)">${reviewDays != null && reviewDays < 0 ? 'Annual review overdue' : 'Annual review due'}</div>
                <div style="font-size:12px;color:var(--mid);margin-top:2px;line-height:1.5">${reviewDays != null && reviewDays < 0 ? `Overdue by ${Math.abs(reviewDays)} days` : `Due in ${reviewDays} days`}. Five questions to confirm nothing has changed in your operation.</div>
                <button class="btn btn-sm btn-sea" style="margin-top:10px" onclick="startSmsAnnualReview('${d.id}')">Start review</button>
              </div>
            </div>` : ''}

          <!-- 1. Share with surveyor -->
          <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Show to your surveyor</div>
          <div class="card" style="padding:14px;margin-bottom:14px">
            ${shareValid ? `
              <div style="font-size:12px;color:var(--mid);margin-bottom:8px;line-height:1.5">Read-only link · expires ${fmtDate(d.share_token_expires_at)}. Surveyor can open this on their iPad without an account.</div>
              <div style="background:var(--slate);padding:10px;border-radius:8px;font-family:monospace;font-size:11px;color:var(--text);word-break:break-all;margin-bottom:10px">${escapeHtml(shareUrl)}</div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-sm btn-sea" style="flex:1" onclick="copySmsShareLink('${escapeHtml(shareUrl)}')">📋 Copy link</button>
                <button class="btn btn-sm btn-out" onclick="rotateSmsShare('${d.id}')">Rotate</button>
              </div>` : `
              <div style="font-size:13px;color:var(--mid);margin-bottom:10px;line-height:1.5">Generate a read-only link your surveyor can open on their iPad — no login, expires in 7 days.</div>
              <button class="btn btn-sm btn-sea btn-full" onclick="rotateSmsShare('${d.id}')">🔗 Generate surveyor link</button>`}
          </div>

          <!-- 2. Crew acknowledgements -->
          <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Crew acknowledgements · ${acks.length}/${crew.length}</div>
          <div class="card" style="padding:6px 0;margin-bottom:14px">
            ${crew.length === 0 ? `
              <div style="padding:14px;font-size:13px;color:var(--mid)">No crew on file yet. Add crew under Vessel → Crew to track read-receipts.</div>` :
              crew.map((c) => {
                const acked = ackedIds.has(c.id);
                const ack = acks.find((a) => a.crew_id === c.id);
                return `
                  <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--bdr)">
                    <div style="width:34px;height:34px;border-radius:10px;background:${c.avatar_color || 'var(--seap)'};color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700">${escapeHtml((c.name || '?').split(' ').map((p) => p[0]).join('').slice(0,2).toUpperCase())}</div>
                    <div style="flex:1;min-width:0">
                      <div style="font-size:13px;font-weight:700;color:var(--text)">${escapeHtml(c.name)}</div>
                      <div style="font-size:11px;color:var(--lt)">${acked ? 'Signed ' + fmtDate(ack.at) : (c.role || 'Crew')}</div>
                    </div>
                    ${acked
                      ? `<button class="btn btn-sm btn-out" style="height:32px;padding:0 12px;font-size:12px" onclick="revokeCrewAck('${d.id}','${c.id}')">Revoke</button>`
                      : `<button class="btn btn-sm btn-sea" style="height:32px;padding:0 12px;font-size:12px" onclick="signCrewAck('${d.id}','${c.id}','${escapeHtml(c.name).replace(/'/g, '&#39;')}')">Sign</button>`}
                  </div>`;
              }).join('')}
          </div>

          <!-- 3. Audit trail -->
          <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Audit trail</div>
          <div class="card" style="padding:14px;margin-bottom:14px">
            ${edits.length === 0 ? `
              <div style="font-size:13px;color:var(--mid)">No edits logged yet. The next save will appear here.</div>` :
              edits.map((e) => `
                <div style="display:flex;gap:10px;padding:6px 0;font-size:12px;color:var(--mid);border-bottom:1px solid rgba(0,0,0,.04)">
                  <div style="flex-shrink:0;color:var(--lt);min-width:90px">${fmtDate(e.at)}</div>
                  <div style="flex:1"><strong style="color:var(--text)">${escapeHtml(e.by_name || 'Edited')}</strong>${e.note ? ' — ' + escapeHtml(e.note) : ''}${e.sections && e.sections.length ? ' · ' + escapeHtml(e.sections.join(', ')) : ''}</div>
                </div>`).join('')}
            ${d.signed_at && d.signed_by_user_id ? (function(){
              const surv = (Store.snapshot().users || []).find((u) => u.id === d.signed_by_user_id) || {};
              const surveyorName = (surv.surveyor && surv.surveyor.company) || surv.name || 'Surveyor';
              return `
                <div style="display:flex;gap:10px;padding:8px 0 0;margin-top:8px;border-top:1px solid var(--bdr);font-size:12px;color:var(--green)">
                  <div style="flex-shrink:0;min-width:90px">${fmtDate(d.signed_at)}</div>
                  <div style="flex:1">✓ Reviewed &amp; signed by <strong>${escapeHtml(surveyorName)}</strong></div>
                </div>`;
            })() : ''}
          </div>

          <button class="btn btn-out btn-full" onclick="downloadSmsAsWord('${escapeHtml(d.title || 'SMS').replace(/'/g, '&#39;')}', '${(d.body || '').replace(/'/g, '&#39;').replace(/\n/g, ' ')}')">📥 Download Word + PDF</button>
        </div>
      </div>`;
  }

  function closeSmsDoc() {
    const m = document.getElementById('sms-doc-sheet');
    if (m) m.remove();
    openSmsDocId = null;
  }
  window.closeSmsDoc = closeSmsDoc;

  // Surveyor read-only view — full-page, no login, no shell. Renders into
  // the entire body so it works on an iPad on the dock.
  function renderSmsPublicView(doc, token) {
    document.body.classList.add('sms-public');
    // Hide all the .shell screens — we own the whole page now.
    document.querySelectorAll('.shell').forEach((el) => { el.style.display = 'none'; });
    let host = document.getElementById('sms-public');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sms-public';
      document.body.appendChild(host);
    }
    if (!doc) {
      host.innerHTML = `
        <div style="max-width:560px;margin:80px auto;padding:36px;background:white;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.18);font-family:var(--fn);text-align:center">
          <div style="font-size:48px;margin-bottom:12px">🔒</div>
          <div style="font-size:22px;font-weight:800;color:var(--text);margin-bottom:6px">Link expired or invalid</div>
          <div style="font-size:14px;color:var(--mid);line-height:1.55">Ask the operator to generate a fresh surveyor link in the CodedOK app.</div>
        </div>`;
      return;
    }
    const v = doc.vessel_id ? Store.getVessel(doc.vessel_id) : null;
    const schema = (window.Codes && window.Codes.SMS_SCHEMA) || [];
    const surveyorRecord = doc.signed_by_user_id ? (Store.snapshot().users || []).find((u) => u.id === doc.signed_by_user_id) : null;
    const surveyorName = surveyorRecord ? ((surveyorRecord.surveyor && surveyorRecord.surveyor.company) || surveyorRecord.name || 'Surveyor') : null;

    function fill(text) {
      if (!text) return '';
      return text
        .replace(/\[VESSEL_NAME\]/g, v ? v.name : '')
        .replace(/\[CATEGORY\]/g, (v && v.category) || '');
    }
    function field(secId, fieldId, def) {
      const sec = (doc.sections || {})[secId] || {};
      const val = sec[fieldId];
      if (val != null && String(val).trim() !== '') return String(val);
      return def ? fill(def) : '';
    }

    const sectionsHtml = schema.map((sec, i) => {
      const fields = (sec.fields || []).map((f) => {
        const val = field(sec.id, f.id, f.default);
        if (!val) return '';
        return `
          <div style="margin-bottom:14px">
            <div style="font-size:11px;font-weight:700;color:var(--lt);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${escapeHtml(f.label)}</div>
            <div style="font-size:14px;color:var(--text);line-height:1.6;white-space:pre-wrap">${escapeHtml(val)}</div>
          </div>`;
      }).filter(Boolean).join('');
      return `
        <section style="background:white;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.05);padding:24px;margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <div style="font-size:11px;font-weight:700;color:var(--lt);text-transform:uppercase;letter-spacing:.06em">Section ${i + 1}</div>
            <div style="display:inline-flex;align-items:center;gap:6px;background:var(--seap);color:var(--sea);font-size:11px;font-weight:700;padding:4px 10px;border-radius:8px">📖 ${escapeHtml(sec.ref)}</div>
          </div>
          <h2 style="font-size:20px;font-weight:800;color:var(--text);letter-spacing:-.3px;margin-bottom:14px">${sec.icon} ${escapeHtml(sec.title)}</h2>
          ${fields || '<div style="font-size:13px;color:var(--lt);font-style:italic">Section not yet completed.</div>'}
        </section>`;
    }).join('');

    const acks = doc.acknowledgements || [];
    const edits = (doc.edit_log || []).slice(-10).reverse();

    host.innerHTML = `
      <div style="min-height:100vh;background:var(--page);font-family:var(--fn);padding:24px 16px 60px">
        <div style="max-width:760px;margin:0 auto">
          <div style="background:var(--ink);color:white;border-radius:18px;padding:28px 24px;margin-bottom:18px;background-image:radial-gradient(circle at 80% 0%, rgba(8,145,178,.22), transparent 60%)">
            <div style="font-size:11px;font-weight:700;color:var(--seal);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Safety Management System · read-only</div>
            <div style="font-size:26px;font-weight:800;letter-spacing:-.5px;line-height:1.15">${escapeHtml(v ? v.name : (doc.title || 'SMS'))}</div>
            <div style="font-size:14px;color:rgba(255,255,255,.65);margin-top:6px">v${doc.version}${doc.signed_at ? ' · signed ' + fmtDate(doc.signed_at) : ''}${v && v.category ? ' · ' + escapeHtml(v.category) : ''}</div>
            <div style="font-size:12px;color:rgba(255,255,255,.45);margin-top:14px">Shared by the operator via CodedOK. This is a read-only snapshot — changes won't sync.</div>
          </div>

          ${surveyorName ? `
            <div style="background:var(--grnp);border:1px solid rgba(22,163,74,.2);border-radius:12px;padding:14px 18px;margin-bottom:18px;font-size:13px;color:var(--green);font-weight:700">✓ Signed by ${escapeHtml(surveyorName)} on ${fmtDate(doc.signed_at)}</div>` : ''}

          ${sectionsHtml}

          ${acks.length ? `
            <section style="background:white;border-radius:14px;padding:24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.05)">
              <h2 style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:12px">Crew acknowledgements · ${acks.length}</h2>
              ${acks.map((a) => `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid var(--bdr)"><span style="color:var(--text);font-weight:600">${escapeHtml(a.name || a.crew_id)}</span><span style="color:var(--lt)">${fmtDate(a.at)}</span></div>`).join('')}
            </section>` : ''}

          ${edits.length ? `
            <section style="background:white;border-radius:14px;padding:24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.05)">
              <h2 style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:12px">Audit trail</h2>
              ${edits.map((e) => `<div style="display:flex;gap:12px;padding:6px 0;font-size:13px;color:var(--mid);border-bottom:1px solid var(--bdr)"><span style="min-width:100px;color:var(--lt)">${fmtDate(e.at)}</span><span style="flex:1"><strong style="color:var(--text)">${escapeHtml(e.by_name)}</strong>${e.note ? ' — ' + escapeHtml(e.note) : ''}</span></div>`).join('')}
            </section>` : ''}

          <div style="font-size:11px;color:var(--lt);text-align:center;margin-top:20px">CodedOK · token ${escapeHtml(token || '')}${doc.share_token_expires_at ? ' · link expires ' + fmtDate(doc.share_token_expires_at) : ''}</div>
        </div>
      </div>`;
  }

  function rotateSmsShare(docId) {
    Store.createSmsShareToken(docId);
    const d = Store.snapshot().sms_documents.find((x) => x.id === docId);
    if (d) showSmsDocSheet(d);
  }
  window.rotateSmsShare = rotateSmsShare;

  function copySmsShareLink(url) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => alert('Surveyor link copied. Paste it into a message or email.'),
        () => prompt('Copy the surveyor link:', url)
      );
    } else {
      prompt('Copy the surveyor link:', url);
    }
  }
  window.copySmsShareLink = copySmsShareLink;

  function signCrewAck(docId, crewId, name) {
    Store.ackSms(docId, crewId, name);
    Store.appendSmsEdit(docId, { note: `Crew ack — ${name}` });
    const d = Store.snapshot().sms_documents.find((x) => x.id === docId);
    if (d) showSmsDocSheet(d);
  }
  window.signCrewAck = signCrewAck;

  function revokeCrewAck(docId, crewId) {
    Store.revokeSmsAck(docId, crewId);
    const d = Store.snapshot().sms_documents.find((x) => x.id === docId);
    if (d) showSmsDocSheet(d);
  }
  window.revokeCrewAck = revokeCrewAck;

  function startSmsAnnualReview(docId) {
    const d = Store.snapshot().sms_documents.find((x) => x.id === docId);
    if (!d) return;
    Store.appendSmsEdit(docId, { note: 'Started annual review' });
    Store.updateSmsDocument(docId, { status: 'review', version: (d.version || 1) + 0 });
    closeSmsDoc();
    // Hand off to the existing builder — operator walks through the
    // 11 sections again, edits anything that's changed, finishes.
    smsActiveSection = 0;
    go('s-sms-builder');
  }
  window.startSmsAnnualReview = startSmsAnnualReview;

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

  // ---------- AI-generated SMS ----------
  // Wizard: 6 questions → mock payment → mock Claude generation → draft seeded.
  // Real implementation swaps `generateSmsFromInputs` for an edge-function
  // call to Claude. Public flow stays the same.

  let smsAiInputs = null;
  let smsAiStep = 0;

  function openSmsAiWizard() {
    smsAiStep = 0;
    smsAiInputs = {
      vessel_id: (Store.getVessel(activeVesselId) || (Store.snapshot().vessels[0] || {})).id || null,
      operation_type: '',
      operating_area: '',
      passengers_max: '',
      crew_size: '',
      season: '',
      notable_risks: ''
    };
    renderSmsAiWizard();
  }
  window.openSmsAiWizard = openSmsAiWizard;

  function renderSmsAiWizard() {
    const existing = document.getElementById('sms-ai-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'sms-ai-modal';
    modal.className = 'bdrop on';
    document.body.appendChild(modal);

    const steps = [
      { key: 'vessel_id', kind: 'vessel', label: 'Which vessel is this SMS for?' },
      { key: 'operation_type', kind: 'options', label: 'What type of operation?',
        opts: ['Passenger charter / day trips', 'Sea angling / fishing trips', 'Diving / instruction', 'Sail training', 'Workboat / safety boat', 'Private use only'] },
      { key: 'operating_area', kind: 'options', label: 'Where do you operate?',
        opts: ['Cat 0 — Unrestricted', 'Cat 1 — Up to 150nm', 'Cat 2 — Up to 60nm', 'Cat 3 — Up to 20nm', 'Cat 4 — Up to 20nm in favourable weather', 'Cat 5/6 — Smooth & partially-smooth waters'] },
      { key: 'passengers_max', kind: 'short', label: 'Max passengers on board?', placeholder: 'e.g. 10' },
      { key: 'crew_size', kind: 'short', label: 'Typical crew (master + mate)?', placeholder: 'e.g. 1 master + 1 mate' },
      { key: 'season', kind: 'options', label: 'Operating season?',
        opts: ['Year-round', 'Apr–Oct (summer)', 'May–Sep (summer narrow)', 'Mar–Nov (extended)'] },
      { key: 'notable_risks', kind: 'long', label: 'Any operation-specific risks worth flagging?',
        placeholder: 'e.g. Crossing the Sound of Rathlin can produce overfalls in spring tides; passengers occasionally board with mobility aids…' }
    ];

    if (smsAiStep >= steps.length) {
      modal.innerHTML = renderSmsAiPayment();
      return;
    }

    const s = steps[smsAiStep];
    const vessels = Store.snapshot().vessels;
    let body = '';
    if (s.kind === 'vessel') {
      body = vessels.length === 0
        ? `<div style="padding:14px;background:var(--ampp);border-radius:10px;font-size:12px;color:var(--text);line-height:1.55">Add a vessel first — the SMS is tied to one. Tap Cancel and create a vessel from your home screen.</div>`
        : `<div style="display:flex;flex-direction:column;gap:8px">
            ${vessels.map((v) => `
              <button onclick="smsAiSelect('vessel_id', '${v.id}')" class="qa-tile" style="text-align:left;width:100%;border:${smsAiInputs.vessel_id === v.id ? '2px solid var(--sea)' : '1px solid var(--bdr)'}">
                <div class="qa-icon bl">${v.icon || '⛵'}</div>
                <div style="flex:1"><div class="qa-title">${escapeHtml(v.name)}</div><div class="qa-sub">${escapeHtml(v.type || '')} · ${escapeHtml(v.category || '')}</div></div>
              </button>`).join('')}
          </div>`;
    } else if (s.kind === 'options') {
      body = `<div style="display:flex;flex-direction:column;gap:8px">
        ${s.opts.map((o) => `
          <button onclick="smsAiSelect('${s.key}', '${escapeHtml(o).replace(/'/g, '&#39;')}')" class="qa-tile" style="text-align:left;width:100%;border:${smsAiInputs[s.key] === o ? '2px solid var(--sea)' : '1px solid var(--bdr)'}">
            <div style="flex:1"><div class="qa-title" style="font-size:13px">${escapeHtml(o)}</div></div>
            ${smsAiInputs[s.key] === o ? '<div style="color:var(--sea);font-weight:700">✓</div>' : ''}
          </button>`).join('')}
      </div>`;
    } else if (s.kind === 'short') {
      body = `<input class="fi" id="sms-ai-input" value="${escapeHtml(smsAiInputs[s.key] || '')}" placeholder="${escapeHtml(s.placeholder || '')}" autofocus>`;
    } else if (s.kind === 'long') {
      body = `<textarea class="fta" id="sms-ai-input" placeholder="${escapeHtml(s.placeholder || '')}" style="min-height:120px" autofocus>${escapeHtml(smsAiInputs[s.key] || '')}</textarea>`;
    }

    modal.innerHTML = `
      <div class="sheet" style="padding-bottom:calc(var(--safe) + 14px)">
        <div class="sh-pull"></div>
        <div class="sh-head">
          <div class="sh-title">✨ Generate SMS — step ${smsAiStep + 1} of ${steps.length}</div>
          <button class="sh-x" onclick="closeSmsAiWizard()">×</button>
        </div>
        <div style="padding:0 20px 14px;overflow-y:auto;max-height:70vh">
          <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:12px">${escapeHtml(s.label)}</div>
          ${body}
          <div style="display:flex;gap:8px;margin-top:14px">
            ${smsAiStep > 0 ? `<button class="btn btn-out" style="flex:1" onclick="smsAiBack()">‹ Back</button>` : ''}
            <button class="btn btn-sea" style="flex:2" onclick="smsAiNext('${s.key}', '${s.kind}')">
              ${smsAiStep === steps.length - 1 ? 'Continue to payment →' : 'Next →'}
            </button>
          </div>
        </div>
      </div>`;
  }

  function smsAiSelect(key, value) {
    smsAiInputs[key] = value;
    renderSmsAiWizard();
  }
  window.smsAiSelect = smsAiSelect;

  function smsAiBack() { if (smsAiStep > 0) smsAiStep--; renderSmsAiWizard(); }
  window.smsAiBack = smsAiBack;

  function smsAiNext(key, kind) {
    if (kind === 'short' || kind === 'long') {
      const el = document.getElementById('sms-ai-input');
      smsAiInputs[key] = (el && el.value || '').trim();
    }
    if (!smsAiInputs[key]) { alert('Please answer this question before continuing.'); return; }
    smsAiStep++;
    renderSmsAiWizard();
  }
  window.smsAiNext = smsAiNext;

  function closeSmsAiWizard() {
    const m = document.getElementById('sms-ai-modal');
    if (m) m.remove();
  }
  window.closeSmsAiWizard = closeSmsAiWizard;

  function renderSmsAiPayment() {
    const v = Store.getVessel(smsAiInputs.vessel_id);
    return `
      <div class="sheet" style="padding-bottom:calc(var(--safe) + 14px)">
        <div class="sh-pull"></div>
        <div class="sh-head">
          <div class="sh-title">Generate SMS — pay £10</div>
          <button class="sh-x" onclick="closeSmsAiWizard()">×</button>
        </div>
        <div style="padding:0 20px 14px">
          <div style="background:var(--slate);border-radius:12px;padding:14px 16px;margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px"><span style="color:var(--mid)">Tailored 11-section SMS for ${escapeHtml(v ? v.name : 'your vessel')}</span><span style="font-weight:600;color:var(--text)">£10</span></div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;color:var(--lt)"><span>Unlimited edits + Word/PDF export</span><span>included</span></div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;color:var(--lt)"><span>Surveyor review &amp; sign-off</span><span>billed separately</span></div>
            <div style="height:1px;background:var(--bdr);margin:8px 0"></div>
            <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:800"><span>Total today</span><span>£10</span></div>
          </div>
          <div style="font-size:11px;color:var(--mid);line-height:1.55;margin-bottom:12px">Mock checkout — production uses Stripe. You'll receive a generated draft you can review, edit, and send to McCollam Marine (or any approved surveyor) for sign-off.</div>
          <button class="btn btn-sea btn-full" onclick="runSmsGeneration()">💷 Pay £10 &amp; generate now</button>
          <button class="btn btn-out btn-full" style="margin-top:8px" onclick="smsAiBack()">‹ Back</button>
        </div>
      </div>`;
  }

  async function runSmsGeneration() {
    const modal = document.getElementById('sms-ai-modal');
    if (modal) {
      modal.innerHTML = `
        <div class="sheet" style="padding:32px 22px;text-align:center">
          <div style="font-size:36px;margin-bottom:10px">✨</div>
          <div style="font-size:15px;font-weight:700">Drafting your SMS with Claude…</div>
          <div style="font-size:12px;color:var(--lt);margin-top:6px">Writing 11 sections tailored to your operation. ~15–25 seconds.</div>
        </div>`;
    }

    let draft = null;

    // Try the real Claude API via the Supabase edge function first. Falls
    // back to the local template substitution if the function isn't
    // deployed or any error occurs — so the app keeps working in dev.
    if (window.Supa && window.Supa.ready) {
      try {
        const v = Store.getVessel(smsAiInputs.vessel_id) || {};
        const payload = {
          vessel: {
            name: v.name, type: v.type, category: v.category,
            length: v.length, persons: v.persons
          },
          operation_type: smsAiInputs.operation_type,
          operating_area: smsAiInputs.operating_area,
          passengers_max: smsAiInputs.passengers_max,
          crew_size: smsAiInputs.crew_size,
          season: smsAiInputs.season,
          notable_risks: smsAiInputs.notable_risks
        };
        const { data, error } = await Supa.client.functions.invoke('generate-sms', { body: payload });
        if (error) throw new Error(error.message || 'edge function error');
        if (data && data.sections) {
          // Merge Claude's per-section output into the existing draft
          // shape so the existing builder UI just works.
          draft = {
            vessel_id: smsAiInputs.vessel_id,
            sections: {},
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            generated_by_ai: true,
            ai_model: data.model,
            generation_inputs: smsAiInputs
          };
          const schema = window.Codes.SMS_SCHEMA;
          schema.forEach((sec) => {
            const claudeSection = data.sections[sec.id] || {};
            const sectionObj = { ai_summary: claudeSection.summary || '', body: claudeSection.body || '' };
            // Also pre-fill the schema fields with the body so the builder
            // shows real content in every field.
            (sec.fields || []).forEach((f) => {
              if (!sectionObj[f.id]) sectionObj[f.id] = claudeSection.body || '';
            });
            draft.sections[sec.id] = sectionObj;
          });
          // Override the meta section with concrete vessel data.
          if (v.name) draft.sections.meta = Object.assign({}, draft.sections.meta || {}, {
            vessel_name: v.name,
            vessel_ssr: v.ssr || '',
            vessel_type: v.type || '',
            vessel_cat: v.category || '',
            sms_version: '1.0 (AI-generated)',
            sms_review_date: new Date().toISOString().slice(0, 10)
          });
        }
      } catch (err) {
        console.warn('Claude generation failed, falling back to local template:', err);
      }
    }

    // Fallback: local template substitution (the original mock).
    if (!draft) draft = generateSmsFromInputs(smsAiInputs);

    saveSmsDraft(draft);
    closeSmsAiWizard();
    smsActiveSection = 0;
    go('s-sms-builder');
    alert('Your SMS is ready. Review each section, edit anything that needs adjusting, then submit for sign-off.');
  }
  window.runSmsGeneration = runSmsGeneration;

  // Mock generation — combines schema defaults with operator inputs.
  // Real implementation calls Claude via an edge function with the same
  // inputs and a JSON schema; output structure matches what's below.
  function generateSmsFromInputs(inputs) {
    const v = Store.getVessel(inputs.vessel_id);
    const schema = window.Codes.SMS_SCHEMA;
    const draft = {
      vessel_id: v ? v.id : null,
      sections: {},
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      generated_by_ai: true,
      generation_inputs: inputs
    };

    function fill(text) {
      if (!text) return '';
      return text
        .replace(/\[VESSEL_NAME\]/g, v ? v.name : 'the vessel')
        .replace(/\[CATEGORY\]/g, (v && v.category) || inputs.operating_area || '');
    }

    // Pre-populate every section with the schema defaults, substituted.
    schema.forEach((sec) => {
      const obj = {};
      (sec.fields || []).forEach((f) => {
        if (f.default) obj[f.id] = fill(f.default);
      });
      draft.sections[sec.id] = obj;
    });

    // Override with concrete vessel + operator data.
    draft.sections.meta = Object.assign({}, draft.sections.meta || {}, {
      vessel_name: v ? v.name : '',
      vessel_ssr: v ? (v.ssr || '') : '',
      vessel_type: v ? (v.type || inputs.operation_type) : inputs.operation_type,
      vessel_cat: v ? (v.category || inputs.operating_area) : inputs.operating_area,
      company_name: '',
      sms_version: '1.0 (AI-generated draft)',
      sms_review_date: new Date().toISOString().slice(0, 10)
    });

    // Insert operation-aware risk assessments. Real impl: Claude reads
    // inputs.operation_type + inputs.notable_risks and emits a per-vessel
    // risk register. For now, prepend the operator's notable risks.
    const riskBlock = draft.sections.risk ? Object.assign({}, draft.sections.risk) : {};
    riskBlock.summary = [
      `Operation: ${inputs.operation_type}.`,
      `Operating area: ${inputs.operating_area}.`,
      `Max persons on board: ${inputs.passengers_max}.`,
      `Typical crew: ${inputs.crew_size}.`,
      `Season: ${inputs.season}.`,
      inputs.notable_risks ? `Operator-flagged risks: ${inputs.notable_risks}` : ''
    ].filter(Boolean).join('\n\n');
    draft.sections.risk = riskBlock;

    return draft;
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
            <div style="font-size:11px;color:var(--lt);font-weight:700;text-transform:uppercase;letter-spacing:.07em">Section ${smsActiveSection + 1} of ${schema.length}</div>
            <div style="font-size:18px;font-weight:700;color:var(--text);margin-top:3px;letter-spacing:-.2px">${sec.icon} ${escapeHtml(sec.title)}</div>
          </div>
          <span class="chip chip-bl">${pct}% done</span>
        </div>
        <div style="display:inline-flex;align-items:center;gap:6px;background:var(--seap);border:1px solid rgba(8,145,178,.2);color:var(--sea);font-size:11px;font-weight:700;padding:5px 10px;border-radius:8px;margin-bottom:10px">
          <span>📖</span><span>Satisfies ${escapeHtml(sec.ref)}</span>
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

    // Seed the audit trail with the finish event so the surveyor sees
    // when this version was first compiled.
    if (Store.appendSmsEdit) {
      Store.appendSmsEdit(stored.id, { note: 'SMS compiled', sections: ['all'] });
    }

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

  // Real surveyor invite. Writes an `invitations` row in Supabase, then
  // surfaces the resulting URL for the operator to share by any channel.
  // The surveyor accepts by opening the link signed in with the invited
  // email — see acceptPendingInvitation() in the boot path.
  async function inviteSurveyorByEmail(docId, vesselId) {
    const input = document.getElementById('invite-surveyor-email');
    const email = (input && input.value || '').trim();
    if (!email.includes('@')) { alert('Please enter a valid email.'); return; }
    if (!window.Supa || !window.Supa.ready) {
      alert('Sign in to send a real invite — Supabase is not configured on this device.');
      return;
    }
    try {
      const client = await window.Supa.getClient();
      const { data: { user }, error: authErr } = await client.auth.getUser();
      if (authErr || !user) throw new Error('Sign in before sending invites.');
      const me = await client.from('users').select('id').eq('auth_user_id', user.id).maybeSingle();
      if (me.error || !me.data) throw new Error('User profile missing — sign out and back in.');

      const id = 'inv_' + Math.random().toString(36).slice(2, 12);
      const row = {
        id,
        vessel_id: vesselId,
        invited_email: email,
        invited_by_user_id: me.data.id
        // token + scopes + expires_at populated by DB defaults
      };
      const ins = await client.from('invitations').insert(row).select('token').single();
      if (ins.error) throw new Error(ins.error.message);

      const base = window.location.origin + window.location.pathname;
      const url  = base + '#invite=' + ins.data.token + (docId ? '&doc=' + encodeURIComponent(docId) : '');

      showInvitationShare(email, url);
    } catch (err) {
      console.error('inviteSurveyorByEmail failed', err);
      alert('Could not create invite: ' + (err && err.message ? err.message : err));
    }
  }
  window.inviteSurveyorByEmail = inviteSurveyorByEmail;

  function showInvitationShare(email, url) {
    const old = document.getElementById('invite-share-modal');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'invite-share-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(8,16,32,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    modal.innerHTML = `
      <div class="card" style="max-width:420px;width:100%;padding:20px;border-radius:16px;background:var(--bg)">
        <div style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:6px;letter-spacing:-.2px">Invite ready</div>
        <div style="font-size:13px;color:var(--mid);line-height:1.5;margin-bottom:14px">Send this link to <strong>${escapeHtml(email)}</strong>. They'll sign in with that email, accept, and gain surveyor access. The link expires in 14 days.</div>
        <div style="background:var(--bg2);border:1px solid var(--bdr);border-radius:10px;padding:10px 12px;font-family:monospace;font-size:11px;color:var(--text);word-break:break-all;margin-bottom:14px" id="invite-url-text">${escapeHtml(url)}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sea" style="flex:1;height:42px;font-weight:700" onclick="copyInviteUrl()">Copy link</button>
          <button class="btn btn-out" style="flex:1;height:42px" onclick="document.getElementById('invite-share-modal').remove()">Done</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    window.__inviteUrl = url;
  }

  async function copyInviteUrl() {
    const url = window.__inviteUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      const btn = document.querySelector('#invite-share-modal .btn-sea');
      if (btn) { const t = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = t; }, 1500); }
    } catch (_) {
      // Clipboard API blocked — fall back to manual select.
      const el = document.getElementById('invite-url-text');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }
  window.copyInviteUrl = copyInviteUrl;

  // ─────────────────────────────────────────────────────────────
  // Accept-invitation boot handler. If the URL hash carries
  // #invite=TOKEN, stash it; once the user is authenticated (or
  // signs in/up), call the SECURITY DEFINER RPC and surface the
  // result. The RPC enforces that the auth email matches the
  // invited email — wrong account just shows a clear error.
  // ─────────────────────────────────────────────────────────────
  function readInviteTokenFromUrl() {
    const hash = window.location.hash || '';
    const m = hash.match(/[?#&]invite=([0-9a-f-]{8,})/i);
    return m ? m[1] : null;
  }

  function stashPendingInviteFromUrl() {
    const token = readInviteTokenFromUrl();
    if (!token) return;
    try { localStorage.setItem('codedok-pending-invite', token); } catch (_) {}
  }

  async function acceptPendingInvitation() {
    let token = null;
    try { token = localStorage.getItem('codedok-pending-invite'); } catch (_) {}
    if (!token) return false;
    if (!window.Supa || !window.Supa.ready) return false;
    try {
      const client = await window.Supa.getClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) return false;
      const { data, error } = await client.rpc('accept_invitation', { p_token: token });
      if (error) throw new Error(error.message);
      try { localStorage.removeItem('codedok-pending-invite'); } catch (_) {}
      let msg = 'Invitation accepted.';
      if (data && data.kind === 'surveyor' && data.vessel_id) {
        const v = Store.getVessel(data.vessel_id);
        msg = 'Surveyor access granted for ' + (v ? v.name : 'the vessel') + '.';
      } else if (data && data.kind === 'team') {
        msg = 'You\'ve joined the team. Pull down to refresh and you\'ll see their vessels.';
      }
      alert(msg);
      if (window.location.hash) history.replaceState(null, '', window.location.pathname);
      return true;
    } catch (err) {
      console.error('accept_invitation failed', err);
      try { localStorage.removeItem('codedok-pending-invite'); } catch (_) {}
      alert("Couldn't accept invitation: " + (err && err.message ? err.message : err));
      return false;
    }
  }
  window.acceptPendingInvitation = acceptPendingInvitation;
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
    if (s.user && s.user.trialEndsAt) {
      const days = Store.daysUntil(s.user.trialEndsAt);
      const bar = document.querySelector('#s-account [style*="width:35%"]');
      if (bar) bar.style.width = Math.max(5, Math.min(100, Math.round((14 - days) / 14 * 100))) + '%';
    }

    // "Switch view" toggles between operator / surveyor / admin. Only the
    // dedicated demo account has more than one role to switch into; hide
    // the section entirely for real users to avoid dead-end taps.
    const session = loadSession();
    const isDemoAccount = session && session.email
      && session.email.toLowerCase() === 'mcljd303@icloud.com';
    const switchLabel = document.getElementById('account-switch-view-label');
    const switchCard  = document.getElementById('account-switch-view-card');
    if (switchLabel) switchLabel.style.display = isDemoAccount ? '' : 'none';
    if (switchCard)  switchCard.style.display  = isDemoAccount ? '' : 'none';

    const demoLabel = document.getElementById('account-demo-label');
    const demoCard  = document.getElementById('account-demo-card');
    if (demoLabel) demoLabel.style.display = isDemoAccount ? '' : 'none';
    if (demoCard)  demoCard.style.display  = isDemoAccount ? '' : 'none';

    renderAccountTeam();
    renderTrialBanner();
  }

  // ─────────────────────────────────────────────────────────────
  // Team management — list members + invite UI in Account.
  // Only operators (the org owner role) get this section.
  // ─────────────────────────────────────────────────────────────
  async function renderAccountTeam() {
    const label = document.getElementById('account-team-label');
    const card  = document.getElementById('account-team-card');
    const list  = document.getElementById('account-team-list');
    if (!label || !card || !list) return;

    const me = window.Store ? Store.getCurrentUser() : null;
    if (!me || me.kind !== 'operator') {
      label.style.display = 'none';
      card.style.display  = 'none';
      return;
    }
    label.style.display = '';
    card.style.display  = '';

    list.innerHTML = `<div class="row" style="opacity:.6"><div class="row-body"><div class="row-sub">Loading team…</div></div></div>`;

    if (!window.Supa || !window.Supa.ready) { list.innerHTML = ''; return; }
    try {
      const client = await window.Supa.getClient();
      // org_id from any of the user's memberships where they're an owner.
      const memb = await client.from('memberships')
        .select('org_id, role, permissions, user_id')
        .order('role', { ascending: true });
      if (memb.error) throw memb.error;
      const rows = memb.data || [];
      if (!rows.length) { list.innerHTML = `<div class="row" style="opacity:.7"><div class="row-body"><div class="row-sub">No team members yet — add your first vessel to create the org.</div></div></div>`; return; }

      const userIds = [...new Set(rows.map((r) => r.user_id))];
      const users = await client.from('users').select('id, name, email, kind').in('id', userIds);
      const byId = new Map((users.data || []).map((u) => [u.id, u]));

      list.innerHTML = rows.map((r) => {
        const u = byId.get(r.user_id) || { name: 'Unknown', email: '' };
        const isOwner = r.role === 'owner';
        const isMe = u.id === me.id;
        const perms = (r.permissions || []).filter((p) => p !== 'view_all');
        const permsText = isOwner ? 'Full access' : (perms.length ? perms.map(prettyPerm).join(', ') : 'View only');
        return `
          <div class="row">
            <div class="row-ic ${isOwner ? 'gn' : 'bl'}">${escapeHtml(u.name ? u.name[0].toUpperCase() : '?')}</div>
            <div class="row-body">
              <div class="row-name">${escapeHtml(u.name || u.email)}${isMe ? ' <span style="color:var(--lt);font-size:11px;font-weight:500">(you)</span>' : ''}</div>
              <div class="row-sub">${escapeHtml(permsText)}</div>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      console.warn('renderAccountTeam failed', err);
      list.innerHTML = `<div class="row" style="opacity:.7"><div class="row-body"><div class="row-sub">Could not load team list.</div></div></div>`;
    }
  }

  function prettyPerm(p) {
    return ({
      manage_vessels: 'Vessels',
      manage_crew:    'Crew',
      manage_certs:   'Certs & equipment',
      manage_sms:     'SMS docs',
      manage_team:    'Team admin'
    })[p] || p;
  }

  function openInviteTeamMember() {
    const old = document.getElementById('team-invite-modal');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'team-invite-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(8,16,32,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    modal.innerHTML = `
      <div class="card" style="max-width:440px;width:100%;padding:20px;border-radius:16px;background:var(--bg);max-height:90vh;overflow:auto">
        <div style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:6px;letter-spacing:-.2px">Invite a team member</div>
        <div style="font-size:12px;color:var(--mid);line-height:1.5;margin-bottom:14px">Send a link they can open on their phone. They'll sign up with the email below and join your org with the permissions you pick.</div>

        <label style="display:block;font-size:11px;font-weight:700;color:var(--lt);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Email</label>
        <input class="fi" id="team-invite-email" type="email" placeholder="crew@example.com" style="width:100%;margin-bottom:12px">

        <label style="display:block;font-size:11px;font-weight:700;color:var(--lt);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">They can manage…</label>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">
          ${[
            ['manage_vessels','Vessels — add, edit, delete'],
            ['manage_certs','Certificates & equipment'],
            ['manage_crew','Crew records & qualifications'],
            ['manage_sms','SMS documents & reviews'],
            ['manage_team','Team admin (invite / remove others)']
          ].map(([id, label]) => `
            <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--bdr);border-radius:10px;cursor:pointer">
              <input type="checkbox" class="team-perm" value="${id}" style="accent-color:var(--sea)">
              <span style="font-size:13px;color:var(--text)">${escapeHtml(label)}</span>
            </label>`).join('')}
        </div>

        <div style="display:flex;gap:8px">
          <button class="btn btn-sea" style="flex:1;height:42px;font-weight:700" onclick="submitTeamInvite()">Create invite</button>
          <button class="btn btn-out" style="flex:1;height:42px" onclick="document.getElementById('team-invite-modal').remove()">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  window.openInviteTeamMember = openInviteTeamMember;

  async function submitTeamInvite() {
    const email = ((document.getElementById('team-invite-email') || {}).value || '').trim();
    if (!email.includes('@')) { alert('Enter a valid email.'); return; }
    const perms = Array.from(document.querySelectorAll('.team-perm:checked')).map((el) => el.value);
    // Everyone can at least view; add manage_* on top of that.
    const permissions = ['view_all'].concat(perms);

    if (!window.Supa || !window.Supa.ready) { alert('Cloud sync not configured.'); return; }
    try {
      const client = await window.Supa.getClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) throw new Error('Sign in first.');
      const me = await client.from('users').select('id').eq('auth_user_id', user.id).maybeSingle();
      if (me.error || !me.data) throw new Error('User profile missing.');
      // Pick the org the operator owns.
      const memb = await client.from('memberships').select('org_id').eq('user_id', me.data.id).eq('role', 'owner').maybeSingle();
      if (memb.error || !memb.data) throw new Error('You need to add a vessel first — that creates your org.');

      const id = 'inv_' + Math.random().toString(36).slice(2, 12);
      const ins = await client.from('invitations').insert({
        id,
        kind: 'team',
        org_id: memb.data.org_id,
        invited_email: email,
        invited_by_user_id: me.data.id,
        permissions
      }).select('token').single();
      if (ins.error) throw ins.error;

      document.getElementById('team-invite-modal').remove();
      const base = window.location.origin + window.location.pathname;
      const url  = base + '#invite=' + ins.data.token;
      showInvitationShare(email, url);
    } catch (err) {
      console.error('submitTeamInvite failed', err);
      alert('Could not create invite: ' + (err && err.message ? err.message : err));
    }
  }
  window.submitTeamInvite = submitTeamInvite;

  // ─────────────────────────────────────────────────────────────
  // Trial countdown banner — shows on Account screen.
  // ─────────────────────────────────────────────────────────────
  async function renderTrialBanner() {
    const host = document.getElementById('s-account');
    if (!host) return;
    let banner = document.getElementById('account-trial-banner');
    if (banner) banner.remove();

    if (!window.Supa || !window.Supa.ready) return;
    try {
      const client = await window.Supa.getClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) return;
      const me = await client.from('users').select('id, kind').eq('auth_user_id', user.id).maybeSingle();
      if (!me.data || me.data.kind !== 'operator') return;
      const memb = await client.from('memberships').select('org_id').eq('user_id', me.data.id).eq('role','owner').maybeSingle();
      if (!memb.data) return;
      const org = await client.from('organizations').select('plan, trial_ends_at').eq('id', memb.data.org_id).maybeSingle();
      if (!org.data) return;

      const plan = org.data.plan || 'trial';
      const endsRaw = org.data.trial_ends_at;
      if (plan !== 'trial') return; // Already paid — no banner.
      if (!endsRaw) return;
      const days = Store.daysUntil(endsRaw);
      const expired = days < 0;
      const colour = expired ? '#ef4444' : (days <= 3 ? '#f59e0b' : 'var(--sea)');
      const msg = expired
        ? 'Trial ended. Upgrade soon to keep adding records.'
        : `Trial: ${days} day${days === 1 ? '' : 's'} left. Everything stays free until ${fmtDate(endsRaw)}.`;

      banner = document.createElement('div');
      banner.id = 'account-trial-banner';
      banner.innerHTML = `
        <div style="padding:14px 16px 0">
          <div class="card" style="padding:12px 14px;display:flex;align-items:center;gap:12px;border-left:4px solid ${colour}">
            <div style="font-size:22px;flex-shrink:0">${expired ? '⏰' : '🎁'}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;color:var(--text)">${escapeHtml(msg)}</div>
              <div style="font-size:11px;color:var(--mid);margin-top:2px;line-height:1.5">Payment goes live soon — nothing to do today.</div>
            </div>
          </div>
        </div>`;
      const scroll = host.querySelector('.scroll');
      if (scroll) scroll.insertBefore(banner, scroll.firstChild);
    } catch (err) {
      console.warn('renderTrialBanner failed', err);
    }
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
            <tr><th>Compliance score</th><td><span class="${ready ? 'pp-status-ok' : 'pp-status-bad'}">${score}% — ${ready ? 'Ready for survey' : 'Not ready for survey'}</span></td></tr>
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
    if (!confirm('Restore the demo data (Tsunami IV & Lagavulin)? This will wipe any vessels you added.')) return;
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

  // Called from the Supabase auth state listener when a real user is
  // signed in (either fresh from a magic-link redirect or returning to
  // an existing session). Ensures our users table has a row for them,
  // creates a starter org + membership the first time, persists the
  // email session, and routes into the app.
  async function handleSignedIn(authUser) {
    const client = window.Supa && window.Supa.client;
    if (!client) return;

    try {
      // Simple, self-healing user save:
      //   1. Look up our users row by auth_user_id.
      //   2. If missing, create it with the role chosen at sign-up.
      //   3. If present but the chosen role has changed since (e.g. they
      //      signed up again with the role picker on a different setting),
      //      sync the row.
      // Org + membership are created LAZILY on first vessel add — no
      // failure point at sign-in, no extra rows for users who sign up
      // but never add a vessel.

      const lookup = await client.from('users')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();
      if (lookup.error) throw new Error('users select: ' + lookup.error.message);
      let row = lookup.data;

      // Role precedence: explicit chosen role from sign-up metadata >
      // admin/builder email pattern > existing row's kind > default operator.
      const chosenKind = authUser.user_metadata && authUser.user_metadata.kind;
      const inferred = kindFromEmail(authUser.email);
      const desiredKind = ['operator','surveyor','admin','builder'].includes(chosenKind)
        ? chosenKind
        : (row && row.kind) || inferred;

      const meta = authUser.user_metadata || {};
      if (!row) {
        const initials = (meta.name || authUser.email || '?').trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || authUser.email.slice(0, 2).toUpperCase();
        const name = meta.name || authUser.email.split('@')[0];
        const id = 'u_' + Math.random().toString(36).slice(2, 9);
        const newUser = {
          id, auth_user_id: authUser.id,
          email: authUser.email, name, initials, kind: desiredKind
        };
        if (desiredKind === 'operator' && meta.business_name) newUser.business_name = meta.business_name;
        if (desiredKind === 'builder') newUser.builder = { slug: 'redbay', company: 'Redbay Boats' };
        const ins = await client.from('users').insert(newUser).select().single();
        if (ins.error) throw new Error('users insert: ' + ins.error.message);
        row = ins.data;
      } else {
        // Returning user — patch in any of: role change, name change,
        // business name backfill (if signup metadata is newer than the row).
        const patch = {};
        if (row.kind !== desiredKind && chosenKind) patch.kind = desiredKind;
        if (meta.name && !row.name) patch.name = meta.name;
        if (meta.business_name && !row.business_name && desiredKind === 'operator') {
          patch.business_name = meta.business_name;
        }
        if (Object.keys(patch).length) {
          const upd = await client.from('users').update(patch).eq('id', row.id).select().single();
          if (!upd.error) row = upd.data;
        }
      }

      // Bridge with the existing localStorage session.
      saveSession({
        mode: 'live', email: authUser.email,
        user_id: row.id,
        signed_in_at: new Date().toISOString()
      });

      // Demo-account gating. The only seeded experience belongs to
      // mcljd303@icloud.com — every other real user gets an empty
      // workspace, even if their device still has leftover demo
      // fixtures from before this change.
      const isDemoAccount = (authUser.email || '').toLowerCase() === 'mcljd303@icloud.com';
      if (window.Store) {
        if (isDemoAccount) {
          if (!Store.hasDemoFixtures()) Store.applyDemoSeed();
        } else if (Store.hasDemoFixtures()) {
          Store.resetToEmpty();
        }
        // Mirror the Supabase users row into the local Store so the rest
        // of the app (getCurrentUser, lazy org creation on first vessel
        // add, role-aware UI) recognises this account.
        Store.attachAuthenticatedUser(row);
      }

      // Drive the boot routing.
      renderDemoBadge();
      if (row.kind === 'admin') {
        applyDesktopAdmin();
        go('s-admin-home');
      } else if (row.kind === 'surveyor') {
        Store.setMode('surveyor');
        go('s-surveyor-home');
      } else if (row.kind === 'builder') {
        window.location.href = 'web/index.html#builder';
      } else {
        Store.setMode('operator');
        go('s-home');
      }

      // If they arrived via a surveyor invite link, claim the grant
      // now that auth is settled. Errors surface to the user.
      acceptPendingInvitation();
    } catch (err) {
      console.error('handleSignedIn failed', err);
      const msg = (err && err.message) || String(err);
      const hint = /infinite recursion/.test(msg)
        ? 'Run migration 0005_definer_helpers_idempotent.sql in the Supabase SQL editor — it patches the RLS helpers to SECURITY DEFINER without cascade-dropping policies.'
        : /violates row-level security|permission denied|new row violates/i.test(msg)
        ? 'Run migration 0003_insert_policies.sql in the Supabase SQL editor.'
        : 'Check Supabase RLS policies (migrations 0002, 0003, 0005) in /supabase/migrations.';
      alert("Couldn't finish signing you in:\n\n" + msg + "\n\n" + hint);
    }
  }

  function resetLoginStep() {
    toggleAuthMode('signin');
  }
  window.resetLoginStep = resetLoginStep;

  // Single in-flight guard shared across every auth handler — prevents
  // double-taps from firing two sign-ins, two reset emails, etc.
  // (Supabase rate-limits reset/verification mail at 4/hour per address.)
  let authInFlight = false;

  // Forgot password — sends a reset link to the email currently typed
  // in the sign-in form. User clicks the link, comes back, and the
  // app catches the recovery session and prompts for a new password.
  async function forgotPassword() {
    if (authInFlight) return;
    const email = ((document.getElementById('login-email') || {}).value || '').trim();
    if (!email.includes('@')) {
      showLoginError('Type your email above first, then tap Forgot.');
      return;
    }
    if (!window.Supa || !window.CodedOkConfig || !window.CodedOkConfig.supabaseUrl) {
      showLoginError("Reset isn't configured.");
      return;
    }
    authInFlight = true;
    try {
      await window.Supa.sendPasswordReset(email);
      const lineEl = document.getElementById('login-sent-line');
      if (lineEl) lineEl.innerHTML = `Reset link sent to <strong style="color:white">${escapeHtml(email)}</strong>. Tap it from this device — you'll come back here and be asked to set a new password.`;
      toggleAuthMode('sent');
    } catch (err) {
      showLoginError("Couldn't send reset: " + ((err && err.message) || err));
    } finally {
      authInFlight = false;
    }
  }
  window.forgotPassword = forgotPassword;

  // Change password while signed in. Tapped from Account → Change password.
  function openChangePassword() {
    const existing = document.getElementById('change-password-sheet');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'change-password-sheet';
    modal.className = 'bdrop on';
    modal.onclick = (e) => { if (e.target === modal) closeChangePassword(); };
    modal.innerHTML = `
      <div class="sheet" style="padding-bottom:calc(var(--safe) + 14px)">
        <div class="sh-pull"></div>
        <div class="sh-head">
          <div class="sh-title">Change password</div>
          <button class="sh-x" onclick="closeChangePassword()">×</button>
        </div>
        <div style="padding:0 20px 14px">
          <div style="font-size:13px;color:var(--mid);margin-bottom:14px;line-height:1.55">Pick a new password (8+ characters). Takes effect immediately on every device you've signed in on.</div>
          <div class="fg"><label class="fl">New password</label><input class="fi" id="cp-new" type="password" autocomplete="new-password" placeholder="••••••••"></div>
          <div class="fg"><label class="fl">Confirm new password</label><input class="fi" id="cp-confirm" type="password" autocomplete="new-password" placeholder="••••••••"></div>
          <div id="cp-error" style="display:none;font-size:12px;color:var(--red);margin-top:6px;text-align:center"></div>
          <button class="btn btn-sea btn-full" onclick="submitChangePassword()" style="margin-top:10px">Update password</button>
          <button class="btn btn-out btn-full" onclick="closeChangePassword()" style="margin-top:8px">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  window.openChangePassword = openChangePassword;

  function closeChangePassword() {
    const m = document.getElementById('change-password-sheet');
    if (m) m.remove();
  }
  window.closeChangePassword = closeChangePassword;

  async function submitChangePassword() {
    const pwd = (document.getElementById('cp-new') || {}).value || '';
    const confirm = (document.getElementById('cp-confirm') || {}).value || '';
    const errEl = document.getElementById('cp-error');
    function showErr(t) { if (errEl) { errEl.textContent = t; errEl.style.display = 'block'; } }
    if (errEl) errEl.style.display = 'none';
    if (pwd.length < 8) return showErr('Password must be 8+ characters.');
    if (pwd !== confirm) return showErr("Passwords don't match.");
    if (!window.Supa || !window.CodedOkConfig || !window.CodedOkConfig.supabaseUrl) {
      return showErr("Cloud isn't configured.");
    }
    // Don't gate on Supa.ready — updatePassword awaits the lazy SDK load
    // internally. Otherwise the user opens the modal before the CDN has
    // finished and the form is unusable for the first few hundred ms.
    try {
      await window.Supa.updatePassword(pwd);
      closeChangePassword();
      alert('Password updated. You stay signed in on this device.');
    } catch (err) {
      showErr((err && err.message) || String(err));
    }
  }
  window.submitChangePassword = submitChangePassword;

  // Toggle between the three login-card modes:
  // 'signin'  email + password sign-in (default)
  // 'signup'  email + password new-account creation
  // 'sent'    verification email sent — wait, then sign in
  function toggleAuthMode(mode) {
    const ids = ['login-step-signin', 'login-step-signup', 'login-step-sent'];
    const map = { signin: 'login-step-signin', signup: 'login-step-signup', sent: 'login-step-sent' };
    const target = map[mode] || 'login-step-signin';
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = id === target ? '' : 'none';
    });
    // Clear any error states when switching.
    ['login-error', 'signup-error'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'none'; el.textContent = ''; }
    });
  }
  window.toggleAuthMode = toggleAuthMode;

  // ----- Email + password sign-in -----
  async function submitSignIn() {
    if (authInFlight) return;
    const email = ((document.getElementById('login-email') || {}).value || '').trim();
    const password = (document.getElementById('login-password') || {}).value || '';
    const errEl = document.getElementById('login-error');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

    if (!email.includes('@')) return showLoginError('Enter the email you signed up with.');
    if (!password) return showLoginError('Enter your password.');

    if (!window.Supa || !window.CodedOkConfig || !window.CodedOkConfig.supabaseUrl) {
      return showLoginError("Cloud sign-in isn't configured. Use the demo button instead.");
    }

    authInFlight = true;
    try {
      await window.Supa.signInWithPassword(email, password);
      // handleSignedIn() will fire via Supa.onAuthChange and route into the app.
    } catch (err) {
      const msg = (err && err.message) ? err.message : 'sign-in failed';
      if (/Email not confirmed/i.test(msg)) {
        showLoginError("Your email isn't verified yet. Check your inbox for the link we sent.");
      } else if (/Invalid login credentials|invalid_grant/i.test(msg)) {
        showLoginError("That email and password don't match. Try again or create an account.");
      } else if (/Failed to fetch|NetworkError|Could not load Supabase|MIME/i.test(msg)) {
        showLoginError("Can't reach the sign-in service. Check your connection.");
      } else if (/rate limit|too many/i.test(msg)) {
        showLoginError("Too many attempts — wait a minute and try again.");
      } else {
        showLoginError(msg);
      }
    } finally {
      authInFlight = false;
    }
  }
  window.submitSignIn = submitSignIn;

  function showLoginError(text) {
    const el = document.getElementById('login-error');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
  }

  // Sign-up role picker state — defaults to operator. Set by clicking
  // one of the two role buttons on the sign-up screen.
  let signupRole = 'operator';

  function setSignupRole(role) {
    if (role !== 'operator' && role !== 'surveyor') return;
    signupRole = role;
    document.querySelectorAll('#signup-role-picker .role-pick').forEach((btn) => {
      const isActive = btn.dataset.role === role;
      btn.classList.toggle('on', isActive);
      btn.style.background = isActive ? 'rgba(8,145,178,.2)' : 'rgba(255,255,255,.04)';
      btn.style.borderColor = isActive ? 'var(--seal)' : 'rgba(255,255,255,.08)';
    });
    // Surveyors don't have a business they're billing under — the field
    // only makes sense for operators.
    const bizWrap = document.getElementById('signup-business-wrap');
    if (bizWrap) bizWrap.style.display = (role === 'operator') ? '' : 'none';
  }
  window.setSignupRole = setSignupRole;

  // ----- Email + password sign-up -----
  async function submitSignUp() {
    if (authInFlight) return;
    const email = ((document.getElementById('signup-email') || {}).value || '').trim();
    const password = (document.getElementById('signup-password') || {}).value || '';
    const name = ((document.getElementById('signup-name') || {}).value || '').trim();
    const businessName = ((document.getElementById('signup-business') || {}).value || '').trim();
    const errEl = document.getElementById('signup-error');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

    if (!name) return showSignupError('Enter your name.');
    if (!email.includes('@')) return showSignupError('Enter a valid email.');
    if (password.length < 8) return showSignupError('Password must be at least 8 characters.');
    if (signupRole === 'operator' && !businessName) {
      return showSignupError('Enter your business name.');
    }

    if (!window.Supa || !window.CodedOkConfig || !window.CodedOkConfig.supabaseUrl) {
      return showSignupError("Cloud sign-up isn't configured.");
    }

    // Pass the chosen role + display name through Supabase auth
    // user_metadata so they survive the email-verification round-trip.
    // handleSignedIn() reads these when creating the public.users row.
    authInFlight = true;
    try {
      const meta = { kind: signupRole, name };
      if (signupRole === 'operator' && businessName) meta.business_name = businessName;
      await window.Supa.signUpWithPassword(email, password, meta);
      // If email confirmation is on, the session is null until they click the link.
      // If it's off, they're signed in immediately — onAuthChange fires.
      const lineEl = document.getElementById('login-sent-line');
      const roleLabel = signupRole === 'surveyor' ? 'surveyor' : 'skipper';
      if (lineEl) lineEl.innerHTML = `${roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1)} account created. We've sent a verification link to <strong style="color:white">${escapeHtml(email)}</strong>. Open the email, tap the link, then come back to sign in.`;
      toggleAuthMode('sent');
    } catch (err) {
      const msg = (err && err.message) ? err.message : 'sign-up failed';
      if (/already.*registered|already.*exists|User already registered/i.test(msg)) {
        showSignupError("That email is already in use. Sign in instead.");
      } else if (/weak.*password|Password should be/i.test(msg)) {
        showSignupError("Pick a stronger password (8+ characters).");
      } else if (/Failed to fetch|NetworkError|Could not load Supabase|MIME/i.test(msg)) {
        showSignupError("Can't reach the sign-up service. Check your connection.");
      } else if (/rate limit|too many|email rate/i.test(msg)) {
        showSignupError("Too many sign-ups for that email — wait an hour or use a different one.");
      } else {
        showSignupError(msg);
      }
    } finally {
      authInFlight = false;
    }
  }
  window.submitSignUp = submitSignUp;

  function showSignupError(text) {
    const el = document.getElementById('signup-error');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
  }

  // Admin emails route into the admin workspace; everything else → operator.
  function isAdminEmail(email) {
    if (!email) return false;
    const e = email.toLowerCase();
    return e === 'admin@codedok.com' || e === 'joe@codedok.com' || e.startsWith('admin@') || e.startsWith('joe+admin@');
  }

  // Builder emails route into the builder dashboard. Redbay's service team
  // signs in with @redbayboats.com — they land directly on their fleet view.
  function isBuilderEmail(email) {
    if (!email) return false;
    const e = email.toLowerCase();
    return e.endsWith('@redbayboats.com') || e.endsWith('@redbay.com');
  }

  // Map an email to the role we should create the user with on first sign-in.
  function kindFromEmail(email) {
    if (isAdminEmail(email))    return 'admin';
    if (isBuilderEmail(email))  return 'builder';
    return 'operator';
  }

  // Legacy entry point. The "Try the live demo →" login button was
  // removed when we cut over to per-account real workspaces — demo
  // data now only loads when mcljd303@icloud.com signs in. The
  // function stays defined so the index.html self-heal sentinel
  // (which probes for window.enterDemo) still detects a successful
  // app.js load. Calling it just routes to the login screen.
  function enterDemo() {
    go('s-login');
  }
  window.enterDemo = enterDemo;

  // Back-button target from the "Add your first vessel" onboarding screen.
  // Signed-in users came from the home dashboard and should return there.
  // Unauthenticated visitors (who tapped "Get inspection-ready" on the
  // marketing landing page) get sent back to s-land.
  function goBackFromOnboard() {
    const session = loadSession();
    go(session ? 's-home' : 's-land');
  }
  window.goBackFromOnboard = goBackFromOnboard;

  function signOut() {
    if (!confirm('Sign out and return to the login screen?')) return;
    clearSession();
    // Best-effort Supabase sign-out — keeps the next session clean.
    if (window.Supa && window.Supa.signOut) {
      window.Supa.signOut().catch(() => {});
    }
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

    // Real auth: when Supabase is wired, listen for sign-in / sign-out
    // events. handleSignedIn ensures a row exists in our users table,
    // persists the email session for the existing app code, and routes
    // into the right home (operator / surveyor / admin / builder).
    if (window.Supa && window.CodedOkConfig && window.CodedOkConfig.supabaseUrl) {
      // Dedupe handleSignedIn — both getUser() and onAuthChange's
      // initial fire can deliver the same user. Run it at most once
      // per unique auth user id until a sign-out clears the guard.
      let signedInUserId = null;
      const onUser = (user) => {
        if (!user) return;
        if (signedInUserId === user.id) return;
        signedInUserId = user.id;
        handleSignedIn(user);
      };

      // Initial check — confirm whether Supabase has a live session.
      // If yes, route via handleSignedIn. If no but our localStorage
      // thinks we're "live", the local session is stale (auth user
      // deleted, refresh token expired, db wiped) — clear it and bounce
      // to login so the user isn't left on a broken home screen.
      window.Supa.getUser().then((user) => {
        if (user) {
          onUser(user);
        } else {
          const sess = loadSession();
          if (sess && sess.mode === 'live') {
            clearSession();
            go('s-login');
          }
        }
      }).catch(() => {});

      // Subscribe to future changes.
      window.Supa.onAuthChange((event, sess) => {
        // Password reset flow: user clicked the link in their email
        // and Supabase dropped them back with a recovery session. Show
        // the change-password modal instead of routing into the app.
        if (event === 'PASSWORD_RECOVERY') {
          go('s-login');
          openChangePassword();
          return;
        }
        // INITIAL_SESSION fires once at subscribe time in supabase-js v2
        // (older versions fired SIGNED_IN). Handle both; dedupe via onUser.
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && sess && sess.user) {
          onUser(sess.user);
        }
        if (event === 'SIGNED_OUT') {
          signedInUserId = null;
          clearSession();
          go('s-login');
        }
      });
    }

    // Stash any surveyor-invite token from the URL hash so we can
    // accept it as soon as the user is authenticated. If they're
    // already signed in, handleSignedIn will pick this up; if they
    // need to sign in or sign up, the token survives across the auth
    // round-trip.
    stashPendingInviteFromUrl();

    // Surveyor read-only SMS view — login-free.
    // Pattern: #sms-view?t=TOKEN (or ?t=TOKEN in the query string).
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const tokenMatch = (hash + search).match(/[?&]t=([A-Z0-9]+)/i);
    const isSmsView = /sms-view/.test(hash) || /sms-view/.test(search);
    if (isSmsView && tokenMatch && tokenMatch[1] && window.Store) {
      const doc = Store.getSmsByShareToken(tokenMatch[1]);
      renderSmsPublicView(doc, tokenMatch[1]);
      return; // Don't continue to the normal app routing.
    }

    // Deep-link from /web — surveyor opens a specific vessel.
    // Web app stores { vesselId, view, ts } on localStorage; we consume it once.
    let deepLink = null;
    try {
      const raw = localStorage.getItem('codedok-deeplink');
      if (raw) {
        deepLink = JSON.parse(raw);
        if (!deepLink || (Date.now() - (deepLink.ts || 0)) > 60000) deepLink = null;
        localStorage.removeItem('codedok-deeplink');
      }
    } catch (_) {}

    // Boot routing
    let session = loadSession();
    // Stale `mode: 'demo'` sessions are no longer honoured — the only
    // seeded experience is mcljd303@icloud.com signing in for real.
    // Clear the session and any leftover demo fixtures so the user lands
    // on the login screen with a clean Store instead of demo data.
    if (session && session.mode === 'demo') {
      clearSession();
      if (window.Store && Store.hasDemoFixtures()) Store.resetToEmpty();
      session = null;
    }
    if (!session) {
      go('s-login');
      return;
    }
    // If a non-demo user is returning to the app and the Store still
    // carries demo fixtures from a previous session, wipe them now so
    // the operator home doesn't flash demo data before handleSignedIn
    // catches up. handleSignedIn re-runs the same check, so we're safe
    // either way.
    if (window.Store
        && session.mode === 'live'
        && (session.email || '').toLowerCase() !== 'mcljd303@icloud.com'
        && Store.hasDemoFixtures()) {
      Store.resetToEmpty();
    }
    if (deepLink && deepLink.vesselId && deepLink.view === 's-surveyor-vessel') {
      Store.setMode('surveyor');
      applyDesktopSurveyor();
      window.setActiveVessel(deepLink.vesselId);
      go('s-surveyor-vessel');
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
