// CodedOK — /founding pre-launch page: waitlist, referrals, ad tracking.
//
// Standalone on purpose (no app.js): ad traffic lands here, so it must be
// fast. Talks to Supabase through three locked-down RPCs from migration
// 0024 — the waitlist table itself is unreadable from the browser.
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────
  var SUPABASE_URL = 'https://zftoqqrqsxctehltebad.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmdG9xcXJxc3hjdGVobHRlYmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NzcxODIsImV4cCI6MjA5NDE1MzE4Mn0.T-gUL06oNQ7dfMJEA2zOVShcM9cwqsV6oH9CbQgi6j8';
  // Meta Pixel: paste your Pixel ID (Events Manager → Data sources). Empty = off.
  var META_PIXEL_ID = '';
  var GA_ID = 'G-SC75K10T7S';
  var SITE = 'https://codedok.com/founding';
  var REFERRALS_FOR_REWARD = 3;
  var SHOW_TOTAL_FROM = 25;   // hide the social-proof count until it's credible

  var $ = function (id) { return document.getElementById(id); };
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) { return null; } }
  function sstore(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (_) { return null; } }

  // ── Attribution: keep the first-touch UTM / fbclid / invite code ─────
  var qs = new URLSearchParams(location.search);
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'ref'].forEach(function (k) {
    var v = qs.get(k);
    if (v && !sstore('cdk_' + k)) sstore('cdk_' + k, v.slice(0, 500));
  });
  var refIn = sstore('cdk_ref');
  if (refIn) $('invite').hidden = false;

  // ── Consent-gated tracking (UK PECR: no ad cookies without consent) ──
  var tracking = false;
  function loadTracking() {
    if (tracking) return;
    tracking = true;
    if (META_PIXEL_ID) {
      // Meta's standard loader, without inline script (CSP-safe).
      var f = window.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
      if (!window._fbq) window._fbq = f;
      f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
      var s = document.createElement('script');
      s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js';
      document.head.appendChild(s);
      window.fbq('init', META_PIXEL_ID);
      window.fbq('track', 'PageView');
    }
    if (GA_ID) {
      var g = document.createElement('script');
      g.async = true; g.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
      document.head.appendChild(g);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', GA_ID, { anonymize_ip: true });
    }
  }
  function track(metaEvent, gaEvent, params, eventId) {
    if (!tracking) return;
    try { if (window.fbq && metaEvent) window.fbq('track', metaEvent, params || {}, eventId ? { eventID: eventId } : undefined); } catch (_) {}
    try { if (window.gtag && gaEvent) window.gtag('event', gaEvent, params || {}); } catch (_) {}
  }
  var consent = store('cdk_consent');
  if (consent === 'granted') loadTracking();
  else if (consent !== 'denied') $('consentBar').hidden = false;
  $('cAccept').onclick = function () { store('cdk_consent', 'granted'); $('consentBar').hidden = true; loadTracking(); };
  $('cDecline').onclick = function () { store('cdk_consent', 'denied'); $('consentBar').hidden = true; };

  // ── Supabase RPC ──────────────────────────────────────────────────────
  function rpc(fn, body) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  // Social proof — only once the number is worth showing.
  rpc('waitlist_total').then(function (n) {
    if (typeof n === 'number' && n >= SHOW_TOTAL_FROM) {
      $('total').textContent = n.toLocaleString('en-GB');
      $('proof').hidden = false;
    }
  }).catch(function () {});

  // ── Join ──────────────────────────────────────────────────────────────
  var editToken = null;
  function showError(msg) { $('err').textContent = msg; $('err').hidden = !msg; }

  function join(email, isReturn) {
    var utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) { var v = sstore('cdk_' + k); if (v) utm[k] = v; });
    return rpc('join_waitlist', {
      p_email: email,
      p_ref: sstore('cdk_ref') || null,
      p_consent: !!$('consent').checked,
      p_utm: utm,
      p_fbclid: sstore('cdk_fbclid') || null,
      p_path: location.pathname
    }).then(function (res) {
      if (!res || !res.ok) {
        if (!isReturn) showError(res && res.error === 'invalid_email' ? 'That email doesn\'t look right — mind checking it?' : 'Something went wrong. Please try again.');
        return;
      }
      store('cdk_wl_email', email);
      editToken = res.edit_token || null;
      showDone(res);
      if (!res.already && !isReturn) {
        // eventID = their referral code, so a later server-side
        // Conversions API event for the same lead de-duplicates.
        track('Lead', 'generate_lead', { content_name: 'founding_list' }, res.ref_code);
      }
    });
  }

  function showDone(res) {
    $('join').hidden = true;
    $('fine').hidden = true;
    $('proof').hidden = true;
    $('invite').hidden = true;
    showError('');
    $('doneTitle').textContent = res.already ? 'Welcome back — you\'re on the list' : 'You\'re on the founding list';
    $('place').textContent = String(res.place);
    var link = SITE + '?ref=' + encodeURIComponent(res.ref_code);
    $('refLink').value = link;
    var msg = 'I\'ve joined the founding list for CodedOK — an app that keeps all your coded vessel certificates in one place and reminds you before anything expires. Join with my link and get 3 months of Pro free: ' + link;
    $('waBtn').href = 'https://wa.me/?text=' + encodeURIComponent(msg);
    if (navigator.share) {
      $('shareBtn').hidden = false;
      $('shareBtn').onclick = function () {
        navigator.share({ title: 'CodedOK is coming to iPhone', text: msg.replace(link, '').trim(), url: link }).then(function () { track(null, 'share', { method: 'native' }); }).catch(function () {});
      };
    }
    var n = Math.min(res.referrals || 0, REFERRALS_FOR_REWARD);
    $('meterTxt').textContent = (res.referrals || 0) + ' of ' + REFERRALS_FOR_REWARD + ' invites';
    setTimeout(function () { $('meterBar').style.width = (n / REFERRALS_FOR_REWARD * 100) + '%'; }, 50);
    $('step2').hidden = !editToken;
    $('done').hidden = false;
    $('sticky').style.display = 'none';
  }

  $('join').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('email').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showError('Please enter a valid email address.'); $('email').focus(); return; }
    showError('');
    var btn = $('joinBtn');
    btn.disabled = true; btn.textContent = 'Joining…';
    join(email, false).catch(function () {
      showError('Couldn\'t connect. Check your signal and try again.');
    }).then(function () { btn.disabled = false; btn.textContent = 'Get early access'; });
  });

  // Returning visitor on this device: show their live place + link.
  var known = store('cdk_wl_email');
  if (known) join(known, true).catch(function () {});

  // ── Share / copy ──────────────────────────────────────────────────────
  $('copyBtn').onclick = function () {
    var inp = $('refLink');
    var done = function () { $('copyBtn').textContent = 'Copied'; setTimeout(function () { $('copyBtn').textContent = 'Copy'; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(inp.value).then(done).catch(function () { inp.select(); });
    else { inp.select(); try { document.execCommand('copy'); done(); } catch (_) {} }
    track(null, 'share', { method: 'copy' });
  };
  $('waBtn').addEventListener('click', function () { track(null, 'share', { method: 'whatsapp' }); });

  // ── Step 2: optional quick profile ────────────────────────────────────
  var profile = {};
  document.querySelectorAll('.chips').forEach(function (group) {
    group.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip || !editToken) return;
      group.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('on', c === chip); });
      profile[group.getAttribute('data-field')] = chip.textContent.trim();
      rpc('update_waitlist_profile', {
        p_token: editToken,
        p_role: profile.role || null,
        p_boat_count: profile.boat_count || null,
        p_region: profile.region || null
      }).then(function () { $('thanks').hidden = false; }).catch(function () {});
    });
  });

  // ── "Use it now" clicks: GA only. Meta's Lead stays reserved for real
  // waitlist signups, so ad optimisation isn't polluted by click-outs.
  document.querySelectorAll('[data-track]').forEach(function (a) {
    a.addEventListener('click', function () { track(null, 'use_now_click', { link: a.getAttribute('data-track') }); });
  });

  // ── Sticky mobile CTA once the form is off-screen ─────────────────────
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      var off = !entries[0].isIntersecting && $('done').hidden && $('consentBar').hidden;
      $('sticky').style.display = off && window.innerWidth < 861 ? 'block' : 'none';
    }).observe($('join'));
  }
  $('stickyBtn').addEventListener('click', function (e) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(function () { $('email').focus(); }, 400);
  });
})();
