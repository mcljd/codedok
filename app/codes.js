// CodedOK — MCA code reference data.
// Source basis: Workboat Code Ed 3 + Sport/Pleasure Vessel Code 2025.
// PROTOTYPE NOTE: schedules below capture the common-knowledge requirements
// per category. Cross-reference against the source PDFs before launch and
// fill in any gaps Joseph spots.

(function () {
  'use strict';

  // Distance-from-safe-haven categories (Workboat Code & SPV Code share the same band logic).
  const CATEGORIES = [
    { id: 'cat0', name: 'Category 0', desc: 'Unrestricted (worldwide)', distance: 'Unrestricted' },
    { id: 'cat1', name: 'Category 1', desc: 'Up to 150 nm from a safe haven', distance: '150 nm' },
    { id: 'cat2', name: 'Category 2', desc: 'Up to 60 nm from a safe haven', distance: '60 nm' },
    { id: 'cat3', name: 'Category 3', desc: 'Up to 20 nm from a safe haven', distance: '20 nm' },
    { id: 'cat4', name: 'Category 4', desc: 'Up to 20 nm in favourable weather', distance: '20 nm (favourable)' },
    { id: 'cat5', name: 'Category 5', desc: '5 nm summer / 3 nm winter from safe haven', distance: '5 nm / 3 nm' },
    { id: 'cat6', name: 'Category 6', desc: 'Up to 3 nm in favourable weather, daytime only', distance: '3 nm daylight' }
  ];

  // Vessel certificate requirements — keyed by category id.
  // `kind` matches Store cert kinds; `required` true = must hold; false = recommended.
  const VESSEL_CERTS = {
    cat2: [
      { kind: 'coding',      name: 'MCA Coding Certificate',          required: true,  validity_months: 60, renew_annual: true,  authority: 'Certifying Authority (YDSA, MECAL, etc.)' },
      { kind: 'stability',   name: 'Stability information book',      required: true,  validity_months: null, authority: 'Naval architect / certifying authority' },
      { kind: 'radio',       name: 'Ship Radio Licence (VHF)',        required: true,  validity_months: 120, authority: 'Ofcom (UK) / ComReg (IE)' },
      { kind: 'pli',         name: 'Public Liability Insurance',      required: true,  validity_months: 12,  authority: 'Marine insurer' },
      { kind: 'loadline',    name: 'Loadline certificate',            required: false, condition: 'length >= 24m', authority: 'MCA / Class society' },
      { kind: 'tonnage',     name: 'Tonnage certificate',             required: false, condition: 'length >= 24m', authority: 'MCA / Class society' },
      { kind: 'mmsi',        name: 'MMSI registration',               required: true,  validity_months: null, authority: 'Ofcom / ComReg' }
    ],
    cat3: [
      { kind: 'coding',      name: 'MCA Coding Certificate',          required: true,  validity_months: 60, renew_annual: true },
      { kind: 'stability',   name: 'Stability information book',      required: true,  validity_months: null },
      { kind: 'radio',       name: 'Ship Radio Licence (VHF)',        required: true,  validity_months: 120 },
      { kind: 'pli',         name: 'Public Liability Insurance',      required: true,  validity_months: 12 },
      { kind: 'mmsi',        name: 'MMSI registration',               required: true,  validity_months: null }
    ],
    cat4: [
      { kind: 'coding',      name: 'MCA Coding Certificate',          required: true,  validity_months: 60, renew_annual: true },
      { kind: 'radio',       name: 'Ship Radio Licence (VHF)',        required: true,  validity_months: 120 },
      { kind: 'pli',         name: 'Public Liability Insurance',      required: true,  validity_months: 12 }
    ],
    cat5: [
      { kind: 'coding',      name: 'MCA Coding Certificate',          required: true,  validity_months: 60, renew_annual: true },
      { kind: 'radio',       name: 'Ship Radio Licence (VHF)',        required: true,  validity_months: 120 },
      { kind: 'pli',         name: 'Public Liability Insurance',      required: true,  validity_months: 12 }
    ],
    cat6: [
      { kind: 'coding',      name: 'MCA Coding Certificate',          required: true,  validity_months: 60, renew_annual: true },
      { kind: 'pli',         name: 'Public Liability Insurance',      required: true,  validity_months: 12 }
    ]
  };
  // Cat 0/1 inherit Cat 2 + add EPIRB cert + sea trials documents
  VESSEL_CERTS.cat1 = VESSEL_CERTS.cat2.slice();
  VESSEL_CERTS.cat0 = VESSEL_CERTS.cat2.slice();

  // Equipment requirements — qty rules can be functions of vessel.persons / vessel.length.
  // `service_months` = max interval between services / inspections.
  const EQUIPMENT = {
    cat2: [
      { kind: 'lifejacket',     name: 'Lifejackets (150N or 275N)',     icon: '🦺',  qty: (v) => Math.ceil((v.persons||12) * 1.1), service_months: 12, mandatory: true },
      { kind: 'liferaft',       name: 'Offshore liferaft (ISO 9650-1)', icon: '🛟',  qty: 'capacity for all persons',           service_months: 12, mandatory: true, note: 'ISO 9650-1 Group A or SOLAS-rated' },
      { kind: 'epirb',          name: 'EPIRB (406 MHz, GPS)',           icon: '📡',  qty: 1,                                    service_months: 60, mandatory: true, note: 'Battery + hydrostatic release' },
      { kind: 'plb',            name: 'PLB (personal locator beacon)',  icon: '📡',  qty: 1,                                    service_months: 60, mandatory: false },
      { kind: 'vhf_fixed',      name: 'VHF DSC fixed radio',            icon: '📻',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'vhf_handheld',   name: 'VHF handheld (waterproof)',      icon: '📻',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'pyro_solas_a',   name: 'SOLAS A pyrotechnics pack',      icon: '🧨',  qty: 1,                                    service_months: 36, mandatory: true, note: '4 red parachute, 6 red hand, 2 orange smoke' },
      { kind: 'fire_ext',       name: 'Fire extinguishers',             icon: '🧯',  qty: (v) => Math.max(2, Math.ceil((v.length||10) / 5)), service_months: 12, mandatory: true },
      { kind: 'fire_blanket',   name: 'Fire blanket (galley)',          icon: '🧯',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'first_aid_c',    name: 'First aid kit — Cat C',          icon: '🩹',  qty: 1,                                    service_months: 12, mandatory: true, note: 'MGN 71(M)+(F) Cat C' },
      { kind: 'anchor',         name: 'Anchor + cable/warp',            icon: '⚓',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'bilge_pump',     name: 'Bilge pumps',                    icon: '💧',  qty: 2,                                    service_months: null, mandatory: true, note: 'One manual, one powered' },
      { kind: 'nav_lights',     name: 'Navigation lights',              icon: '💡',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'compass',        name: 'Steering compass',               icon: '🧭',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'horn',           name: 'Sound signal (horn)',            icon: '📣',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'torch',          name: 'Waterproof torch',               icon: '🔦',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'kill_cord',      name: 'Engine kill cord (if open)',     icon: '🔑',  qty: 1,                                    service_months: null, mandatory: false }
    ],
    cat3: [
      { kind: 'lifejacket',     name: 'Lifejackets (150N)',             icon: '🦺',  qty: (v) => Math.ceil((v.persons||12) * 1.1), service_months: 12, mandatory: true },
      { kind: 'liferaft',       name: 'Coastal liferaft',               icon: '🛟',  qty: 'capacity for all persons',           service_months: 12, mandatory: true, note: 'ISO 9650-1 Group A or B' },
      { kind: 'plb',            name: 'PLB (personal locator beacon)',  icon: '📡',  qty: 1,                                    service_months: 60, mandatory: true },
      { kind: 'vhf_fixed',      name: 'VHF DSC fixed radio',            icon: '📻',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'vhf_handheld',   name: 'VHF handheld (waterproof)',      icon: '📻',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'pyro_inshore',   name: 'Inshore pyrotechnics pack',      icon: '🧨',  qty: 1,                                    service_months: 36, mandatory: true, note: '2 red parachute, 4 red hand, 2 orange smoke' },
      { kind: 'fire_ext',       name: 'Fire extinguishers',             icon: '🧯',  qty: (v) => Math.max(2, Math.ceil((v.length||10) / 6)), service_months: 12, mandatory: true },
      { kind: 'fire_blanket',   name: 'Fire blanket',                   icon: '🧯',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'first_aid_c',    name: 'First aid kit — Cat C',          icon: '🩹',  qty: 1,                                    service_months: 12, mandatory: true },
      { kind: 'anchor',         name: 'Anchor + cable/warp',            icon: '⚓',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'bilge_pump',     name: 'Bilge pump',                     icon: '💧',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'nav_lights',     name: 'Navigation lights',              icon: '💡',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'compass',        name: 'Steering compass',               icon: '🧭',  qty: 1,                                    service_months: null, mandatory: true }
    ],
    cat4: [
      { kind: 'lifejacket',     name: 'Lifejackets (100N+)',            icon: '🦺',  qty: (v) => Math.ceil((v.persons||12) * 1.1), service_months: 12, mandatory: true },
      { kind: 'liferaft',       name: 'Inshore liferaft / lifebuoy',    icon: '🛟',  qty: 'capacity for all persons',           service_months: 12, mandatory: true },
      { kind: 'vhf_handheld',   name: 'VHF handheld',                   icon: '📻',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'pyro_inshore',   name: 'Inshore pyrotechnics pack',      icon: '🧨',  qty: 1,                                    service_months: 36, mandatory: true },
      { kind: 'fire_ext',       name: 'Fire extinguishers',             icon: '🧯',  qty: 2,                                    service_months: 12, mandatory: true },
      { kind: 'first_aid_b',    name: 'First aid kit — Cat B',          icon: '🩹',  qty: 1,                                    service_months: 12, mandatory: true },
      { kind: 'anchor',         name: 'Anchor + warp',                  icon: '⚓',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'bilge_pump',     name: 'Bilge pump',                     icon: '💧',  qty: 1,                                    service_months: null, mandatory: true }
    ],
    cat5: [
      { kind: 'lifejacket',     name: 'Lifejackets (100N+)',            icon: '🦺',  qty: (v) => Math.ceil((v.persons||12) * 1.1), service_months: 12, mandatory: true },
      { kind: 'lifebuoy',       name: 'Lifebuoy with line',             icon: '🛟',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'vhf_handheld',   name: 'VHF handheld',                   icon: '📻',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'pyro_handheld',  name: 'Handheld flares',                icon: '🧨',  qty: 1,                                    service_months: 36, mandatory: true, note: '2 red hand, 2 orange smoke' },
      { kind: 'fire_ext',       name: 'Fire extinguishers',             icon: '🧯',  qty: 1,                                    service_months: 12, mandatory: true },
      { kind: 'first_aid_b',    name: 'First aid kit — Cat B',          icon: '🩹',  qty: 1,                                    service_months: 12, mandatory: true },
      { kind: 'anchor',         name: 'Anchor + warp',                  icon: '⚓',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'bilge_pump',     name: 'Bilge pump',                     icon: '💧',  qty: 1,                                    service_months: null, mandatory: true }
    ],
    cat6: [
      { kind: 'lifejacket',     name: 'Lifejackets',                    icon: '🦺',  qty: (v) => v.persons||12,                  service_months: 12, mandatory: true },
      { kind: 'lifebuoy',       name: 'Lifebuoy with line',             icon: '🛟',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'pyro_handheld',  name: 'Handheld flares (basic)',        icon: '🧨',  qty: 1,                                    service_months: 36, mandatory: true },
      { kind: 'fire_ext',       name: 'Fire extinguisher',              icon: '🧯',  qty: 1,                                    service_months: 12, mandatory: true },
      { kind: 'first_aid_a',    name: 'First aid kit — Basic',          icon: '🩹',  qty: 1,                                    service_months: 12, mandatory: true },
      { kind: 'anchor',         name: 'Anchor + warp',                  icon: '⚓',  qty: 1,                                    service_months: null, mandatory: true },
      { kind: 'bilge_pump',     name: 'Bailer / bilge pump',            icon: '💧',  qty: 1,                                    service_months: null, mandatory: true }
    ]
  };
  EQUIPMENT.cat0 = EQUIPMENT.cat2.slice(); // Worldwide inherits offshore + adds local additions
  EQUIPMENT.cat1 = EQUIPMENT.cat2.slice();

  // Crew qualification requirements per category.
  const CREW_REQS = {
    cat0: [
      { role: 'Skipper',   cert: 'RYA/MCA Yachtmaster Offshore (Commercial) or higher', mandatory: true },
      { role: 'Skipper',   cert: 'ENG1 medical or ML5',                                   mandatory: true },
      { role: 'Skipper',   cert: 'VHF SRC / GMDSS GOC',                                   mandatory: true },
      { role: 'Skipper',   cert: 'STCW Basic Safety Training',                            mandatory: true },
      { role: 'Crew',      cert: 'STCW Basic + first aid',                                mandatory: true }
    ],
    cat1: [
      { role: 'Skipper',   cert: 'RYA/MCA Yachtmaster Offshore (Commercial)',              mandatory: true },
      { role: 'Skipper',   cert: 'ENG1 medical or ML5',                                    mandatory: true },
      { role: 'Skipper',   cert: 'VHF SRC',                                                mandatory: true },
      { role: 'Crew',      cert: 'First aid trained (RYA or equivalent)',                  mandatory: true }
    ],
    cat2: [
      { role: 'Skipper',   cert: 'RYA Day Skipper (Commercial) or higher',                 mandatory: true },
      { role: 'Skipper',   cert: 'ENG1 or ML5 medical',                                    mandatory: true },
      { role: 'Skipper',   cert: 'VHF SRC',                                                mandatory: true },
      { role: 'Skipper',   cert: 'First aid (RYA / equivalent)',                           mandatory: true },
      { role: 'Crew',      cert: 'First aid trained (one per trip minimum)',               mandatory: true }
    ],
    cat3: [
      { role: 'Skipper',   cert: 'RYA Day Skipper (Commercial) or higher',                 mandatory: true },
      { role: 'Skipper',   cert: 'ML5 medical (ENG1 preferred)',                           mandatory: true },
      { role: 'Skipper',   cert: 'VHF SRC',                                                mandatory: true },
      { role: 'Skipper',   cert: 'First aid (RYA / equivalent)',                           mandatory: true }
    ],
    cat4: [
      { role: 'Skipper',   cert: 'RYA Day Skipper (Commercial) or Powerboat L2 (CB)',      mandatory: true },
      { role: 'Skipper',   cert: 'ML5 medical',                                            mandatory: true },
      { role: 'Skipper',   cert: 'VHF SRC',                                                mandatory: true }
    ],
    cat5: [
      { role: 'Skipper',   cert: 'RYA Powerboat Level 2 (Commercially endorsed)',          mandatory: true },
      { role: 'Skipper',   cert: 'ML5 medical',                                            mandatory: true },
      { role: 'Skipper',   cert: 'VHF SRC',                                                mandatory: true }
    ],
    cat6: [
      { role: 'Skipper',   cert: 'RYA Powerboat Level 2 (Commercially endorsed)',          mandatory: true },
      { role: 'Skipper',   cert: 'ML5 medical',                                            mandatory: true }
    ]
  };

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

  // FULL SAFETY MANAGEMENT SYSTEM SCHEMA
  // Sources: Sport or Pleasure Vessel Code 2025 — Appendix 7
  //          Workboat Code Ed 3 — Appendix (Safety Management System)
  // Both codes are aligned on what a small-vessel SMS must contain.
  // Templated default text is industry-standard boilerplate; operators edit to suit.
  const SMS_SCHEMA = [
    {
      id: 'meta',
      title: 'Vessel & company',
      icon: '⛵',
      ref: 'SPV Code App. 7 — General',
      blurb: 'The SMS opens with the vessel and operating company so a surveyor knows what they\'re reading.',
      fields: [
        { id: 'vessel_name',   label: 'Vessel name',                    type: 'short', placeholder: 'e.g. Silver Sands' },
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
      title: 'Health, Safety & Environmental Policy',
      icon: '🛡️',
      ref: 'SPV Code App. 7 §2 / Workboat Code App. §2 + §4',
      blurb: 'A signed statement of intent — covering health, safety, working environment and the environment, both ashore and on board. Must be visible to crew and reviewed.',
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
      title: 'Risk Assessments',
      icon: '⚠️',
      ref: 'SPV Code App. 7 §3 / Workboat Code App. §3',
      blurb: 'A risk assessment for every routine operation and foreseeable emergency. Assessed by likelihood × severity; records the controls in place.',
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
      ref: 'SPV Code App. 7 §4 / Workboat Code App. §5–6',
      blurb: 'Establishes the Master\'s overriding authority for safety, the Owner/Operator\'s duties, and a designated Person Ashore for emergency support.',
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
      title: 'Training & Familiarisation',
      icon: '🎓',
      ref: 'SPV Code App. 7 §5 / Workboat Code App. §7',
      blurb: 'Before working on the vessel, every crew member receives familiarisation. The minimum coverage is set by the Code.',
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
      title: 'Standard Operating Procedures',
      icon: '📋',
      ref: 'SPV Code App. 7 §6 / Workboat Code App. §8',
      blurb: 'Documented procedures for daily vessel operations: pre-departure checks, navigation, refuelling, watertight integrity, passenger conduct.',
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
      title: 'Emergency Procedures',
      icon: '🚨',
      ref: 'SPV Code App. 7 §7 / Workboat Code App. §9',
      blurb: 'Clear procedures for the named emergencies the Code requires. Every crew member must know their role.',
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
      title: 'Accident & Incident Reporting',
      icon: '📓',
      ref: 'SPV Code App. 7 §8 / Workboat Code App. §10',
      blurb: 'Procedure for reporting accidents to the MAIB and capturing near-misses for internal lessons-learned.',
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
      title: 'Maintenance of Vessel & Equipment',
      icon: '🔧',
      ref: 'SPV Code App. 7 §9 / Workboat Code App. §11',
      blurb: 'Documented inspection + maintenance schedule for the vessel and its equipment, with records.',
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
      title: 'Cyber Security',
      icon: '🔒',
      ref: 'SPV Code App. 7 §10 (new in 2025)',
      blurb: 'New under SPV Code 2025: identify systems, manage risks, detect attacks, restore. Proportionate to vessel size.',
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
      ref: 'SPV Code App. 7 §11 / Workboat Code App. §12',
      blurb: 'How and how often the SMS is reviewed. SPV Code requires at minimum every 3 years; in practice annually is far better.',
      fields: [
        { id: 'review_freq', label: 'Review frequency', type: 'short', default: 'Annually, after every incident, and at least every 3 years per the Code' },
        { id: 'review_record', label: 'Review record', type: 'long', default:
`Each review is recorded by the Owner with: date, who reviewed, what changed, the new version number. Crew are briefed on changes at the next opportunity and the briefing is logged.` }
      ]
    }
  ];

  // ----- Helpers -----

  function getCategory(catId) {
    return CATEGORIES.find((c) => c.id === catId) || CATEGORIES.find((c) => c.id === 'cat2');
  }

  function shortIdFromCategory(category) {
    if (!category) return 'cat2';
    const m = String(category).match(/(\d)/);
    return m ? 'cat' + m[1] : 'cat2';
  }

  function requiredVesselCerts(category) {
    return VESSEL_CERTS[shortIdFromCategory(category)] || [];
  }

  function requiredEquipment(category, vessel) {
    const items = EQUIPMENT[shortIdFromCategory(category)] || [];
    return items.map((it) => Object.assign({}, it, {
      qty_resolved: typeof it.qty === 'function' ? it.qty(vessel || {}) : it.qty
    }));
  }

  function requiredCrewQuals(category) {
    return CREW_REQS[shortIdFromCategory(category)] || [];
  }

  // Public API
  window.Codes = {
    CATEGORIES,
    VESSEL_CERTS,
    EQUIPMENT,
    CREW_REQS,
    SMS_TEMPLATES,
    SMS_SCHEMA,
    getCategory,
    shortIdFromCategory,
    requiredVesselCerts,
    requiredEquipment,
    requiredCrewQuals
  };
})();
