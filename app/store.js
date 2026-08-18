// CodedOK data layer — localStorage-backed, with seed data on first launch.
// Exposes a global `Store` object. All UI reads/writes go through this.
(function () {
  'use strict';

  const KEY = 'codedok-v2';
  const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
  const DAY_MS = 86400000;

  function isoOffset(days) {
    return new Date(TODAY.getTime() + days * DAY_MS).toISOString().slice(0, 10);
  }

  // Empty state — what every real account starts from. No vessels, crew,
  // certs, or surveyors. Their real data flows in via sync.js from Supabase.
  function buildEmptyState() {
    return {
      meta: { seededAt: new Date().toISOString(), version: 2 },
      session: { user_id: null, mode: 'operator' },
      users: [],
      organizations: [],
      memberships: [],
      user: null,
      vessels: [],
      certs: [],
      equipment: [],
      crew: [],
      crewCerts: [],
      deficiencies: [],
      surveyor_grants: [],
      inspections: [],
      sms_documents: [],
      handoff_links: [],
      jobs: [],
      invoices: [],
      review_requests: [],
      audit_log: []
    };
  }

  // Seed data is dated relative to "today" so the demo always looks right
  // regardless of when the user first opens the app. Only loaded for the
  // single demo account (mcljd303@icloud.com) — see Store.applyDemoSeed.
  function buildDemoSeed() {
    return {
      meta: { seededAt: new Date().toISOString(), version: 2 },

      // App-level state — which user is "logged in" (operator or surveyor view).
      session: {
        user_id: 'u_jm',           // active user
        mode: 'operator'           // 'operator' | 'surveyor' — toggle in account screen for demo
      },

      // Users — operators and surveyors all live here.
      users: [
        { id: 'u_jm',  email: 'joseph@codedok.com',     name: 'Joseph McLaughlin', initials: 'JM', kind: 'operator', phone: '+44 7700 900111' },
        { id: 'u_sv1', email: 'mccollam@example.com',   name: 'Anchor Marine',   initials: 'MM', kind: 'surveyor',
          surveyor: { qualifications: ['Naval Architect MRINA', 'MCA-recognised surveyor'], certifying_bodies: ['YDSA'], regions: ['Northern Ireland', 'Irish Sea'], company: 'Anchor Marine', tagline: 'Naval Architects · Marine Surveyors', phone: '+44 28 9012 3456', logo: 'icons/mccollam.webp' } },
        { id: 'u_rb',  email: 'service@redbayboats.com', name: 'Stormrider Marine',     initials: 'RB', kind: 'builder',
          builder: { company: 'Stormrider Marine', town: 'Cushendall, NI', phone: '+44 28 2177 1331', specialties: ['Stormforce RIB', 'Stormforce Cabin'] } },
        { id: 'u_admin', email: 'admin@codedok.com',    name: 'Joe (CodedOK)',     initials: 'JD', kind: 'admin' }
      ],

      // Organisations & memberships.
      organizations: [
        { id: 'org_jm', name: 'McLaughlin Charters', plan: 'trial', trial_ends_at: isoOffset(13), stripe_customer_id: null }
      ],
      memberships: [
        { org_id: 'org_jm', user_id: 'u_jm', role: 'owner' }
      ],
      // For backwards compatibility with v1 renderers:
      user: { name: 'Joseph McLaughlin', initials: 'JM', plan: 'trial', trialEndsAt: isoOffset(13) },

      vessels: [
        { id: 'v_silver_sands', org_id: 'org_jm', name: 'Tsunami IV', type: 'Open RIB charter', category: 'Cat 2',
          ssr: '987654', length: 8.5, persons: 10, port: 'Ballycastle', certifier: 'YDSA',
          icon: '⛵', photo: 'icons/vessels/tsunami.jpg', jurisdictions: ['UK'],
          make: 'Stormrider RIB', engine: 'Suzuki 300hp 4-stroke',
          built_by: 'redbay', hull_number: 'RB-487', built_at: isoOffset(-720) },
        { id: 'v_cormorant',    org_id: 'org_jm', name: 'Lagavulin',    type: 'Cabin RIB charter', category: 'Cat 2',
          ssr: '456789', length: 11.0, persons: 12, port: 'Ballycastle', certifier: 'YDSA',
          icon: '🚤', photo: 'icons/vessels/lagavulin.jpg', jurisdictions: ['UK'],
          make: 'Stormrider Cabin RIB', engine: 'Twin Suzuki 4-stroke',
          built_by: 'redbay', hull_number: 'RB-512', built_at: isoOffset(-400) }
      ],

      certs: [
        // Tsunami IV — 2 overdue, 1 due-soon, rest valid
        { id: 'c1',  vessel_id: 'v_silver_sands', kind: 'pyrotechnics', name: 'Cat C Pyrotechnics',     icon: '🧨', expires_at: isoOffset(-5),  category: 'equipment', issuer: 'IMO Group', number: 'PYR-4421' },
        { id: 'c2',  vessel_id: 'v_silver_sands', kind: 'liferaft',     name: 'Life raft service',      icon: '🛟', expires_at: isoOffset(-30), category: 'equipment', issuer: 'Survitec',  number: 'LR-9821' },
        { id: 'c3',  vessel_id: 'v_silver_sands', kind: 'coding',       name: 'YDSA Coding Certificate',icon: '📋', expires_at: isoOffset(18),  category: 'vessel',    issuer: 'YDSA',      number: 'YDSA/2024/TS/4892' },
        { id: 'c4',  vessel_id: 'v_silver_sands', kind: 'pli',          name: 'Public Liability Insurance', icon: '🛡️', expires_at: isoOffset(200), category: 'insurance', issuer: 'Pantaenius', number: 'PL-225887' },
        { id: 'c5',  vessel_id: 'v_silver_sands', kind: 'radio',        name: 'Ship Radio Licence (VHF)',icon: '📡', expires_at: isoOffset(640), category: 'vessel',    issuer: 'Ofcom',     number: 'GBRT-559220' },
        { id: 'c8',  vessel_id: 'v_silver_sands', kind: 'stability',    name: 'Stability book',         icon: '📋', expires_at: null,            category: 'vessel',    issuer: 'Anchor Marine', number: 'STAB-2022-19' },
        // Lagavulin — all clear
        { id: 'c10', vessel_id: 'v_cormorant',    kind: 'pli',          name: 'P&I Insurance',          icon: '🛡️', expires_at: isoOffset(240), category: 'insurance', issuer: 'Topsail',  number: 'P-118832' },
        { id: 'c11', vessel_id: 'v_cormorant',    kind: 'coding',       name: 'YDSA Coding Certificate',icon: '📋', expires_at: isoOffset(280), category: 'vessel',    issuer: 'YDSA',      number: 'YDSA/2024/LG/4901' },
        { id: 'c14', vessel_id: 'v_cormorant',    kind: 'liferaft',     name: 'Life raft service',      icon: '🛟', expires_at: isoOffset(420), category: 'equipment', issuer: 'Survitec',  number: 'LR-9899' },
        { id: 'c15', vessel_id: 'v_cormorant',    kind: 'radio',        name: 'Ship Radio Licence (VHF)',icon: '📡', expires_at: isoOffset(700), category: 'vessel',    issuer: 'Ofcom',     number: 'GBRT-559221' }
      ],

      // Equipment as a first-class entity — actual physical items aboard the vessel.
      equipment: [
        { id: 'e1',  vessel_id: 'v_silver_sands', kind: 'liferaft',    name: 'Liferaft',                 icon: '🛟', make: 'Survitec',  model: 'OceanMaster ISO 9650-1', serial: 'SVT-558821', qty: 1,  installed_at: '2022-06-15', last_service_at: '2023-09-12', next_service_at: isoOffset(-30), notes: 'Service due — book Survitec authorised station' },
        { id: 'e2',  vessel_id: 'v_silver_sands', kind: 'lifejacket',  name: 'Lifejackets 150N',         icon: '🦺', make: 'Crewsaver', model: 'Crewfit 165N',           serial: '—',          qty: 14, installed_at: '2022-06-15', last_service_at: '2024-09-04', next_service_at: isoOffset(150) },
        { id: 'e3',  vessel_id: 'v_silver_sands', kind: 'fire_ext',    name: 'Fire extinguishers (×4)',  icon: '🧯', make: 'Chubb',     model: 'AB 2kg',                 serial: '—',          qty: 4,  installed_at: '2022-06-15', last_service_at: '2025-03-04', next_service_at: isoOffset(330) },
        { id: 'e4',  vessel_id: 'v_silver_sands', kind: 'pyro_solas_a',name: 'SOLAS A Pyro pack',        icon: '🧨', make: 'Pains Wessex', model: 'SOLAS A',             serial: 'PW-4421',    qty: 1,  installed_at: '2022-06-15', last_service_at: '2022-06-15', next_service_at: isoOffset(-5),  notes: 'Pack out of date — replace before next trip' },
        { id: 'e5',  vessel_id: 'v_silver_sands', kind: 'epirb',       name: 'EPIRB 406 GPS',            icon: '📡', make: 'Ocean Signal', model: 'rescueME EPIRB1',     serial: 'OS-22118',   qty: 1,  installed_at: '2022-06-15', last_service_at: '2024-06-01', next_service_at: isoOffset(1500) },
        { id: 'e6',  vessel_id: 'v_silver_sands', kind: 'vhf_fixed',   name: 'VHF DSC fixed',            icon: '📻', make: 'Icom',      model: 'IC-M510',                serial: 'IC-99221',   qty: 1,  installed_at: '2022-06-15', last_service_at: null,         next_service_at: null },
        { id: 'e7',  vessel_id: 'v_silver_sands', kind: 'first_aid_c', name: 'First aid kit Cat C',      icon: '🩹', make: 'Reliance',  model: 'MGN 71 Cat C',           serial: '—',          qty: 1,  installed_at: '2022-06-15', last_service_at: '2024-08-20', next_service_at: isoOffset(120) },
        { id: 'e8',  vessel_id: 'v_silver_sands', kind: 'anchor',      name: 'Anchor + 60m chain',       icon: '⚓', make: 'Lewmar',    model: 'Delta 16kg',             serial: '—',          qty: 1,  installed_at: '2022-06-15', last_service_at: null,         next_service_at: null },

        { id: 'e10', vessel_id: 'v_cormorant',    kind: 'liferaft',    name: 'Coastal liferaft',         icon: '🛟', make: 'Survitec',  model: 'Coastal ISO 9650-1B',    serial: 'SVT-558822', qty: 1,  installed_at: '2023-04-10', last_service_at: '2024-04-02', next_service_at: isoOffset(420) },
        { id: 'e11', vessel_id: 'v_cormorant',    kind: 'lifejacket',  name: 'Lifejackets 150N',         icon: '🦺', make: 'Crewsaver', model: 'Crewfit 165N',           serial: '—',          qty: 10, installed_at: '2023-04-10', last_service_at: '2024-09-04', next_service_at: isoOffset(180) },
        { id: 'e12', vessel_id: 'v_cormorant',    kind: 'fire_ext',    name: 'Fire extinguishers (×2)',  icon: '🧯', make: 'Chubb',     model: 'AB 2kg',                 serial: '—',          qty: 2,  installed_at: '2023-04-10', last_service_at: '2025-02-01', next_service_at: isoOffset(290) },
        { id: 'e13', vessel_id: 'v_cormorant',    kind: 'plb',         name: 'PLB',                      icon: '📡', make: 'Ocean Signal', model: 'rescueME PLB1',       serial: 'OS-44201',   qty: 1,  installed_at: '2023-04-10', last_service_at: null,         next_service_at: isoOffset(1700) }
      ],

      crew: [
        { id: 'p_jm', org_id: 'org_jm', name: 'Joseph McLaughlin', initials: 'JM', role: 'Skipper',   vessel_ids: ['v_silver_sands', 'v_cormorant'], avatar_color: 'sea' },
        { id: 'p_pm', org_id: 'org_jm', name: 'Patrick Maguire',   initials: 'PM', role: 'Deck crew', vessel_ids: ['v_silver_sands'],                avatar_color: 'purp' }
      ],
      crewCerts: [
        { id: 'cc1', person_id: 'p_jm', name: 'RYA Day Skipper (Commercial)', expires_at: null,            issuer: 'RYA',  number: 'RYA-DS-44218' },
        { id: 'cc2', person_id: 'p_jm', name: 'ENG1 Medical',                  expires_at: isoOffset(27),  issuer: 'NHS Approved', number: 'ENG1-22118' },
        { id: 'cc3', person_id: 'p_jm', name: 'VHF SRC',                       expires_at: null,            issuer: 'RYA',  number: 'SRC-91188' },
        { id: 'cc4', person_id: 'p_jm', name: 'First Aid (RYA)',               expires_at: isoOffset(450), issuer: 'RYA',  number: 'FA-44190' },
        { id: 'cc5', person_id: 'p_pm', name: 'GMDSS Short Range',             expires_at: isoOffset(35),  issuer: 'RYA',  number: 'SRC-91201' },
        { id: 'cc6', person_id: 'p_pm', name: 'First Aid',                     expires_at: isoOffset(640), issuer: 'St John Ambulance', number: 'SJA-22841' }
      ],

      deficiencies: [
        { id: 'd1', vessel_id: 'v_silver_sands', title: 'Category C pyrotechnics — expired',  severity: 'critical', raised_at: isoOffset(-5),  status: 'open',     source: 'self',     raised_by: 'u_jm' },
        { id: 'd2', vessel_id: 'v_silver_sands', title: 'Life raft — service overdue',         severity: 'critical', raised_at: isoOffset(-30), status: 'open',     source: 'self',     raised_by: 'u_jm' },
        { id: 'd3', vessel_id: 'v_silver_sands', title: 'Annual coding cert — due in 18 days', severity: 'major',    raised_at: isoOffset(-2),  status: 'open',     source: 'self',     raised_by: 'u_jm' }
      ],

      // Surveyor grants — link a surveyor user to a vessel with scopes.
      surveyor_grants: [
        { id: 'sg1', vessel_id: 'v_silver_sands', surveyor_user_id: 'u_sv1', granted_by: 'u_jm', granted_at: isoOffset(-180), expires_at: isoOffset(180), scopes: ['view','deficiency','inspect','issue_cert'], revoked_at: null },
        { id: 'sg2', vessel_id: 'v_cormorant',    surveyor_user_id: 'u_sv1', granted_by: 'u_jm', granted_at: isoOffset(-180), expires_at: isoOffset(180), scopes: ['view','deficiency','inspect','issue_cert'], revoked_at: null }
      ],

      // Inspections — guided walk-throughs by surveyors.
      inspections: [
        { id: 'i1', vessel_id: 'v_silver_sands', surveyor_user_id: 'u_sv1', started_at: isoOffset(-300), completed_at: isoOffset(-298), status: 'signed', signed_pdf_url: null, summary: 'Annual renewal — passed, no deficiencies' },
        { id: 'i2', vessel_id: 'v_cormorant',    surveyor_user_id: 'u_sv1', started_at: isoOffset(-200), completed_at: isoOffset(-198), status: 'signed', signed_pdf_url: null, summary: 'Annual renewal — passed' }
      ],

      // SMS documents — bespoke premium content.
      sms_documents: [
        // Empty by default — operators add via the SMS builder.
      ],

      // Hand-off QR codes — temporary read-only access tokens.
      handoff_links: [],

      // Marketplace: jobs are the unit of work the surveyor does for an operator
      // (SMS review, annual survey, mid-term, renewal). Invoices belong to jobs.
      jobs: [
        // Seed 1: completed paid job (shows in Earnings)
        { id: 'j_seed1', vessel_id: 'v_cormorant', surveyor_user_id: 'u_sv1', requested_by_user_id: 'u_jm',
          type: 'annual_survey', title: 'Annual renewal survey — Lagavulin',
          description: 'Annual renewal under Workboat Code Ed 3, Cat 3.',
          status: 'completed',
          created_at: isoOffset(-205), quote_amount: 285, quote_sent_at: isoOffset(-204),
          paid_at: isoOffset(-200), payment_method: 'stripe',
          completed_at: isoOffset(-198), invoice_id: 'inv_seed1', attachment_url: null },
        // Seed 2: pending request from operator — appears in Inbox
        { id: 'j_seed2', vessel_id: 'v_silver_sands', surveyor_user_id: 'u_sv1', requested_by_user_id: 'u_jm',
          type: 'sms_review', title: 'SMS review — Tsunami IV',
          description: 'Operator has built a new SMS in CodedOK and asks for technical review and sign-off.',
          status: 'requested',
          created_at: isoOffset(-1), quote_amount: null, quote_sent_at: null,
          paid_at: null, payment_method: null,
          completed_at: null, invoice_id: null, sms_doc_id: null, attachment_url: null }
      ],

      invoices: [
        { id: 'inv_seed1', job_id: 'j_seed1', vessel_id: 'v_cormorant',
          surveyor_user_id: 'u_sv1', operator_org_id: 'org_jm',
          line_items: [
            { description: 'Annual renewal survey (out of water)', qty: 1, unit_price: 235 },
            { description: 'Travel — Cushendall', qty: 1, unit_price: 50 }
          ],
          subtotal: 285, vat: 57, total: 342, currency: 'GBP',
          status: 'paid',
          issued_at: isoOffset(-204), due_at: isoOffset(-190), paid_at: isoOffset(-200), paid_amount: 342,
          notes: 'Thanks for the work — invoice settled via CodedOK Pay.' }
      ],

      // Quote/review workflow status records (how operator sees their requested job).
      review_requests: [],


      // Audit log — high-signal events.
      audit_log: [
        { id: 'a1', org_id: 'org_jm', actor_user_id: 'u_jm', action: 'cert.added',     target_type: 'cert',   target_id: 'c4', at: isoOffset(-3),  metadata: { name: 'Public Liability Insurance' } },
        { id: 'a2', org_id: 'org_jm', actor_user_id: null,    action: 'cert.flagged',   target_type: 'cert',   target_id: 'c1', at: isoOffset(-5),  metadata: { reason: 'expired' } },
        { id: 'a3', org_id: 'org_jm', actor_user_id: 'u_jm', action: 'equipment.serviced', target_type: 'equipment', target_id: 'e3', at: isoOffset(-42), metadata: { name: 'Fire extinguishers' } },
        { id: 'a4', org_id: 'org_jm', actor_user_id: 'u_sv1',action: 'inspection.signed', target_type: 'inspection', target_id: 'i2', at: isoOffset(-198), metadata: { vessel: 'Lagavulin' } }
      ]
    };
  }

  // True if the Store still carries the original hardcoded demo fixtures.
  // We use this to decide whether a sign-in by a non-demo user should
  // wipe the local cache. Real users' offline data won't match these IDs.
  function looksLikeDemo(parsed) {
    if (!parsed) return false;
    const u = parsed.users || [];
    const v = parsed.vessels || [];
    const o = parsed.organizations || [];
    return u.some((x) => x.id === 'u_jm' || x.id === 'u_sv1')
        || v.some((x) => x.id === 'v_silver_sands' || x.id === 'v_cormorant')
        || o.some((x) => x.id === 'org_jm');
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        // Cold start: empty Store. Demo fixtures only load via
        // Store.applyDemoSeed() when the demo account signs in.
        const fresh = buildEmptyState();
        localStorage.setItem(KEY, JSON.stringify(fresh));
        return fresh;
      }
      const parsed = JSON.parse(raw);
      // Light migration: if old v1 keys are present, drop and start clean.
      if (!parsed.session || !parsed.equipment) {
        const fresh = buildEmptyState();
        localStorage.setItem(KEY, JSON.stringify(fresh));
        return fresh;
      }
      // Migration: rename legacy seed vessels (Silver Sands -> Tsunami IV,
      // Cormorant -> Lagavulin) and refresh their meta fields. Idempotent —
      // only fires when the old names are still present. Kept for the
      // demo account's existing localStorage; harmless on empty Stores.
      let migrated = false;
      (parsed.vessels || []).forEach((v) => {
        if (v.id === 'v_silver_sands' && !v.built_by) { v.built_by = 'redbay'; v.hull_number = v.hull_number || 'RB-487'; migrated = true; }
        if (v.id === 'v_cormorant'    && !v.built_by) { v.built_by = 'redbay'; v.hull_number = v.hull_number || 'RB-512'; migrated = true; }
      });
      if (parsed.users && parsed.users.length && !parsed.users.find((u) => u.id === 'u_rb') && parsed.users.find((u) => u.id === 'u_jm')) {
        parsed.users.push({
          id: 'u_rb', email: 'service@redbayboats.com', name: 'Stormrider Marine', initials: 'RB', kind: 'builder',
          builder: { company: 'Stormrider Marine', town: 'Cushendall, NI', phone: '+44 28 2177 1331', specialties: ['Stormforce RIB', 'Stormforce Cabin'] }
        });
        migrated = true;
      }
      (parsed.vessels || []).forEach((v) => {
        if (v.id === 'v_silver_sands' && v.name === 'Silver Sands') {
          v.name = 'Tsunami IV';
          v.type = 'Open RIB charter';
          v.length = 8.5;
          v.persons = 10;
          v.port = 'Ballycastle';
          v.make = 'Stormrider RIB';
          v.engine = 'Suzuki 300hp 4-stroke';
          v.photo = v.photo || null;
          migrated = true;
        }
        if (v.id === 'v_cormorant' && v.name === 'Cormorant') {
          v.name = 'Lagavulin';
          v.type = 'Cabin RIB charter';
          v.category = 'Cat 2';
          v.length = 11.0;
          v.persons = 12;
          v.port = 'Ballycastle';
          v.make = 'Stormrider Cabin RIB';
          v.engine = 'Twin Suzuki 4-stroke';
          v.photo = v.photo || null;
          migrated = true;
        }
      });
      if (migrated) localStorage.setItem(KEY, JSON.stringify(parsed));
      return parsed;
    } catch (err) {
      console.warn('Store load failed, resetting to empty:', err);
      const fresh = buildEmptyState();
      localStorage.setItem(KEY, JSON.stringify(fresh));
      return fresh;
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  let state = load();

  // ---------- Computed helpers ----------

  function daysUntil(iso) {
    if (!iso) return Infinity;
    const d = new Date(iso); d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - TODAY.getTime()) / DAY_MS);
  }

  function bucket(days) {
    if (days < 0) return 'overdue';
    if (days <= 30) return 'due30';
    if (days <= 60) return 'due60';
    return 'valid';
  }

  function vesselCerts(vesselId) {
    return state.certs.filter((c) => c.vessel_id === vesselId);
  }

  function vesselEquipment(vesselId) {
    return state.equipment.filter((e) => e.vessel_id === vesselId);
  }

  function vesselDeficiencies(vesselId, opts) {
    let list = state.deficiencies.filter((d) => d.vessel_id === vesselId);
    if (opts && opts.openOnly) list = list.filter((d) => d.status === 'open');
    return list;
  }

  function vesselCrew(vesselId) {
    return state.crew.filter((p) => (p.vessel_ids || []).indexOf(vesselId) !== -1);
  }

  function fleetCerts() {
    return state.certs;
  }

  function fleetEquipment() {
    return state.equipment;
  }

  function getVessel(vesselId) {
    return state.vessels.find((v) => v.id === vesselId);
  }

  function getUser(userId) {
    return state.users.find((u) => u.id === userId);
  }

  function getCurrentUser() {
    return getUser(state.session.user_id);
  }

  function getMode() {
    return state.session.mode;
  }

  function setMode(mode) {
    if (!['operator', 'surveyor', 'admin', 'builder'].includes(mode)) return;
    const user = state.users.find((u) => u.kind === mode);
    if (user) state.session.user_id = user.id;
    state.session.mode = mode;
    save(state);
  }

  // ---------- Builder (boat builder, e.g. Redbay) ----------
  // Anything that supports the boat-builder dashboard: every hull built by
  // a given builder, their service pipeline, and aftermarket leads.

  function vesselsByBuilder(builderSlug) {
    return state.vessels.filter((v) => v.built_by === builderSlug);
  }

  function builderPipeline(builderSlug) {
    const vessels = vesselsByBuilder(builderSlug);
    return vessels.map((v) => {
      const counts = urgencyCounts(v.id);
      const score = complianceScore(v.id);
      const certs = vesselCerts(v.id);
      const equip = vesselEquipment(v.id);
      // Next service / cert across both lists.
      const items = []
        .concat(certs.map((c) => ({ kind: 'cert', label: c.name, due: c.expires_at, severity: daysUntil(c.expires_at) })))
        .concat(equip.map((e) => ({ kind: 'equipment', label: e.name, due: e.next_service_at, severity: daysUntil(e.next_service_at) })))
        .filter((i) => i.due && i.severity !== Infinity)
        .sort((a, b) => a.severity - b.severity);
      const nextDue = items[0] || null;
      const overdue = items.filter((i) => i.severity < 0);
      const dueSoon = items.filter((i) => i.severity >= 0 && i.severity <= 60);
      // Pull the owner so the builder can email them.
      const org = state.organizations.find((o) => o.id === v.org_id) || {};
      const ownerMembership = state.memberships.find((m) => m.org_id === v.org_id && m.role === 'owner');
      const owner = ownerMembership ? getUser(ownerMembership.user_id) : null;
      return { vessel: v, owner, org, counts, score, nextDue, overdue: overdue.length, dueSoon: dueSoon.length };
    }).sort((a, b) => (a.nextDue && b.nextDue) ? a.nextDue.severity - b.nextDue.severity : 0);
  }

  function smsSubmissions(statusFilter) {
    let list = (state.sms_documents || []).filter((d) => d.type === 'full_sms' || d.type === 'risk_assess' || d.status === 'submitted' || d.status === 'in_progress' || d.status === 'delivered');
    if (statusFilter) list = list.filter((d) => d.status === statusFilter);
    return list.sort((a, b) => (b.submitted_at || b.last_reviewed_at || '').localeCompare(a.submitted_at || a.last_reviewed_at || ''));
  }

  function updateSmsDocument(docId, patch) {
    const d = (state.sms_documents || []).find((x) => x.id === docId);
    if (!d) return;
    Object.assign(d, patch || {});
    save(state);
    return d;
  }

  function deliverSmsToOperator(docId, polished_sections, notes, polished_body) {
    const d = updateSmsDocument(docId, {
      status: 'delivered',
      polished_sections: polished_sections,
      polished_body: polished_body || '',
      admin_notes: notes || '',
      delivered_at: isoOffset(0),
      version: ((state.sms_documents.find((x) => x.id === docId) || {}).version || 1) + 1
    });
    if (d) {
      logAction('sms.delivered', 'sms', d.id, { vessel_id: d.vessel_id });
      state.audit_log.unshift({
        id: uid('a'), org_id: d.org_id, actor_user_id: 'u_admin',
        action: 'sms.delivered', target_type: 'sms', target_id: d.id,
        at: isoOffset(0),
        metadata: { vessel_id: d.vessel_id, title: d.title }
      });
      save(state);
    }
    return d;
  }

  function complianceScore(vesselId) {
    const certs = vesselId ? vesselCerts(vesselId) : fleetCerts();
    const equipment = vesselId ? vesselEquipment(vesselId) : fleetEquipment();
    const items = certs.concat(equipment.map((e) => ({ expires_at: e.next_service_at })));
    if (items.length === 0) return 100;
    let valid = 0, overdue = 0;
    for (const it of items) {
      const d = daysUntil(it.expires_at);
      if (d === Infinity) { valid++; continue; }
      if (d < 0) overdue++;
      else valid++;
    }
    const total = items.length;
    const validRatio = valid / total;
    const overdueRatio = overdue / total;
    const score = (validRatio * 0.7 + (1 - overdueRatio) * 0.3) * 100;
    return Math.max(0, Math.round(score));
  }

  function urgencyCounts(vesselId) {
    const certs = vesselId ? vesselCerts(vesselId) : fleetCerts();
    const equipment = vesselId ? vesselEquipment(vesselId) : fleetEquipment();
    const items = certs.concat(equipment.map((e) => ({ expires_at: e.next_service_at })));
    const out = { overdue: 0, due30: 0, due60: 0, valid: 0 };
    for (const it of items) {
      const d = daysUntil(it.expires_at);
      if (d === Infinity) { out.valid++; continue; }
      out[bucket(d)]++;
    }
    return out;
  }

  function topActions(limit) {
    if (typeof limit !== 'number') limit = 3;
    const certWithDays = state.certs.map((c) => ({ kind: 'cert', cert: c, days: daysUntil(c.expires_at), vessel: getVessel(c.vessel_id) }));
    const equipWithDays = state.equipment.map((e) => ({ kind: 'equipment', equipment: e, days: daysUntil(e.next_service_at), vessel: getVessel(e.vessel_id) }));
    const crewWithDays = state.crewCerts.map((cc) => ({ kind: 'crewCert', crewCert: cc, days: daysUntil(cc.expires_at), person: state.crew.find((p) => p.id === cc.person_id) }));
    let all = certWithDays.concat(equipWithDays).concat(crewWithDays).filter((it) => it.days !== Infinity);
    all.sort((a, b) => a.days - b.days);

    // Dedupe: liferafts and similar items often exist as BOTH a cert
    // ("Life raft service") and equipment ("Liferaft") on the same vessel.
    // Keep the most urgent occurrence per (vessel_id, item_kind) so the
    // user sees one row, not two for the same physical thing.
    const seen = new Set();
    all = all.filter((it) => {
      const child = it.cert || it.equipment || it.crewCert;
      const vesselId = child && child.vessel_id;
      const itemKind = child && child.kind;
      if (!vesselId || !itemKind) return true;
      const key = vesselId + '|' + itemKind;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return all.filter((it) => it.days <= 60).slice(0, limit);
  }

  function isInspectionReady(vesselId) {
    return urgencyCounts(vesselId).overdue === 0;
  }

  // Compare actual vs Codes-required cert+equipment lists.
  // Returns { coveredCerts, missingCerts, coveredEquip, missingEquip, recommendations }.
  function gapAnalysis(vesselId) {
    if (!window.Codes) return { coveredCerts: [], missingCerts: [], coveredEquip: [], missingEquip: [], recommendations: [] };
    const v = getVessel(vesselId);
    if (!v) return { coveredCerts: [], missingCerts: [], coveredEquip: [], missingEquip: [], recommendations: [] };

    const requiredCerts = window.Codes.requiredVesselCerts(v.category);
    const heldCerts = vesselCerts(vesselId);
    const heldKinds = new Set(heldCerts.map((c) => c.kind));
    const coveredCerts = requiredCerts.filter((r) => heldKinds.has(r.kind));
    const missingCerts = requiredCerts.filter((r) => r.required && !heldKinds.has(r.kind));

    const requiredEquip = window.Codes.requiredEquipment(v.category, v);
    const heldEquip = vesselEquipment(vesselId);
    const heldEquipKinds = new Set(heldEquip.map((e) => e.kind));
    const coveredEquip = requiredEquip.filter((r) => heldEquipKinds.has(r.kind));
    const missingEquip = requiredEquip.filter((r) => r.mandatory && !heldEquipKinds.has(r.kind));

    return { coveredCerts, missingCerts, coveredEquip, missingEquip };
  }

  // Surveyor helpers — used in surveyor mode.
  function surveyorGrants(surveyorUserId) {
    return state.surveyor_grants.filter((g) => g.surveyor_user_id === surveyorUserId && !g.revoked_at);
  }

  function surveyorVessels(surveyorUserId) {
    const grants = surveyorGrants(surveyorUserId);
    return grants.map((g) => {
      const v = getVessel(g.vessel_id);
      const ownerOrg = state.organizations.find((o) => o.id === (v ? v.org_id : null));
      return v ? { vessel: v, grant: g, ownerOrg: ownerOrg } : null;
    }).filter(Boolean);
  }

  function vesselGrants(vesselId) {
    return state.surveyor_grants.filter((g) => g.vessel_id === vesselId && !g.revoked_at);
  }

  function vesselInspections(vesselId) {
    return state.inspections.filter((i) => i.vessel_id === vesselId).sort((a, b) => (b.completed_at || b.started_at).localeCompare(a.completed_at || a.started_at));
  }

  // ---------- Mutations ----------

  function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }

  function logAction(action, targetType, targetId, metadata) {
    const me = getCurrentUser();
    const orgId = me && me.kind === 'operator' ? 'org_jm' : (state.vessels[0] && state.vessels[0].org_id) || 'org_jm';
    state.audit_log.unshift({ id: uid('a'), org_id: orgId, actor_user_id: me ? me.id : null, action, target_type: targetType, target_id: targetId, at: isoOffset(0), metadata: metadata || {} });
    // Audit trail used to be capped at 100 entries FIFO — meaning a
    // busy operator silently lost their earliest history after ~100
    // actions. That fails the basic surveyor test ("show me every
    // change to this record"). Raised to 5,000 to keep multiple
    // years of activity in-store without unbounded growth. The
    // authoritative log lives in Supabase via the audit_log table —
    // this is just the cached projection for offline rendering.
    if (state.audit_log.length > 5000) state.audit_log.length = 5000;
  }

  function addVessel(input) {
    // Lazy-create a starter org + membership the first time a real user
    // adds a vessel. The legacy fallback (input.org_id || 'org_jm') only
    // worked for the seeded demo account; for everyone else the vessel
    // would otherwise be orphaned to a non-existent org.
    let orgId = input.org_id;
    if (!orgId) {
      const me = getCurrentUser();
      const myMembership = me ? state.memberships.find((m) => m.user_id === me.id) : null;
      if (myMembership) {
        orgId = myMembership.org_id;
      } else if (me) {
        orgId = uid('org');
        const isSolo = !me.business_name;
        const orgName = me.business_name
          || (me.name ? me.name + "'s vessels" : 'My vessels');
        state.organizations.push({
          id: orgId,
          name: orgName,
          plan: 'trial',
          trial_ends_at: isoOffset(14),
          stripe_customer_id: null,
          // Solo organizations are flagged so the UI can hide team
          // features (invite members etc.) when there's never going
          // to be a second person on this account.
          solo_user_id: isSolo ? me.id : null
        });
        state.memberships.push({
          org_id: orgId, user_id: me.id, role: 'owner',
          permissions: ['view_all','manage_vessels','manage_crew','manage_certs','manage_sms','manage_team']
        });
      } else {
        // No signed-in user (shouldn't happen in normal flow); fall back to
        // the demo org so legacy seed paths keep working.
        orgId = 'org_jm';
      }
    }
    const v = {
      id: uid('v'),
      org_id: orgId,
      name: input.name || 'Untitled vessel',
      type: input.type || 'Motor vessel',
      category: input.category || 'Cat 2',
      ssr: input.ssr || '',
      length: input.length || null,
      persons: input.persons || 12,
      port: input.port || '',
      certifier: input.certifier || 'YDSA',
      icon: input.icon || '⛵',
      jurisdictions: input.jurisdictions || ['UK']
    };
    state.vessels.push(v);
    logAction('vessel.added', 'vessel', v.id, { name: v.name });
    save(state);
    return v;
  }

  function updateVessel(vesselId, patch) {
    const v = getVessel(vesselId);
    if (!v) return null;
    const allowed = ['name', 'type', 'category', 'ssr', 'length', 'persons', 'port', 'certifier', 'icon', 'make', 'engine', 'photo'];
    allowed.forEach((k) => {
      if (patch[k] !== undefined) v[k] = patch[k];
    });
    logAction('vessel.updated', 'vessel', v.id, { fields: Object.keys(patch) });
    save(state);
    return v;
  }

  function deleteVessel(vesselId) {
    const v = getVessel(vesselId);
    if (!v) return false;
    state.vessels = state.vessels.filter((x) => x.id !== vesselId);
    // Cascade: remove certs, equipment, deficiencies, inspections, jobs, surveyor grants for this vessel.
    state.certs = state.certs.filter((c) => c.vessel_id !== vesselId);
    state.equipment = state.equipment.filter((e) => e.vessel_id !== vesselId);
    state.deficiencies = state.deficiencies.filter((d) => d.vessel_id !== vesselId);
    state.inspections = state.inspections.filter((i) => i.vessel_id !== vesselId);
    state.surveyor_grants = state.surveyor_grants.filter((g) => g.vessel_id !== vesselId);
    if (state.jobs) state.jobs = state.jobs.filter((j) => j.vessel_id !== vesselId);
    if (state.invoices) state.invoices = state.invoices.filter((i) => i.vessel_id !== vesselId);
    if (state.sms_documents) state.sms_documents = state.sms_documents.filter((d) => d.vessel_id !== vesselId);
    logAction('vessel.deleted', 'vessel', vesselId, { name: v.name });
    save(state);
    return true;
  }

  function addCert(input) {
    const c = {
      id: uid('c'),
      vessel_id: input.vessel_id,
      kind: input.kind || 'other',
      name: input.name || 'Certificate',
      icon: input.icon || '📋',
      expires_at: input.expires_at || null,
      category: input.category || 'vessel',
      issuer: input.issuer || '',
      number: input.number || '',
      file: input.file || null,    // { name, type, size, data_url, added_at }
      issued_at: input.issued_at || null,
      // Audit field — only populated when added via the AI extraction
      // flow. Carries the raw extraction + any human overrides so a
      // surveyor can answer "did the AI hallucinate or did the
      // operator override?" months later.
      extraction: input.extraction || null
    };
    state.certs.push(c);
    const audit = { name: c.name, hasFile: !!c.file };
    if (c.extraction) {
      audit.aiConfidence = c.extraction.confidence;
      audit.aiOverrides = (c.extraction.overrides || []).map((o) => o.field);
    }
    logAction('cert.added', 'cert', c.id, audit);
    save(state);
    return c;
  }

  function updateCert(certId, patch) {
    const c = state.certs.find((x) => x.id === certId);
    if (!c) return;
    Object.assign(c, patch || {});
    logAction('cert.updated', 'cert', c.id, {});
    save(state);
    return c;
  }

  function deleteCert(certId) {
    const idx = state.certs.findIndex((x) => x.id === certId);
    if (idx < 0) return;
    const c = state.certs[idx];
    state.certs.splice(idx, 1);
    logAction('cert.deleted', 'cert', certId, { name: c.name });
    save(state);
  }

  function attachFileToCert(certId, file) {
    const c = state.certs.find((x) => x.id === certId);
    if (!c) return;
    c.file = file;
    logAction('cert.file_attached', 'cert', c.id, { file_name: file && file.name });
    save(state);
    return c;
  }

  function detachFileFromCert(certId) {
    const c = state.certs.find((x) => x.id === certId);
    if (!c) return;
    c.file = null;
    logAction('cert.file_removed', 'cert', c.id, {});
    save(state);
    return c;
  }

  function getCert(certId) {
    return state.certs.find((c) => c.id === certId);
  }

  function addEquipment(input) {
    const e = {
      id: uid('e'),
      vessel_id: input.vessel_id,
      kind: input.kind || 'other',
      name: input.name || 'Equipment',
      icon: input.icon || '🔧',
      make: input.make || '',
      model: input.model || '',
      serial: input.serial || '',
      qty: input.qty || 1,
      installed_at: input.installed_at || null,
      last_service_at: input.last_service_at || null,
      next_service_at: input.next_service_at || null,
      notes: input.notes || '',
      file: input.file || null,
      // Same audit pattern as addCert — populated only when added
      // via AI extraction. Lets us trace what the AI read vs what
      // the human entered.
      extraction: input.extraction || null
    };
    state.equipment.push(e);
    const audit = { name: e.name, hasFile: !!e.file };
    if (e.extraction) {
      audit.aiConfidence = e.extraction.confidence;
      audit.aiOverrides = (e.extraction.overrides || []).map((o) => o.field);
    }
    logAction('equipment.added', 'equipment', e.id, audit);
    save(state);
    return e;
  }

  function attachFileToEquipment(equipmentId, file) {
    const e = state.equipment.find((x) => x.id === equipmentId);
    if (!e) return;
    e.file = file;
    logAction('equipment.file_attached', 'equipment', e.id, { file_name: file && file.name });
    save(state);
    return e;
  }

  function detachFileFromEquipment(equipmentId) {
    const e = state.equipment.find((x) => x.id === equipmentId);
    if (!e) return;
    e.file = null;
    logAction('equipment.file_removed', 'equipment', e.id, {});
    save(state);
    return e;
  }

  function getEquipment(equipmentId) {
    return state.equipment.find((e) => e.id === equipmentId);
  }

  function recordEquipmentService(equipmentId, opts) {
    const e = state.equipment.find((x) => x.id === equipmentId);
    if (!e) return;
    e.last_service_at = (opts && opts.serviced_at) || isoOffset(0);
    if (opts && opts.next_service_at) e.next_service_at = opts.next_service_at;
    logAction('equipment.serviced', 'equipment', e.id, { name: e.name });
    save(state);
    return e;
  }

  function assignCrewToVessel(crewId, vesselId) {
    const p = state.crew.find((x) => x.id === crewId);
    if (!p) return;
    p.vessel_ids = Array.from(new Set([...(p.vessel_ids || []), vesselId]));
    logAction('crew.assigned', 'crew', p.id, { vessel_id: vesselId });
    save(state);
    return p;
  }

  function removeCrewFromVessel(crewId, vesselId) {
    const p = state.crew.find((x) => x.id === crewId);
    if (!p) return;
    p.vessel_ids = (p.vessel_ids || []).filter((id) => id !== vesselId);
    logAction('crew.unassigned', 'crew', p.id, { vessel_id: vesselId });
    save(state);
    return p;
  }

  function updateCrewRole(crewId, role) {
    const p = state.crew.find((x) => x.id === crewId);
    if (!p) return;
    p.role = role;
    save(state);
    return p;
  }

  function addCrew(input) {
    const p = {
      id: uid('p'),
      org_id: input.org_id || 'org_jm',
      name: input.name || 'New crew member',
      initials: (input.name || 'NN').split(/\s+/).map((s) => s[0]).slice(0,2).join('').toUpperCase(),
      role: input.role || 'Crew',
      vessel_ids: input.vessel_ids || [],
      avatar_color: input.avatar_color || 'sea'
    };
    state.crew.push(p);
    logAction('crew.added', 'crew', p.id, { name: p.name });
    save(state);
    return p;
  }

  function addCrewCert(input) {
    const cc = {
      id: uid('cc'),
      person_id: input.person_id,
      name: input.name || 'Qualification',
      expires_at: input.expires_at || null,
      issuer: input.issuer || '',
      number: input.number || ''
    };
    state.crewCerts.push(cc);
    logAction('crewCert.added', 'crewCert', cc.id, { name: cc.name });
    save(state);
    return cc;
  }

  function addDeficiency(input) {
    const d = {
      id: uid('d'),
      vessel_id: input.vessel_id,
      title: input.title || 'Deficiency',
      severity: input.severity || 'minor',
      raised_at: isoOffset(0),
      status: 'open',
      source: input.source || 'self',
      raised_by: (getCurrentUser() || {}).id || null,
      // Survey-grade fields — surveyors raising a finding on the
      // dock need category, Code reference, free-text notes, and
      // an evidence photo. These used to be absent (deficiencies
      // were captured via two chained prompt() calls), failing the
      // basic "show me your audit trail" surveyor test.
      category: input.category || 'other',
      code_ref: input.code_ref || null,
      notes: input.notes || null,
      photo: input.photo || null
    };
    state.deficiencies.push(d);
    logAction('deficiency.raised', 'deficiency', d.id, {
      title: d.title,
      severity: d.severity,
      category: d.category,
      hasPhoto: !!d.photo,
      hasCodeRef: !!d.code_ref
    });
    save(state);
    return d;
  }

  function resolveDeficiency(deficiencyId) {
    const d = state.deficiencies.find((x) => x.id === deficiencyId);
    if (!d) return;
    d.status = 'resolved';
    d.resolved_at = isoOffset(0);
    d.resolved_by = (getCurrentUser() || {}).id || null;
    logAction('deficiency.resolved', 'deficiency', d.id, { title: d.title });
    save(state);
  }

  function startInspection(vesselId) {
    const me = getCurrentUser();
    if (!me || me.kind !== 'surveyor') return null;
    const i = {
      id: uid('i'),
      vessel_id: vesselId,
      surveyor_user_id: me.id,
      started_at: isoOffset(0),
      completed_at: null,
      status: 'in_progress',
      signed_pdf_url: null,
      summary: ''
    };
    state.inspections.push(i);
    logAction('inspection.started', 'inspection', i.id, { vessel_id: vesselId });
    save(state);
    return i;
  }

  function completeInspection(inspectionId, payload) {
    const i = state.inspections.find((x) => x.id === inspectionId);
    if (!i) return;
    // Backwards-compat: a plain string is the old summary-only path.
    if (typeof payload === 'string' || payload == null) {
      payload = { summary: payload || '' };
    }
    i.completed_at = isoOffset(0);
    i.status = 'signed';
    i.summary = payload.summary || i.summary;
    // Evidentiary fields — captured signature, hash, surveyor.
    // Patricia's surveyor walkthrough: "Wouldn't survive a contested
    // MAIB enquiry." Now it carries a drawn signature data URL, the
    // SHA-256 hash of the canonical document body at sign time, and
    // the user-id of whoever signed. The audit log row stamps the
    // hash for tamper-evidence.
    if (payload.signature_data_url) i.signature_data_url = payload.signature_data_url;
    if (payload.signed_by_user_id)  i.signed_by_user_id  = payload.signed_by_user_id;
    if (payload.signed_by_name)     i.signed_by_name     = payload.signed_by_name;
    if (payload.signed_by_role)     i.signed_by_role     = payload.signed_by_role;
    if (payload.document_hash)      i.document_hash      = payload.document_hash;
    i.signed_at = i.completed_at;
    logAction('inspection.signed', 'inspection', i.id, {
      vessel_id: i.vessel_id,
      document_hash: i.document_hash || null,
      has_signature: !!i.signature_data_url,
      signed_by: i.signed_by_name || null
    });
    save(state);
    return i;
  }

  function setVesselPhoto(vesselId, dataUrlOrNull) {
    const v = getVessel(vesselId);
    if (!v) return null;
    v.photo = dataUrlOrNull || null;
    save(state);
    return v.photo;
  }

  function setSurveyorLogo(dataUrl) {
    const user = getCurrentUser();
    if (!user || user.kind !== 'surveyor') return null;
    user.surveyor = user.surveyor || {};
    user.surveyor.logo = dataUrl || null;
    save(state);
    return user.surveyor.logo;
  }

  function getSurveyorLogo(userId) {
    const u = getUser(userId);
    return (u && u.surveyor && u.surveyor.logo) || null;
  }

  function inviteSurveyor(input) {
    // input: { vessel_id, surveyor_user_id (or email), scopes, expires_at }
    const g = {
      id: uid('sg'),
      vessel_id: input.vessel_id,
      surveyor_user_id: input.surveyor_user_id || 'u_sv1',
      granted_by: (getCurrentUser() || {}).id || 'u_jm',
      granted_at: isoOffset(0),
      expires_at: input.expires_at || isoOffset(180),
      scopes: input.scopes || ['view','deficiency','inspect','issue_cert'],
      revoked_at: null
    };
    state.surveyor_grants.push(g);
    logAction('surveyor.invited', 'surveyor_grant', g.id, { vessel_id: input.vessel_id });
    save(state);
    return g;
  }

  function revokeSurveyor(grantId) {
    const g = state.surveyor_grants.find((x) => x.id === grantId);
    if (!g) return;
    g.revoked_at = isoOffset(0);
    logAction('surveyor.revoked', 'surveyor_grant', g.id, {});
    save(state);
  }

  function addSmsDocument(input) {
    const d = {
      id: uid('sms'),
      org_id: input.org_id || 'org_jm',
      vessel_id: input.vessel_id || null,
      type: input.type || 'risk_assess',
      version: input.version || 1,
      file_url: input.file_url || null,
      status: input.status || 'draft',
      built_by_codedok: !!input.built_by_codedok,
      title: input.title || '',
      body: input.body || '',
      last_reviewed_at: input.last_reviewed_at || null,
      // New surfaces for the SMS feature set:
      edit_log: [],           // [{ at, by, sections: ['risk', 'meta'] }]
      acknowledgements: [],   // [{ at, crew_id, name }]
      share_token: null,      // token for surveyor read-only view
      share_token_expires_at: null,
      review_due_at: null     // 12mo after signed_at
    };
    state.sms_documents.push(d);
    logAction('sms.created', 'sms', d.id, { type: d.type });
    save(state);
    return d;
  }

  // Append a record to the SMS edit log. Used to show audit trail in
  // the builder footer + the inspection-pack PDF — "last edited 12 Sep
  // by Joseph; reviewed 14 Sep by Anchor Marine" is the surveyor
  // trust signal Sea-Flux's cloud library can't show.
  function appendSmsEdit(docId, info) {
    const d = (state.sms_documents || []).find((x) => x.id === docId);
    if (!d) return null;
    d.edit_log = d.edit_log || [];
    d.edit_log.push({
      at: new Date().toISOString(),
      by_user_id: ((getCurrentUser() || {}).id) || 'u_jm',
      by_name: (getCurrentUser() || {}).name || 'Operator',
      sections: info && info.sections ? info.sections : [],
      note: info && info.note ? info.note : ''
    });
    save(state);
    return d.edit_log[d.edit_log.length - 1];
  }

  // Each crew member taps "Read & understood" — surveyors want this
  // as evidence of training.
  function ackSms(docId, crewId, name) {
    const d = (state.sms_documents || []).find((x) => x.id === docId);
    if (!d) return null;
    d.acknowledgements = d.acknowledgements || [];
    // Idempotent — replace existing ack for the same crew member.
    d.acknowledgements = d.acknowledgements.filter((a) => a.crew_id !== crewId);
    const a = { at: new Date().toISOString(), crew_id: crewId, name: name || '' };
    d.acknowledgements.push(a);
    save(state);
    return a;
  }

  function revokeSmsAck(docId, crewId) {
    const d = (state.sms_documents || []).find((x) => x.id === docId);
    if (!d) return false;
    d.acknowledgements = (d.acknowledgements || []).filter((a) => a.crew_id !== crewId);
    save(state);
    return true;
  }

  // Generate / refresh a share token so a surveyor can view the SMS in a
  // login-free read-only mode on their iPad on the dock. 7 days by default.
  function createSmsShareToken(docId, hours) {
    const d = (state.sms_documents || []).find((x) => x.id === docId);
    if (!d) return null;
    if (typeof hours !== 'number') hours = 24 * 7;
    d.share_token = Math.random().toString(36).slice(2, 12).toUpperCase();
    d.share_token_expires_at = new Date(Date.now() + hours * 3600000).toISOString();
    save(state);
    return d.share_token;
  }

  function getSmsByShareToken(token) {
    if (!token) return null;
    const d = (state.sms_documents || []).find((x) => x.share_token === token);
    if (!d) return null;
    if (d.share_token_expires_at && new Date(d.share_token_expires_at).getTime() < Date.now()) return null;
    return d;
  }

  // Annual review: signed_at + 12 months. Returns true if the SMS is
  // due for review (within 30 days or overdue).
  function isSmsReviewDue(doc) {
    if (!doc || !doc.signed_at) return false;
    const signed = new Date(doc.signed_at).getTime();
    const dueAt = signed + 365 * 86400000;
    return (dueAt - Date.now()) < 30 * 86400000; // within 30d or overdue
  }
  function smsReviewDays(doc) {
    if (!doc || !doc.signed_at) return null;
    const signed = new Date(doc.signed_at).getTime();
    const dueAt = signed + 365 * 86400000;
    return Math.round((dueAt - Date.now()) / 86400000);
  }

  // ---------- Jobs / invoices ----------

  function createJob(input) {
    const j = {
      id: uid('j'),
      vessel_id: input.vessel_id,
      surveyor_user_id: input.surveyor_user_id,
      requested_by_user_id: (getCurrentUser() || {}).id || null,
      type: input.type || 'other',
      title: input.title || 'Job',
      description: input.description || '',
      status: input.status || 'requested',
      created_at: isoOffset(0),
      quote_amount: null,
      quote_sent_at: null,
      paid_at: null,
      payment_method: null,
      completed_at: null,
      invoice_id: null,
      attachment_url: input.attachment_url || null,
      sms_doc_id: input.sms_doc_id || null
    };
    state.jobs = state.jobs || [];
    state.jobs.unshift(j);
    logAction('job.created', 'job', j.id, { type: j.type, title: j.title });
    save(state);
    return j;
  }

  function getJob(jobId) {
    return (state.jobs || []).find((j) => j.id === jobId);
  }

  function jobsForSurveyor(surveyorUserId, statusFilter) {
    let list = (state.jobs || []).filter((j) => j.surveyor_user_id === surveyorUserId);
    if (statusFilter) list = list.filter((j) => j.status === statusFilter);
    return list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }

  function jobsForOperator(orgId, statusFilter) {
    const vesselsInOrg = state.vessels.filter((v) => v.org_id === orgId).map((v) => v.id);
    let list = (state.jobs || []).filter((j) => vesselsInOrg.includes(j.vessel_id));
    if (statusFilter) list = list.filter((j) => j.status === statusFilter);
    return list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }

  function quoteJob(jobId, amount, lineItems, notes) {
    const j = getJob(jobId);
    if (!j) return;
    j.quote_amount = amount;
    j.quote_sent_at = isoOffset(0);
    j.status = 'quoted';

    // Auto-create the invoice in draft.
    const subtotal = lineItems.reduce((s, li) => s + (li.qty * li.unit_price), 0);
    const vat = Math.round(subtotal * 0.20);
    const inv = {
      id: uid('inv'),
      job_id: j.id,
      vessel_id: j.vessel_id,
      surveyor_user_id: j.surveyor_user_id,
      operator_org_id: (state.vessels.find((v) => v.id === j.vessel_id) || {}).org_id || null,
      line_items: lineItems,
      subtotal,
      vat,
      total: subtotal + vat,
      currency: 'GBP',
      status: 'sent',
      issued_at: isoOffset(0),
      due_at: isoOffset(14),
      paid_at: null,
      paid_amount: null,
      notes: notes || ''
    };
    state.invoices = state.invoices || [];
    state.invoices.unshift(inv);
    j.invoice_id = inv.id;
    logAction('job.quoted', 'job', j.id, { amount });
    save(state);
    return { job: j, invoice: inv };
  }

  function getInvoice(invoiceId) {
    return (state.invoices || []).find((i) => i.id === invoiceId);
  }

  function invoicesForSurveyor(surveyorUserId, statusFilter) {
    let list = (state.invoices || []).filter((i) => i.surveyor_user_id === surveyorUserId);
    if (statusFilter) list = list.filter((i) => i.status === statusFilter);
    return list.sort((a, b) => (b.issued_at || '').localeCompare(a.issued_at || ''));
  }

  function invoicesForOperator(orgId, statusFilter) {
    let list = (state.invoices || []).filter((i) => i.operator_org_id === orgId);
    if (statusFilter) list = list.filter((i) => i.status === statusFilter);
    return list.sort((a, b) => (b.issued_at || '').localeCompare(a.issued_at || ''));
  }

  function payInvoice(invoiceId, method) {
    const inv = getInvoice(invoiceId);
    if (!inv) return;
    inv.status = 'paid';
    inv.paid_at = isoOffset(0);
    inv.paid_amount = inv.total;
    if (method) inv.payment_method = method;
    const j = getJob(inv.job_id);
    if (j) {
      j.status = 'paid';
      j.paid_at = isoOffset(0);
      j.payment_method = method || 'stripe';
    }
    logAction('invoice.paid', 'invoice', inv.id, { amount: inv.total });
    save(state);
    return inv;
  }

  function declineInvoice(invoiceId) {
    const inv = getInvoice(invoiceId);
    if (!inv) return;
    inv.status = 'declined';
    inv.declined_at = isoOffset(0);
    const j = getJob(inv.job_id);
    if (j) j.status = 'declined';
    logAction('invoice.declined', 'invoice', inv.id, { amount: inv.total });
    save(state);
    return inv;
  }

  function declineJob(jobId, reason) {
    const j = getJob(jobId);
    if (!j) return;
    j.status = 'declined';
    j.declined_reason = reason || '';
    j.declined_at = isoOffset(0);
    logAction('job.declined', 'job', j.id, { reason });
    save(state);
    return j;
  }

  function startJob(jobId) {
    const j = getJob(jobId);
    if (!j) return;
    j.status = 'in_progress';
    j.started_at = isoOffset(0);
    logAction('job.started', 'job', j.id, {});
    save(state);
    return j;
  }

  function completeJob(jobId, attachment_url) {
    const j = getJob(jobId);
    if (!j) return;
    j.status = 'completed';
    j.completed_at = isoOffset(0);
    if (attachment_url) j.attachment_url = attachment_url;
    logAction('job.completed', 'job', j.id, {});
    save(state);
    return j;
  }

  // Deliver a job: surveyor uploads the signed deliverable, and we apply it
  // to the operator's record in the way that makes sense for the job type.
  //   sms_review     -> mark the operator's SMS as signed + replace file
  //   annual_survey / mid_term / renewal_survey -> create a fresh Coding cert with the signed PDF
  //   other          -> attach to the job only
  // Returns { job, certs[], smsDoc?, deliveryNote }
  function deliverJob(jobId, deliverable) {
    // deliverable: { file: { name,type,size,data_url,added_at }, doc_type, expires_at?, notes?, cert_kind?, cert_name? }
    const j = getJob(jobId);
    if (!j) return null;
    const v = state.vessels.find((x) => x.id === j.vessel_id);
    const surveyor = state.users.find((u) => u.id === j.surveyor_user_id) || {};
    const company = (surveyor.surveyor && surveyor.surveyor.company) || surveyor.name || 'Surveyor';

    const certsCreated = [];
    let smsDoc = null;

    const docType = deliverable.doc_type || (j.type === 'sms_review' ? 'sms_signed' : 'coding_cert');

    if (docType === 'sms_signed' || j.type === 'sms_review') {
      // Find or create the SMS document for this vessel.
      let doc = state.sms_documents.find((d) => d.id === j.sms_doc_id) ||
                state.sms_documents.find((d) => d.vessel_id === j.vessel_id && d.type === 'full_sms');
      if (!doc) {
        doc = {
          id: uid('sms'), org_id: v ? v.org_id : 'org_jm', vessel_id: j.vessel_id,
          type: 'full_sms', version: 1, title: `Safety Management System — ${v ? v.name : 'Vessel'}`,
          body: '', status: 'signed', built_by_codedok: false, last_reviewed_at: isoOffset(0)
        };
        state.sms_documents.push(doc);
      }
      doc.status = 'signed';
      doc.signed_pdf = deliverable.file;
      doc.signed_by_user_id = j.surveyor_user_id;
      doc.signed_at = isoOffset(0);
      doc.last_reviewed_at = isoOffset(0);
      smsDoc = doc;
      logAction('sms.signed', 'sms', doc.id, { surveyor: company });
    } else if (docType === 'coding_cert' || docType === 'survey_report') {
      // Create a fresh Coding certificate with the surveyor as issuer.
      const monthsValid = j.type === 'renewal_survey' ? 60 : 12;
      const expDate = new Date(); expDate.setHours(0, 0, 0, 0); expDate.setMonth(expDate.getMonth() + monthsValid);
      const cert = {
        id: uid('c'),
        vessel_id: j.vessel_id,
        kind: deliverable.cert_kind || 'coding',
        name: deliverable.cert_name || (j.type === 'renewal_survey' ? 'MCA Coding Certificate (5-year renewal)' : 'MCA Coding Certificate'),
        icon: '📋',
        category: 'vessel',
        issuer: company,
        number: '',
        issued_at: isoOffset(0),
        expires_at: deliverable.expires_at || expDate.toISOString().slice(0, 10),
        file: deliverable.file,
        issued_by_user_id: j.surveyor_user_id
      };
      state.certs.push(cert);
      certsCreated.push(cert);
      logAction('cert.delivered', 'cert', cert.id, { name: cert.name, surveyor: company });

      // Optionally also record a completed inspection.
      const inspection = {
        id: uid('i'),
        vessel_id: j.vessel_id,
        surveyor_user_id: j.surveyor_user_id,
        started_at: isoOffset(0),
        completed_at: isoOffset(0),
        status: 'signed',
        signed_pdf_url: null,
        summary: deliverable.notes || `${({ annual_survey: 'Annual renewal', mid_term: 'Mid-term survey', renewal_survey: '5-year renewal' })[j.type] || 'Inspection'} — passed`
      };
      state.inspections.push(inspection);
      logAction('inspection.completed', 'inspection', inspection.id, { surveyor: company });
    } else {
      // Other: store on the job only (we already do this below).
    }

    // Mark the job complete.
    j.status = 'completed';
    j.completed_at = isoOffset(0);
    j.attachment_url = deliverable.file && deliverable.file.data_url || null;
    j.delivery = {
      file: deliverable.file,
      doc_type: docType,
      notes: deliverable.notes || '',
      delivered_by: j.surveyor_user_id,
      delivered_at: isoOffset(0)
    };
    logAction('job.delivered', 'job', j.id, { doc_type: docType, file_name: deliverable.file && deliverable.file.name });

    // Add a notification record on the operator's audit-log feed (read by home banner).
    state.audit_log.unshift({
      id: uid('a'),
      org_id: v ? v.org_id : 'org_jm',
      actor_user_id: j.surveyor_user_id,
      action: 'delivery.received',
      target_type: 'job',
      target_id: j.id,
      at: isoOffset(0),
      metadata: { vessel_id: j.vessel_id, doc_type: docType, file_name: deliverable.file && deliverable.file.name, surveyor: company, cert_id: certsCreated[0] && certsCreated[0].id, sms_doc_id: smsDoc && smsDoc.id }
    });

    save(state);
    return { job: j, certs: certsCreated, smsDoc };
  }

  // Recent deliveries to an org's vessels — used to show "newly delivered" banner on operator home.
  function recentDeliveriesForOperator(orgId, sinceDays) {
    sinceDays = typeof sinceDays === 'number' ? sinceDays : 14;
    const cutoff = new Date(Date.now() - sinceDays * DAY_MS);
    const vesselsInOrg = state.vessels.filter((v) => v.org_id === orgId).map((v) => v.id);
    return (state.audit_log || []).filter((a) =>
      a.action === 'delivery.received' &&
      vesselsInOrg.includes(a.metadata && a.metadata.vessel_id) &&
      new Date(a.at) >= cutoff
    );
  }

  function surveyorEarnings(surveyorUserId) {
    const paid = (state.invoices || []).filter((i) => i.surveyor_user_id === surveyorUserId && i.status === 'paid');
    const platformFeeRate = 0.08;  // 8% platform fee
    const grossThisYear = paid.filter((i) => new Date(i.paid_at).getFullYear() === new Date().getFullYear()).reduce((s, i) => s + i.total, 0);
    const grossLifetime = paid.reduce((s, i) => s + i.total, 0);
    const platformFees = paid.reduce((s, i) => s + (i.total * platformFeeRate), 0);
    return {
      grossThisYear,
      grossLifetime,
      platformFees: Math.round(platformFees),
      netLifetime: Math.round(grossLifetime - platformFees),
      paidCount: paid.length,
      pending: (state.invoices || []).filter((i) => i.surveyor_user_id === surveyorUserId && i.status === 'sent').reduce((s, i) => s + i.total, 0)
    };
  }

  function createHandoff(vesselId, hours) {
    if (typeof hours !== 'number') hours = 48;
    const link = {
      id: uid('ho'),
      vessel_id: vesselId,
      created_by: (getCurrentUser() || {}).id || 'u_jm',
      created_at: isoOffset(0),
      expires_at: new Date(Date.now() + hours * 3600000).toISOString(),
      token: Math.random().toString(36).slice(2, 12).toUpperCase()
    };
    state.handoff_links.push(link);
    logAction('handoff.created', 'handoff', link.id, { vessel_id: vesselId });
    save(state);
    return link;
  }

  function resetToSeed() {
    state = buildDemoSeed();
    save(state);
  }

  // Load the demo fixtures over the top of the current Store. Only called
  // by the app for the dedicated demo account on first sign-in (or if
  // their local cache has been cleared). No-op for everyone else.
  function applyDemoSeed() {
    state = buildDemoSeed();
    save(state);
  }

  // Swap every reference to the seeded Anchor Marine user (u_sv1) over
  // to the real auth user's id. Used when the McCollam demo email signs
  // in: the demo seed is loaded once with hardcoded ids, then this
  // re-stamps the surveyor side so the signed-in user sees the seeded
  // grants, jobs, invoices and inspections as their own.
  function adoptSeededSurveyor(realUserId) {
    if (!realUserId || realUserId === 'u_sv1') return;
    const i = state.users.findIndex((u) => u.id === 'u_sv1');
    if (i >= 0) state.users[i].id = realUserId;
    (state.surveyor_grants || []).forEach((g) => { if (g.surveyor_user_id === 'u_sv1') g.surveyor_user_id = realUserId; });
    (state.jobs            || []).forEach((j) => { if (j.surveyor_user_id === 'u_sv1') j.surveyor_user_id = realUserId; });
    (state.invoices        || []).forEach((iv) => { if (iv.surveyor_user_id === 'u_sv1') iv.surveyor_user_id = realUserId; });
    (state.inspections     || []).forEach((ins) => { if (ins.surveyor_user_id === 'u_sv1') ins.surveyor_user_id = realUserId; });
    (state.audit_log       || []).forEach((a) => { if (a.actor_user_id === 'u_sv1') a.actor_user_id = realUserId; });
    state.session.user_id = realUserId;
    state.session.mode = 'surveyor';
    save(state);
  }

  // Mirror a Supabase users row into the local Store so getCurrentUser,
  // role-aware UI, and lazy-org-creation on first vessel-add can find
  // the signed-in user without re-querying Supabase.
  function attachAuthenticatedUser(user) {
    if (!user || !user.id) return;
    const idx = state.users.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      state.users[idx] = Object.assign({}, state.users[idx], user);
    } else {
      state.users.push(user);
    }
    state.session.user_id = user.id;
    const k = user.kind;
    state.session.mode = (k === 'admin' || k === 'surveyor' || k === 'builder') ? k : 'operator';
    save(state);
  }

  // Wipe every record back to an empty workspace. Preserves nothing.
  // Used when a real (non-demo) user signs in on a device that still
  // has the demo fixtures cached from before.
  function resetToEmpty() {
    state = buildEmptyState();
    save(state);
  }

  // Clear just the session pointer (user_id + mode). Called on sign-out
  // so the next sign-in doesn't inherit the previous user's mode — e.g.
  // signing out as McCollam-surveyor and back in as mcljd-operator would
  // otherwise see the lingering 'surveyor' mode on boot and route to
  // the surveyor home before handleSignedIn has a chance to correct it.
  function resetSession() {
    state.session = { user_id: null, mode: 'operator' };
    save(state);
  }

  function hasDemoFixtures() {
    return looksLikeDemo(state);
  }

  function clearAll() {
    state = {
      meta: { seededAt: new Date().toISOString(), version: 2 },
      session: state.session,
      users: state.users,
      organizations: state.organizations,
      memberships: state.memberships,
      user: state.user,
      vessels: [], certs: [], equipment: [], crew: [], crewCerts: [],
      deficiencies: [], surveyor_grants: [], inspections: [], sms_documents: [], handoff_links: [],
      audit_log: []
    };
    save(state);
  }

  function snapshot() { return state; }

  // ---------- Public API ----------

  window.Store = {
    snapshot,
    daysUntil,
    bucket,
    // reads
    vesselCerts,
    vesselEquipment,
    vesselDeficiencies,
    vesselCrew,
    vesselGrants,
    vesselInspections,
    fleetCerts,
    fleetEquipment,
    getVessel,
    getUser,
    getCurrentUser,
    getMode,
    complianceScore,
    urgencyCounts,
    topActions,
    isInspectionReady,
    gapAnalysis,
    surveyorVessels,
    // mutations
    setMode,
    addVessel,
    updateVessel,
    deleteVessel,
    addCert,
    updateCert,
    deleteCert,
    getCert,
    attachFileToCert,
    detachFileFromCert,
    addEquipment,
    getEquipment,
    attachFileToEquipment,
    detachFileFromEquipment,
    recordEquipmentService,
    addCrew,
    assignCrewToVessel,
    removeCrewFromVessel,
    updateCrewRole,
    addCrewCert,
    addDeficiency,
    resolveDeficiency,
    startInspection,
    completeInspection,
    inviteSurveyor,
    setSurveyorLogo,
    getSurveyorLogo,
    setVesselPhoto,
    vesselsByBuilder,
    builderPipeline,
    revokeSurveyor,
    addSmsDocument,
    appendSmsEdit,
    ackSms,
    revokeSmsAck,
    createSmsShareToken,
    getSmsByShareToken,
    isSmsReviewDue,
    smsReviewDays,
    smsSubmissions,
    updateSmsDocument,
    deliverSmsToOperator,
    createJob,
    getJob,
    jobsForSurveyor,
    jobsForOperator,
    quoteJob,
    getInvoice,
    invoicesForSurveyor,
    invoicesForOperator,
    payInvoice,
    declineInvoice,
    declineJob,
    startJob,
    completeJob,
    deliverJob,
    recentDeliveriesForOperator,
    surveyorEarnings,
    createHandoff,
    resetToSeed,
    applyDemoSeed,
    adoptSeededSurveyor,
    resetToEmpty,
    resetSession,
    hasDemoFixtures,
    attachAuthenticatedUser,
    clearAll
  };
})();
