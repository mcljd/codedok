// CodedOK — MCA code reference data.
// SPV data: The Sport or Pleasure Vessel Code (2nd edition, MCA, published
// 20 Nov 2025). Every item carries a `ref` (section + PDF page). Items marked
// verify: true are ambiguous or contradictory in the Code text — confirm with
// the Certifying Authority before relying on them.

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Corrected SPV Code 2025 data — proposed replacement for the matching
  // structures in app/codes.js. All refs are to "The Sport or Pleasure Vessel
  // Code" (MCA, published 20 Nov 2025). "p" = PDF page number (= printed page).
  //
  // Vessel fields assumed by the qty()/applies() helpers (new ones marked NEW):
  //   persons            max persons certificated (crew + passengers + trainees)
  //   length             length overall (m)
  //   gmdss_area   NEW   'A1' | 'A2' | 'A3' | 'A4' (default 'A1')
  //   is_sailing   NEW   true for sailing vessels
  //   is_open_boat NEW   open boat / RIB / inflatable / buoyant-collar boat
  //   is_decked    NEW   decked vessel
  //   lifejackets_inflatable NEW  true if inflatable lifejackets are carried
  //   installed_kw NEW   total installed power (propulsion + generation), kW
  //   category / category_id  e.g. 'cat2' or 'Category 2' (stabilityRouteFor)
  //   single_handed, liferaft_count, has_enclosure_or_cooker, has_open_flame_cooker,
  //   has_gas_appliance, activity_equipment_kg, activity_equipment_free_surface,
  //   has_lifting_device, iso12217_part1_assessed   NEW (all optional)
  // Items whose qty resolves to 0 do not apply to that vessel; the UI should
  // hide them (or show "n/a").
  // ---------------------------------------------------------------------------

  const REF = 'SPV Code 2025';
  const P = (v) => (v && v.persons) || 0;
  const L = (v) => (v && v.length) || 0;
  const AREA = (v) => (v && v.gmdss_area) || 'A1';
  const GE16 = (v) => P(v) >= 16;

  // 1. CATEGORIES — SPV Code 2025 §3.10.1 (p37-38), Table 3.10.2 (p38).
  // "Up to" means up to but not including (Definitions, p31). "Daylight" = 1 h
  // before sunrise to 1 h after sunset (Definitions, p20).
  const CATEGORIES = [
    { id: 'cat0', name: 'Area Category 0', desc: 'Unrestricted service', distance: 'Unrestricted', rcr_design_category: 'A', ref: `${REF} §3.10.1, Table 3.10.2 (p38)` },
    { id: 'cat1', name: 'Area Category 1', desc: 'Up to 150 miles from a safe haven', distance: '<150 nm from safe haven', rcr_design_category: 'A', ref: `${REF} §3.10.1, Table 3.10.2 (p38)` },
    { id: 'cat2', name: 'Area Category 2', desc: 'Up to 60 miles from a safe haven', distance: '<60 nm from safe haven', rcr_design_category: 'B', ref: `${REF} §3.10.1, Table 3.10.2 (p38)` },
    { id: 'cat3', name: 'Area Category 3', desc: 'Up to 20 miles from a safe haven', distance: '<20 nm from safe haven', rcr_design_category: 'B', ref: `${REF} §3.10.1, Table 3.10.2 (p38)` },
    { id: 'cat4', name: 'Area Category 4', desc: 'Up to 20 miles from a safe haven, in favourable weather and in daylight', distance: '<20 nm, favourable weather, daylight', rcr_design_category: 'C', ref: `${REF} §3.10.1 (p37), Table 3.10.2 (p38)` },
    { id: 'cat5', name: 'Area Category 5', desc: 'Within 3 miles of land and not more than 3 miles radius from the point of departure to sea or the seaward boundary of categorised waters, in favourable weather', distance: '3 nm of land / 3 nm radius, favourable weather', rcr_design_category: 'C', ref: `${REF} §3.10.1 (p37), Table 3.10.2 (p38)` },
    { id: 'cat6', name: 'Area Category 6', desc: 'Within 3 miles of land and not more than 3 miles radius from the point of departure to sea or the seaward boundary of categorised waters, in favourable weather and daylight', distance: '3 nm of land / 3 nm radius, favourable weather, daylight', rcr_design_category: 'C', ref: `${REF} §3.10.1 (p37), Table 3.10.2 (p38)` }
  ];
  const CAT_IDS = CATEGORIES.map((c) => c.id);
  const n = (cat) => Number(cat.slice(3)); // 'cat3' -> 3

  // Code-wide scope/thresholds (for display/validation)
  const SPV_SCOPE = {
    max_passengers: 12,                       // §1.1 p12, §3.1.1 p33
    max_load_line_length_m: 24,               // "Small vessel" <24 m load line length, Definitions p29
    exam_group_2_persons: 16,                 // §4.3.1 p42 — Group 2 = ≥16 persons and/or Cat 0/1
    published: '2025-11-20',                  // title page p3
    legal_basis: 'Merchant Shipping (Vessels in Commercial Use for Sport or Pleasure) Regulations 2025 (SI 2025/1195)', // §1.6 p12, Definitions p18
    entry_into_force: '2025-12-12',          // SI 2025/1195 reg. 1 (not stated in the Code text)
    existing_vessel_deadline: 'next renewal examination or 3 years after entry into force, whichever is later', // App. 12 §3 p253
    sms_deadline: '3 years after entry into force',          // §30.1.1 p210
    fire_and_stability_course_deadline: '5 years after entry into force' // §28.10.2-3 p205; Table A5.3 p235
  };

  // 2. VESSEL_CERTS
  function certsFor(cat) {
    const c = n(cat);
    const list = [
      { kind: 'coding', name: 'Sport or Pleasure Vessel Certificate', required: true, validity_months: 60, renew_annual: true,
        authority: 'Certifying Authority',
        condition: 'Max 5 years from examination date (CA may set less). Annual examination within ±3 months of anniversary (≤15 months apart); intermediate examination by an Authorised Person so that ≤36 months between AP examinations; renewal examination before expiry. Certificate suspended if an examination is missed (restorable within 1 month).',
        ref: `${REF} §4.2.2 (p42), §4.3 & Table 4.3.1 (p42-44), §4.5-4.7 (p44-47), §4.10.5 (p49)` },
      { kind: 'scv2', name: 'SCV2 — Compliance Examination report & Declaration (signed, up to date)', required: true, validity_months: null,
        authority: 'Certifying Authority', condition: 'Carry on board, or retain ashore where not practicable',
        ref: `${REF} §4.1.1.5 (p41), §3.8.2 (p36)` },
      { kind: 'id_disc', name: 'Annual identification disc (displayed, visible from outside)', required: true, validity_months: 12,
        authority: 'Certifying Authority', ref: `${REF} §4.2.4 (p42)` },
      { kind: 'radio', name: "Ships' Radio Licence", required: true, validity_months: null, verify: true,
        authority: 'Ofcom', condition: 'All vessels. Renewal/revalidation interval is set by Ofcom, not the Code',
        ref: `${REF} §17.9.1 (p147)` },
      { kind: 'mmsi', name: 'MMSI (marked on fixed radio installation)', required: true, validity_months: null,
        authority: 'Ofcom', condition: 'Shown on Ships’ Radio Licence; required for DSC radios',
        ref: `${REF} §17.3.4 (p145)`, verify: true },
      { kind: 'pli', name: 'Insurance (crew/passenger liability)', required: false, validity_months: 12,
        authority: 'Marine insurer', condition: 'Code only encourages/advises insurance; a local or harbour authority may require it',
        ref: `${REF} §1.9 (p13), §1.13 (p13-14)` },
      { kind: 'sms', name: 'Safety Management System (Appendix 7)', required: true, validity_months: 36,
        authority: 'Owner/operator (reviewed by CA at compliance & renewal examinations)',
        condition: 'Must comply within 3 years of the Code coming into force; review at least every 3 years',
        ref: `${REF} §30.1-30.2 (p210), App. 7 §11.1 (p245)` },
      { kind: 'risk_assessment', name: 'Operational risk assessment (presented to CA)', required: true, validity_months: null,
        authority: 'Owner/operator', condition: 'Presented at issue/renewal; redo on change of area category, conversion or new equipment',
        ref: `${REF} §3.13 (p39)` },
      { kind: 'construction_cert', name: 'Certificate of construction / evidence of structural strength', required: true, validity_months: null,
        authority: 'Load Line Assigning Authority / Approved or Notified Body / CA', condition: 'Needed for first certification (or §5.3.6 for existing certificated vessels)',
        ref: `${REF} §5.3 (p53-55)` },
      { kind: 'medical_stores_checklist', name: 'Medical stores checklist (reviewed annually)', required: true, validity_months: 12,
        authority: 'Master / competent person', ref: `${REF} §23.1.4 (p170)` },
      { kind: 'epirb_registry', name: 'EPIRB / 406 MHz PLB registration (UK Beacon Registry)', required: c <= 4, validity_months: null, verify: true,
        authority: 'UK Beacon Registry', condition: 'For every EPIRB/PLB carried (MGN 665). Re-registration interval not stated in the Code',
        ref: `${REF} §17.5.5 (p147)` },
      { kind: 'fire_control_plan', name: 'Fire control and safety plan (displayed at control position)', required: false, validity_months: null,
        authority: 'Owner/operator', condition: 'Required if a Stability Information Booklet is required or installed power ≥750 kW; recommended otherwise',
        ref: `${REF} §15.8 (p135-136)` },
      { kind: 'eiapp', name: 'EIAPP Certificate + Technical File', required: false, validity_months: null,
        authority: 'Engine manufacturer / RO', condition: 'Each marine diesel engine >130 kW built on/after 1 Jan 2000',
        ref: `${REF} §29.5.1 (p208)` },
      { kind: 'garbage_plan', name: 'Garbage Management Plan', required: false, validity_months: null,
        authority: 'Owner/operator', condition: '≥100 GT, or certified to carry ≥15 persons (placards for all vessels >12 m LOA)',
        ref: `${REF} §29.3.3, Table 29.3.3 (p208)` },
      { kind: 'official_log_book', name: 'Official Log Book', required: false, validity_months: null,
        authority: 'MCA', condition: 'UK-registered vessels of 25 GT or more', ref: `${REF} §3.16.1 (p40)` },
      { kind: 'rib_airtightness', name: 'Airtightness test declaration (inflatable/RIB)', required: false, validity_months: 12,
        authority: 'Owner annually; competent person at compliance/renewal', condition: 'Inflatable boats and RIBs only',
        ref: `${REF} §4.9 (p48-49)` },
      { kind: 'radio_survey', name: 'Radio survey / Statement of Compliance', required: false, validity_months: 60,
        authority: 'Organisation authorised by the Administration', condition: 'Recommended every 5 years where GMDSS radio equipment is fitted',
        ref: `${REF} §17.10.1 (p147-148)` }
    ];
    if (c <= 2) {
      list.push({ kind: 'mlc_inspection', name: 'MLC inspection report', required: false, validity_months: null, verify: true,
        authority: 'MCA', condition: 'Only for international voyages or voyages >60 miles from a UK safe haven with seafarers on board',
        ref: `${REF} App. 14 sample certificate, MLC compliance statement (p264); §21B (p162)` });
    }
    // stability item is resolved per vessel via stabilityRouteFor(); this is a placeholder for listing
    list.splice(2, 0, { kind: 'stability', name: 'Stability information (booklet or simplified assessment)', required: true, validity_months: null,
      authority: 'Certifying Authority (approval)', condition: c <= 1 ? 'Cat 0/1: approved Stability Information Booklet (motor vessels may instead use ISO 12217-1 under 12A.2.6)' : 'Booklet only if 12.1.1.3 applies; else 12A simplified assessment',
      ref: `${REF} §4.2.1.2 (p42), §12.1.1.3 (p87-88)` });
    return list;
  }
  const VESSEL_CERTS = Object.fromEntries(CAT_IDS.map((id) => [id, certsFor(id)]));

  // 3. OWNER_DECLARATIONS — the Code does NOT define the four annual
  // declarations previously listed. What it does require from the owner:
  const OWNER_DECLARATIONS = [
    { kind: 'decl_compliance', name: 'Annual examination — SCV2 signed by owner/managing agent (Group 1 vessels)',
      ref: `${REF} §4.3.2.3 (p43), §4.5.2 (p45)`, validity_months: 12,
      required_for: ['cat2', 'cat3', 'cat4', 'cat5', 'cat6'],
      condition: 'Group 1 only: ≤15 persons AND Cat 2-6. Group 2 (≥16 persons or Cat 0/1) must use an Authorised Person (§4.3.2.4, §4.5.1). Within ±3 months of anniversary; ≤15 months apart. Not signed if defects found — report to CA instead (§4.5.2.3).',
      blurb: 'Owner confirms arrangements, fittings and equipment are as documented in the SCV2, sound, well maintained and serviced.' },
    { kind: 'decl_rib_airtightness', name: 'Airtightness test declaration', ref: `${REF} §4.9.1-4.9.2 (p48-49)`, validity_months: 12,
      required_for: CAT_IDS, condition: 'Inflatable boats and RIBs only',
      blurb: 'Each compartment at 100% working pressure, 30-min and 24-h checks; declaration sent to the CA.' },
    { kind: 'decl_modification', name: 'Notification/approval of change or modification (before implementing)', ref: `${REF} §3.5.8 (p35), §3.8.2 (p36), §12.1.1.6 (p88)`, validity_months: null,
      required_for: CAT_IDS, condition: 'Event-driven, not annual', blurb: 'Agree changes in writing with the CA; lightship/freeboard re-check if stability may be affected.' },
    { kind: 'decl_incident', name: 'Incident report to Certifying Authority', ref: `${REF} §3.6 (p35), §4.8.1-4.8.5 (p47-48)`, validity_months: null,
      required_for: CAT_IDS, condition: 'Event-driven. Failure to report a §4.8.4 incident invalidates the Certificate',
      blurb: 'Collision, grounding (outside normal operations), fire, or damage to hull/keel/rudder/below-waterline fittings/propulsion/steering/machinery/critical equipment.' }
    // Owner's declarations at the compliance examination are "documented in the
    // SCV2" (§3.8.4 p36, §4.4.4 p44) but their content is not set out in the Code text — verify against the SCV2 form.
  ];

  // 4. stabilityRouteFor — §12.1.1.3 (p87-88). Length 15 m is NOT the trigger.
  function stabilityRouteFor(vessel) {
    const v = vessel || {};
    const m = String(v.category_id || v.category || '').match(/(\d)/);
    const c = m ? Number(m[1]) : 2;
    const sibTrigger = c <= 1 || GE16(v) || (v.activity_equipment_kg || 0) > 1000 ||
      !!v.activity_equipment_free_surface || !!v.has_lifting_device;
    const iso12217MotorAlt = !v.is_sailing && (c <= 1 || GE16(v)) && !!v.iso12217_part1_assessed &&
      !((v.activity_equipment_kg || 0) > 1000 || v.activity_equipment_free_surface || v.has_lifting_device);
    const damage = GE16(v) || (c <= 1 && P(v) >= 7);
    if (sibTrigger && !iso12217MotorAlt) {
      return {
        kind: 'stability', name: 'Approved Stability Information Booklet', validity_months: null,
        authority: 'Approved by the Certifying Authority (prepared/verified by a competent person)',
        ref: `${REF} §12.1.1.3 (p87-88), §12B (p98-108), App. 3 (p220)`,
        damage_stability_required: damage, damage_ref: `${REF} §12B.1 (p98), §12B.2 (p102)`,
        blurb: 'Required for Cat 0/1, ≥16 persons, activity equipment >1000 kg or with free-surface effect, or a lifting device. Carry on board (§12B.1.1.1). Re-check lightship/freeboard after modifications (>5% change → reassess, §12.1.1.6) and at the renewal after 20 years without reassessment (§12.1.1.7). Master needs an MCA-approved stability course within 5 years of entry into force (Table A5.3).'
      };
    }
    return {
      kind: 'stability_simplified', name: 'Simplified stability assessment (heel test) or ISO 12217 categorisation', validity_months: null,
      authority: 'Tests/calculations by a competent person; results approved and kept by the Certifying Authority',
      ref: `${REF} §12A.1-12A.2 (p90-91)`,
      blurb: 'Heel test with all persons on one side: ≤7° (or ≤10° with heeled freeboard per Table 13.2.1.1); decked vessels ≥75 mm freeboard. Vessels over 15 m must also show GM ≥0.5 m (0.35 m if displacement verified) (§12A.2.4). Max weight is entered on the Certificate. Alternatively ISO 12217 design category B (Cat 2/3) or C (Cat 4-6) per Table 12A.2.6.'
    };
  }

  // 5. EQUIPMENT
  function equipmentFor(cat) {
    const c = n(cat);
    const pyro = { 6: [0, 2], 5: [4, 6], 4: [0, 2], 3: [4, 6], 2: [4, 6], 1: [6, 6], 0: [12, 6] }[c];
    const lifebuoyWithLight = [3, 2, 1, 0].includes(c) || c === 5;
    const raftPack = c <= 1 ? 'SOLAS "A" pack' : c <= 3 ? 'SOLAS "B" pack' : 'DfT "E" pack equivalent';
    const raftStd = c === 0 ? 'SOLAS + UKCA/MED or MCA DfT approved'
      : c === 6 ? 'SOLAS/UKCA/MED/DfT, or ISO 9650-1 Type 1 certified to Part 3, or open reversible (HSC Code 2000, MED/DfT)'
      : 'SOLAS + UKCA/MED or MCA DfT approved, or ISO 9650-1 Type 1 certified to ISO 9650-3';
    const list = [
      // ---- Life-saving appliances: Table 14.1.2 (p115) ----
      { kind: 'liferaft', name: 'Liferaft(s)', icon: '🛟',
        qty: (v) => (c === 0 || (c === 1 && GE16(v))) ? 'capacity for all persons with any one raft lost' : 'capacity for all persons (one or more rafts)',
        service_months: 12, verify: true, mandatory: true,
        note: `${raftStd}; ${raftPack}; ${c <= 1 ? 'FRP container, insulated floor & canopy' + (c === 1 ? ' (unless only in waters ≥10°C)' : '') : c <= 3 ? 'FRP container or valise; insulated if outside UK SRR where sea <10°C' : 'FRP container or valise'}. Service per manufacturer’s schedule at approved station; annual for valise rafts, Cat 2/3 rafts outside UK SRR <10°C, and open reversible rafts in Cat 6; extension to 30 months possible under General Exemption. Service certificate to CA at compliance/renewal.`,
        ref: `${REF} Table 14.1.2 (p115), §14.2.1 (p114), §14.2.4 (p118), Table 14.2.5.1 (p119)` },
      { kind: 'hru', name: 'Hydrostatic release unit (if float-free stowage)', icon: '🛟', qty: 1, service_months: 12, mandatory: false,
        note: 'Re-usable HRUs serviced annually; disposable per manufacturer life', ref: `${REF} §14.2.1.4 (p117), §14.2.3.1 (p118)` },
      { kind: 'lifebuoy', name: 'Lifebuoys (total)', icon: '🛟', qty: (v) => (GE16(v) ? 4 : 2), service_months: null, mandatory: true,
        note: `Of which: with light ${lifebuoyWithLight ? '1 (<16 persons) / 2 (≥16)' : 'none required'}; with 18 m buoyant line 1; without attachments ${c >= 4 ? '1 (<16) / 3 (≥16)' : '0 (<16) / 1 (≥16)'}; additional buoyant line 1 if ≥16 persons. Not inflatable; marked with vessel name + one other ID.${''}`,
        ref: `${REF} Table 14.1.2 (p115), §14.3 (p121)` },
      { kind: 'lifebuoy_danbuoy', name: c <= 3 ? 'Lifebuoy with Dan-buoy and light (sailing vessels)' : 'Lifebuoy with Dan-buoy (sailing vessels)', icon: '🛟',
        qty: (v) => (v.is_sailing ? 1 : 0), service_months: null, mandatory: true, ref: `${REF} Table 14.1.2 (p115), §14.3.3 (p121)` },
      { kind: 'lifejacket', name: 'Lifejackets (SOLAS/UKCA/MED/DfT, or ISO 12402-3 Level 150, or ISO 12402-2 Level 275)', icon: '🦺',
        qty: (v) => P(v) + (v.lifejackets_inflatable ? 2 : 0), service_months: 12, mandatory: true,
        note: `100% of persons incl. suitable sizes for persons under 32 kg; +2 spare if inflatable. Whistle + retro-reflective${[0, 1, 2, 3, 5].includes(c) ? ' + light' : ''}. Inflatables: gas inflation with oral top-up, serviced annually per manufacturer (record in SMS; certificate to CA at compliance/renewal). Orally-inflated-only lifejackets not permitted. Level 100 (100N) is NOT acceptable.`,
        ref: `${REF} §14.4.1-14.4.10 (p121-122)` },
      { kind: 'lifejacket_spray_hood', name: 'Lifejacket spray hoods', icon: '🦺', qty: (v) => (c <= 1 ? P(v) : 0), service_months: null, mandatory: c <= 1,
        note: c <= 1 ? 'One per lifejacket' : 'Optional (R)', ref: `${REF} §14.4.7 (p122), Table 14.1.2 (p115)` },
      { kind: 'lifejacket_rearm_kit', name: 'Inflatable lifejacket rearming kits', icon: '🦺', qty: (v) => (c <= 1 && v.lifejackets_inflatable ? P(v) : 0), service_months: null, mandatory: false,
        note: 'Recommended (R) for Cat 0/1 only', ref: `${REF} §14.4.6 (p121), Table 14.1.2 (p115)` },
      { kind: 'tpa', name: 'Thermal protective aids (UKCA/MCA approved)', icon: '🧥', qty: (v) => P(v), service_months: null,
        mandatory: c <= 5, note: c === 6 ? 'Cat 6: 100% only if sea ≤10°C or open reversible raft carried' : '100% of persons; may be in grab bag',
        ref: `${REF} §14.5 (p122)` },
      { kind: 'general_alarm', name: 'General alarm (audible throughout vessel)', icon: '🔔',
        qty: (v) => (((c <= 1 && GE16(v)) || (v.installed_kw || 0) > 750) ? 1 : 0), service_months: null, mandatory: true,
        note: 'Cat 0/1 with ≥16 persons, or any vessel with >750 kW installed power', ref: `${REF} §14.6 (p123), Table 14.1.2 (p115)` },
      { kind: 'recovery_means', name: 'Means of recovering persons from the water (demonstrated)', icon: '🪜', qty: 1, service_months: null, mandatory: true,
        ref: `${REF} §14.7 (p123)` },
      { kind: 'training_manual', name: 'LSA training manual (at control position)', icon: '📘', qty: 1, service_months: null, mandatory: true, ref: `${REF} §14.8 (p123-124)` },
      { kind: 'lsa_maintenance_manual', name: 'LSA on-board maintenance instruction manual', icon: '📘', qty: 1, service_months: null, mandatory: true, ref: `${REF} §14.9 (p124)` },
      { kind: 'lifesaving_signals_table', name: 'Table of International Life-Saving Signals (1× SOLAS No.1 or 2× No.2)', icon: '📋', qty: 1, service_months: null, mandatory: true, ref: `${REF} §14.10 (p125)` },
      { kind: 'pyrotechnics', name: 'Pyrotechnics (UKCA/MED or MSN 1676)', icon: '🧨', qty: 1, service_months: null, verify: true, mandatory: true,
        note: `${pyro[0]} red parachute, ${pyro[1]} red hand flares, 2 ${c <= 1 ? 'buoyant smoke' : 'buoyant or hand-held smoke'}. Replace by manufacturer expiry date (interval not stated in Code).`,
        ref: `${REF} Table 14.1.2 + Note A (p115)` },
      { kind: 'searchlight', name: 'Waterproof electric signalling lamp + searchlight (or daylight signalling lamp with searchlight capability)', icon: '🔦',
        qty: [0, 1, 2, 3, 5].includes(c) ? 1 : 0, service_months: null, mandatory: [0, 1, 2, 3, 5].includes(c), ref: `${REF} §14.11.1 (p125)` },
      { kind: 'sart', name: 'SART (Radar SART or AIS-SART)', icon: '📡', qty: c <= 1 ? 2 : 0, service_months: null, mandatory: c <= 1,
        note: c <= 1 ? 'May be reduced to 1 if in SAR-covered areas and EPIRB has 121.5 MHz homer and is non-float-free for raft (§14.11.4)' : 'Required only if operating outside dedicated SAR coverage (radar SART, AIS-SART or EPIRB-AIS) (§14.11.2)',
        ref: `${REF} §14.11.2-14.11.4 (p125), Table 14.1.2 Note C (p115-116)` },
      // ---- Radio: Table 17.2.1 (p143-144), Table 14.1.2 (p115) ----
      { kind: 'vhf_fixed', name: c === 6 ? 'VHF DSC — fixed installation (or portable VHF DSC)' : 'Fixed VHF radio installation with DSC (Ch 70 watch)', icon: '📻',
        qty: 1, service_months: null, mandatory: c <= 5, note: c === 6 ? 'Cat 6: fixed OR portable VHF DSC' : 'Marked with call sign + MMSI; distress procedures displayed',
        ref: `${REF} Table 17.2.1 (p143), §17.3 (p145-146), §17.8.1 (p147)` },
      { kind: 'vhf_handheld', name: 'Portable VHF (waterproof 1 m/5 min, lanyard, 8 h battery)', icon: '📻',
        qty: (v) => Math.max(1, v.liferaft_count || 1), service_months: null, mandatory: true, verify: c >= 3 && c <= 5,
        note: 'One per liferaft if more than one raft. Table 14.1.2 lists "Portable VHF with DSC" ×1 for all categories, but Table 17.2.1 shows portable VHF DSC 0 for Cat 3-5 — confirm whether DSC is needed on the handheld for Cat 3-5.',
        ref: `${REF} §17.4 (p146), Table 14.1.2 (p115), Table 17.2.1 (p143)` },
      { kind: 'mf_radio', name: 'MF DSC radio installation, or recognised mobile satellite service (distress alerting)', icon: '📻',
        qty: (v) => (c <= 5 && AREA(v) !== 'A1' ? 1 : 0), service_months: null, mandatory: c <= 5, verify: true,
        note: 'Sea Area A2: MF DSC or satellite; A3: satellite. HM Coastguard keeps no MF watch in UK waters (Note A). Cat 6 in A2 shows "C1" in the table; A4 cells are blank — confirm.',
        ref: `${REF} Table 17.2.1 + Notes A, D (p143-144)` },
      { kind: 'epirb', name: '406 MHz EPIRB (float-free, auto-activating)', icon: '📡',
        qty: (v) => (c === 0 ? 2 : c <= 2 ? 1 : (c <= 5 ? (AREA(v) === 'A1' ? (c === 5 ? 0 : 1) : 1) : 0)),
        service_months: null, mandatory: c <= 4, verify: c >= 3,
        note: c === 0 ? 'Second EPIRB need not float free (§17.5.3)'
          : c === 6 ? 'Recommended (R)'
          : c === 5 ? 'Table 14.1.2: "R or 1"; Table 17.2.1: 1 in Sea Area A2'
          : (c === 3 || c === 4) ? 'Table 14.1.2 says 1, but Table 17.2.1 Note B says required only in Sea Areas A2-A4 and recommended in A1 — conflict in the Code' : 'Float-free unless impracticable and <16 persons (§17.5.2)',
        ref: `${REF} Table 14.1.2 (p115), Table 17.2.1 + Note B (p143-144), §17.5 (p146-147)` },
      { kind: 'plb', name: '406 MHz PLB / Class M VHF DSC MOB device with AIS', icon: '📡',
        qty: (v) => (v.single_handed ? 1 : (c <= 1 ? 'Table 14.1.2 "Yes" — quantity not specified' : 0)), service_months: null,
        mandatory: c <= 1, verify: c <= 1,
        note: c <= 1 ? 'Table 14.1.2 marks Personal Emergency Radio Devices "Yes" for Cat 0/1, but §17.6.1/Table 17.2.1 say "recommended" — conflict. Mandatory (worn by Master, with GPS + light) for single-handed operation (§28.2.4.2).'
          : 'Recommended. Mandatory for the Master in single-handed operation (§28.2.4.2).',
        ref: `${REF} Table 14.1.2 (p115), §17.6.1 (p147), §28.2.4.2 (p200)` },
      { kind: 'navtex', name: 'NAVTEX receiver', icon: '📠',
        qty: (v) => (c <= 3 ? 1 : c === 4 ? (AREA(v) === 'A1' ? 0 : 1) : 0), service_months: null,
        mandatory: c <= 4, verify: c >= 4,
        note: c <= 3 ? '' : c === 4 ? 'Required in A2-A4; in A1 not required for voyages <12 h but recommended (Note C)' : c === 5 ? 'C1: required where navigation/weather info cannot be reliably obtained by other means' : 'C3: recommended where info cannot be reliably obtained otherwise',
        ref: `${REF} Table 17.2.1 + Note C (p143-144), §17.1.3.1 (p142)` },
      // ---- Fire: Sections 15-16 ----
      { kind: 'fire_ext_portable', name: 'Portable fire extinguishers (5A/34B etc.)', icon: '🧯',
        qty: (v) => (v.is_open_boat && L(v) <= 8 && !v.has_enclosure_or_cooker ? 2 : 'per space — see note'),
        service_months: 12, verify: true, mandatory: true,
        note: 'Outboard ≤220 kW: 1×5A/34B; >220 kW: total B rating 0.3×P. Inboard <120 kW: 1×5A/34B at each machinery-space entrance; >120 kW: via fire port or fixed system. 1×5A/34B per accommodation space (within 5 m of bunks); galley per Table 16.2.3.1. Open boats/RIBs ≤8 m without enclosure/cooker: min 2×34B. No halon; CO2 ≤2 kg, not in sleeping spaces. Service intervals per MGN 276 Table 1 (not stated in the Code).',
        ref: `${REF} Table 16.1.1.1 (p137), §16.2 (p138), Table 16.2.3.1 (p139), §16.3 (p138-140)` },
      { kind: 'fire_pump', name: 'Fire pump (power self-priming or hand) — or 13A/113B extinguisher(s) alternative', icon: '🧯',
        qty: (v) => (L(v) >= 15 || GE16(v) ? 2 : 1), service_months: null, mandatory: true,
        note: 'Alternative: <15 m and ≤15 persons → 1×13A/113B; ≥15 m or ≥16 persons → 2×13A/113B. Pump needs hose with 10 mm nozzle + spray nozzle.',
        ref: `${REF} §16.4.2 (p141)` },
      { kind: 'fire_ext_fixed', name: 'Fixed fire extinguishing system (machinery space)', icon: '🧯', qty: 1, service_months: 12, mandatory: false,
        note: 'Option for inboard engines >120 kW (alternative to fire port); serviced at least annually', ref: `${REF} Table 16.1.1.1 (p137), §16.4.1 (p140)` },
      { kind: 'fire_blanket', name: 'Fire blanket', icon: '🧯', qty: (v) => (v.has_open_flame_cooker ? 1 : 0), service_months: null, mandatory: false,
        note: 'One option (with 1×5A/34B) for spaces with open-flame cooking/heating — alternatives: 8A/68B extinguisher or fixed system. Located where CA identifies a fire-acceleration risk.',
        ref: `${REF} Table 16.2.3.1 (p139), §16.5 (p141)` },
      { kind: 'fire_bucket', name: 'Fire buckets with lanyards', icon: '🪣', qty: 2, service_months: null, mandatory: false,
        note: 'Where practicable or deemed necessary', ref: `${REF} §16.6.1 (p141)` },
      { kind: 'fire_detector', name: 'Fire detectors (machinery, accommodation, appliance & electrical-risk spaces)', icon: '🚨', qty: 'per space', service_months: null, mandatory: true,
        note: 'Audible at control position and accommodation; test per manufacturer', ref: `${REF} §15.6.1-15.6.2 (p133)` },
      { kind: 'co_detector', name: 'Carbon monoxide detectors', icon: '🚨', qty: 'each accommodation space + exhaust-risk spaces', service_months: null, mandatory: true,
        ref: `${REF} §15.6.3 (p133-134)` },
      { kind: 'gas_detector', name: 'Hydrocarbon gas detector & alarm', icon: '🚨', qty: (v) => (v.has_gas_appliance ? 1 : 0), service_months: null, mandatory: true,
        note: 'Any space with gas appliances or where gas may accumulate', ref: `${REF} §15.6.4 (p134), App. 2A §7 (p217)` },
      // ---- Navigation: Sections 18-19 ----
      { kind: 'compass', name: c === 4 || c === 6 ? 'Magnetic steering compass (deviation card)' : 'Magnetic steering compass with light (deviation card)', icon: '🧭', qty: 1, service_months: null, mandatory: true,
        note: 'Keep a deviation record; re-adjust on installation, unreliability, structural/electrical changes, or if 2 years pass without a deviation record; bearing capability over 360°', ref: `${REF} §19.2 (p153-154)` },
      { kind: 'nav_lights', name: 'Navigation lights, shapes & sound signals (COLREGs / SI 1996/75)', icon: '💡', qty: 1, service_months: null, mandatory: true,
        note: '<12 m: any efficient sound signal; 12-20 m: whistle; 20-24 m: whistle + bell', ref: `${REF} §18 & Table 18.4 (p149-152)` },
      { kind: 'charts', name: c === 6 ? 'Access to relevant nautical publication information' : 'Up-to-date charts & nautical publications (or MGN 319 ECS)', icon: '🗺️', qty: 1, service_months: null, mandatory: true,
        ref: `${REF} §19.3 (p154)` },
      { kind: 'signalling_lamp', name: 'Waterproof electric signalling lamp', icon: '🔦', qty: 1, service_months: null, mandatory: true, ref: `${REF} §19.4.1 (p154)` },
      { kind: 'echo_sounder', name: 'Echo sounder (or other means to measure depth)', icon: '📏', qty: 1, service_months: null, mandatory: true, ref: `${REF} §19.5.1 (p154)` },
      { kind: 'radar_reflector', name: 'Radar reflector', icon: '📡', qty: 1, service_months: null, mandatory: c <= 5,
        note: c === 6 ? 'Cat 6 may be excused if impracticable; then must not go to sea in fog' : '', ref: `${REF} §19.6 (p154-155)` },
      ...(c <= 2 ? [
        { kind: 'gnss', name: 'Electronic position-fixing system (GNSS)', icon: '🛰️', qty: 1, service_months: null, mandatory: true, ref: `${REF} §19.7.1.1 (p155)` },
        { kind: 'log', name: 'Distance-measuring log (unless GNSS gives reliable distance)', icon: '📏', qty: 1, service_months: null, mandatory: true, ref: `${REF} §19.7.1.2 (p155)` },
        { kind: 'ais', name: 'AIS transceiver', icon: '📡', qty: 1, service_months: null, mandatory: true, ref: `${REF} §19.7.1.3 (p155)` },
        { kind: 'radar', name: '3 cm radar', icon: '📡', qty: 1, service_months: null, mandatory: true,
          note: 'Existing vessels transitioning from MGN 280/Yellow/Red/Blue Code without radar are exempt unless they later fit one (§19.7.2)', ref: `${REF} §19.7.1.4, §19.7.2 (p155)` }
      ] : []),
      // ---- Anchors: Section 20 ----
      { kind: 'anchor', name: c <= 5 ? 'Anchors (main + spare, or two main) with cables' : 'Anchor with cable (≥ kedge mass)', icon: '⚓',
        qty: c <= 5 ? 2 : 1, service_months: null, mandatory: true,
        note: c <= 3 ? 'Masses/cable sizes per Table 20.1.1 (HHP anchors; fisherman +75%)' : c <= 5 ? 'Each ≥90% of Table 20.1.1 masses, subject to CA approval' : 'At least kedge mass from Table 20.1.1',
        ref: `${REF} §20.1 (p156), Table 20.1.1 (p157)` },
      // ---- Bilge: Section 11 ----
      { kind: 'bilge_pump', name: 'Bilge pumps (1 hand + 1 powered, permanently installed, self-priming)', icon: '💧',
        qty: (v) => (c === 6 && v.is_open_boat && L(v) < 6 ? 1 : 2), service_months: null, mandatory: true,
        note: c <= 1 ? 'Combined ≥210 l/min, powered pump ≥140 l/min' : 'Min individual capacity: ≤6 m 10 l/min; 6-12 m 15 l/min; ≥12 m 30 l/min. Open boats/RIBs <6 m in Cat 6: 1 hand pump, bailer or 10 l bucket instead; ≥6 m: add a 10 l bailer/bucket.',
        ref: `${REF} §11.2 (p84-85)` },
      { kind: 'bilge_alarm', name: 'Bilge alarm', icon: '🚨', qty: 'each propulsion-machinery compartment + other at-risk compartments', service_months: null, mandatory: true,
        ref: `${REF} §11.3 (p85-86)` },
      // ---- Personnel ----
      { kind: 'kill_cord', name: 'Kill cord (+ spare) — open boats/RIBs or where helm may fall overboard', icon: '🔑',
        qty: (v) => (v.is_open_boat ? 2 : 0), service_months: null, mandatory: true,
        note: 'Spare, override-capable system or sprung throttle; alternatives by CA', ref: `${REF} §8.9.2 (p71-72)` },
      { kind: 'harness', name: 'Safety harnesses', icon: '🪢', qty: (v) => (v.is_sailing ? P(v) : (v.is_decked ? 2 : 0)), service_months: null, mandatory: true,
        note: `Each person working on deck; min 2 on decked vessels; sailing vessels one per person${c <= 3 ? '; jackstays on sailing vessels' : ''}`,
        ref: `${REF} §22.2.4 (p167)` },
      // ---- Medical: §23.1.1 (p170) ----
      c === 0
        ? { kind: 'first_aid_a', name: 'Medical stores — Category A', icon: '🩹', qty: 1, service_months: 12, mandatory: true, note: 'Checklist reviewed annually; first-aid instructions included (see MIN 724)', ref: `${REF} §23.1.1.1, §23.1.4 (p170)` }
        : c === 1
          ? { kind: 'first_aid_b', name: 'Medical stores — Category B', icon: '🩹', qty: 1, service_months: 12, mandatory: true, note: 'Checklist reviewed annually; first-aid instructions included (see MIN 724)', ref: `${REF} §23.1.1.2, §23.1.4 (p170)` }
          : { kind: 'first_aid_c', name: 'Medical stores — Category C', icon: '🩹', qty: 1, service_months: 12, mandatory: true, note: 'Checklist reviewed annually; first-aid instructions included (see MIN 724)', ref: `${REF} §23.1.1.3, §23.1.4 (p170)` }
    ];
    return list;
  }
  const EQUIPMENT = Object.fromEntries(CAT_IDS.map((id) => [id, equipmentFor(id)]));

  // 6. CREW_REQS — Appendix 5 Tables A5.1 (p231), A5.2 (p233), A5.3 (p235); §28 (p198-205)
  const MASTER_OPTIONS = {
    0: 'Yachtmaster Ocean CoC, STCW Master (Code vessels <200 GT unlimited) or STCW Master (Workboat <500 GT unlimited)',
    1: 'Yachtmaster Offshore CoC or higher (Yachtmaster Ocean; STCW Master <200 GT limited to 150 miles; STCW Master <200 GT unlimited; STCW Master Workboat <500 GT)',
    2: 'Yachtmaster Offshore CoC or higher (Yachtmaster Ocean; STCW Master <200 GT limited to 150 miles; STCW Master <200 GT unlimited; STCW Master Workboat <500 GT)',
    3: 'Yachtmaster Coastal CoC, MCA Boatmasters’ Licence, Powerboat Advanced CoC (or Advanced Practical issued before 1 Jan 2005), CoC for the area from a Competent Authority, or any higher qualification',
    4: 'Yachtmaster Coastal CoC, Boatmasters’ Licence, Powerboat Advanced CoC (or Advanced Practical pre-2005), CoC from a Competent Authority, Day Skipper Theory & Practical (daylight only), or higher',
    5: 'Yachtmaster Coastal CoC, Boatmasters’ Licence, Powerboat Advanced CoC (or Advanced Practical pre-2005), CoC from a Competent Authority, or higher',
    6: 'Any Cat 5 qualification, or Day Skipper Theory & Practical (daylight only), Local Authority Licence for the area, or Powerboat Level 2 + 12 months relevant experience (open boats/RIBs/inflatables/buoyant-collar boats <10 m only)'
  };
  const SECOND_PERSON = {
    0: 'Another person holding Yachtmaster Offshore, STCW Master (<200 GT, 150 miles), Yachtmaster Ocean or STCW Master (<200 GT unlimited)',
    1: 'Second person holding at least Yachtmaster Coastal CoC',
    2: 'Second person deemed competent and briefed by the Master (may be a trainee or passenger), able to operate the vessel safely in expected conditions',
    3: 'Second person deemed by the Master to be experienced and competent (single-handed exceptions apply)',
    4: 'Second person deemed by the Master to be experienced and competent (single-handed exceptions apply)',
    5: 'Second person deemed by the Master to be experienced and competent (single-handed exceptions apply)',
    6: 'Second person deemed by the Master to be experienced and competent (single-handed exceptions apply)'
  };
  function crewFor(cat) {
    const c = n(cat);
    const list = [
      { role: 'Master', cert: MASTER_OPTIONS[c], mandatory: true, ref: `${REF} Table A5.1 (p231), Notes A-H (p232)` },
      { role: 'Master', cert: 'RYA/MCA certificates must be commercially endorsed (and appropriate to sail or power)', mandatory: true, ref: `${REF} §28.1.5 (p198), Table A5.1 Notes 3 & A (p232)` },
      { role: 'Second person', cert: SECOND_PERSON[c], mandatory: true, ref: `${REF} Table A5.1 Additional Requirements (p231)` },
      { role: 'All crew', cert: 'Valid medical fitness certificate (type per MIN 724)', mandatory: true, verify: true,
        note: 'The Code does not name ENG1 or ML5 — confirm accepted certificates in MIN 724', ref: `${REF} §28.1.3 (p198)` },
      { role: 'All crew', cert: 'RYA Basic Sea Survival or MCA-approved Personal Survival Techniques (PST mandatory for those on an STCW CoC route)', mandatory: true, ref: `${REF} Table A5.3 (p235)` },
      c <= 1
        ? { role: 'Master', cert: 'Proficiency in Medical Care (unless another crew member holds an equivalent or higher medical/nursing qualification); plus one person holding STCW Medical First Aid', mandatory: true, ref: `${REF} §23.2.1 (p170), Table A5.3 (p235)` }
        : { role: 'One person on board', cert: 'Elementary First Aid / First Aid at Sea / Medical First Aid, RYA First Aid, or SeaFish Basic First Aid (covering Category C medical stores)', mandatory: true, ref: `${REF} §23.2.1 (p170), Table A5.3 (p235)` },
      { role: 'Master and/or crew', cert: 'Fire-fighting course (MCA one-day, STCW FPFF, or MIN 724 course): <15 m — Master OR one crew; ≥15 m — Master AND one crew. Deadline: 5 years after entry into force', mandatory: true, ref: `${REF} §28.10 (p205), Table A5.3 (p235)` },
      { role: 'All crew', cert: 'On-board familiarisation with the vessel’s fire-fighting equipment (and ECS if fitted)', mandatory: true, ref: `${REF} §28.9.3, §28.10.1 (p205)` },
      { role: 'Master', cert: 'MCA-approved stability course — only if the vessel needs a Stability Information Booklet. Deadline: 5 years after entry into force', mandatory: c <= 1, ref: `${REF} Table A5.3 (p235)` },
      { role: 'Engineering', cert: c >= 3 ? 'One crew member sufficiently familiar with operation & maintenance of the machinery'
          : c === 2 ? 'Power Vessel W (towing/lifting/cargo >1000 kg): Approved Engine Course Part 1; otherwise one crew member familiar with the machinery'
          : c === 1 ? 'Sail: RYA Diesel Engine Course; Power SL: Approved Engine Course Part 1; Power W: MEOL (or STCW III/4 / AEC 1&2)'
          : 'Sail: RYA Diesel Engine Course; Power SL: AEC Part 1; Power W <1500 kW: MEOL; 1500-3000 kW: SMEOL / STCW C/Eng (Y4) or Small Vessel Second Engineer CoC',
        mandatory: true, ref: `${REF} Table A5.2 + Notes (p233-234)` },
      { role: 'All crew', cert: 'Basic Food Hygiene / Food Safety Level 2 — where preparing food for passengers', mandatory: false, ref: `${REF} Table A5.3 (p235)` },
      { role: 'Master', cert: 'Single-handed operation not permitted', mandatory: c <= 2, ref: `${REF} §28.2.1 (p199)` }
    ];
    if (c <= 2) {
      list.push({ role: 'Master + navigational watchkeepers', cert: 'MCA-approved/recognised radar course (MIN 724); pre-Code Yachtmaster Offshore/Ocean/STCW holders with radar experience or a one-day course are exempt', mandatory: true, ref: `${REF} §28.8.1 (p204), Table A5.3 (p235)` });
    }
    list.push({ role: 'Master + navigational watchkeepers', cert: 'ECS training (Small Ships Navigation & Radar ECS module) — only if an MGN 319 Electronic Chart System is used in lieu of paper charts', mandatory: false, ref: `${REF} §28.9.1 (p204)` });
    list.push({ role: 'Radio operator', cert: 'Radio operator certificate (e.g. VHF SRC; MF/GMDSS as fitted)', mandatory: true, verify: true,
      note: 'Not stated in the SPV Code — legal requirement comes from Ofcom radio licensing; confirm before showing as a Code requirement', ref: 'Not in SPV Code 2025' });
    return list;
  }
  const CREW_REQS = Object.fromEntries(CAT_IDS.map((id) => [id, crewFor(id)]));

  // 7. SMS_SCHEMA refs/titles (Appendix 7, p239-245). Field content unchanged.
  const SMS_REFS = [
    { id: 'meta',        title: 'Vessel & company',                                 ref: 'SPV Code 2025 §30.1-30.2 (p210); App. 7 §1.1 (p239)' },
    { id: 'hs_policy',   title: 'Health, Safety & Environmental Protection Policy', ref: 'SPV Code 2025 App. 7 §2 (p239)' },
    { id: 'risk',        title: 'Risk Assessments for Safe Working for all Operations', ref: 'SPV Code 2025 App. 7 §3 (p240); §3.13 (p39)' },
    { id: 'roles',       title: 'Roles & Responsibilities',                         ref: 'SPV Code 2025 App. 7 §4 (p240-241)' },
    { id: 'training',    title: 'Training & Qualifications of Personnel',            ref: 'SPV Code 2025 App. 7 §5 (p241-242); §28, App. 5' },
    { id: 'sop',         title: 'Vessel Standard Operating Procedures',              ref: 'SPV Code 2025 App. 7 §6 (p242-243); App. 8 (p246)' },
    { id: 'emergency',   title: 'Vessel Emergency Procedures',                       ref: 'SPV Code 2025 App. 7 §7 (p243)' },
    { id: 'reporting',   title: 'Reporting of Accidents',                            ref: 'SPV Code 2025 App. 7 §8 (p243-244); §3.6 (p35), §4.8 (p47-48)' },
    { id: 'maintenance', title: 'Maintenance of the Vessel & Equipment',             ref: 'SPV Code 2025 App. 7 §9 (p244); §3.5 (p34-35)' },
    { id: 'cyber',       title: 'Cyber Security Measures',                           ref: 'SPV Code 2025 App. 7 §10 (p244-245)' },
    { id: 'review',      title: 'Review & Continuous Improvement',                   ref: 'SPV Code 2025 App. 7 §11 (p245)' },
    { id: 'single_handed', title: 'Single-handed operation (only if permitted)',     ref: 'SPV Code 2025 App. 7 §12 (p245); §28.2 (p199-200)', new_section: true }
  ];




  // SMS module templates — what Joseph will help operators build.
  const SMS_TEMPLATES = [
    { id: 'risk_assess',    name: 'Risk Assessment',                desc: 'Operational risks: weather, passenger handling, fuel, fire, MOB',  icon: '⚠️' },
    { id: 'muster_list',    name: 'Muster List & Emergency Plan',  desc: 'Roles in emergency, abandon-ship procedure, rendezvous points',     icon: '🚨' },
    { id: 'drill_schedule', name: 'Drill Schedule',                 desc: 'MOB, fire, abandon-ship — frequency and record sheet',              icon: '🎯' },
    { id: 'permit_to_work', name: 'Permit to Work',                 desc: 'Hot work, confined space, working aloft — sign-off chain',          icon: '📝' },
    { id: 'toolbox_talks',  name: 'Toolbox Talks',                  desc: 'Pre-trip safety briefings — passenger and crew versions',           icon: '🧰' },
    { id: 'emergency_contacts', name: 'Emergency Contacts',         desc: 'HM Coastguard, vessel insurer, hospital, agent',                    icon: '☎️' },
    { id: 'pre_departure',  name: 'Pre-Departure Checklist',        desc: 'Daily walk-around: hull, fuel, comms, safety equipment',            icon: '✅' },
    { id: 'incident_log',   name: 'Incident & Near-miss Log',       desc: 'Recording, investigation, MAIB reporting threshold',                icon: '📓' }
  ];

  // ===========================================================================
  // SAFETY MANAGEMENT SYSTEM SCHEMA
  //
  // Canonical source:
  //   The Sport or Pleasure Vessel Code 2025, Appendix 7 — "Safety Management
  //   System". Published 20 November 2025 by the Maritime and Coastguard Agency.
  //   File: docs/The_sport_or_pleasure_vessel_code 2025 Published.pdf
  //
  //   Cross-referenced with:
  //   Workboat Code Edition 3 (updated)
  //   File: docs/Workboat_Code_Edition_3 - UPDATED.pdf
  //
  // Section order, titles and references mirror SPV Code 2025 App. 7 sections
  // §1–§11 exactly. Default text is operator-ready boilerplate. The AI SMS
  // generator (generateSmsFromInputs in app.js + the Claude edge function)
  // substitutes [VESSEL_NAME] / [CATEGORY] and lets the operator review.
  // ===========================================================================
  const SMS_SCHEMA = [
    {
      id: 'meta',
      title: 'Vessel & company',
      icon: '⛵',
      ref: 'SPV Code 2025 §30.1-30.2 (p210); App. 7 §1.1 (p239)',
      blurb: 'Identifies the vessel and operating company. Required so the Certifying Authority can match the SMS to the vessel under examination (§30.1.2).',
      fields: [
        { id: 'vessel_name',   label: 'Vessel name',                    type: 'short', placeholder: 'e.g. Tsunami IV' },
        { id: 'vessel_ssr',    label: 'SSR / Official number',          type: 'short', placeholder: 'e.g. 987654' },
        { id: 'vessel_type',   label: 'Vessel type',                    type: 'short', placeholder: 'Motor charter / Angling / Sailing yacht' },
        { id: 'vessel_cat',    label: 'Coding category',                type: 'short', placeholder: 'Cat 2' },
        { id: 'company_name',  label: 'Owning company / sole trader',   type: 'short', placeholder: 'McLaughlin Charters Ltd' },
        { id: 'company_addr',  label: 'Registered address',             type: 'long',  placeholder: 'Address used on insurance + survey paperwork' },
        { id: 'company_contact', label: 'Owner contact (name + phone + email)', type: 'long', placeholder: 'Joseph McLaughlin · +44 7… · joseph@…' },
        { id: 'sms_version',   label: 'SMS version',                    type: 'short', default: '1.0 (initial issue)' },
        { id: 'sms_review_date', label: 'Date of this issue',          type: 'date'  }
      ]
    },
    {
      id: 'hs_policy',
      title: 'Health, Safety & Environmental Protection Policy',
      icon: '🛡️',
      ref: 'SPV Code 2025 App. 7 §2 (p239)',
      blurb: 'Must address health, safety, working environment and the environment, both ashore and on board (§2.2). An appointed person within the organisation takes responsibility (§2.3). The policy must also include a drug and alcohol policy (§2.4).',
      fields: [
        { id: 'policy_text', label: 'Policy statement', type: 'long', default:
`The owner of [VESSEL_NAME] is committed to providing a safe and healthy workplace for crew, passengers and contractors, and to operating the vessel in a way that protects the marine environment.

In support of this commitment we will:
  • comply with the Sport or Pleasure Vessel Code 2025 (or Workboat Code Ed 3 as applicable), associated MGNs and any other relevant regulation;
  • identify hazards, assess risk and apply control measures, reviewed at least annually and after any incident;
  • provide instruction, training and supervision so that everyone on board is competent for their role;
  • maintain the vessel and its equipment in a safe and seaworthy condition;
  • prevent pollution by the careful management of fuel, oil, sewage, chemicals and waste;
  • report all accidents, incidents and near-misses, learn from them, and act on the lessons;
  • prohibit the use of alcohol and recreational drugs on board, in line with our Drug & Alcohol Policy.

Signed: ______________________     Position: ______________________     Date: __________` },
        { id: 'designated_person', label: 'Person responsible for H&S (name + role)', type: 'short', placeholder: 'Joseph McLaughlin — Owner/Master' },
        { id: 'da_policy', label: 'Drug & Alcohol Policy', type: 'long', default:
`No person shall be in charge of, or work on, [VESSEL_NAME] while impaired by alcohol, prescription drugs that affect judgement, or any illegal substance. The Master may at any time stand down a person reasonably suspected of being impaired. Random checks may be carried out. Any positive result is treated as gross misconduct.` }
      ]
    },
    {
      id: 'risk',
      title: 'Risk Assessments for Safe Working for all Operations',
      icon: '⚠️',
      ref: 'SPV Code 2025 App. 7 §3 (p240); §3.13 (p39)',
      blurb: 'The SMS shall include risk assessments for all applicable elements of the Code AND a statement confirming the sections of the Code requiring reference to the SMS have been included (§3.2). Further guidance: COSWP Chapter 1.',
      fields: [
        { id: 'risk_method', label: 'Method statement', type: 'long', default:
`Risks are scored on a 5×5 matrix (likelihood × severity). For each task we list the hazards, who could be harmed, the controls already in place, the residual risk score, and any further action required. Risk assessments are reviewed every 12 months, when there is a change to the vessel, equipment or operation, and after any incident or near-miss.` },
        { id: 'risk_register', label: 'Risk register — bullet list of operations covered', type: 'long', default:
`  • Embarking and disembarking passengers
  • Mooring, anchoring and getting underway
  • Refuelling
  • Engine operations and engine-room access
  • Navigation in pilotage waters
  • Passage planning offshore
  • Heavy-weather operations
  • Use and stowage of pyrotechnics
  • Hot work / maintenance underway
  • Lone working
  • Manual handling
  • Slips, trips and falls
  • Working at height (mast, radar arch)
  • Bird strike / fishing gear conflict (where relevant)` },
        { id: 'risk_review_freq', label: 'Review frequency', type: 'short', default: 'Every 12 months, after any incident, and on change of operation' }
      ]
    },
    {
      id: 'roles',
      title: 'Roles & Responsibilities',
      icon: '🧑‍✈️',
      ref: 'SPV Code 2025 App. 7 §4 (p240-241)',
      blurb: 'Master has overriding authority — by written statement (§4.2.1). Owner/Operator defines responsibilities (§4.4). A competent Person Ashore must be designated to liaise with the Master, shore-based authorities and emergency services (§4.7).',
      fields: [
        { id: 'master_authority', label: 'Master\'s authority statement', type: 'long', default:
`The Master of [VESSEL_NAME] has overriding authority and responsibility to make decisions with respect to the safety of the vessel, the persons on board and the prevention of pollution, and to request the owner/operator's assistance as may be necessary. No instruction from the Owner shall override this authority.` },
        { id: 'owner_role', label: 'Owner/Operator responsibilities', type: 'long', default:
`The Owner/Operator is responsible for:
  • providing a vessel that meets the Code in force;
  • ensuring the Master and crew are properly qualified and medically fit;
  • providing adequate resources to maintain the vessel and equipment;
  • maintaining insurance cover appropriate to the operation;
  • ensuring this SMS is available, current, and understood by everyone on board;
  • appointing a competent Person Ashore.` },
        { id: 'crew_duties', label: 'Crew duties', type: 'long', default:
`All crew have a duty to take reasonable care for their own safety and the safety of others affected by what they do, and to follow the procedures in this SMS. Crew shall report any defect, hazard or near-miss to the Master without delay.` },
        { id: 'person_ashore', label: 'Person Ashore — name + contact', type: 'long', placeholder: 'Name, relationship, mobile number, email — must be reachable when the vessel is at sea' },
        { id: 'shoreside_plan', label: 'Shoreside emergency plan summary', type: 'long', default:
`If the vessel is overdue, fails to make routine contact, or the Master declares an emergency, the Person Ashore will:
  1. Attempt voice contact on the agreed channel(s).
  2. If contact cannot be re-established within 30 minutes, contact HM Coastguard (999 / Channel 16) and provide the Vessel Information Sheet kept with this SMS.
  3. Liaise with emergency services and the Owner.
  4. Notify the insurer and next-of-kin only after the operational emergency is contained.` }
      ]
    },
    {
      id: 'training',
      title: 'Training & Qualifications of Personnel',
      icon: '🎓',
      ref: 'SPV Code 2025 App. 7 §5 (p241-242); §28, App. 5',
      blurb: 'Before first working on the vessel, each crew member receives familiarisation training covering, at minimum: emergency drills + MOB recovery, mooring, launch/recovery of survival craft, evacuation, lifejacket donning, fire-fighting equipment use (§5.2). See Section 28 of the Code for crew qualifications.',
      fields: [
        { id: 'familiarisation', label: 'Familiarisation checklist', type: 'long', default:
`Before working on [VESSEL_NAME] each new crew member is briefed and signed off on:
  • emergency drills and MOB recovery
  • mooring and unmooring
  • launching and recovery of survival craft
  • evacuation routes from all areas of the vessel
  • donning of lifejackets
  • use and handling of fire-fighting equipment
  • starting/stopping the main engine
  • operating the radio (Mayday/Pan-Pan procedure)

The familiarisation record is signed by the crew member and the Master and kept on board.` },
        { id: 'crew_quals', label: 'Required qualifications by role', type: 'long', placeholder: 'Auto-filled from your vessel category if you leave blank' }
      ]
    },
    {
      id: 'sop',
      title: 'Vessel Standard Operating Procedures',
      icon: '📋',
      ref: 'SPV Code 2025 App. 7 §6 (p242-243); App. 8 (p246)',
      blurb: 'Documented procedures for: steering-gear test before passage, navigation and handling, maintenance routines, refuelling, watertight/weathertight integrity, stability, passenger and crew conduct, emergency towing (§6.1). Safety briefing requirements under §6.2.',
      fields: [
        { id: 'pre_departure', label: 'Pre-departure checks', type: 'long', default:
`Before each voyage the Master shall confirm:
  ☐ Weather forecast obtained and acceptable for the planned passage
  ☐ Steering gear tested and free
  ☐ Engine cooling, fuel, oil and battery levels checked
  ☐ Bilges dry; bilge pumps tested
  ☐ Navigation lights tested
  ☐ VHF radio tested (radio check on Ch 16/67)
  ☐ Liferaft service in date; lifejackets accessible and within service interval
  ☐ Pyrotechnics in date and accessible
  ☐ Fire extinguishers in date; fire blanket present
  ☐ First aid kit complete
  ☐ Anchor and chain free to deploy
  ☐ Crew briefed; passenger headcount taken
  ☐ Passage plan filed with the Person Ashore (ETA, route, persons on board)` },
        { id: 'passage_plan', label: 'Passage planning policy', type: 'long', default:
`A passage plan covering Berth-to-Berth is prepared for every voyage > 60 minutes from a safe haven. It includes weather, tide, route, hazards, alternates, communication plan and ETA. A copy is left with the Person Ashore.` },
        { id: 'refuel_proc', label: 'Refuelling procedure', type: 'long', default:
`Before refuelling: stop engines and electrical equipment; close hatches; extinguish all flame; have a fire extinguisher to hand; brief any helper. Pump slowly. Wipe and dispose of any spill rags ashore. Open hatches, ventilate and sniff-test before re-starting engines.` },
        { id: 'passenger_brief', label: 'Passenger conduct & safety briefing', type: 'long', default:
`At the start of every trip the Master shall brief all passengers on:
  • lifejacket location and donning;
  • location of liferafts and grab bag;
  • muster point;
  • location of fire extinguishers and the first aid kit;
  • man-overboard alert procedure;
  • the no-alcohol/no-drug policy;
  • the duty to obey the Master's instructions in any emergency.` }
      ]
    },
    {
      id: 'emergency',
      title: 'Vessel Emergency Procedures',
      icon: '🚨',
      ref: 'SPV Code 2025 App. 7 §7 (p243)',
      blurb: 'Procedures required by the Code for: fire, flooding, collision, grounding, violent act, propulsion/steering failure, MOB, abandon ship, medical, aid to other vessels, enclosed space rescue (§7.1). Roles in emergencies must be clearly defined (§7.2). Exercises must be recorded with names of participants (§7.5).',
      fields: [
        { id: 'mayday_proc', label: 'Mayday / Pan-Pan procedure', type: 'long', default:
`To send a Mayday on Ch 16:
  1. Press the red DSC distress button until acknowledged (then release).
  2. Voice transmission:
       MAYDAY MAYDAY MAYDAY
       This is [VESSEL_NAME] [VESSEL_NAME] [VESSEL_NAME]
       MAYDAY [VESSEL_NAME], MMSI/Callsign […]
       Position: [lat/long or bearing & distance from a known point]
       Nature of distress: [e.g. taking on water]
       Assistance required: [e.g. immediate evacuation]
       Persons on board: […]
       Over.
  3. If no acknowledgement in 60 seconds, repeat. Use phone: 999 (UK) / 112 (IE) — ask for Coastguard.

Pan-Pan is used for urgency that is NOT immediate danger to life. Same format, prefix "PAN-PAN PAN-PAN PAN-PAN".` },
        { id: 'fire_proc', label: 'Fire on board', type: 'long', default:
`Sound the alarm. Master orders engines stopped if appropriate. Cut fuel and electrical supplies to the affected space. Use the nearest extinguisher (CO₂ for engine, dry powder/foam for galley/accommodation, blanket for cooking-oil). If the fire is not under control within 60 seconds, prepare to abandon ship and broadcast Mayday.` },
        { id: 'mob_proc', label: 'Man Overboard', type: 'long', default:
`On hearing "Man Overboard":
  1. The first person to see throws a lifebuoy / dan buoy with light, and shouts to keep eyes on the casualty.
  2. Helm: turn the vessel onto a Williamson or quick-stop turn.
  3. Hit MOB button on the chartplotter.
  4. Broadcast Pan-Pan if recovery is not immediate.
  5. Approach from downwind/down-tide, engine out of gear before recovery.
  6. Recover using the boarding ladder, recovery sling or scoop.
  7. Treat for hypothermia. Keep horizontal. Reassess if Mayday is required.` },
        { id: 'flood_proc', label: 'Flooding', type: 'long', default:
`Identify source. Activate bilge pumps. Reduce speed; turn to take seas on the bow if practical. Plug visible holes (soft-wood plug, anything to slow ingress). If pumps cannot keep up, broadcast Mayday and prepare to abandon to the liferaft.` },
        { id: 'abandon_proc', label: 'Abandon ship', type: 'long', default:
`Master gives the order. Don lifejackets and immersion suits if carried. Take grab bag and EPIRB. Activate liferaft and board only when stable. Stay attached to the vessel as long as it is safe — a liferaft is harder to find than a vessel. Once clear, deploy drogue, account for everyone, conserve water, await rescue.` },
        { id: 'medical_proc', label: 'Medical emergency', type: 'long', default:
`Do not move a casualty unless they are in further danger. Call HM Coastguard for medical advice (Ch 16 / 999). Provide age, conscious state, breathing, pulse, injuries, current treatment. Be prepared to support a helicopter winch — clear the deck, secure loose gear, follow Coastguard instructions.` }
      ]
    },
    {
      id: 'reporting',
      title: 'Reporting of Accidents',
      icon: '📓',
      ref: 'SPV Code 2025 App. 7 §8 (p243-244); §3.6 (p35), §4.8 (p47-48)',
      blurb: 'Procedure must be understood by all personnel (§8.1). Owner/Operator reports accidents to the Administration; see Section 3 of the Code and MIN 724 (§8.2). All accidents, incidents AND near-misses are recorded and reported to the Owner/Operator who implements corrective action (§8.3).',
      fields: [
        { id: 'maib_proc', label: 'MAIB reporting', type: 'long', default:
`The Owner/Operator shall report any accident reportable under the Merchant Shipping (Accident Reporting and Investigation) Regulations 2012 to the Marine Accident Investigation Branch (MAIB) within 24 hours.
  • Phone: +44 (0)23 8023 2527 (24-hour line)
  • Email: maib@dft.gov.uk
A report covers: serious injury, loss of life, structural damage, fire, grounding, collision, capsize, sinking. Any near-miss involving any of the above is also reported.` },
        { id: 'internal_log', label: 'Internal incident & near-miss log', type: 'long', default:
`Every accident, incident and near-miss is recorded by the Master in the Incident Log on board, with date/time, location, weather, sequence of events, persons involved, immediate action and lessons learned. The Owner reviews each entry within 7 days and updates this SMS, the risk register, or training as required.` }
      ]
    },
    {
      id: 'maintenance',
      title: 'Maintenance of the Vessel & Equipment',
      icon: '🔧',
      ref: 'SPV Code 2025 App. 7 §9 (p244); §3.5 (p34-35)',
      blurb: 'Maintenance shall meet §3.5 of the Code (§9.1). Owner/Operator develops documented inspection + maintenance procedures, sets the frequency, and records every inspection and maintenance activity (§9.2).',
      fields: [
        { id: 'maint_method', label: 'Maintenance approach', type: 'long', default:
`Routine maintenance follows the manufacturer's service intervals. Service records are kept on board (and in CodedOK) for: liferaft, EPIRB, lifejackets, fire extinguishers, pyrotechnics, bilge pumps, engine, steering, gas system. Defects are logged immediately. Critical defects render the vessel unfit for commercial use until corrected.` },
        { id: 'inspection_freq', label: 'Inspection frequency', type: 'long', default:
`  • Daily — pre-departure check (see SOP)
  • Weekly — bilges, mooring lines, gas, batteries
  • Monthly — fire extinguisher visual, lifejacket visual, EPIRB self-test
  • Annually — service certificates renewed; safety equipment professionally serviced
  • At survey — full inspection by Certifying Authority` }
      ]
    },
    {
      id: 'cyber',
      title: 'Cyber Security Measures',
      icon: '🔒',
      ref: 'SPV Code 2025 App. 7 §10 (p244-245)',
      blurb: 'Required by §10.2: identify critical systems/data, define roles, defend, detect, restore, maintain back-ups. §10.3 mandates a cyber risk assessment covering IT systems, OT, remotely-operable equipment, comms, and crew responsibilities — refreshed on any alteration or every 5 years. References: IMO MSC.428(98), IEC 61162-420, IEC 63154.',
      fields: [
        { id: 'cyber_assets', label: 'Critical IT/OT systems on board', type: 'long', default:
`  • Chartplotter / GPS
  • AIS
  • VHF DSC radio
  • Engine ECU
  • Onboard wifi router
  • Owner/Master mobile phones used for navigation or comms` },
        { id: 'cyber_controls', label: 'Cyber controls', type: 'long', default:
`  • All connected devices use unique, complex passwords; default passwords are changed before use.
  • Software/firmware updates applied within 30 days of release.
  • USB devices from unknown sources are not connected to vessel systems.
  • Backups of charts, route plans and critical software held offline.
  • Crew trained on basic phishing awareness.` },
        { id: 'cyber_response', label: 'Response to a cyber-attack', type: 'long', default:
`On detection of unusual behaviour: disconnect from internet, switch to backup paper charts, fall back on traditional navigation (fix from known landmarks), and notify the Owner. Do not attempt to "fix" the system at sea — return to a safe haven and seek qualified help.` }
      ]
    },
    {
      id: 'review',
      title: 'Review & Continuous Improvement',
      icon: '🔁',
      ref: 'SPV Code 2025 App. 7 §11 (p245)',
      blurb: 'Owner/Operator shall undertake a review of the SMS AT LEAST once every three years (§11.1). Improvements arising from any accident, incident, near-miss or periodic review shall be implemented at the earliest opportunity (§11.2). CodedOK defaults to annual review.',
      fields: [
        { id: 'review_freq', label: 'Review frequency', type: 'short', default: 'Annually, after every incident, and at least every 3 years per the Code' },
        { id: 'review_record', label: 'Review record', type: 'long', default:
`Each review is recorded by the Owner with: date, who reviewed, what changed, the new version number. Crew are briefed on changes at the next opportunity and the briefing is logged.` }
      ]
    }
  ];



  // ===========================================================================
  // WORKBOAT CODE EDITION 3 (in force 13 Dec 2023). Kept in its own scope so
  // its helpers don't clash with the SPV data above. Same item shapes.
  // ===========================================================================
  const WBC = (function () {
    // ===========================================================================
    // WORKBOAT CODE EDITION 3 (updated, published 22 Jan 2025) — CodedOK data
    // Source: MCA "The Workboat Code Edition 3 — The Safety of Small Workboats and
    // Pilot Boats — A Code of Practice". Given legal effect by The Merchant
    // Shipping (Small Workboats and Pilot Boats) Regulations 2023 (SI 2023/1216).
    //
    // `ref` format: 'WBC §<section> (p<PDF page>)'. PDF page == printed footer page.
    // (The Code's own contents page is stale by 1–3 pages; do not use it.)
    // `mandatory: null` = conditional / depends on configuration or GMDSS area (see `condition`).
    // `verify: true` = the Code is ambiguous, internally inconsistent, or defers to
    // another document (MIN/MGN/MSN) not reviewed — confirm before relying on it.
    //
    // Vessel attributes read by the functions below (all optional; sensible
    // defaults are NOT assumed where the Code needs a real value):
    //   v.persons            total persons on board (crew + passengers + industrial personnel)
    //   v.length             length overall (m)
    //   v.gt                 gross tonnage
    //   v.gmdss_area         'A1' | 'A1+A2' | 'A1+A2+A3' | 'A1+A2+A3+A4' (stated on the certificate, §17.1.1)
    //   v.open_boat          true for open boat / RIB / inflatable / boat with buoyant collar
    //   v.decked             true for a decked vessel
    //   v.substantial_enclosure  true if fitted with a substantial enclosure
    //   v.inflatable_lifejackets true if lifejackets are inflatable
    //   v.liferaft_count     number of liferafts carried
    //   v.sst_10_or_less     operates where sea surface temp <= 10°C
    //   v.cargo_kg           max cargo carried (kg)
    //   v.cargo_free_surface cargo may create free-surface effect
    //   v.lifting_device     fitted with a lifting device (excl. person retrieval, own anchor gear, tender davits)
    //   v.towing             engaged in towing
    //   v.tow_over_2x_displacement  towing an object > 2x own displacement on a towline (not side-by-side / push-pull)
    //   v.pilot              'dedicated_seagoing' | 'dedicated_non_seagoing' | 'endorsed' | null
    //   v.installed_kw       total installed power (propulsion + generation), kW
    //   v.mlc                true if MLC 2006 applies
    //   v.has_radar, v.has_ecs  radar / electronic chart plotter carried
    //   v.carries_dg         carries dangerous goods beyond IMDG limited quantities
    //   v.icing_areas        operates in areas with icing risk in winter
    //   v.high_speed         operates at >= 20 kn or planing mode
    // ===========================================================================

    const WBC_SCOPE = {
      code: 'workboat',
      title: 'The Workboat Code Edition 3 (updated) — The Safety of Small Workboats and Pilot Boats',
      published: '2025-01-22', ref_published: 'WBC title page (p3)',
      legal_basis: 'Merchant Shipping (Small Workboats and Pilot Boats) Regulations 2023 (SI 2023/1216)',
      ref_legal_basis: 'WBC §1.10 (p12); App.10 certificates (p240)',
      entry_into_force: '2023-12-13', ref_entry_into_force: 'WBC §1.11 (p13)',
      applies_to: 'Workboats that operate to sea (beyond categorised waters) and ALL dedicated pilot boats, at sea or in categorised waters, in commercial use other than sport or pleasure',
      ref_applies_to: 'WBC §1.1–1.2 (p12); §3.1.1 (p31); §2 "To sea" (p28), "Workboat" (p30)',
      max_load_line_length_m: 24, ref_length: 'WBC §2 "Small vessel" (<24 m load line length) (p28) + "Workboat" (p30)',
      max_passengers_plus_industrial_personnel: 12, ref_persons: 'WBC §3.1.1 (p31); §22.4.2 (p158)',
      cargo: 'May carry cargo (SPV Code: no cargo). Bulk cargo in holds/tanks is excluded (small tanker/bulk carrier).',
      ref_cargo: 'WBC §3.1.1 (p31); §1.4 (p12)',
      excluded: ['vessels operating underwater', 'hovercraft', 'vessels in use for sport or pleasure', 'bulk cargo carriers / small tankers'],
      ref_excluded: 'WBC §3.1.2 (p31); §1.4, §1.9 (p12)',
      optional_alternatives: [{ what: 'Independent rescue boats may use the Rescue Boat Code (MGN 466)', ref: 'WBC §1.5 (p12)' }],
      high_speed_craft: 'Exceeding HSC speed/displacement ratio need not comply with HSC Regs if certificated to this Code and carrying <=12 passengers + industrial personnel',
      ref_high_speed_craft: 'WBC §3.1.5 (p31)',
      sub_codes: [
        { id: 'pilot', name: 'Dedicated pilot boats / workboats with Pilot Boat Endorsement', ref: 'WBC §27 (p176–178); §4.10 (p46)' },
        { id: 'towing', name: 'Towing (Workboat Certificate with towing endorsement) & non-self-propelled vessels', ref: 'WBC §26 (p171–); §26.1.5 (p171)' },
        { id: 'cargo_lifting_highspeed', name: 'Cargo carrying, lifting (incl. diver lifts), high speed / planing, bow push-up', ref: 'WBC §25 (p165–170)' },
        { id: 'industrial_personnel', name: 'Industrial personnel (offshore energy / aquaculture / ocean mining)', ref: 'WBC §2 "Industrial Personnel", "Offshore industrial activities" (p22, p25); §22.4 (p158)' },
        { id: 'offshore_energy', name: 'Offshore Energy Service Vessels (hull/structure)', ref: 'WBC §5.7 (p54)' },
        { id: 'dangerous_goods', name: 'Carriage & transfer of dangerous goods / MGO', ref: 'WBC §29 (p182–); §29.2 (p183)' },
        { id: 'tenders', name: 'Tenders and daughter craft', ref: 'WBC §24 (p162–164)' },
        { id: 'alt_fuels', name: 'Annex 1 — Alternative fuels and propulsion systems', ref: 'WBC Annex 1 (p252–)' },
        { id: 'rouv', name: 'Annex 2 — Remotely Operated Unmanned Vessels', ref: 'WBC §1.7–1.8 (p12); §3.9.2 (p35); Annex 2 (p268–)' },
        { id: 'police', name: 'Annex 3 — The Safety of Police Boats', ref: 'WBC §1.6 (p12); Annex 3 (p296–)' },
        { id: 'rib_night', name: 'Appendix 1 — "Area Category 3 Restricted" endorsement for RIBs/open boats operating outside daylight', ref: 'WBC App.1 (p199–200)' }
      ],
      diving: 'No separate dive-support sub-code: diver lifts are covered in §25.3 (p168); diving-platform use bars single-handed operation (§28.2.1.8, p180).',
      ref_diving: 'WBC §25.3 (p168); §28.2.1 (p180)'
    };

    const WBC_CATEGORIES = [
      { id: 'cat0', name: 'Area Category 0', desc: 'Unrestricted service', distance: 'Unrestricted', favourable_weather: false, daylight_only: false, rcr_design_min: 'A', ref: 'WBC §3.10.1 (p37); Table 3.10.2 (p37)' },
      { id: 'cat1', name: 'Area Category 1', desc: 'Up to 150 miles from a safe haven', distance: '150 nm', favourable_weather: false, daylight_only: false, rcr_design_min: 'A', ref: 'WBC §3.10.1 (p37); Table 3.10.2 (p37)' },
      { id: 'cat2', name: 'Area Category 2', desc: 'Up to 60 miles from a safe haven', distance: '60 nm', favourable_weather: false, daylight_only: false, rcr_design_min: 'B', ref: 'WBC §3.10.1 (p37); Table 3.10.2 (p37)' },
      { id: 'cat3', name: 'Area Category 3', desc: 'Up to 20 miles from a safe haven', distance: '20 nm', favourable_weather: false, daylight_only: false, rcr_design_min: 'B', ref: 'WBC §3.10.1 (p37); Table 3.10.2 (p37)' },
      { id: 'cat4', name: 'Area Category 4', desc: 'Up to 20 miles from a safe haven, in favourable weather and in daylight', distance: '20 nm (favourable weather, daylight)', favourable_weather: true, daylight_only: true, rcr_design_min: 'C', ref: 'WBC §3.10.1 (p37); Table 3.10.2 (p37)' },
      { id: 'cat5', name: 'Area Category 5', desc: 'Within 3 miles of land and not more than 3 miles radius from either the point of departure to sea or the seaward boundary of categorised waters, in favourable weather', distance: '3 nm (favourable weather)', favourable_weather: true, daylight_only: false, rcr_design_min: 'C', ref: 'WBC §3.10.1 (p37); Table 3.10.2 (p37)' },
      { id: 'cat6', name: 'Area Category 6', desc: 'Within 3 miles of land and not more than 3 miles radius from either the point of departure to sea or the seaward boundary of categorised waters, in favourable weather and daylight', distance: '3 nm (favourable weather, daylight)', favourable_weather: true, daylight_only: true, rcr_design_min: 'C', ref: 'WBC §3.10.1 (p36–37); Table 3.10.2 (p37)' }
    ];
    // Definitions used by the categories:
    //   Daylight = 1 h before sunrise to 1 h after sunset (tropics: sunrise–sunset) — WBC §2 (p19)
    //   Favourable weather — WBC §2 (p20); Safe haven — WBC §2 (p27); "Up to" = strictly less than — WBC §2 (p29)
    //   Cat 3–6 may be further restricted; restriction recorded on Certificate — WBC §3.10.3 (p37)
    //   Hull without full watertight weather deck: cat 3–6 only; without deck AND without substantial
    //   enclosure: cat 4 & 6 only (cat 3/5 possible via §5.9) — WBC §5.1.2–5.1.4 (p49)

    const WBC_CERT_TYPES = [
      { id: 'workboat', name: 'Workboat Certificate', ref: 'WBC §1.17 (p14); App.10 (p245)' },
      { id: 'workboat_pilot', name: 'Workboat Certificate with Pilot Boat Endorsement', ref: 'WBC §3.10.4 (p37); §27.1.1 (p176); App.10 (p242)' },
      { id: 'pilot_boat', name: 'Pilot Boat Certificate (dedicated pilot boat — required even if never at sea)', ref: 'WBC §27.1.1, §27.2.1 (p176); App.10 (p240)' },
      { id: 'light_duty', name: 'Light Duty Workboat Certificate (vessel already certified under another small commercial vessel code, e.g. SPV; occasional workboat duties only)', ref: 'WBC §3.9.3 (p35–36); App.10 (p250)' },
      { id: 'statement_of_compliance', name: 'Workboat Statement of Compliance (non-UK vessels; NOT a certificate)', ref: 'WBC §4.15 (p48); App.10 (p248)' }
    ];

    const WBC_ENDORSEMENTS = [
      { id: 'towing', name: 'Towing endorsement (required for any vessel engaged in towing)', ref: 'WBC §26.1.5 (p171)' },
      { id: 'single_handed', name: '"Suitable for single handed operation" (cat 3–6 only, CA permission)', ref: 'WBC §28.2.2–28.2.4 (p180–181)' },
      { id: 'area3_restricted', name: '"Area Category 3 Restricted" (RIBs/open boats outside daylight)', ref: 'WBC App.1 §1 (p199)' },
      { id: 'uk_waters_only', name: '"This Certificate is applicable within UK territorial waters only" (non-UK vessels)', ref: 'WBC §4.14.1 (p48)' },
      { id: 'no_icing', name: 'Not approved to operate in icing areas (noted on SIB and Certificate)', ref: 'WBC §12.1.1.6 (p82)' },
      { id: 'no_eca', name: 'Not permitted in Baltic/North Sea NOx ECA (engines installed >= 1 Jan 2021 not compliant)', ref: 'WBC §30.5.3 (p194)' }
    ];

    // Light Duty Workboat limits (vessel shall not:) — WBC §3.9.3.5 (p36)
    const WBC_LIGHT_DUTY_LIMITS = [
      'carry cargo > 1,000 kg', 'be fitted with a lifting device',
      'tow other than side-by-side / push-pull (26.1.1.2–.3), harbour/inshore only, with §26.1–26.4 and §12A.4 met',
      'carry out duties imposing severe local structural loads (e.g. static pushing)', 'carry dangerous goods'
    ];

    // ---------------------------------------------------------------------------
    // Stability route — WBC §12.1.1.3 (p81–82); §12A (p83–88); §12B.6 (p99–100)
    // NOT length-based (unlike the SPV rule in codes.js).
    // ---------------------------------------------------------------------------
    function wbcSibTriggers(v, catId) {
      v = v || {};
      const t = [];
      if (catId === 'cat0' || catId === 'cat1') t.push('Area category 0 or 1 (§12.1.1.3.1)');
      if ((v.persons || 0) >= 16) t.push('16 or more persons (§12.1.1.3.2)');
      if ((v.cargo_kg || 0) > 1000) t.push('Cargo > 1,000 kg (§12.1.1.3.3)');
      if (v.cargo_free_surface) t.push('Cargo with free-surface effect (§12.1.1.3.4)');
      if (v.lifting_device) t.push('Lifting device incl. dredging (§12.1.1.3.5)');
      if (v.tow_over_2x_displacement) t.push('Towing > 2x own displacement on a towline (§12.1.1.3.6)');
      if (v.pilot === 'dedicated_seagoing' || v.pilot === 'endorsed') t.push('Seagoing pilot boat (§12.1.1.3.7; Table 27.2.3 row 12B.6)');
      if (v.icing_areas) t.push('Operates in icing areas in winter — SIB with icing conditions or avoid (§12.1.1.6)');
      return t;
    }

    function wbcStabilityRouteFor(v, catId) {
      const triggers = wbcSibTriggers(v, catId);
      if (triggers.length) {
        return {
          kind: 'stability',
          name: 'Approved Stability Information Booklet (SIB)',
          ref: 'WBC §12.1.1.3 (p81–82); §12B.6.1, §12B.6.7–12B.6.8 (p99–100); App.3 (p206–)',
          validity_months: null,
          authority: 'Produced by a competent person; approved (stamped "APPROVED FORM AND CONTENT") by the Certifying Authority',
          triggers,
          blurb: 'Copy carried on board (or ashore for crew if CA agrees). Must be held before the Certificate is issued. Master must complete an MCA-approved 1-day stability course (Table A5.3).',
          also: 'Damage survivability (§12B.1) applies if >=16 persons, or cat 0/1 with >=7 persons (p89).'
        };
      }
      return {
        kind: 'stability_simplified',
        name: 'Simplified stability assessment (heel test) — maximum permissible weight recorded on Certificate',
        ref: 'WBC §12A.1–12A.2 (p83–85); §12A.2.6 (p85); §12A.3 (open boats/RIBs, p85–87)',
        validity_months: null,
        authority: 'Tests by a competent person; results approved and recorded by the Certifying Authority',
        blurb: 'Heel <= 7° (or <= 10° with Table 13.1.1 freeboard) with all persons on one side; open boats/RIBs also damage, swamp and person-recovery tests. Re-check after modifications (§12.1.1.7, p82).'
      };
    }

    // ---------------------------------------------------------------------------
    // Vessel certificates & documents
    // `cats` = categories it applies to; `applies(v)` = extra condition (omit = always).
    // ---------------------------------------------------------------------------
    const ALL = ['cat0', 'cat1', 'cat2', 'cat3', 'cat4', 'cat5', 'cat6'];

    const WBC_VESSEL_CERT_ITEMS = [
      { kind: 'coding', name: 'Workboat Certificate (or Pilot Boat Certificate / WB Cert with Pilot Boat Endorsement / Light Duty WB Cert)', cats: ALL, required: true, validity_months: 60, authority: 'Certifying Authority (MCA or an authorised CA — MIN 698)', ref: 'WBC §4.1.1.4 (p40); §4.3.2 (p41); §4.6.5–4.6.6 (p44)', note: 'Max 5 years. Interim certificate up to 5 months (§4.13.1, p47). Cancelled automatically on sale (§3.8.4, p34). Ceases to be valid if annual/intermediate exams are missed (§3.8.3, p34). Light Duty cert only valid while the underlying SPV certificate is valid (§3.9.3.2, p36).' },
      { kind: 'wbc_id_disc', name: 'Annual identification disc (displayed, visible from outside the vessel)', cats: ALL, required: true, validity_months: 12, authority: 'Certifying Authority', ref: 'WBC §4.3.4 (p41)' },
      { kind: 'swb2', name: 'SWB2 report form (Compliance Examination & Declaration), signed by CA — up to date copy', cats: ALL, required: true, validity_months: null, authority: 'Certifying Authority / authorised person', ref: 'WBC §4.1.3 (p40); §2 "SWB2" (p28–29); §3.8.2 (p34)', note: 'Kept on board, or ashore where not practicable. All agreed changes appended (§3.8.2). New SWB2 at each renewal (§4.6.7, p44).' },
      { kind: 'annual_exam', name: 'Annual examination (authorised person)', cats: ALL, required: true, validity_months: 12, window_months: 3, max_interval_months: 15, authority: 'Authorised person for the CA (dedicated pilot boats: owner/operator self-exam if CA authorises)', ref: 'WBC §4.4.1.1 (p42); §4.4.2 (p42); §4.8.2–4.8.3 (p45)', note: 'Within 3 months either side of the anniversary of the compliance/renewal examination, never more than 15 months apart.' },
      { kind: 'out_of_water_exam', name: 'Out-of-water (intermediate) examination', cats: ALL, required: true, validity_months: 36, authority: 'Authorised person for the CA', ref: 'WBC §2 "Annual examination" (p16); §4.5.1.1–4.5.1.2 (p43); §4.8.1 (p45)', note: 'Interval between out-of-water exams must not exceed 3 years (CA may shorten). In-water (diver/ROV) exam only in exceptional circumstances (§4.5.2, p43). Renewal exam is out of water (§4.6.2, p44).' },
      { kind: 'renewal_exam', name: 'Renewal examination (out of water) before certificate expiry', cats: ALL, required: true, validity_months: 60, authority: 'Authorised person for the CA', ref: 'WBC §4.6.1–4.6.2, §4.6.5 (p44)', note: 'If done within 3 months before expiry the new certificate runs 5 years from old expiry.' },
      { kind: 'certificate_of_construction', name: 'Certificate of construction / evidence of hull structural strength', cats: ALL, required: true, validity_months: null, authority: 'UK Load Line Assigning Authority, RCR Approved Body, or CA verification', ref: 'WBC §5.2 (p50); §5.3.1–5.3.4 (p51)', note: 'Cat 0–2: Recognised Organisation hull standard or equivalent/first principles; cat 3–6: Administration-approved standard. Wind/wave limits on the construction certificate limit the area category (§5.3.2).' },
      { kind: 'radio', name: "Ship's Radio Licence", cats: ALL, required: true, validity_months: null, authority: 'Ofcom', ref: 'WBC §17.9.1 (p139)', verify: true, note: 'Code requires a valid licence for ALL categories (incl. cat 6) but does not state a validity period.' },
      { kind: 'mmsi', name: 'MMSI (and call sign) marked on fixed radio installation', cats: ALL, required: true, applies: (v) => v.cat !== 'cat6' || !!v.has_fixed_vhf, validity_months: null, authority: 'Ofcom', ref: 'WBC §17.3.4 (p135); Table 17.2.1 (p136)' },
      { kind: 'radio_survey', name: 'Ships\' radio survey (GMDSS radio installation) — Statement of Compliance', cats: ALL, required: true, applies: (v) => v.gmdss_fitted !== false, validity_months: 60, authority: 'Organisation authorised by the Administration', ref: 'WBC §17.10.1 (p139)', verify: true, note: 'Applies "where a vessel is fitted with GMDSS radio equipment". Whether a VHF-DSC-only installation triggers it is not stated.' },
      { kind: 'epirb_registry', name: 'EPIRB / 406 MHz PLB registration (UK Beacon Registry)', cats: ALL, required: true, validity_months: null, authority: 'MCA UK Beacon Registry', ref: 'WBC §17.5.4 (p138); footnote 68 (p138); footnote 102 (p181)', verify: true, note: 'Mandatory registration per MGN 665 (not reviewed) — renewal period not stated in the Code.' },
      { kind: 'risk_assessment', name: 'Risk assessment of operations (and of all persons on board)', cats: ALL, required: true, validity_months: null, authority: 'Owner/operator — presented to CA at examinations before issue/renewal', ref: 'WBC §3.14.1–3.14.3 (p38)', note: 'Redo on change of area category, change of use, or additional equipment fitted (§3.14.2).' },
      { kind: 'sms', name: 'Safety Management System (Appendix 8)', cats: ALL, required: true, validity_months: 36, authority: 'Owner/operator', ref: 'WBC §31.1–31.2 (p197); App.8 §1–§13 (p233–237)', note: 'Mandatory for manned vessels 3 years after entry into force (i.e. from 13 Dec 2026); for ROUVs from entry into force. Review at least every 3 years (App.8 §13.1, p237).' },
      { kind: 'cyber_ra', name: 'Cyber security measures + cyber-security risk assessment; remote-access log', cats: ALL, required: true, validity_months: 60, authority: 'Owner/operator (available to CA)', ref: 'WBC §31.3.1–31.3.6 (p197–198)', note: 'RA redone on any alteration or at least every 5 years. Mandatory from 13 Dec 2026 for manned vessels (§31.1.1).' },
      { kind: 'fire_plan', name: 'Fire control and safety plan (displayed at control position, kept up to date)', cats: ALL, required: true, validity_months: null, authority: 'Owner/operator', ref: 'WBC §15.8.1–15.8.3 (p127)' },
      { kind: 'compass_deviation', name: 'Compass deviation card / record of deviations', cats: ALL, required: true, validity_months: null, authority: 'Master / compass adjuster', ref: 'WBC §19.2.4–19.2.6 (p143–144)', note: 'Re-adjust if 2 years since last adjustment and no deviation record kept, or after alterations/new equipment near compass.' },
      { kind: 'official_log_book', name: 'Official Log Book', cats: ALL, required: true, applies: (v) => (v.gt || 0) >= 25, condition: '25 GT and over', validity_months: null, authority: 'MCA (free of charge)', ref: 'WBC §3.12.1 (p38); §14.11.1 (p116)' },
      { kind: 'medical_checklist', name: 'Medical stores checklist (reviewed annually)', cats: ['cat0', 'cat1'], required: true, validity_months: 12, authority: 'Master / designated competent person', ref: 'WBC §23.1.4, §23.1.6 (p160)' },
      { kind: 'mlc_inspection', name: 'MLC inspection report', cats: ['cat0', 'cat1', 'cat2'], required: true, applies: (v) => !!v.mlc && !!v.international_or_over_60nm, condition: 'Seafarers on board AND international voyages or >60 miles from a UK safe haven', validity_months: null, authority: 'MCA', ref: 'WBC App.10 MLC compliance statements (p241, p244, p247, p251); §21B (p152–)', verify: true },
      { kind: 'eiapp', name: 'EIAPP Certificate + Technical File (per engine)', cats: ALL, required: true, applies: (v) => !!v.diesel_over_130kw_post2000, condition: 'Marine diesel engine > 130 kW constructed after 1 Jan 2000', validity_months: null, authority: 'Engine manufacturer / Administration', ref: 'WBC §30.5.1 (p193)' },
      { kind: 'garbage_plan', name: 'Garbage Management Plan', cats: ALL, required: true, applies: (v) => (v.gt || 0) >= 100 || (v.persons || 0) >= 15, condition: '>= 100 GT or carrying >= 15 persons', validity_months: null, authority: 'Owner/operator', ref: 'WBC Table 30.3.3 (p193)' },
      { kind: 'garbage_record_book', name: 'Garbage Record Book', cats: ALL, required: true, applies: (v) => ((v.gt || 0) > 100 && !!v.international) || (v.persons || 0) >= 15, condition: '> 100 GT on international voyages, or certified to carry >= 15 persons', validity_months: null, authority: 'Owner/operator', ref: 'WBC Table 30.3.3 (p193)' },
      { kind: 'garbage_placards', name: 'Garbage placards', cats: ALL, required: true, applies: (v) => (v.length || 0) > 12, condition: '> 12 m LOA', validity_months: null, authority: 'Owner/operator', ref: 'WBC Table 30.3.3 (p193)' },
      { kind: 'sopep', name: 'Shipboard Oil Pollution Emergency Plan', cats: ALL, required: true, applies: (v) => (v.gt || 0) >= 400, condition: '>= 400 GT', validity_months: null, authority: 'Owner/operator', ref: 'WBC §30.6.3 (p194)' },
      { kind: 'doc_dg', name: 'Document of Compliance for the Carriage of Dangerous Goods (DoC DG)', cats: ALL, required: true, applies: (v) => !!v.carries_dg, condition: 'DG above IMDG limited quantities', validity_months: null, authority: 'MCA', ref: 'WBC §29.2.1 (p183)', verify: true, note: 'Validity period not reviewed. Light Duty Workboats may not carry DG (§3.9.3.5).' },
      { kind: 'towing_gear_service', name: 'Towing equipment service certificate', cats: ALL, required: true, applies: (v) => !!v.towing, validity_months: 12, authority: 'Per manufacturer', ref: 'WBC §26.1.7 (p171)', note: 'Plus regular documented detailed examination of towing gear (§26.1.8, p171–172). Towing endorsement on certificate required (§26.1.5).' },
      { kind: 'lifting_thorough_exam', name: 'Lifting device thorough examination & functional test (LOLER)', cats: ALL, required: true, applies: (v) => !!v.lifting_device, validity_months: 12, authority: 'Competent person (LOLER)', ref: 'WBC §25.2.3.1–25.2.3.2 (p167–168)', note: 'Load test after installation and any modification.' },
      { kind: 'rib_airtightness', name: 'Airtightness test declaration (inflatable / RIB tubes)', cats: ALL, required: true, applies: (v) => !!v.inflatable_tubes, validity_months: 12, authority: 'Owner/operator annually; competent person at compliance & renewal exams', ref: 'WBC §4.9.1–4.9.2 (p46)' },
      { kind: 'prop_shaft_exam', name: 'Propeller shaft drawn for examination (pilot boats)', cats: ALL, required: true, applies: (v) => !!v.pilot, validity_months: 36, authority: 'Authorised person', ref: 'WBC §4.10.1–4.10.3 (p46)', note: '<= 3 years; shafts running in oil <= 10 years if wear insignificant; annual oil analysis may be accepted.' },
      { kind: 'pli', name: 'Insurance for all persons on board', cats: ALL, required: false, validity_months: 12, authority: 'Insurer', ref: 'WBC §1.16 (p14); §1.12 (p13)', note: 'Encouraged by the Code, not required by it; local/harbour authorities may require it.' },
      { kind: 'loadline', name: 'Compliance with Load Line Regulations 1998 / assigned freeboard', cats: ALL, required: true, applies: (v) => (v.cargo_kg || 0) > 1000, condition: 'Cargo > 1,000 kg', validity_months: null, authority: 'Load Line Assigning Authority / CA', ref: 'WBC §13.2.1 (p101); §13.4.3 (p104); §1.10 (p13)', verify: true, note: 'Workboat certificates state they are "equivalent to a UK Load Line Exemption Certificate" (App.10, p240). Whether a separate UK Load Line Certificate is issued is not clear.' }
    ];

    function wbcVesselCerts(catId, v) {
      v = Object.assign({}, v || {}, { cat: catId });
      const items = WBC_VESSEL_CERT_ITEMS
        .filter((it) => it.cats.includes(catId))
        .filter((it) => (typeof it.applies === 'function' ? it.applies(v) : true))
        .map(({ cats, applies, ...rest }) => rest);
      const st = wbcStabilityRouteFor(v, catId);
      items.push({ kind: st.kind, name: st.name, required: true, validity_months: null, authority: st.authority, ref: st.ref });
      return items;
    }

    // Static per-category view (conditional items included, with `condition`), for listing screens.
    const WBC_VESSEL_CERTS = {};
    ALL.forEach((c) => {
      WBC_VESSEL_CERTS[c] = WBC_VESSEL_CERT_ITEMS
        .filter((it) => it.cats.includes(c))
        .map(({ cats, applies, ...rest }) => rest);
    });

    // ---------------------------------------------------------------------------
    // Equipment — Table 14.1.2 (p106–107), Table 14.2.5.1 (p112–113), Table 17.2.1 (p136–137)
    // ---------------------------------------------------------------------------
    const n = (catId) => Number(String(catId).replace('cat', ''));
    const big = (v) => (v.persons || 0) >= 16;

    const LSA_LIFEBUOY = { // Table 14.1.2 (p106), index = category number 0..6
      total_lt16:      [2, 2, 2, 2, 2, 2, 2],
      total_ge16:      [4, 4, 4, 4, 4, 4, 4],
      light_lt16:      [1, 1, 1, 1, 0, 1, 0],
      light_ge16:      [2, 2, 2, 2, 0, 2, 0],
      line_lt16:       [1, 1, 1, 1, 1, 1, 1],
      line_ge16:       [1, 1, 1, 1, 1, 1, 1],
      plain_lt16:      [0, 0, 0, 0, 1, 1, 1],
      plain_ge16:      [1, 1, 1, 1, 3, 3, 3],
      extra_line_lt16: [0, 0, 0, 0, 0, 0, 0],
      extra_line_ge16: [1, 1, 1, 1, 1, 1, 1]
    };
    const LSA_PYRO = { // Table 14.1.2 (p107) + Note A (p108)
      parachute: [12, 6, 4, 4, 0, 4, 0],
      red_hand:  [6, 6, 6, 6, 2, 6, 2],
      smoke:     [2, 2, 2, 2, 2, 2, 2],
      smoke_type: ['buoyant (table reads "buoyant held")', 'buoyant', 'buoyant or hand held', 'buoyant or hand held', 'buoyant or hand held', 'buoyant or hand held', 'buoyant or hand held']
    };
    const LIFERAFT_SPEC = { // Table 14.2.5.1 (p112–113)
      0: { construction: 'SOLAS standard and UKCA or MER approved, or MCA DfT approved', insulation: 'Insulated floor and canopy', pack: 'SOLAS "A" pack', stowage: 'FRP container' },
      1: { construction: 'SOLAS/UKCA/MER/DfT approved, or ISO 9650-1 Type 1 Group A certified to ISO 9650-3', insulation: 'Insulated floor and canopy unless operating exclusively in waters >= 10°C', pack: 'SOLAS "A" pack', stowage: 'FRP container' },
      2: { construction: 'SOLAS/UKCA/MER/DfT approved, or ISO 9650-1 Type 1 Group A certified to ISO 9650-3', insulation: 'Insulated floor and canopy if operating outside UK SRR where mean sea temp < 10°C', pack: 'SOLAS "B" pack', stowage: 'FRP container or valise' },
      3: { construction: 'SOLAS/UKCA/MER/DfT approved, or ISO 9650-1 Type 1 Group A certified to ISO 9650-3', insulation: 'Insulated floor and canopy if operating outside UK SRR where mean sea temp < 10°C', pack: 'SOLAS "B" pack', stowage: 'FRP container or valise' },
      4: { construction: 'SOLAS/UKCA/MER/DfT approved, or ISO 9650-1 Type 1 Group A certified to ISO 9650-3', insulation: 'Not required', pack: 'Equivalent to DfT "E" pack', stowage: 'FRP container or valise' },
      5: { construction: 'SOLAS/UKCA/MER/DfT approved, or ISO 9650-1 Type 1 Group A certified to ISO 9650-3', insulation: 'Not required', pack: 'Equivalent to DfT "E" pack', stowage: 'FRP container or valise' },
      6: { construction: 'SOLAS/UKCA/MER/DfT approved, or ISO 9650-1 Type 1 Group A (ISO 9650-3), or open reversible type to IMO HSC Code 2000 (MER/DfT approved)', insulation: 'Not required', pack: 'Equivalent to DfT "E" pack', stowage: 'FRP container or valise' }
    };

    function wbcEquipmentFor(catId) {
      const c = n(catId);
      const items = [];
      const add = (o) => items.push(o);

      // ---- Life-saving appliances (§14) ----
      add({ kind: 'liferaft', name: 'Liferaft(s)', icon: '🛟', mandatory: true,
        qty: (v) => (c === 0 || (c === 1 && big(v))) ? 'Capacity for all persons with any one liferaft lost' : 'Capacity for all persons on board',
        spec: LIFERAFT_SPEC[c], service_months: null,
        note: 'Serviced at a manufacturer-approved station per manufacturer schedule; valise liferafts max annually. Service certificate presented at compliance/renewal exam. Float-free with HRU (valise: dedicated locker). Physical deployment demonstrated at compliance/renewal.',
        ref: 'WBC Table 14.1.2 (p106); §14.2.1.1 (p105); §14.2.2 (p108–109); §14.2.4 (p109); Table 14.2.5.1 (p112–113)' });
      add({ kind: 'hru', name: 'Hydrostatic release unit (re-usable)', icon: '🛟', qty: (v) => v.liferaft_count || 1, mandatory: false, condition: 'Where liferaft stowed float-free with a re-usable HRU', service_months: 12, note: 'Disposable HRUs: manufacturer life.', ref: 'WBC §14.2.1.3 (p105); §14.2.3.1 (p109)' });
      add({ kind: 'lifebuoy', name: 'Lifebuoys (non-inflatable, marked with vessel name + 1 other ID)', icon: '🛟', mandatory: true,
        qty: (v) => (big(v) ? LSA_LIFEBUOY.total_ge16[c] : LSA_LIFEBUOY.total_lt16[c]),
        breakdown: (v) => ({
          with_light: big(v) ? LSA_LIFEBUOY.light_ge16[c] : LSA_LIFEBUOY.light_lt16[c],
          with_buoyant_line_18m: big(v) ? LSA_LIFEBUOY.line_ge16[c] : LSA_LIFEBUOY.line_lt16[c],
          without_attachments: big(v) ? LSA_LIFEBUOY.plain_ge16[c] : LSA_LIFEBUOY.plain_lt16[c],
          additional_buoyant_line: big(v) ? LSA_LIFEBUOY.extra_line_ge16[c] : LSA_LIFEBUOY.extra_line_lt16[c]
        }),
        service_months: null, ref: 'WBC Table 14.1.2 (p106); §14.3.1–14.3.2 (p109–110)',
        verify: c === 5, note: c === 5 ? 'Cat 5 column of Table 14.1.2 is internally inconsistent (sub-rows sum to 3 / 6 but total is 2 / 4) — confirm with CA.' : undefined });
      add({ kind: 'lifejacket', name: 'Lifejackets (SOLAS/UKCA/MER/DfT, or ISO 12402-3 150N / 12402-2 275N), whistle + retro-reflective' + ([0, 1, 2, 3, 5].includes(c) ? ' + light' : ''), icon: '🦺', mandatory: true,
        qty: (v) => (v.persons || 0) + (v.inflatable_lifejackets ? 2 : 0),
        service_months: 12, note: '100% of persons (suitable jackets for persons < 32 kg) + 2 spare if inflatable. Inflatables: compressed-gas, manual/auto + oral top-up; serviced within 1 month either side of compliance/renewal/intermediate exams, max annually in between. Max 2 types on board. Donning instructions displayed.',
        ref: 'WBC Table 14.1.2 (p106); §14.4.1–14.4.5, §14.4.8–14.4.9 (p110–111); §14.4.10–14.4.12 (p114)' });
      add({ kind: 'lifejacket_rearm', name: 'Inflatable lifejacket re-arming kit (one per lifejacket)', icon: '🦺', mandatory: c <= 2, qty: (v) => (c <= 2 && v.inflatable_lifejackets ? (v.persons || 0) + 2 : 0), condition: 'Cat 0–2, inflatable lifejackets', service_months: null, ref: 'WBC Table 14.1.2 (p106); §14.4.6 (p110)' });
      add({ kind: 'spray_hood', name: 'Lifejacket spray hood (one per lifejacket)', icon: '🦺', mandatory: c <= 2, qty: (v) => (v.persons || 0), condition: c <= 2 ? 'Required' : 'Strongly recommended', service_months: null, ref: 'WBC Table 14.1.2 (p107); §14.4.7 (p110)' });
      add({ kind: 'tpa', name: 'Thermal protective aids (UKCA/MER approved, stowed in grab bag)', icon: '🧥', mandatory: c <= 5,
        qty: (v) => (v.immersion_suits_for_all ? 2 : (c <= 5 ? (v.persons || 0) : ((v.sst_10_or_less || v.open_reversible_liferaft) && !v.canopied_liferaft ? (v.persons || 0) : 0))),
        condition: c === 6 ? 'Cat 6: only if SST <= 10°C or open reversible liferaft, and no canopied liferaft' : 'One per person (only 2 if immersion suits provided for all)',
        service_months: null, ref: 'WBC Table 14.1.2 (p106); §14.5.1–14.5.6 (p114)' });
      if (c <= 2) add({ kind: 'immersion_suit', name: 'Immersion suit / dry suit / EN ISO 15027-1 flotation suit per person', icon: '🧥', mandatory: true, qty: (v) => (v.sst_10_or_less ? (v.persons || 0) : 0), condition: 'Cat 0–2 in waters with SST <= 10°C', service_months: null, ref: 'WBC §22.2.6.2 (p157); §14.5.7 (p114)' });
      add({ kind: 'general_alarm', name: 'General alarm (audible throughout vessel)', icon: '🚨', mandatory: true, qty: (v) => (((c <= 2 && big(v)) || (v.installed_kw || 0) > 750) ? 1 : 0), condition: '(Cat 0–2 AND >= 16 persons) OR installed power > 750 kW', service_months: null, ref: 'WBC Table 14.1.2 (p107); §14.6.1–14.6.2 (p114–115)' });
      add({ kind: 'pyrotechnics', name: 'Pyrotechnics (MER "wheelmarked" or MSN 1676; hand-held smoke need not be)', icon: '🧨', mandatory: true,
        qty: `${LSA_PYRO.parachute[c]} parachute + ${LSA_PYRO.red_hand[c]} red hand flares + ${LSA_PYRO.smoke[c]} smoke (${LSA_PYRO.smoke_type[c]})`,
        breakdown: { parachute_rocket: LSA_PYRO.parachute[c], red_hand_flare: LSA_PYRO.red_hand[c], smoke_signal: LSA_PYRO.smoke[c], smoke_type: LSA_PYRO.smoke_type[c] },
        service_months: null, note: 'Code sets no service interval — track manufacturer expiry date.',
        verify: c === 0, ref: 'WBC Table 14.1.2 + Note A (p107–108)' });
      add({ kind: 'recovery_means', name: 'Means of recovery of persons from the water (demonstrated at compliance/renewal)', icon: '🪝', qty: 1, mandatory: true, service_months: null, ref: 'WBC Table 14.1.2 (p107); §14.7.1 (p115); §14.11.2 (p116)' });
      add({ kind: 'training_manual', name: 'LSA training manual (at control position)', icon: '📘', qty: 1, mandatory: true, service_months: null, ref: 'WBC Table 14.1.2 (p107); §14.8 (p115)' });
      add({ kind: 'lsa_maint_manual', name: 'LSA on-board maintenance instruction manual (at control position; ashore allowed for open boats/RIBs)', icon: '📘', qty: 1, mandatory: true, service_months: null, ref: 'WBC Table 14.1.2 (p107); §14.9 (p115–116)' });
      add({ kind: 'lifesaving_signals', name: 'Table of International Life-Saving Signals (1x SOLAS No.1 or 2x No.2 poster)', icon: '📋', qty: 1, mandatory: true, service_months: null, ref: 'WBC Table 14.1.2 (p107); §14.10.1 (p116)' });
      if ([0, 1, 2, 3, 5].includes(c)) add({ kind: 'searchlight', name: 'Waterproof electric signalling lamp + searchlight (or daylight signalling lamp with searchlight capability)', icon: '🔦', qty: 1, mandatory: true, service_months: null, verify: true, ref: 'WBC §14.12.1 (p117)' });
      add({ kind: 'signalling_lamp', name: 'Waterproof electric lamp suitable for signalling', icon: '🔦', qty: 1, mandatory: true, service_months: null, ref: 'WBC §19.4.1 (p144)' });

      // ---- Radio / SAR locating (§17, §14.12) ----
      add({ kind: 'vhf_fixed', name: 'Fixed VHF radio with DSC (marked with call sign + MMSI; distress procedures displayed)', icon: '📻', qty: 1, mandatory: c <= 5, condition: c === 6 ? 'Cat 6: fixed VHF DSC OR portable VHF DSC' : undefined, service_months: null, ref: 'WBC Table 17.2.1 (p136); §17.3.4–17.3.5 (p135)' });
      add({ kind: 'vhf_handheld', name: 'Portable VHF with DSC (waterproof 1 m/5 min, lanyard, 8 h battery)', icon: '📻',
        qty: (v) => Math.max(1, v.liferaft_count || 1), mandatory: true, note: 'One per liferaft where more than one liferaft is carried.', service_months: null,
        ref: 'WBC Table 14.1.2 (p106); §17.4.1 (p135); §17.4.2–17.4.8 (p137); Table 17.2.1 (p136)' });
      add({ kind: 'dsc_ch70_watch', name: 'VHF Channel 70 DSC watch installation', icon: '📻', qty: 1, mandatory: true, service_months: null, ref: 'WBC Table 17.2.1 (p136); §17.8.1 (p139)' });
      add({ kind: 'mf_radio', name: 'Beyond-A1 radio: MF DSC (A2) / recognised mobile satellite service / MF-HF DSC with NBDP', icon: '📡', mandatory: true,
        qty: (v) => {
          const a = v.gmdss_area;
          if (!a) return 'Depends on GMDSS sea area (set v.gmdss_area)';
          if (a === 'A1') return 0;
          if (c === 6) return 'Satellite service — required only where nav/weather info cannot be obtained by other means (C1)';
          if (a === 'A1+A2') return '1 of: MF DSC radio (Note C) or satellite service or MF/HF DSC+NBDP';
          if (a === 'A1+A2+A3') return '1 of: satellite service or MF/HF DSC+NBDP';
          return '1 MF/HF DSC with NBDP';
        },
        service_months: null, verify: true, ref: 'WBC Table 17.2.1 + Notes C, D (p136–137); §17.3.2 (p135)' });
      add({ kind: 'navtex', name: 'NAVTEX receiver', icon: '📠',
        mandatory: c <= 4 ? true : (c === 5 ? null : false),
        qty: 1,
        condition: c <= 3 ? 'Required' : c === 4 ? 'Required; in Sea Area A1 recommendatory only for voyages < 12 h (Note B)' : c === 5 ? 'Required where up-to-date nav/weather info cannot be reliably obtained by other means (C1)' : 'Recommended where nav/weather info cannot be reliably obtained by other means (C3)',
        service_months: null, ref: 'WBC Table 17.2.1 + Note B, C1, C3 (p136–137); §17.1.3.1 (p134)' });
      add({ kind: 'epirb', name: '406 MHz EPIRB (float-free, auto-activating; accessible for manual release)', icon: '📡',
        qty: (v) => {
          if (c === 0) return 2;
          if (c <= 2) return 1;
          const a = v.gmdss_area;
          if (c <= 4) return 1; // Table 17.2.1 shows 1 for all sea areas (A1 qualified by Note A) — conflicts with Table 14.1.2 "None"
          if (c === 5) return !a ? 'Depends on GMDSS area' : a === 'A1' ? 'Recommended (R)' : a === 'A1+A2' ? '1 EPIRB or 1 PLB' : 1;
          return !a ? 'Depends on GMDSS area' : a === 'A1' ? 'EPIRB or PLB recommended (C2)' : '1 EPIRB or 1 PLB';
        },
        mandatory: c <= 2 ? true : null, verify: c >= 3,
        note: c === 0 ? 'Second EPIRB (manned vessels) stowed accessibly for placing in liferaft, need not float free.' : (c >= 3 ? 'Table 14.1.2 says None for cat 3–6; Table 17.2.1 requires EPIRB/PLB by GMDSS area — tables conflict.' : undefined),
        service_months: null, service_note: 'Maintain per manufacturer; batteries replaced by manufacturer-approved station.',
        ref: 'WBC Table 14.1.2 (p107); Table 17.2.1 + Note A (p136–137); §17.5.1–17.5.4 (p137–138)' });
      add({ kind: 'sart', name: 'SART (Radar SART, AIS-SART or EPIRB-AIS)', icon: '📡',
        qty: c <= 2 ? 1 : 0, mandatory: c <= 2,
        condition: c <= 2 ? 'Second SART required unless in a dedicated SAR area AND EPIRB has 121.5 MHz homer and is non-float-free (§14.12.4)' : 'Required in addition to EPIRB when operating outside areas covered by dedicated SAR assets (§14.12.2)',
        verify: true, service_months: null, ref: 'WBC Table 14.1.2 (p107); §14.12.2–14.12.4 (p117)' });
      add({ kind: 'plb', name: '406 MHz PLB with GPS and light (worn by at least one crew member on open deck)', icon: '📡',
        qty: 1, mandatory: c <= 2 ? true : null, verify: c >= 3,
        note: 'Table 14.1.2: cat 0–2 Yes, cat 3 Recommended, cat 4–6 None; Table 17.2.1 lists PLB 1 for cat 0–4 and PLB/EPIRB options for cat 5–6; §17.6.2 requires one worn on deck. Single-handed: Master wears PLB (§28.2.5.2). Crew not wearing a PLB strongly recommended to wear Class M VHF DSC MOB device with AIS.',
        service_months: null, ref: 'WBC Table 14.1.2 + fn 41 (p107); Table 17.2.1 (p136); §17.6.1–17.6.2 (p138); §28.2.5.2 (p181)' });

      // ---- Fire safety (§15–16) — configuration-driven, not category-driven ----
      add({ kind: 'fire_ext_portable', name: 'Portable fire extinguishers (ISO 7165 / BS EN 3; no halon)', icon: '🧯', mandatory: true,
        qty: 'Per Table 16.1.1.1 (machinery/outboards) + one 5A/34B per accommodation space (+ Table 16.2.3.1 for cooking/heating); open boats/RIBs <= 8 m without enclosure or cooking: min two 34B',
        min_qty: (v) => (v.open_boat && (v.length || 0) <= 8 && !v.substantial_enclosure && !v.cooking_appliance ? 2 : 1),
        service_months: null, service_note: 'Serviced by a competent person at the intervals in MGN 276 Table 1 (not reviewed).', verify: true,
        note: 'Within 2 m of main control position and of open-flame/gas/liquid-fuel appliances; within 3 m of inboard fire ports and of outboards. CO2 portables: max 2 kg, not in sleeping spaces, max one per accommodation space.',
        ref: 'WBC Table 16.1.1.1 + note d (p128–129); §16.2.1.2 (p129); Table 16.2.3.1 (p130); §16.3.1.3, §16.3.1.8 (p130–131); §16.3.2 (p131)' });
      add({ kind: 'fire_ext_fixed', name: 'Fixed fire-extinguishing system (Administration-approved type)', icon: '🧯', qty: 1, mandatory: null,
        condition: 'Required for inboard diesel engine compartments below deck; option for engine box above deck (else portable via fire port); option for accommodation', service_months: 12,
        note: 'Serviced at least annually or per manufacturer if more frequent. Visual discharge alarm outside space and at control position where automatic or cylinders inside space.',
        ref: 'WBC Table 16.1.1.1 (p128–129); §16.4.1.1–16.4.1.6 (p131–132)' });
      add({ kind: 'fire_blanket', name: 'Fire blanket', icon: '🧯', qty: 1, mandatory: null, condition: 'In any area the CA identifies as increasing fire risk; one option for open-flame cooking/heating spaces (Table 16.2.3.1)', service_months: null, ref: 'WBC §16.5 (p133); Table 16.2.3.1 (p130)' });
      add({ kind: 'fire_pump', name: 'Fire pump (power-driven self-priming, or hand pump outside machinery space) + hose with 10 mm jet & spray nozzle', icon: '🚒', qty: 1,
        mandatory: true, condition: 'Not required for open boats/RIBs/inflatables/buoyant-collar boats < 8 m without substantial enclosure', service_months: null, ref: 'WBC §16.4.2.1–16.4.2.5 (p132–133)' });
      add({ kind: 'fire_bucket', name: 'Fire buckets with lanyards', icon: '🪣', qty: 2, mandatory: null, condition: 'Where practicable or deemed necessary (not needed on larger vessels with multiple extinguishers/fixed systems)', service_months: null, ref: 'WBC §16.6.1 + fn 65 (p133)' });
      add({ kind: 'fire_detection', name: 'EN 54 fire detectors (machinery spaces: smoke+heat or flame; accommodation; appliance spaces; electrical concentrations)', icon: '🔥', qty: 'Per space', mandatory: true, service_months: null, note: 'Maintained/tested per manufacturer.', ref: 'WBC §15.6.1–15.6.2 (p125)' });
      add({ kind: 'co_detector', name: 'Carbon monoxide detector', icon: '⚠️', qty: 'Per space', mandatory: null, condition: 'Open-flame/gas/liquid-fuel appliances in or adjacent to accommodation; spaces where exhaust gas may accumulate', service_months: null, ref: 'WBC §15.6.3 (p125–126)' });
      add({ kind: 'gas_detector', name: 'Hydrocarbon gas detector and alarm (hazardous-area rated)', icon: '⚠️', qty: 'Per space', mandatory: null, condition: 'Spaces with gas-consuming appliances or where gas may accumulate', service_months: null, ref: 'WBC §15.6.4 (p126)' });

      // ---- Navigation (§18–20) ----
      add({ kind: 'compass', name: 'Magnetic compass (adjusted, readable at steering position; bearing capability 360°)', icon: '🧭', qty: 1, mandatory: true, service_months: null, ref: 'WBC §19.2.1–19.2.6 (p143–144)' });
      if ([0, 1, 2, 3, 5].includes(c)) add({ kind: 'compass_light', name: 'Compass light', icon: '💡', qty: 1, mandatory: true, service_months: null, ref: 'WBC §19.2.7 (p144)' });
      if (c !== 6) add({ kind: 'charts', name: 'Up-to-date charts & nautical publications (or MGN 319 compliant ECS)', icon: '🗺️', qty: 1, mandatory: true, service_months: null, ref: 'WBC §19.3.1–19.3.4 (p144)' });
      add({ kind: 'echo_sounder', name: 'Echo sounder or other effective means of measuring depth', icon: '📏', qty: 1, mandatory: true, service_months: null, ref: 'WBC §19.5.1 (p144)' });
      add({ kind: 'radar_reflector', name: 'Radar reflector', icon: '📡', qty: 1, mandatory: c !== 6, condition: c === 6 ? 'Cat 6 may be excused if impracticable — then must not go to sea in fog' : 'Not needed if vessel RCS exceeds passive reflector standard', service_months: null, ref: 'WBC §19.6.1–19.6.3 (p144–145)' });
      add({ kind: 'nav_lights', name: 'Navigation lights & shapes per COLREGs (SI 1996/75)', icon: '💡', qty: 1, mandatory: true, service_months: null, ref: 'WBC §18.1–18.4, Table 18.4 (p140–142)' });
      add({ kind: 'horn', name: 'Sound signalling appliance (< 12 m: any efficient means; 12–20 m whistle; 20–24 m whistle + bell)', icon: '📣', qty: 1, mandatory: true, service_months: null, ref: 'WBC §18.3 (p140); Table 18.4 (p141)' });
      if (c <= 2) {
        add({ kind: 'gnss', name: 'Electronic position-fixing system (GNSS)', icon: '🛰️', qty: 1, mandatory: true, service_months: null, ref: 'WBC §19.7.1.1 (p145)' });
        add({ kind: 'distance_log', name: 'Distance measuring log (unless GNSS gives reliable distance)', icon: '📏', qty: 1, mandatory: true, service_months: null, ref: 'WBC §19.7.1.2 (p145)' });
        add({ kind: 'radar', name: '3 cm radar (MER-compliant if designed for > 30 kn; heading device if ATT)', icon: '📡', qty: 1, mandatory: true, service_months: null, ref: 'WBC §19.7.1.3 (p145)' });
        add({ kind: 'ais', name: 'AIS transceiver', icon: '📡', qty: 1, mandatory: true, service_months: null, ref: 'WBC §19.7.1.4 (p145)' });
      }
      add({ kind: 'anchor', name: 'Anchor(s) + cable sized per Table 20.1 (<= 15 m) / 20.2 (> 15 m); cable >= 4x mean length or 30 m', icon: '⚓', qty: c <= 4 ? 2 : 1, mandatory: true, note: c <= 4 ? 'One main + one spare, or two main' : undefined, service_months: null, ref: 'WBC §20.1.1–20.1.2 (p146); Tables 20.1–20.2 (p146–147); §20.4.1 (p148)' });
      add({ kind: 'towline', name: 'Towline (may be spare anchor warp)', icon: '🪢', qty: 1, mandatory: true, service_months: null, ref: 'WBC §20.4.7 (p149)' });

      // ---- Bilge, machinery, personnel (§8, §11, §22) ----
      add({ kind: 'bilge_pump', name: 'Bilge pumps: 1 hand + 1 engine-driven/independent powered per space', icon: '💧', qty: 2, mandatory: true,
        note: (c <= 2 ? 'Combined capacity >= 210 l/min; a powered pump >= 140 l/min.' : 'Combined capacity >= 140 l/min.') + (c === 6 ? ' Open boats/RIBs < 6 m in cat 6: one hand pump, hand bailer or 10 l bucket suffices.' : '') + (c >= 3 ? ' Open boats/RIBs >= 6 m: also a hand bailer or 10 l bucket.' : ''),
        service_months: null, ref: 'WBC §11.2.1.1–11.2.3.2 (p79–80)' });
      add({ kind: 'bilge_alarm', name: 'Bilge alarm (propulsion compartments + unseen-ingress compartments), audible at control position', icon: '🚨', qty: 'Per compartment', mandatory: true, service_months: null, ref: 'WBC §11.3.1–11.3.3 (p80)' });
      add({ kind: 'kill_cord', name: 'Kill cord (worn by helm) + spare / overridable kill system / sprung throttle', icon: '🔑', qty: 2, mandatory: null, condition: 'Open boats, RIBs, inflatables, buoyant-collar boats, or any vessel where helm could fall overboard', service_months: null, ref: 'WBC §8.9.1–8.9.3 (p67–68)' });
      add({ kind: 'safety_harness', name: 'Safety harnesses (each person working on deck; min 2 on decked vessels) + fastening points', icon: '🧷', qty: (v) => (v.decked ? Math.max(2, v.deck_workers || 0) : 0), mandatory: null, condition: 'Not applicable to open boats/RIBs/inflatables/buoyant-collar boats', service_months: null, ref: 'WBC §22.2.3.1–22.2.3.2 (p156–157)' });
      add({ kind: 'coswp', name: 'Code of Safe Working Practices for Merchant Seafarers (current edition) at control position', icon: '📕', qty: 1, mandatory: true, service_months: null, ref: 'WBC §22.5.1–22.5.2 (p158–159)' });

      // ---- Medical (§23) ----
      const med = c === 0 ? 'first_aid_a' : c === 1 ? 'first_aid_b' : 'first_aid_c';
      add({ kind: med, name: `Medical stores — Category ${c === 0 ? 'A' : c === 1 ? 'B' : 'C'}`, icon: '🩹', qty: 1, mandatory: true,
        service_months: 12,
        note: c <= 1 ? 'Annually reviewed checklist carried (§23.1.4).' : 'Sealed kit, reviewed at each annual examination (§23.1.5).',
        ref: 'WBC §23.1.1–23.1.6 (p160)' });

      return items;
    }

    const WBC_EQUIPMENT = {};
    ALL.forEach((cId) => { WBC_EQUIPMENT[cId] = wbcEquipmentFor(cId); });

    // Pilot boats — additional / alternative requirements. WBC Table 27.2.3 (p177–178)
    const WBC_PILOT_BOAT_EXTRAS = [
      { kind: 'pyro_white_parachute', name: 'White parachute illuminating flares', icon: '🧨', qty: 4, mandatory: true, note: 'Waivable for pilot boats in categorised waters only, subject to risk assessment (Note A).', ref: 'WBC Table 27.2.3 row 14.1 + Note A (p177–178)' },
      { kind: 'pyrotechnics', name: 'Red rocket parachute flares (pilot boat)', icon: '🧨', qty: 6, mandatory: true, ref: 'WBC Table 27.2.3 row 14.1 (p177)', verify: true, note: 'Relationship to Table 14.1.2 parachute quantity (replace vs add) not stated.' },
      { kind: 'line_throwing', name: 'Line-throwing appliances (half a set)', icon: '🪢', qty: 2, mandatory: true, ref: 'WBC Table 27.2.3 row 14.1 (p177)' },
      { kind: 'immersion_suit', name: 'Immersion suits for all persons on board', icon: '🧥', qty: (v) => v.persons || 0, mandatory: true, ref: 'WBC Table 27.2.3 row 14.5 (p177)' },
      { kind: 'recovery_means', name: 'Rescue retrieval: transom steps/ladder or side ladder/scrambling net; 2 buoyant lifelines >= 18 m with quoit; propeller guard (or approved alternative)', icon: '🪝', qty: 1, mandatory: true, ref: 'WBC Table 27.2.3 row 14.7 (p177)' },
      { kind: 'searchlight', name: 'Permanently mounted searchlight covering pilot ladder / sea area', icon: '🔦', qty: 1, mandatory: true, ref: 'WBC Table 27.2.3 row 14.12 (p177)' },
      { kind: 'stretcher', name: 'Compact stretcher', icon: '🩹', qty: 1, mandatory: true, ref: 'WBC Table 27.2.3 row 23.1 (p177)' },
      { kind: 'fall_prevention', name: 'Fall-prevention equipment where bulwarks/guardrails not fitted', icon: '🧷', qty: 1, mandatory: true, ref: 'WBC Table 27.2.3 row 22.2.3 + Note B (p177–178)' },
      { kind: 'shock_seating', name: 'Seating with seat belts (individual shock-absorbent seats with headrests/footrests/armrests for crew & pilots on WB+PB / seagoing dedicated)', icon: '💺', qty: (v) => v.persons || 0, mandatory: true, ref: 'WBC Table 27.2.3 row 25.4 (p177)' },
      { kind: 'stability', name: 'Approved Stability Information Booklet', icon: '📘', qty: 1, mandatory: true, ref: 'WBC Table 27.2.3 row 12B.6 (p177); §12.1.1.3.7 (p82)' }
    ];
    // Also: no petrol engine (row 8.6); forward-facing accessways prohibited (row 6.2.1.1); pilot boarding visible
    // from control position (row 10.1.2); side deck >= 400 mm for keels laid >= 31 Dec 2018 (row 22.2) — Table 27.2.3 (p177).
    // Non-seagoing dedicated pilot boats: daylight-only => cat 6 WB+PB requirements; night => cat 3 — WBC §27.2.2 (p176).

    // ---------------------------------------------------------------------------
    // Crew / manning — §28 (p179–181); App.5 Tables A5.1 (p218–219), A5.2 (p220), A5.3 (p221)
    // ---------------------------------------------------------------------------
    const MASTER_QUALS = { // Table A5.1 (p218) — ticks by category
      'STCW Master (Workboat < 500 GT, unlimited area) [Note G, MGN 496]': [0, 1, 2, 3, 4, 5, 6],
      'STCW Master (Code Vessels < 200 GT, unlimited area) [Note E]': [0, 1, 2, 3, 4, 5, 6],
      'RYA/MCA Yachtmaster Ocean CoC [Note A]': [0, 1, 2, 3, 4, 5, 6],
      'STCW Master (Code Vessels < 200 GT, limited to 150 miles from a safe haven) [Note E]': [1, 2, 3, 4, 5, 6],
      'RYA/MCA Yachtmaster Offshore CoC or Service [Note A]': [1, 2, 3, 4, 5, 6],
      "MCA Boatmasters' Licence (limited to licence area/endorsements) [Note B]": [3, 4, 5, 6],
      'RYA/MCA Yachtmaster Coastal CoC or Service [Note A]': [3, 4, 5, 6],
      'RYA/MCA Powerboat Advanced CoC [Notes A, F]': [3, 4, 5, 6],
      'RYA/MCA Powerboat Advanced Practical Certificate (issued before 1 Jan 2005) [Notes A, F]': [3, 4, 5, 6],
      'Certificate of competency for appropriate area issued by Competent Authority [Notes A, C]': [3, 4, 5, 6],
      'RYA/MCA Powerboat Level 2 — ONLY open boats/RIBs/inflatables/buoyant-collar boats < 3 GT [Note H]': [6],
      'RYA/MCA Day Skipper Theory & Practical — DAYLIGHT operation only [Note A]': [4, 6],
      'Local Authority Licence for appropriate area (MCA-approved LAs only) [Notes A, D]': [6]
    };
    const SECOND_PERSON = { // Table A5.1 "Additional requirements" (p218)
      0: 'Another person holding at least RYA/MCA Yachtmaster Offshore CoC, STCW Master (<200 GT, 150 miles), Yachtmaster Ocean, or STCW Master (<200 GT unlimited)',
      1: 'A second person holding at least RYA/MCA Yachtmaster Coastal CoC or Service',
      2: 'A second person deemed competent by the Master: experienced with the vessel type, the operations, and all likely sea-state/weather/light conditions for the voyage',
      3: 'A second person the owner/operator considers experienced and competent',
      4: 'A second person the owner/operator considers experienced and competent',
      5: 'A second person the owner/operator considers experienced and competent',
      6: 'A second person the owner/operator considers experienced and competent'
    };

    function wbcCrewFor(catId) {
      const c = n(catId);
      const r = [];
      const masterOpts = Object.keys(MASTER_QUALS).filter((k) => MASTER_QUALS[k].includes(c));
      r.push({ role: 'Master', cert: 'One of: ' + masterOpts.join('; '), options: masterOpts, mandatory: true,
        ref: 'WBC §28.1.1 (p179); Table A5.1 (p218); Notes (p219)',
        note: 'RYA certificates must carry a commercial endorsement (valid medical fitness certificate + Basic Sea Survival/PST + RYA PPR course) — Note 3. Note A: qualification gained in motor vessels (high-speed ops: in a high-speed vessel). CoCs revalidated every 5 years (§28.1.7).' });
      if (c >= 3) r.push({ role: 'Master', cert: 'Minimum RYA/MCA Advanced Powerboat Certificate + relevant experience when towing (§26.1.5) or in high-speed/planing operations (§25.4); high-speed training in a high-speed vessel', mandatory: true, condition: 'Towing or high-speed/planing ops', ref: 'WBC Table A5.1 Note F (p219)' });
      r.push({ role: 'Second person', cert: SECOND_PERSON[c], mandatory: true, ref: 'WBC Table A5.1 Additional requirements (p218)', verify: c >= 3, note: c >= 3 ? 'Interaction with CA-permitted single-handed operation (§28.2) not stated in the table.' : undefined });

      // Engineering — Table A5.2 (p220). Power Vessel W = towing, lifting, or cargo > 1000 kg (Note 6); SL = other (Note 7).
      if (c === 2) r.push({ role: 'Engineer', cert: 'Approved Engine Course (Part 1) or MCA-accepted engineering experience/competency', mandatory: true, condition: 'Power Vessel W only (towing, lifting or cargo > 1000 kg)', ref: 'WBC Table A5.2 + Notes 2–6 (p220)' });
      if (c === 1) {
        r.push({ role: 'Engineer', cert: 'Approved Engine Course (Part 1) or MCA-accepted experience', mandatory: true, condition: 'Power Vessel SL', ref: 'WBC Table A5.2 (p220)' });
        r.push({ role: 'Engineer', cert: 'Marine Engine Operators Licence (MEOL) or equivalent incl. STCW III/4 Engine Ratings or AEC Parts 1 & 2', mandatory: true, condition: 'Power Vessel W', ref: 'WBC Table A5.2 (p220)' });
      }
      if (c === 0) {
        r.push({ role: 'Engineer', cert: 'Approved Engine Course (Part 1) or MCA-accepted experience', mandatory: true, condition: 'Power Vessel SL', ref: 'WBC Table A5.2 (p220)' });
        r.push({ role: 'Engineer', cert: 'MEOL or equivalent (STCW III/4 Engine Ratings or AEC Parts 1 & 2)', mandatory: true, condition: 'Power Vessel W < 1500 kW', ref: 'WBC Table A5.2 (p220)' });
        r.push({ role: 'Engineer', cert: 'SMEOL / STCW C/Eng (Y4), or Small Vessel Second Engineer CoC', mandatory: true, condition: 'Power Vessel W >= 1500 kW and < 3000 kW', ref: 'WBC Table A5.2 + Note 9 (p220)' });
        r.push({ role: 'Engineer', cert: 'STCW III/2 Small Vessel Chief Engineer', mandatory: true, condition: '< 9000 kW, < 3000 GT (row applicability unclear)', verify: true, ref: 'WBC Table A5.2 + Note 8 (p220)' });
      }
      if (c >= 3) r.push({ role: 'Crew', cert: 'No engineering certificate required; one crew member sufficiently familiar with machinery operation & maintenance', mandatory: true, ref: 'WBC Table A5.2 col 6–3 + Note 5 (p220)' });

      // Radio
      r.push({ role: 'Radio operator', cert: 'At least one person holding a valid radio licence / CoC appropriate to the area category (issued by Ofcom)', mandatory: true, verify: true, note: 'Code does not name the certificate (e.g. SRC/LRC/GOC).', ref: 'WBC §28.1.8 + fn 100 (p179)' });

      // Medical fitness
      r.push({ role: 'All persons employed/engaged on board', cert: 'Valid medical fitness certificate (type per MIN 698)', mandatory: true, verify: true, note: 'Code does not name ENG1 or ML5 — see MIN 698.', ref: 'WBC §28.1.5 (p179); Table A5.1 Note 3 (p219)' });

      // Table A5.3 mandatory training (p221)
      r.push({ role: 'All persons employed/engaged on board', cert: 'Sea survival: MCA-approved STCW Personal Survival Techniques (STCW CoC route) or RYA Basic Sea Survival / PST', mandatory: true, ref: 'WBC §28.1.4 (p179); Table A5.3 (p221)' });
      if (c <= 1) r.push({ role: 'Master', cert: 'Proficiency in Medical Care (or Ship Captain\'s Medical) — unless another crew member holds an equivalent or higher medical/nursing qualification', mandatory: true, condition: 'Non-MLC vessels', ref: 'WBC §23.2.1 (p160); Table A5.3 (p221)' });
      else r.push({ role: 'Crew (min 1 on board)', cert: 'MCA-approved Elementary First Aid (or First Aid at Sea / Medical First Aid), RYA First Aid, or SeaFish Basic First Aid — course must cover Category C medical stores', mandatory: true, condition: 'Non-MLC vessels', ref: 'WBC §23.2.1 (p160); Table A5.3 (p221)' });
      r.push({ role: 'Crew (min 1 on board)', cert: 'Person in charge of medical care / competent in medical first aid holding the relevant STCW certificate', mandatory: true, condition: 'MLC-compliant vessels', ref: 'WBC Table A5.3 (p221)' });
      r.push({ role: 'Crew', cert: 'MCA-approved 1-day fire fighting course, STCW Fire Fighting & Fire Prevention, or Royal Navy equivalent — min 1 crew member if < 15 m; ALL crew if >= 15 m', mandatory: true, ref: 'WBC Table A5.3 (p221)' });
      r.push({ role: 'Master + crew using radar', cert: 'MCA-approved Small Ships Navigation and Radar: Radar & Meteorology (or MIN 698 equivalent)', mandatory: c <= 2 ? true : null, condition: 'Vessels carrying radar (radar compulsory in cat 0–2, §19.7.1.3)', ref: 'WBC Table A5.3 (p221)' });
      r.push({ role: 'Master', cert: 'MCA-approved 1-day stability course', mandatory: c <= 1 ? true : null, condition: 'Vessels required to have a Stability Information Booklet (always for cat 0/1)', ref: 'WBC Table A5.3 (p221); §12.1.1.3 (p81–82)' });
      r.push({ role: 'Masters + watchkeepers', cert: 'MCA-approved Small Ships Navigation and Radar: Electronic Chart Systems & Bridge Watchkeeping + equipment-specific familiarisation', mandatory: null, condition: 'Vessels carrying electronic chart plotters', ref: 'WBC Table A5.3 (p221)' });
      r.push({ role: 'Crew using equipment beyond Code requirements', cert: 'Appropriate training on that equipment (e.g. ECDIS)', mandatory: null, condition: 'Where carried', ref: 'WBC Table A5.3 + Note B (p221)' });
      r.push({ role: 'Crew preparing food', cert: "Level 2 'Basic Food Hygiene' / 'Food Safety'", mandatory: null, condition: 'Where appropriate', ref: 'WBC Table A5.3 (p221)' });
      r.push({ role: 'All crew', cert: 'Dangerous goods general awareness/familiarisation training (+ IMDG function-specific training); records kept 5 years', mandatory: null, condition: 'Vessels carrying dangerous goods', ref: 'WBC App.5 §4.1–4.3 (p222)' });
      r.push({ role: 'All crew', cert: 'LSA & emergency familiarisation; drills (fire, abandon ship, MOB incl. low light) recorded', mandatory: true, ref: 'WBC §14.11 + fn 49 (p116); App.8 §7.2 (p235)' });
      r.push({ role: 'Industrial personnel', cert: 'Able-bodied, appropriate medical standard, basic safety training to industry standard, safety briefing, PPE; otherwise carried as passengers (12 max)', mandatory: true, condition: 'When carrying industrial personnel', verify: true, ref: 'WBC §22.4.1–22.4.2 (p158)' });
      r.push({ role: 'Pilot boat crew', cert: 'Manned per MGN 50(M) Manning of Pilot Boats (not reviewed)', mandatory: true, condition: 'Dedicated pilot boats and WB+PB on pilot duties', verify: true, ref: 'WBC Table 27.2.3 row 28.1 (p177)' });
      if (c <= 2) r.push({ role: 'Manning', cert: 'Single-handed operation NOT permitted', mandatory: true, ref: 'WBC §28.2.1.1 (p180)' });
      else r.push({ role: 'Manning', cert: 'Single-handed only with CA permission + endorsement; max 8 h; not in restricted visibility, towing, pilot duties, personnel transfer, or diving platform use; Master wears lifejacket + PLB; voyage plan with person ashore', mandatory: true, condition: 'If operating single-handed', ref: 'WBC §28.2.1–28.2.5 (p179–181)' });
      return r;
    }

    const WBC_CREW_REQS = {};
    ALL.forEach((cId) => { WBC_CREW_REQS[cId] = wbcCrewFor(cId); });

    // ---------------------------------------------------------------------------
    // SMS — WBC App.8 (p233–237) + §31.3 cyber (p197–198). Maps CodedOK SMS_SCHEMA ids → WBC refs.
    // ---------------------------------------------------------------------------
    const WBC_SMS_REFS = {
      meta:        { ref: 'WBC §31.2.1 (p197) — SMS proportionate to vessel & operation' },
      hs_policy:   { ref: 'WBC App.8 §2.1 Safety & Environmental Protection Policy (p233); §4.1–4.3 H&S Protection Policy, competent person, alcohol & drug policy (p234)' },
      risk:        { ref: 'WBC App.8 §3.1 (p233–234); §3.14 (p38); COSWP Ch.1' },
      roles:       { ref: 'WBC App.8 §5.1–5.3 written statement of Master\'s authority (p234); §6.1–6.3 Person Ashore (p234)' },
      training:    { ref: 'WBC App.8 §7.1–7.2 familiarisation (p234–235); §28; Table A5.3 (p221)' },
      sop:         { ref: 'WBC App.8 §8.1 procedures (p235); §9.1–9.2 safety briefing (p235–236); §22.3.3 transfer briefing (p157)' },
      emergency:   { ref: 'WBC App.8 §10.1–10.6 (p236–237)' },
      reporting:   { ref: 'WBC App.8 §11.1–11.3 (p237); §3.6 (p33); §4.7 (p44–45)' },
      maintenance: { ref: 'WBC App.8 §12.1–12.2 (p237); §3.5 (p32–33)' },
      cyber:       { ref: 'WBC §31.3.1–31.3.6 (p197–198) — RA on alteration or <= 5 years' },
      review:      { ref: 'WBC App.8 §13.1 — at least once every 3 years (p237)' }
    };
    const WBC_SMS_DEADLINE = { manned: '2026-12-13', rouv: '2023-12-13', ref: 'WBC §31.1.1–31.1.2 (p197); §1.11 (p13)' };

    return { WBC_SCOPE, WBC_CATEGORIES, WBC_VESSEL_CERTS, WBC_EQUIPMENT, WBC_CREW_REQS, WBC_SMS_REFS, WBC_SMS_DEADLINE, wbcStabilityRouteFor, WBC_PILOT_BOAT_EXTRAS, WBC_CERT_TYPES, WBC_ENDORSEMENTS };
  })();

  // ----- Helpers -----

  function getCategory(catId) {
    return CATEGORIES.find((c) => c.id === catId) || CATEGORIES.find((c) => c.id === 'cat2');
  }

  function shortIdFromCategory(category) {
    if (!category) return 'cat2';
    const m = String(category).match(/(\d)/);
    return m ? 'cat' + m[1] : 'cat2';
  }

  // Kinds a user can actually hold a record for in the app (scan / add).
  // Other required items (manuals, signal tables, searchlight…) are shown
  // as "check on board" rather than "missing".
  const TRACKED_CERT_KINDS = ['coding', 'stability', 'stability_simplified', 'radio', 'mmsi', 'pli', 'sms', 'risk_assessment', 'epirb_registry', 'construction_cert'];
  const TRACKED_EQUIPMENT_KINDS = ['liferaft', 'hru', 'lifejacket', 'lifebuoy', 'epirb', 'sart', 'plb', 'vhf_fixed', 'vhf_handheld', 'mf_radio', 'navtex', 'pyrotechnics', 'fire_ext_portable', 'fire_ext_fixed', 'fire_blanket', 'first_aid_a', 'first_aid_b', 'first_aid_c', 'tpa'];

  // Which Code applies: 'workboat' when the vessel says so (vessel.code) or
  // its category is 'Workboat'; otherwise the SPV Code.
  function codeFor(vessel, category) {
    if (vessel && vessel.code === 'workboat') return 'workboat';
    if (/workboat/i.test(String(category || (vessel && vessel.category) || ''))) return 'workboat';
    return 'spv';
  }
  // Area category id. A workboat whose category is just 'Workboat' uses
  // vessel.area_category ('cat3' etc.).
  function areaFor(category, vessel) {
    if (vessel && vessel.area_category && /^cat[0-6]$/.test(vessel.area_category)) return vessel.area_category;
    return shortIdFromCategory(category);
  }

  function requiredVesselCerts(category, vessel) {
    const id = areaFor(category, vessel);
    return (codeFor(vessel, category) === 'workboat' ? WBC.WBC_VESSEL_CERTS[id] : VESSEL_CERTS[id]) || [];
  }

  // qty may be a number, a function of the vessel, or descriptive text.
  // Items that resolve to 0 don't apply to this vessel and are dropped.
  function requiredEquipment(category, vessel) {
    const id = areaFor(category, vessel);
    const items = (codeFor(vessel, category) === 'workboat' ? WBC.WBC_EQUIPMENT[id] : EQUIPMENT[id]) || [];
    return items.map((it) => Object.assign({}, it, {
      qty_resolved: typeof it.qty === 'function' ? it.qty(vessel || {}) : it.qty
    })).filter((it) => it.qty_resolved !== 0 && it.qty_resolved !== false);
  }

  function requiredCrewQuals(category, vessel) {
    const id = areaFor(category, vessel);
    return (codeFor(vessel, category) === 'workboat' ? WBC.WBC_CREW_REQS[id] : CREW_REQS[id]) || [];
  }

  function stabilityFor(vessel) {
    const v = vessel || {};
    return codeFor(v) === 'workboat' ? WBC.wbcStabilityRouteFor(v, areaFor(v.category, v)) : stabilityRouteFor(v);
  }

  // Key dates (entry into force: SPV SI 2025/1195 reg.1 — 12 Dec 2025;
  // Workboat Code §1.11 — 13 Dec 2023).
  const KEY_DATES = {
    spv: { in_force: '2025-12-12', existing_vessels_by: 'next renewal examination or 2028-12-12, whichever is later', sms_by: '2028-12-12', courses_by: '2030-12-12',
           ref: 'SPV Code 2025 App. 12 §3 (p253); §30.1.1 (p210); §28.10 (p205). Date from SI 2025/1195 reg. 1' },
    workboat: { in_force: '2023-12-13', sms_by: WBC.WBC_SMS_DEADLINE.manned, ref: WBC.WBC_SMS_DEADLINE.ref }
  };

  function requiredOwnerDeclarations(category) {
    const id = shortIdFromCategory(category);
    return OWNER_DECLARATIONS.filter((d) => d.required_for.includes(id));
  }

  // Public API
  window.Codes = {
    CATEGORIES,
    SPV_SCOPE,
    VESSEL_CERTS,
    EQUIPMENT,
    CREW_REQS,
    OWNER_DECLARATIONS,
    SMS_TEMPLATES,
    SMS_SCHEMA,
    TRACKED_CERT_KINDS,
    TRACKED_EQUIPMENT_KINDS,
    WBC,
    KEY_DATES,
    getCategory,
    shortIdFromCategory,
    codeFor,
    areaFor,
    stabilityFor,
    requiredVesselCerts,
    requiredEquipment,
    requiredCrewQuals,
    requiredOwnerDeclarations,
    stabilityRouteFor
  };
})();
