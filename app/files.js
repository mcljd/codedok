// CodedOK — attachments: in-app viewer + share/save.
//
// Replaces window.open()-based viewing (a blank popup is refused inside the
// iPhone app, so "View" did nothing) and <a download> (ignored by iOS
// WebViews, so "Download Word" did nothing).
//   • View: full-screen sheet. Images shown directly; PDFs rendered page by
//     page with the bundled pdf.js. Files that live only in Supabase Storage
//     (added on another device) are fetched with a short-lived signed URL.
//   • Share: on iPhone, writes a temp file and opens the iOS share sheet
//     (Save to Files, Mail, AirDrop…). On the web, Web Share or a download.
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
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeName(n, fallback) {
    var s = String(n || fallback || 'file').replace(/[\\/:*?"<>|]+/g, '-').trim();
    return s.slice(0, 80) || 'file';
  }

  // ── Resolve something viewable ───────────────────────────────────────────
  async function resolveUrl(src) {
    var s = String(src || '');
    if (/^(data:|blob:|https:)/i.test(s)) return s;
    // Otherwise treat it as a path inside the private cert-files bucket.
    if (!/^[A-Za-z0-9_][A-Za-z0-9_\/.\-]*$/.test(s) || s.indexOf('..') !== -1) return null;
    if (!window.Supa || !window.Supa.ready) return null;
    var client = await window.Supa.getClient();
    var r = await client.storage.from('cert-files').createSignedUrl(s, 600);
    return (r && r.data && r.data.signedUrl) || null;
  }
  function guessType(src, name, given) {
    if (given) return given;
    var m = /^data:([^;,]+)/i.exec(String(src || ''));
    if (m) return m[1];
    if (/\.pdf($|\?)/i.test(name || src)) return 'application/pdf';
    if (/\.(png|jpe?g|webp|heic|gif)($|\?)/i.test(name || src)) return 'image/*';
    return '';
  }

  // ── Viewer ───────────────────────────────────────────────────────────────
  var current = null;
  function close() {
    var el = document.getElementById('fv'); if (el) el.remove();
    current = null;
  }
  async function view(src, name, type) {
    close();
    var el = document.createElement('div');
    el.id = 'fv';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', name || 'Attachment');
    el.innerHTML =
      '<div class="fv-bar"><button type="button" class="fv-btn" data-fv-close="1">Done</button>' +
      '<div class="fv-title">' + esc(name || 'Attachment') + '</div>' +
      '<button type="button" class="fv-btn fv-strong" data-fv-share="1">Share</button></div>' +
      '<div class="fv-body"><div class="fv-msg">Opening…</div></div>';
    document.body.appendChild(el);
    var body = el.querySelector('.fv-body');
    try {
      var url = await resolveUrl(src);
      if (!url) { body.innerHTML = '<div class="fv-msg">This file isn\'t available offline. Connect to the internet and try again.</div>'; return; }
      current = { url: url, name: name, type: guessType(src, name, type) };
      if (/pdf/i.test(current.type)) {
        await renderPdf(url, body);
      } else {
        body.innerHTML = '<img class="fv-img" alt="' + esc(name || 'Attachment') + '">';
        body.querySelector('img').src = url;
      }
    } catch (e) {
      console.warn('viewer', e);
      body.innerHTML = '<div class="fv-msg">Couldn\'t open this file. Try Share to open it in another app.</div>';
    }
  }
  async function renderPdf(url, body) {
    var lib = window.SurveyImport && window.SurveyImport.loadPdfJs ? await window.SurveyImport.loadPdfJs() : null;
    if (!lib) throw new Error('pdf viewer unavailable');
    var buf = await (await fetch(url)).arrayBuffer();
    var doc = await lib.getDocument({ data: buf, isEvalSupported: false }).promise;
    body.innerHTML = '';
    var width = Math.min(body.clientWidth || window.innerWidth, 900) - 24;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    for (var i = 1; i <= Math.min(doc.numPages, 40); i++) {
      var page = await doc.getPage(i);
      var vp1 = page.getViewport({ scale: 1 });
      var scale = width / vp1.width;
      var vp = page.getViewport({ scale: scale * dpr });
      var c = document.createElement('canvas');
      c.className = 'fv-page';
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      c.style.width = Math.floor(vp.width / dpr) + 'px';
      c.setAttribute('aria-label', 'Page ' + i);
      body.appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
  }

  // ── Share / save ─────────────────────────────────────────────────────────
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }
  // data: URL / URL / Blob → share sheet (iPhone) or download (web).
  async function share(src, name, type) {
    var blob = src instanceof Blob ? src : await (await fetch(await resolveUrl(src))).blob();
    var filename = safeName(name, 'file');
    if (!/\.[a-z0-9]{2,5}$/i.test(filename)) {
      var ext = /pdf/.test(blob.type) ? 'pdf' : /png/.test(blob.type) ? 'png' : /jpe?g/.test(blob.type) ? 'jpg' : /msword/.test(blob.type) ? 'doc' : '';
      if (ext) filename += '.' + ext;
    }
    var FS = plugin('Filesystem'), SH = plugin('Share');
    if (FS && SH) {
      var w = await FS.writeFile({ path: filename, data: await blobToBase64(blob), directory: 'CACHE' });
      try { await SH.share({ title: filename, files: [w.uri] }); }
      catch (e) { if (!/cancel/i.test((e && e.message) || '')) throw e; }
      return true;
    }
    try {
      var file = new File([blob], filename, { type: type || blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return true; }
    var a = document.createElement('a');
    var u = URL.createObjectURL(blob);
    a.href = u; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(u); }, 300);
    return true;
  }

  document.addEventListener('click', async function (e) {
    var t = e.target.closest && e.target.closest('[data-fv-close],[data-fv-share]');
    if (!t) return;
    if (t.hasAttribute('data-fv-close')) close();
    else if (current) {
      try { await share(current.url, current.name, current.type); }
      catch (err) { console.warn('share failed', err); if (window.toast) toast('Couldn\'t share this file'); }
    }
  });

  // View a certificate's file by id — works with the local copy or, if this
  // device doesn't have it, the cloud copy.
  function viewCert(certId) {
    var c = window.Store && Store.getCert(certId);
    if (!c) return;
    var f = c.file || {};
    var src = f.data_url || f.storage_path || c.file_url;
    if (!src) return;
    view(src, f.name || c.name, f.type);
  }

  window.CodedokFiles = { view: view, viewCert: viewCert, share: share, close: close };
})();
