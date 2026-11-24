// CodedOK — Quick SMS.
//
// A Safety Management System in about ten minutes: plain questions, most of
// them pre-filled from the boat's record, then the app writes the document.
//
// The document follows the Sport or Pleasure Vessel Code 2025, Section 30 and
// Appendix 7 (1.1 lists the ten elements an SMS shall include), and ends with
// the cross-reference statement Appendix 7, 3.2 asks for. Every Code reference
// below was checked against the published Code. Anything the operator has not
// told us is shown as a highlighted "[to confirm]" and listed at the top, so a
// half-finished SMS never looks finished.
//
// Works offline; nothing is sent anywhere. Workboat-coded boats use the
// existing builder. Workboat Code boats get the same document re-referenced to
// Section 31 and Appendix 8 (see toWorkboat).
(function () {
  'use strict';

  var DRAFT_KEY = 'codedok_quick_sms_draft';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function fmt(d) {
    var x = new Date(d);
    return isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function isQuick(d) { return !!(d && d.sections && d.sections.quick); }
  function isSpv(v) { var C = window.Codes; return !(C && C.codeFor && C.codeFor(v) === 'workboat'); }
  function areaOf(v) {
    var C = window.Codes;
    var id = C && C.areaFor ? C.areaFor(v.category, v) : '';
    return /^cat[0-6]$/.test(id || '') ? id : '';
  }

  // ───────────────────────── Questions ─────────────────────────

  var OPERATIONS = [
    ['charter', 'Skippered charter / day trips'],
    ['transfer', 'Passenger transfers / water taxi'],
    ['wildlife', 'Wildlife and sightseeing tours'],
    ['angling', 'Angling charter'],
    ['dive', 'Dive boat'],
    ['school', 'Training / sailing school'],
    ['bareboat', 'Bareboat charter or hire'],
    ['other', 'Something else']
  ];
  var WB_OPERATIONS = [
    ['crew', 'Crew or personnel transfer'],
    ['survey', 'Survey and inspection work'],
    ['support', 'Safety boat or dive support'],
    ['cargo', 'Carrying cargo or stores'],
    ['tow', 'Towing or pushing'],
    ['pax', 'Passenger trips (12 or fewer)'],
    ['other', 'Something else']
  ];
  var BOAT_KINDS = [
    ['rib_open', 'Open RIB'],
    ['rib_cabin', 'Cabin RIB'],
    ['motor', 'Motor boat'],
    ['sail', 'Sailing yacht'],
    ['other', 'Other']
  ];
  var SYSTEMS = [
    ['plotter', 'Chart plotter / GPS'],
    ['radar', 'Radar'],
    ['ais', 'AIS'],
    ['engine', 'Engine electronics / displays'],
    ['phone', 'Phone or tablet for navigation'],
    ['booking', 'Online booking / passenger lists'],
    ['wifi', 'Wi-Fi on board']
  ];

  var STEPS = [
    { id: 'op', title: 'What do you do?', sub: 'Pick the closest. You can change anything later.', fields: [
      { k: 'company', label: 'Business or owner name', type: 'text', ph: 'e.g. Bay Boat Trips Ltd' },
      { k: 'operation', label: 'Type of work', type: 'chips', options: OPERATIONS, wb: { options: WB_OPERATIONS } },
      { k: 'carries', label: 'Who do you carry besides crew?', type: 'chips', wbOnly: true, options: [['workers', 'Workers / industrial personnel'], ['pax', 'Passengers'], ['none', 'Nobody – crew only']] },
      { k: 'operationOther', label: 'Describe it', type: 'text', ph: 'e.g. Film support', wb: { ph: 'e.g. Mooring maintenance' }, showIf: function (a) { return a.operation === 'other'; } },
      { k: 'routes', label: 'Where do you usually go?', type: 'area', ph: 'e.g. Ballycastle to Rathlin; trips along the north coast', hint: 'A line or two is enough. Mention any places you land passengers.',
        wb: { ph: 'e.g. Harbour and approaches; transfers to the wind farm', hint: 'A line or two is enough. Mention any places or structures you put people onto.' } }
    ] },
    { id: 'boat', title: 'About the boat', sub: 'We filled in what we already know.', fields: [
      { k: 'boatKind', label: 'Kind of boat', type: 'chips', options: BOAT_KINDS },
      { k: 'engines', label: 'Engines', type: 'text', ph: 'e.g. 2 × Suzuki 200 hp outboards' },
      { k: 'fuel', label: 'Fuel', type: 'chips', options: [['petrol', 'Petrol'], ['diesel', 'Diesel'], ['electric', 'Electric']] },
      { k: 'pax', label: 'Most passengers you carry', type: 'number', ph: 'e.g. 12', wb: { label: 'Most people you carry, not counting crew', hint: 'Enter 0 if you only ever carry crew.' } },
      { k: 'crewMax', label: 'Crew on board (including the skipper)', type: 'number', ph: 'e.g. 2' },
      { k: 'planing', label: 'Do you carry passengers at planing speed?', type: 'yn', hint: 'The Code asks for a specific risk assessment if you do.', wb: { label: 'Do you run at high speed or on the plane?' } },
      { k: 'fwdSeats', label: 'At speed, where do passengers sit?', wb: { label: 'At speed, where do people sit?' }, type: 'chips', showIf: function (a) { return a.planing === 'y'; },
        options: [['none', 'Nobody in the front third'], ['slow', 'Front seats used, but we slow down'], ['all', 'All seats used']], hint: 'The front of the boat slams hardest, so the Code asks how you manage it.' },
      { k: 'night', label: 'Do you operate at night?', type: 'yn' }
    ] },
    { id: 'kit', title: 'What is on board?', sub: 'So the procedures match your boat.', fields: [
      { k: 'liferaft', label: 'Liferaft carried', type: 'yn' },
      { k: 'lifting', label: 'Crane, davit or other lifting gear', type: 'yn', wbOnly: true },
      { k: 'fixedFire', label: 'Fixed fire system in the engine space', type: 'yn' },
      { k: 'gas', label: 'Gas (LPG) on board', type: 'yn' },
      { k: 'toilet', label: 'Toilet on board', type: 'yn' },
      { k: 'vhfFixed', label: 'Fixed VHF radio', type: 'yn' },
      { k: 'vhfHandheld', label: 'Handheld VHF', type: 'yn' },
      { k: 'beacon', label: 'EPIRB or personal locator beacon', type: 'yn' }
    ] },
    { id: 'people', title: 'Who is in charge?', sub: 'The Code wants names, so everyone knows who to go to.', fields: [
      { k: 'hsName', label: 'Person responsible for health and safety', type: 'text', ph: 'Name', hint: 'This can be you.' },
      { k: 'hsRole', label: 'Their role', type: 'text', ph: 'e.g. Owner' },
      { k: 'hsPhone', label: 'Their phone', type: 'tel', ph: 'Phone number' },
      { k: 'masters', label: 'Skippers who take the boat out', type: 'text', ph: 'Names, separated by commas' },
      { k: 'crewNames', label: 'Other crew', type: 'text', ph: 'Names, or leave blank' },
      { k: 'singleHanded', label: 'Is the boat ever run by one person alone?', type: 'yn' }
    ] },
    { id: 'ashore', title: 'Your person ashore', sub: 'Someone on land who knows your plans and raises the alarm if you are overdue. A colleague, family member or friend is fine.', fields: [
      { k: 'ashoreName', label: 'Name', type: 'text', ph: 'Name' },
      { k: 'ashorePhone', label: 'Phone', type: 'tel', ph: 'Phone number' },
      { k: 'deputyName', label: 'Stand-in (optional)', type: 'text', ph: 'Name' },
      { k: 'deputyPhone', label: 'Stand-in phone', type: 'tel', ph: 'Phone number', showIf: function (a) { return !!a.deputyName; } },
      { k: 'mobile', label: 'Mobile carried on the boat', type: 'tel', ph: 'Phone number' }
    ] },
    { id: 'limits', wb: { title: 'Your working limits' }, title: 'Your limits with passengers', sub: 'When do you say "we are not going"? These must be within your certificate. You can always set lower limits on the day.', fields: [
      { k: 'limWind', label: 'Strongest wind you sail in (Beaufort force)', type: 'chips', options: [['3', 'F3'], ['4', 'F4'], ['5', 'F5'], ['6', 'F6'], ['7', 'F7'], ['8', 'F8']] },
      { k: 'limWave', label: 'Biggest waves (metres)', type: 'chips', options: [['0.5', '0.5 m'], ['1', '1 m'], ['1.5', '1.5 m'], ['2', '2 m'], ['2.5', '2.5 m'], ['3', '3 m'], ['4', '4 m']] },
      { k: 'limVis', label: 'Least visibility', type: 'chips', options: [['0.25', '¼ mile'], ['0.5', '½ mile'], ['1', '1 mile'], ['2', '2 miles']] }
    ] },
    { id: 'contacts', title: 'Useful numbers', sub: 'These go in the emergency contact list. Leave any you do not have yet.', fields: [
      { k: 'harbour', label: 'Harbour master at your base', type: 'text', ph: 'Name and number' },
      { k: 'ca', label: 'Certifying Authority', type: 'text', ph: 'e.g. YDSA, MECAL' },
      { k: 'insurer', label: 'Insurer', type: 'text', ph: 'Name and number' },
      { k: 'engineer', label: 'Engineer / service agent', type: 'text', ph: 'Name and number' }
    ] },
    { id: 'cyber', title: 'Electronics', sub: 'The new Code asks every boat to think about what happens if the electronics fail or are tampered with. Tick what you rely on.', fields: [
      { k: 'systems', label: 'What do you use?', type: 'multi', options: SYSTEMS },
      { k: 'remote', label: 'Can any system on the boat be accessed remotely?', type: 'yn', hint: 'For example engine monitoring a dealer can log in to. Most small boats: no.' }
    ] }
  ];

  function defaults(v) {
    var s = Store.snapshot();
    var u = (Store.getCurrentUser && Store.getCurrentUser()) || s.user || {};
    var org = (s.organizations || []).filter(function (o) { return o.id === v.org_id; })[0] || (s.organizations || [])[0] || {};
    var crew = (Store.vesselCrew(v.id) || []);
    var t = String(v.type || '').toLowerCase();
    var kind = /rib/.test(t) ? (/cabin/.test(t) ? 'rib_cabin' : 'rib_open') : /sail|yacht|ketch|sloop/.test(t) ? 'sail' : /motor|cruiser|launch|power/.test(t) ? 'motor' : '';
    var skip = crew.filter(function (c) { return /skipper|master|coxswain|captain/i.test(c.role || ''); });
    var others = crew.filter(function (c) { return skip.indexOf(c) < 0; });
    var area = areaOf(v);
    var certWind = /cat[456]/.test(area) ? '6' : '8';
    return {
      company: org.name || '', operation: '', operationOther: '', routes: '', carries: '', lifting: '',
      boatKind: kind, engines: '', fuel: '', pax: v.persons ? String(Math.max(0, v.persons - 2)) : '', crewMax: '2',
      planing: /rib/.test(t) ? 'y' : '', fwdSeats: '', night: /cat[46]/.test(area) ? 'n' : '',
      liferaft: '', fixedFire: '', gas: '', toilet: '', vhfFixed: 'y', vhfHandheld: '', beacon: '',
      hsName: u.name || '', hsRole: 'Owner', hsPhone: u.phone || '',
      masters: skip.map(function (c) { return c.name; }).join(', ') || u.name || '',
      crewNames: others.map(function (c) { return c.name; }).join(', '), singleHanded: '',
      ashoreName: '', ashorePhone: '', deputyName: '', deputyPhone: '', mobile: u.phone || '',
      limWind: String(Math.min(Number(certWind), 5)), limWave: '', limVis: '0.5',
      harbour: '', ca: v.certifier || '', insurer: '', engineer: '',
      systems: ['plotter'], remote: 'n'
    };
  }


  // Pre-departure checklist for this boat (Annex B1). One list feeds both the
  // printed form and the tap-to-log check, so they can never disagree.
  function checkItems(a, v) {
    var yes = function (k) { return a[k] === 'y'; };
    var S = function (k) { return (a.systems || []).indexOf(k) >= 0; };
    var rib = a.boatKind === 'rib_open' || a.boatKind === 'rib_cabin';
    var cabin = a.boatKind === 'rib_cabin' || a.boatKind === 'motor' || a.boatKind === 'sail';
    var max = maxPersons(a, v);
    return [
      'Weather forecast, sea state, visibility and tides checked against the limits (5.2)',
      'Route, landing places and alternatives reviewed',
      'Certificate in date; persons on board will not exceed ' + (max || 'the certificate limit'),
      'Master and crew fit, rested and qualified',
      a.fuel === 'electric' ? 'Battery charge sufficient plus reserve' : 'Engine(s): oil, coolant, belts, no leaks; fuel sufficient plus reserve',
      'Bilges dry; bilge pump tested',
      'Steering tested hard over to hard over; engine controls ahead and astern',
      rib || yes('singleHanded') ? 'Kill cord fitted and tested' : '',
      rib ? 'Tube pressures and condition' : cabin ? 'Doors, windows and hatches close and seal' : '',
      'Navigation lights' + (yes('vhfFixed') || yes('vhfHandheld') ? ', VHF' : '') + (S('plotter') ? ', plotter' : '') + ' working',
      'Lifejackets (all sizes), lifebuoy' + (yes('liferaft') ? ', liferaft' : '') + ', flares' + (yes('beacon') ? ', beacon' : '') + ', first-aid kit in place and in date',
      'Fire extinguishers in place and charged; fuel shut-offs reachable',
      'Seats and handholds secure',
      'Person ashore told the trip details',
      'No open Category A defects'
    ].filter(Boolean);
  }
  function maxPersons(a, v) {
    var pax = Number(a.pax) || 0, crew = Number(a.crewMax) || 0;
    return pax && crew ? pax + crew : (Number(v && v.persons) || 0);
  }

  // Drill schedule (Part 6.15). `every` is days between drills.
  function drillTypes(a) {
    var rib = a.boatKind === 'rib_open' || a.boatKind === 'rib_cabin';
    return [
      { k: 'mob', label: 'Man overboard', every: 31 },
      { k: 'fire', label: 'Fire', every: 31 },
      { k: 'abandon', label: 'Abandon ship / evacuation', every: 92 },
      { k: 'flood', label: rib ? 'Flooding / tube damage' : 'Flooding', every: 92 },
      { k: 'power', label: 'Loss of propulsion or steering', every: 92 },
      { k: 'shore', label: 'Shoreside emergency plan', every: 366 }
    ];
  }

  // ───────────────────────── Document generator ─────────────────────────

  // Certificate limits by area category — SPV Code 3.10.1 and Table 3.10.2.
  var CERT = {
    cat0: ['Unrestricted service', 'Exceeding 8', 'Exceeding 4 m'],
    cat1: ['Up to 150 miles from a safe haven', 'Exceeding 8', 'Exceeding 4 m'],
    cat2: ['Up to 60 miles from a safe haven', 'Up to 8', 'Up to 4 m'],
    cat3: ['Up to 20 miles from a safe haven', 'Up to 8', 'Up to 4 m'],
    cat4: ['Up to 20 miles from a safe haven, in favourable weather and in daylight', 'Up to 6', 'Up to 2 m'],
    cat5: ['Within 3 miles of land and 3 miles of the departure point, in favourable weather', 'Up to 6', 'Up to 2 m'],
    cat6: ['Within 3 miles of land and 3 miles of the departure point, in favourable weather and daylight', 'Up to 6', 'Up to 2 m']
  };

  // The document is written once, against the Sport or Pleasure Vessel Code.
  // For a Workboat Code boat every reference is moved to its Workboat Code
  // Edition 3 equivalent (checked against the Code text). A reference with no
  // checked equivalent is removed rather than guessed.
  var WB_APP = { '1.1': '1.1', '2.3': '4.2', '2.4': '4.3', '3.1': '3.1', '4.2.1': '5.2', '4.3.1': '5.3', '4.7': '6.1', '5.2': '7.2', '6.1': '8.1',
    '6.2.1': '9.1', '6.2.2': '9.2', '7.1': '10.1', '7.1.11': '10.1.11', '7.2': '10.2', '7.3': '10.3', '7.5': '10.5', '7.6': '10.6',
    '8.2': '11.2', '8.3': '11.3', '9.1': '12.1', '9.2': '12.2', '11.1': '13.1' };
  var WB_CODE = { '14.2': '14.2', '14.4': '14.4', '14.4.9': '14.4.9', '14.7': '14.7', '14.8.1': '14.8.1', '16': '16', '25.7': '25.4', '25.7.1': '25.4.1', '25.7.2': '25.4.2',
    '28': '28', '28.7': '28.3', '28.7.2': '28.3.2', '3.10.1': '3.10.1', '3.10.3': '3.10.3', '3.13': '3.14', '3.13.1': '3.14.1', '3.13.2': '3.14.2', '3.13.3': '3.14.3',
    '3.5': '3.5', '3.6': '3.6', '3.6.1': '3.6.1', '3.6.2': '3.6.2', '30.2.1.1': '31.2.1' };
  var WB_CYBER = { '10.2': '31.3.2', '10.3': '31.3.3', '10.4': '31.3.4', '10.5': '31.3.5' };
  function toWorkboat(html, workers) {
    var Z = '\u2205';
    html = html.replace(/Sport or Pleasure Vessel Code 2025/g, 'Workboat Code Edition 3').replace(/Sport or Pleasure Vessel Code/g, 'Workboat Code')
      .replace(/Appendix 7, 4\.2\.1 and 4\.4\.3/g, 'Appendix 7, 4.2.1')
      .replace(/Appendix 7, 10\b(?!\.\d)/g, '§§31.3')
      .replace(/Appendix 7, (\d+(?:\.\d+)*)/g, function (m, n) { return WB_APP[n] ? 'Appendix 8, ' + WB_APP[n] : Z; })
      .replace(/Appendix 7/g, 'Appendix 8')
      .replace(/Code 28\.10\b/g, 'Appendix 5, Table A5.3')
      .replace(/Code (\d+(?:\.\d+)*)(?:–\d+(?:\.\d+)*)?/g, function (m, n) { return WB_CODE[n] ? '§§' + WB_CODE[n] : Z; })
      .replace(/\((10\.\d)((?:\.\d)?)(?:–10\.2\.(\d))?\)/g, function (m, n, sub, to) { return WB_CYBER[n] ? '(§§' + WB_CYBER[n] + sub + (to ? '–' + WB_CYBER[n] + '.' + to : '') + ')' : ''; })
      .replace(/MIN 724/g, 'MIN 698').replace(/<td>\.\d /g, '<td>')
      .replace('<td>28.7, Appendix 5</td>', '<td>28.1, Appendix 5</td>').replace('<td>28.10.2</td>', '<td>Appendix 5, Table A5.3</td>')
      .replace('<td>28.10.1</td>', '<td>Appendix 8, 7.2</td>').replace('<td>25.7</td>', '<td>25.4</td>').replace(/ \(item \.2\)/g, '');
    // Tidy up where a reference was removed.
    html = html.replace(new RegExp('\\(' + Z + '; ', 'g'), '(').replace(new RegExp('; ' + Z + '\\)', 'g'), ')').replace(new RegExp('; ' + Z + ';', 'g'), ';')
      .replace(new RegExp(' ?\\((?:see )?' + Z + '\\)', 'g'), '').replace(new RegExp(Z, 'g'), '').replace(/ \(\)/g, '').replace(/§§/g, 'Code ');
    if (workers) {
      html = html.replace(/ at booking and in the safety briefing/g, ' in the safety briefing').replace(/at booking and briefing/g, 'before the job and at the briefing')
        .replace(/at booking and before boarding/g, 'before boarding').replace(/, including fitting children’s lifejackets/g, '').replace(/Sizes for adults and children; /g, '')
        .replace(/, children and older passengers are/g, ' are').replace(/including helping passengers and children/g, 'including helping others')
        .replace(/her passengers and crew/g, 'her crew and the people she carries').replace(/passenger injury/g, 'injury to personnel').replace(/planing passenger operation/g, 'planing operation')
        .replace(/passenger lists/g, 'personnel lists').replace(/Passenger lists/g, 'Personnel lists').replace(/Passengers’/g, 'Personnel’s').replace(/passengers’/g, 'personnel’s')
        .replace(/Passengers/g, 'Personnel').replace(/passengers/g, 'personnel').replace(/Passenger/g, 'Person').replace(/passenger/g, 'person');
    }
    return html;
  }

  function generate(a, v, doc) {
    var todo = [];
    function need(val, label, step) {
      if (val != null && String(val).trim() !== '') return esc(val);
      if (!todo.some(function (t) { return t.label === label; })) todo.push({ label: label, step: step });
      return '<mark class="qs-todo">[' + esc(label) + ' – to confirm]</mark>';
    }
    function ul(items) { return '<ul>' + items.filter(Boolean).map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>'; }
    function ol(items) { return '<ol>' + items.filter(Boolean).map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ol>'; }
    function table(head, rows) {
      return '<table><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.filter(Boolean).map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    }
    function kv(rows) { return table(['', ''], rows).replace('<thead><tr><th></th><th></th></tr></thead>', '').replace('<table>', '<table class="qs-kv">'); }

    var yes = function (k) { return a[k] === 'y'; };
    var wb = !isSpv(v);                      // Workboat Code Edition 3: Section 31 and Appendix 8
    var workers = wb && a.carries !== 'pax'; // carries workers or crew only, not fare-paying passengers
    var name = esc(v.name || 'the vessel');
    var NAME = esc(String(v.name || 'the vessel').toUpperCase());
    var co = need(a.company, 'Business or owner name', 0);
    var area = areaOf(v);
    var cert = CERT[area] || null;
    var areaTxt = area ? 'Area Category ' + area.slice(3) : need('', 'Area category', 1);
    var rib = a.boatKind === 'rib_open' || a.boatKind === 'rib_cabin';
    var open = a.boatKind === 'rib_open';
    var sail = a.boatKind === 'sail';
    var cabin = a.boatKind === 'rib_cabin' || a.boatKind === 'motor' || sail;
    var planing = yes('planing');
    var single = yes('singleHanded');
    var bare = a.operation === 'bareboat';
    var pax = Number(a.pax) || 0, crewMax = Number(a.crewMax) || 0;
    var paxGiven = a.pax != null && String(a.pax).trim() !== '' && !isNaN(Number(a.pax));
    var paxTxt = paxGiven ? String(pax) : need('', wb ? 'Most people carried' : 'Most passengers carried', 1);
    var totalTxt = paxGiven && crewMax ? String(pax + crewMax) : (v.persons ? esc(v.persons) : need('', 'Maximum persons on board', 1));
    var opLabel = a.operation === 'other' ? need(a.operationOther, 'Type of work', 0)
      : need(((wb ? WB_OPERATIONS : OPERATIONS).filter(function (o) { return o[0] === a.operation; })[0] || [])[1], 'Type of work', 0);
    var kindLabel = (BOAT_KINDS.filter(function (o) { return o[0] === a.boatKind; })[0] || [])[1];
    var boatDesc = [v.length ? esc(v.length) + ' m' : '', kindLabel ? esc(kindLabel.toLowerCase().replace('rib', 'RIB')) : esc(v.type || '')].filter(Boolean).join(' ') || need('', 'Kind of boat', 1);
    var hs = need(a.hsName, 'Person responsible for health and safety', 3);
    var masters = need(a.masters, 'Skippers', 3);
    var ashore = need(a.ashoreName, 'Person ashore', 4);
    var ashoreTel = need(a.ashorePhone, 'Person ashore phone', 4);
    var fuelTxt = a.fuel ? esc(a.fuel) : need('', 'Fuel type', 1);
    var FuelTxt = a.fuel ? esc(a.fuel.charAt(0).toUpperCase() + a.fuel.slice(1)) : fuelTxt;
    var hatch = cabin ? 'doors, windows and hatches' : 'hatches and lockers';
    var seated = open ? 'seated (or astride jockey seats) and holding on' : 'seated';
    var S = function (k) { return (a.systems || []).indexOf(k) >= 0; };
    var parts = [];
    var P = function (title, html) { parts.push({ title: title, html: html }); };

    // ── Front matter ──
    var issue = doc && doc.version ? doc.version : 1;
    var signedName = doc && doc.sections && doc.sections.quick && doc.sections.quick.signed_name;
    var front =
      '<div class="qs-cover"><div class="qs-cover-co">' + co + '</div><h1>Safety Management System</h1><div class="qs-cover-v">' + NAME + '</div></div>' +
      kv([
        ['Vessel', name + ' – ' + boatDesc],
        ['Operation', opLabel],
        ['Standard applied', wb ? 'MCA Workboat Code Edition 3 – Section 31 and Appendix 8' : 'MCA Sport or Pleasure Vessel Code 2025 – Section 30 and Appendix 7'],
        ['Document owner', co],
        ['Responsible on board', 'Master (skipper)'],
        ['Issue', 'Issue ' + issue + (doc && doc.signed_at ? ' – approved ' + esc(fmt(doc.signed_at)) + (signedName ? ' by ' + esc(signedName) : '') : ' – draft for approval')],
        ['Review', 'Every year, after any significant incident or change, and in any case at least once every three years (Appendix 7, 11.1)']
      ]) +
      '<h3>Controlled copies</h3>' +
      table(['Copy', 'Where it is kept'], [['1', 'On board ' + name + ' – at the steering position (paper or in the CodedOK app)'], ['2', 'With the owner / operator (master copy)'], ['3', 'Person ashore – Part 7, shoreside emergency plan']]);

    // ── Introduction ──
    P('Introduction and vessel particulars',
      '<h3>Purpose and scope</h3>' +
      '<p>This Safety Management System (SMS) sets out how ' + co + ' manages the safety of ' + name + ', her passengers and crew, and how it prevents pollution. It applies to everything the boat does, at sea and ashore, including piers, pontoons, slipways and places where passengers wait (Code 30.2.1.1).</p>' +
      '<p>The SMS is proportionate to a single ' + boatDesc + ' carrying up to ' + paxTxt + ' passengers, and follows the elements required by Appendix 7, 1.1 of the Sport or Pleasure Vessel Code. Annex A cross-references each Code requirement to the section of this SMS that covers it.</p>' +
      '<p>The SMS shall be made available to the Certifying Authority at each compliance and renewal examination (Code 30.1.2).</p>' +
      (single ? '<p><strong>Single-handed operation.</strong> ' + name + ' is at times operated by one person. Where a requirement cannot apply because there is no second crew member, this is stated in the relevant section together with the alternative arrangement (Appendix 7, 12.1).' + (wb ? ' Single-handed operation takes place only as permitted by the Certifying Authority, within Area Category 3 to 6, and never when towing, transferring personnel at sea, acting as a diving platform, in restricted visibility or on a voyage of more than 8 hours (§§28.2).' : '') + '</p>' : '') +
      (bare ? '<p><strong>Bareboat charter.</strong> The owner / operator meets the requirements of this SMS. A charterer is not subject to Appendix 7 sections 9 to 11 (Code 30.2.2.2; Appendix 7, 4.5).</p>' : '') +
      '<h3>Vessel particulars</h3>' +
      kv([
        ['Vessel name', name],
        ['Type', boatDesc + (v.type && kindLabel && String(v.type).toLowerCase() !== kindLabel.toLowerCase() ? ' (' + esc(v.type) + ')' : '')],
        ['Length', v.length ? esc(v.length) + ' m' : need('', 'Length', 1)],
        ['Persons on board (maximum)', totalTxt + (pax ? ' – ' + pax + ' passengers and up to ' + (crewMax || '…') + ' crew' : '')],
        ['Engines', need(a.engines, 'Engines', 1)],
        ['Fuel', FuelTxt],
        ['Area category of operation', areaTxt + (cert ? ' – ' + esc(cert[0].charAt(0).toLowerCase() + cert[0].slice(1)) + ' (Code 3.10.1)' : '')],
        ['Certifying Authority', need(a.ca, 'Certifying Authority', 6)],
        ['Official / SSR number', v.ssr ? esc(v.ssr) : '–'],
        ['Passengers carried at planing speed', planing ? 'Yes – see Section 3.3' : 'No'],
        ['Base port', v.port ? esc(v.port) : need('', 'Base port', 1)]
      ]) +
      '<h3>Regular routes and landing places</h3><p>' + need(a.routes, 'Usual routes and landing places', 0).replace(/\n/g, '<br>') + '</p>');

    // ── Part 1 ──
    P('Part 1 – Health, Safety and Environmental Protection Policy',
      '<h3>1.1 Policy statement</h3>' +
      '<p>' + co + ' is committed to operating ' + name + ' so that the health and safety of passengers, crew and everyone affected by our work, a safe working environment, and the protection of the marine environment come before any commercial consideration. This applies equally on board and ashore (Appendix 7, 2.2).</p><p>We will:</p>' +
      ul([
        'Identify hazards to people, the vessel and the environment, and control the risks through written risk assessments and safe ways of working.',
        'Keep ' + name + ' and her equipment in a safe and seaworthy condition, in line with the makers’ recommendations and the Code.',
        'Operate within the limits of the vessel’s certificate and the operating limits in this SMS.',
        'Use competent, qualified and properly rested crew, and give them the training, information and equipment they need.',
        'Prepare for emergencies and practise the response with regular drills.',
        'Report, record and investigate accidents, incidents and near misses, and act on what we learn.',
        'Prevent pollution from fuel, oil, sewage and rubbish.',
        'Talk to the crew about safety and review this SMS regularly.'
      ]) +
      '<p>No timetable, booking or financial pressure overrides the Master’s judgement on safety.</p>' +
      '<h3>1.2 Environmental commitment</h3>' +
      ul(['Prevent fuel and oil spills, particularly when refuelling and pumping bilges.', 'Keep all rubbish on board for disposal ashore; nothing goes over the side.', 'Use sensible speeds and engine management to reduce fuel use and wash.', 'Keep a respectful distance from marine mammals, seabirds and sensitive sites.', 'Follow harbour authority and environmental requirements.']) +
      '<h3>1.3 Person responsible for health and safety</h3><p>The person responsible for health and safety matters (Appendix 7, 2.3) is:</p>' +
      kv([['Name', hs], ['Position', need(a.hsRole, 'Role of the person responsible for health and safety', 3)], ['Telephone', need(a.hsPhone, 'Phone for the person responsible for health and safety', 3)]]) +
      '<p>This person’s name and number are displayed on board and given to all crew at induction.</p>' +
      '<h3>1.4 Alcohol and drugs policy</h3><p>Required by Appendix 7, 2.4.</p>' +
      ul([
        'No crew member drinks alcohol while on duty or within 8 hours before reporting for duty.',
        'No crew member reports for duty, or stays on duty, under the influence of alcohol or drugs.',
        'Illegal drugs are prohibited on board at all times.',
        'Crew taking medicine that may cause drowsiness or affect judgement tell the Master or owner before duty.',
        'The Master may refuse to carry any passenger whose intoxication creates a risk to themselves or others.',
        'Anyone with concerns about a colleague’s fitness for duty raises them with the Master or owner. A breach of this policy is a serious disciplinary matter.'
      ]) +
      '<h3>1.5 Safety objectives</h3>' +
      table(['Area', 'Objective', 'Measured by'], [
        ['People', 'No deaths or serious injuries', 'Incident reports'],
        ['Vessel', 'No avoidable collisions, groundings or machinery failures', 'Incident and defect reports'],
        ['Passengers', 'Safe boarding, passage and landing on every trip', 'Incident and near-miss reports'],
        ['Pollution', 'No preventable pollution', 'Incident reports'],
        ['Maintenance', 'All planned and safety-critical maintenance done on time', 'Maintenance records'],
        ['Competence', 'All crew qualifications and training in date', 'Crew records in CodedOK'],
        ['Drills', 'All scheduled drills completed and recorded', 'Drill records']
      ]));

    // ── Part 2 ──
    P('Part 2 – Roles and Responsibilities',
      '<p>Clear lines of responsibility and authority are set out below (Appendix 7, 4.1 and 4.4.1).</p>' +
      table(['Role', 'Holder'], [
        ['Owner / operator', co],
        ['Person responsible for health and safety (1.3)', hs],
        ['Master(s)', masters],
        ['Crew', a.crewNames ? esc(a.crewNames) : (single ? 'None when operating single-handed' : 'As listed in the crew records in CodedOK')],
        ['Person ashore (Part 7)', ashore + (a.deputyName ? ' / stand-in ' + esc(a.deputyName) : '')]
      ]) +
      '<h3>2.1 Owner / operator</h3>' +
      ul([
        'Approve, put in place and review this SMS, and provide the resources, people and shore support needed to run it (Appendix 7, 4.4.2).',
        'Keep ' + name + ' certificated, examined and maintained, and tell the Certifying Authority before modifying the vessel.',
        'Use only suitably qualified and medically fit Masters and crew; check certificates and keep the crew records up to date.',
        'Make sure risk assessments and procedures are completed, explained to the crew and reviewed.',
        'Appoint the person ashore, keep the shoreside emergency plan current and agree check-in times (Part 7).',
        'Make statutory accident reports and investigate incidents (Part 8).',
        'Put the cyber security measures in place (Part 10).',
        'Support any Master’s decision to delay, divert or cancel a trip for safety reasons, without penalty.'
      ]) +
      '<h3>2.2 Master (skipper)</h3><p>The Master is responsible for the safety of ' + name + ' and everyone on board, and for putting this SMS into practice on board (Appendix 7, 4.2.2). The Master shall:</p>' +
      ul([
        'Operate within the vessel’s certificate and the operating limits in Section 5.2.',
        'Plan each passage and check weather, tides, sea state, visibility and landing conditions.',
        'Complete the pre-departure checks (Annex B1), including the steering and engine tests.',
        'Make sure the safety briefings are given (Section 5.9).',
        'Keep passenger numbers within ' + paxTxt + ' and total persons within ' + totalTxt + '.',
        'Set a speed that is safe for the sea state and the people on board' + (planing ? ' (Section 3.3)' : '') + '.',
        'Keep a proper lookout and watch (Code 28.7).',
        'Manage hours of rest (Section 4.4).',
        'Report defects, incidents and near misses, and keep the vessel’s records.',
        'Lead drills and the response to any emergency.'
      ]) +
      '<div class="qs-box"><strong>Statement of the Master’s overriding authority.</strong> ' + co + ' confirms that the Master of ' + name + ' has overriding authority and responsibility at all times to make decisions about the safety of the vessel, the persons on board and the prevention of pollution, and to ask for the owner / operator’s help as may be necessary. The Master may refuse to sail, delay, divert, slow down, stop boarding or landing, refuse to carry any person, return to harbour or call for assistance. The owner / operator will support every such decision, and no Master will be penalised for a decision made in good faith on safety grounds. (Appendix 7, 4.2.1 and 4.4.3)</div>' +
      '<h3>2.3 Crew</h3>' +
      ul([
        'Take care of their own safety and that of anyone affected by what they do or fail to do (Appendix 7, 4.3.1).',
        'Follow the Master’s instructions and these procedures; know their emergency duties (Section 6.1).',
        'Help passengers when boarding, underway and landing; keep a lookout when asked.',
        'Wear a lifejacket on deck and any other protective equipment required.',
        'Report defects, hazards, incidents and near misses, and stop any task they believe is unsafe.'
      ]) +
      '<h3>2.4 Person ashore</h3><p>See Part 7 – Shoreside emergency plan.</p>' +
      '<h3>2.5 Passengers</h3><p>Passengers are told at booking and in the safety briefing to follow crew instructions, stay ' + seated + ' while underway, wear lifejackets when told to, keep clear of controls and equipment, and tell the crew about any medical condition or mobility need that may affect their safety.</p>');

    // ── Part 3 ──
    var risks = [
      planing ? ['High-speed / planing operation – passenger injury from slamming (back, neck)', '4×5=20', 'See Section 3.3 (Code 25.7.2). Speed matched to sea state; passengers ' + seated + ' and briefed on bracing; forward seats managed; Master experienced in the vessel.', '2×5=10'] : null,
      planing ? ['Whole-body vibration and shock – crew', '3×4=12', 'Speed management; suitable seating; rotation at the helm where possible; MGN 436 guidance followed (Code 25.7.1).', '2×3=6'] : null,
      ['Boarding and landing – slips, falls between vessel and pier or pontoon, crushing', '3×4=12', 'Landing assessed first (Section 5.3); crew help every passenger; boarding only when the vessel is secure and on instruction; non-slip surfaces; transfers stopped in swell.', '2×4=8'],
      ['Person overboard', '2×5=10', (open ? 'Lifejackets worn by everyone on board; ' : 'Passengers kept ' + seated + ' underway; lifejackets worn on deck; ') + 'man-overboard procedure and drills; means of recovery carried and practised (Code 14.7).', '1×5=5'],
      ['Fire (engine, fuel, electrical' + (yes('gas') ? ', gas' : '') + ')', '2×5=10', 'Planned engine maintenance; fuel system inspection; extinguishers serviced; fire drills; firefighting training (Code 28.10)' + (yes('gas') ? '; gas system inspected, gas isolated when not in use' : '') + '.', '1×5=5'],
      cabin ? ['Evacuation from the cabin (fire, capsize, flooding)', '2×5=10', 'Passengers shown the exits; exits kept clear; lifejackets for all; abandon-ship drill.', '1×5=5'] : null,
      cabin && a.fuel !== 'electric' ? ['Exhaust fumes / carbon monoxide in the cabin', '2×4=8', 'Exhaust system inspected; ventilation maintained; carbon monoxide alarm.', '1×4=4'] : null,
      ['Collision', '2×5=10', 'Proper lookout; safe speed; navigation lights' + (S('radar') || S('ais') ? '; radar / AIS used' : '') + '; restricted-visibility procedure.', '1×5=5'],
      ['Grounding', '2×5=10', 'Passage planning for each route; up-to-date charts; tidal planning; slow down near hazards.', '1×5=5'],
      ['Bad weather / sea state', '3×4=12', 'Operating limits (Section 5.2); forecast checked; Master’s authority to cancel; refuges known.', '2×4=8'],
      ['Loss of propulsion or steering', '2×4=8', 'Pre-departure steering and engine test; maintenance to makers’ schedule; anchor ready; emergency towing procedure' + (sail ? '; sails available' : '') + '.', '1×4=4'],
      rib ? ['Tube damage / loss of buoyancy', '2×4=8', 'Tubes checked before departure; separate tube compartments; repair kit; flooding procedure.', '1×4=4'] : ['Flooding', '2×5=10', 'Seacocks and hoses inspected; bilge pumps and alarm tested before departure; flooding procedure.', '1×5=5'],
      sail ? ['Sailing hazards – boom, winches, lines under load, going forward', '3×4=12', 'Briefing before sailing; passengers kept clear of the boom and loaded lines; reef early; harness and jackstays in rough weather or at night.', '2×3=6'] : null,
      a.operation === 'dive' || a.operation === 'support' ? ['Divers in the water – propeller injury, lost diver', '2×5=10', 'Engine in neutral / stopped with divers near the stern; dive flag shown; diver count out and in; recall signal agreed; lookout kept.', '1×5=5'] : null,
      wb && a.operation === 'crew' ? ['Personnel transfer at sea – falls, crushing between the vessel and a structure or another vessel', '3×5=15', 'Transfer only on the Master’s word and when the vessel is steady; lifejackets and suitable protective equipment worn; one person at a time with hands free; crew at the transfer point; transfers stopped when swell or movement is too great.', '2×5=10'] : null,
      wb && a.operation === 'tow' ? ['Towing or pushing – girting (capsize by the tow line), line parting, snap-back', '2×5=10', 'Tow point and quick release checked before each tow; tow line tended and kept clear of people; snap-back zones kept clear; speed and course changed gradually; towing within the limits on the certificate.', '1×5=5'] : null,
      wb && a.operation === 'cargo' ? ['Cargo and stores – shifting, overloading, loss of stability', '2×5=10', 'Loads within the maximum on the certificate and the stability information; cargo secured before departure; freeing ports kept clear; weight kept low.', '1×5=5'] : null,
      wb && yes('lifting') ? ['Lifting operations – dropped load, loss of stability', '2×5=10', 'Lifting gear examined and used within its marked safe working load; loads within the stability information; people kept clear of suspended loads; lifting stopped in unsuitable sea states.', '1×5=5'] : null,
      a.operation === 'angling' ? ['Fishing gear – hooks, knives, weights', '3×2=6', 'Briefing on casting and handling; first-aid kit; deck kept tidy.', '2×2=4'] : null,
      ['Passenger medical emergency / seasickness', '3×3=9', 'Medical questions at booking and briefing; first-aid trained crew; first-aid kit; evacuation through the Coastguard.', '2×3=6'],
      workers ? ['People more likely to be injured by the work – existing injuries, reduced mobility, inexperience afloat (Code 3.13.3)', '3×4=12', 'Ask before the job; lifejackets that fit; seating chosen with care; extra help from crew; Master may decline to carry' + (planing ? ' at high speed' : '') + '.', '2×3=6'] :
      ['Passengers more likely to be injured – children, older people, reduced mobility, pregnancy (Code 3.13.3)', '3×4=12', 'Ask at booking; suitable lifejackets including child sizes; seating chosen with care; extra help from crew; Master may decline to carry' + (planing ? ' at high speed' : '') + '.', '2×3=6'],
      ['Violent or disruptive passenger', '2×4=8', 'Refuse boarding to intoxicated or aggressive people; violent-act procedure (6.6).', '1×4=4'],
      a.fuel === 'electric' ? ['Battery fire or electrical fault', '2×5=10', 'Charging to the maker’s instructions; battery monitoring; isolators known; suitable extinguisher.', '1×5=5']
        : ['Refuelling – spill, fire', a.fuel === 'petrol' ? '3×4=12' : '2×4=8', 'Refuelling procedure (5.6); no passengers on board; spill kit' + (a.fuel === 'petrol' ? '; petrol vapour ventilated before starting' : '') + '.', '1×3=3'],
      ['Mooring – rope injuries, crushing', '2×3=6', 'Familiarisation; clear communication; no hands or feet between the hull and a pier.', '1×3=3'],
      ['Crew fatigue', '2×4=8', 'Hours of rest (Section 4.4); sensible rosters.', '1×4=4'],
      yes('night') ? ['Night operation', '3×4=12', 'Lower limits at night (5.2); navigation lights checked; reduced speed; torches and lifejacket lights.', '2×3=6'] : null,
      single ? ['Single-handed operation – Master incapacitated or overboard', '2×5=10', 'Kill cord / engine cut-out worn; lifejacket with beacon where carried; a second person briefed before every trip (5.9); check-ins with the person ashore.', '1×5=5'] : null,
      ['Shore side – slipways, pontoons, waiting areas', '3×3=9', 'Landing places inspected; passengers escorted; lighting for landings in the dark.', '2×3=6'],
      ['Manual handling – luggage, stores, equipment', '3×2=6', 'Two-person lifts for heavy items; stowage secured.', '2×2=4'],
      ['Cyber attack / loss of electronic systems', '2×4=8', 'Cyber measures (Part 10); back-up navigation and communications.', '1×3=3'],
      ['Pollution – fuel or oil', '2×3=6', 'Bilge checks; absorbents; no oily bilge discharge; spill response (6.13).', '1×3=3']
    ];
    P('Part 3 – Risk Assessment',
      '<h3>3.1 Method</h3>' +
      '<p>Risk assessments identify the risks to people, the vessel and the environment, and their results shape the safe ways of working in this SMS (Appendix 7, 3.1; Code 3.13). Each hazard is scored for likelihood (L) and severity (S) from 1 to 5; risk = L × S. A score of 15 or more is high and the activity does not go ahead until further controls bring it down. 8 to 14 is medium and needs active management. 7 or less is low.</p>' +
      '<p>Risk assessments are reviewed every year, after any incident, and whenever the area category, use of the vessel or its equipment changes (Code 3.13.2). The risk assessment is shown to the Certifying Authority before the certificate is issued or renewed (Code 3.13.1).</p>' +
      '<h3>3.2 Risk register – ' + name + '</h3>' +
      '<p class="qs-note">These are starting scores for a boat and operation like yours. Check each line against your own experience and change anything that does not fit.</p>' +
      table(['Hazard', 'Before controls', 'Controls', 'After controls'], risks) +
      (planing ?
        '<h3>3.3 High-speed / planing operation (Code 25.7.2)</h3>' +
        (wb ? '<p>' + name + ' operates at high speed or in planing mode. §§25.4.2 requires a risk assessment for all such operations. Everyone on board has an individual inboard seat that lets them brace and gives lateral support (§§25.4.3), and stays seated unless moving about for a specific purpose (§§25.4.4)' + (rib ? '; nobody sits on the tubes or the gunwale (§§25.4.5)' : '') + '.</p>' : '<p>' + name + ' carries passengers at planing speed. Code 25.7.2 requires a risk assessment covering at least the items below, set out in the SMS. The certificate notes that passengers are carried at high speed and the minimum number of crew (Code 25.7).</p>') +
        table([wb ? 'What is assessed' : '25.7.2 item', 'How ' + name + ' manages it'], [
          ['.1 Suitable speeds for the sea state, weather and light', 'The Master sets the speed so the boat does not fall off waves or slam, and slows down whenever any passenger is uncomfortable. In rough water: displacement speed only, or do not sail.' + (yes('night') ? ' At night or in poor visibility, speed is reduced so the boat can stop within the distance that can be seen.' : '')],
          ['.2 Passengers’ physical ability to cope with the forces', 'Questions at booking and before boarding about back or neck problems, recent surgery, pregnancy, osteoporosis and mobility. Higher-risk passengers are seated aft and the trip run at reduced speed, or the Master declines to carry them.'],
          ['.3 Passengers’ ability to brace in the seating provided', 'Everyone ' + seated + ' while underway; standing' + (open ? ' away from a seat' : '') + ' is not allowed. The briefing shows the correct bracing position and use of handholds.'],
          ['.4 Suitability and fit of lifejackets', (open ? 'Lifejackets worn by everyone on board. ' : 'Lifejackets at hand and put on when instructed. ') + 'Sizes for adults and children; crew check the fit before departure.'],
          ['.5 Handholds and foot placements', 'Handholds within reach of every seat and secure footing, checked before departure.'],
          ['.6 Passengers in the forward third of the boat', a.fwdSeats === 'none' ? 'No passengers are seated in the forward third of the boat at planing speed.'
            : a.fwdSeats === 'slow' ? 'Forward seats are used only by fit adults who have been told the ride is harder there. Speed is reduced whenever the forward seats are occupied, and nobody at higher risk (item .2) sits forward.'
            : a.fwdSeats === 'all' ? 'All seats may be used. Passengers at higher risk (item .2), children and older passengers are seated aft. Those seated forward are told the ride is harder there and shown how to brace; the Master slows down in any sea that causes slamming.'
            : need('', 'Where passengers sit at speed', 1)]
        ]) +
        '<p>The Merchant Shipping and Fishing Vessels (Control of Vibration at Work) Regulations 2007 and MGN 436 apply to crew exposure (Code 25.7.1).</p>' : ''));

    // ── Part 4 ──
    P('Part 4 – Training and Qualifications',
      '<h3>4.1 Manning and qualifications</h3>' +
      '<p>' + name + ' is manned in line with Section 28 and Appendix 5 of the Code and her certificate. The Master and anyone in charge of a navigational watch holds an appropriate certificate (Code 28.7.2). Certificates, expiry dates and reminders for every Master and crew member are kept in CodedOK under Crew.</p>' +
      table(['Requirement', 'Who', 'Code'], [
        ['Certificate of competency suitable for ' + areaTxt, 'Master', '28.7, Appendix 5'],
        ['Medical fitness certificate', 'Master and crew as Appendix 5 requires', 'Appendix 5'],
        ['Radio operator’s certificate', 'Master', 'Appendix 5'],
        ['First aid', 'Master, and crew as Appendix 5 requires', 'Appendix 5'],
        ['Sea survival', 'Master, and crew as Appendix 5 requires', 'Appendix 5'],
        ['Firefighting course (MCA-approved one-day course or STCW Fire Prevention and Fire Fighting)', wb && Number(v.length) >= 15 ? 'All crew' : 'Master or at least one crew member', '28.10.2'],
        ['Familiarisation with this vessel’s firefighting equipment', 'Everyone', '28.10.1'],
        planing ? ['High-speed handling – competent and experienced in this vessel', 'Master', '25.7'] : null
      ]) +
      '<h3>4.2 Familiarisation before first working on ' + name + '</h3><p>Before working on board for the first time, every Master and crew member completes familiarisation, recorded on Annex B4 (Appendix 7, 5.2). It covers at least:</p>' +
      ul([
        'Emergency drills and man-overboard recovery, including the vessel’s recovery equipment (Code 14.7).',
        'Mooring and unmooring.',
        yes('liferaft') ? 'Launching the liferaft (Code 14.2, 14.8).' : 'Survival equipment carried and how it is used (Code 14.2, 14.8).',
        'Evacuation from all areas of the vessel.',
        'Putting on lifejackets, including helping passengers and children (Code 14.4).',
        'Use of the fire extinguishers' + (yes('fixedFire') ? ' and the fixed fire system' : '') + ' (Code 16).',
        'Steering and engine controls, engine stops and fuel shut-offs' + (rib || single ? ', and the kill cord' : '') + '.',
        'Radio, distress alerting and navigation equipment.',
        'This SMS: the policy, reporting, the Master’s authority and the alcohol and drugs policy.'
      ]) +
      '<h3>4.3 Training manual</h3><p>The vessel’s training manual is kept at the steering position (Code 14.8.1) and includes the makers’ instructions for the life-saving equipment.</p>' +
      '<h3>4.4 Hours of rest and fatigue</h3><p>' + name + ' is manned so that excessive hours are not needed (Code 28.6.2). Minimum rest for anyone employed on board is 10 hours in any 24-hour period and 77 hours in any seven days, in no more than two periods, one of at least 6 hours (Code 28.6.3–28.6.4). Exceptions are allowed only when agreed between Master and crew and when health and safety are not put at risk (Code 28.6.5).</p>');

    // ── Part 5 ──
    var wind = a.limWind ? 'Beaufort ' + esc(a.limWind) : need('', 'Wind limit with passengers', 5);
    var wave = a.limWave ? esc(a.limWave) + ' m' : need('', 'Wave height limit with passengers', 5);
    var vis = a.limVis ? esc(a.limVis) + ' mile' + (a.limVis === '1' || Number(a.limVis) < 1 ? '' : 's') : need('', 'Visibility limit', 5);
    var comms = [yes('vhfFixed') ? 'fixed VHF / DSC radio' : '', yes('vhfHandheld') ? 'handheld VHF' : '', 'mobile phone ' + need(a.mobile, 'Mobile carried on the boat', 4), yes('beacon') ? 'EPIRB / personal locator beacon' : ''].filter(Boolean).join('; ');
    P('Part 5 – Vessel Standard Operating Procedures',
      '<p>These procedures meet Appendix 7, 6.1. The Master may depart from a procedure only where needed for safety, and records and reports the reason.</p>' +
      '<h3>5.1 Pre-departure checks (including steering test)</h3><p>Before the first trip of each day, and before each passage after the boat has been left unattended, the Master or a competent crew member completes the pre-departure checklist (Annex B1). Steering is tested from hard over to hard over and the engine(s) run and tested ahead and astern before letting go. Any defect affecting safety is assessed under Section 9.3 before departure.</p>' +
      '<h3>5.2 Navigation and handling</h3><p><strong>Operating limits.</strong> Our limits with passengers on board are equal to or lower than the certificate limits. The Master may set lower limits on the day and is never obliged to sail because conditions are within the limits.</p>' +
      table(['', 'Certificate limit', 'Our limit with passengers', 'Action at the limit'], [
        ['Area', cert ? esc(cert[0]) : areaTxt, 'Our usual routes (see Introduction)', 'No trip outside the usual routes without the owner’s agreement'],
        ['Wind', cert ? 'Beaufort ' + esc(cert[1].toLowerCase()) + ' (Table 3.10.2)' : '–', wind, 'Cancel or delay'],
        ['Wave height', cert ? esc(cert[2]) + ' (Table 3.10.2)' : '–', wave, 'Cancel or slow down'],
        ['Visibility', '–', vis, 'Delay, or proceed slowly'],
        ['Daylight', /cat[46]/.test(area) ? 'Daylight only' : '–', yes('night') ? 'Night trips allowed at reduced speed' : 'Daylight only', yes('night') ? 'Cancel if in doubt' : 'Return before dark'],
        ['Persons on board', totalTxt, paxTxt + ' passengers + ' + (crewMax || '…') + ' crew', 'Never exceeded']
      ]) +
      '<p class="qs-note">Your certificate may set tighter limits than the Code’s table (Code 3.10.3). If it does, the certificate wins.</p>' +
      '<p><strong>Passage planning.</strong> Before each trip the Master checks the forecast, tides, navigational warnings and harbour notices, and thinks about the passengers being carried. A plan exists for each regular route: hazards, tidal streams, refuges and check-in points.</p><p><strong>Underway.</strong></p>' +
      ul([
        'Keep a proper lookout by sight, hearing and all available means; electronics assist but never replace the lookout.',
        'Proceed at a safe speed for visibility, traffic, sea state and the people on board.',
        'Monitor position continuously; slow down in confined or poorly charted water.',
        yes('vhfFixed') || yes('vhfHandheld') ? 'Keep a listening watch on VHF Channel 16; make check-in calls to the person ashore (5.8).' : 'Make check-in calls to the person ashore (5.8).',
        'In poor visibility: slow down, sound signals, extra lookout; divert or delay if safe navigation cannot be assured.',
        'Approach landing places slowly, judging wind, tide, swell and wash, and abort if the boat cannot be controlled safely alongside.',
        rib || single ? 'The helm wears the kill cord whenever the engine is running.' : '',
        sail ? 'Reef early; keep passengers clear of the boom, winches and loaded lines.' : ''
      ]) +
      '<h3>5.3 Passenger boarding and landing</h3>' +
      ul(['The Master assesses the landing place for swell, wash, tide height, surface and lighting before passengers move.', 'The boat is secured or held in position under full control before anyone boards or lands.', 'Passengers move one at a time, only on instruction, with a crew member giving a hand at the transfer point.', 'Children, older passengers and those with reduced mobility are helped individually; bags are passed across separately.', 'Nobody puts any part of their body between the boat and a fixed structure.', 'Passengers are counted on boarding and on landing.', 'Boarding or landing stops if movement makes it unsafe.']) +
      '<h3>5.4 Loading and stability</h3>' +
      ul(['Maximum ' + paxTxt + ' passengers and ' + totalTxt + ' persons in total – never exceeded.', 'Passengers ' + seated + ' while underway; bags and stores secured so they cannot shift or block exits.', 'Weight spread evenly; heavy items kept low.', 'Fuel, water and stores within the loaded condition assessed for the boat’s stability.', rib ? 'Tube pressures checked – soft tubes reduce reserve buoyancy and stability.' : '']) +
      '<h3>5.5 Watertight and weathertight integrity</h3>' +
      ul([hatch.charAt(0).toUpperCase() + hatch.slice(1) + ' closed and secured underway.', 'Bilges dry; bilge pumps' + (cabin ? ' and alarm' : '') + ' tested before departure.', 'Seacocks and through-hull fittings inspected at the intervals in Part 9.', rib ? 'Tubes and tube compartments checked for damage and pressure.' : '', 'Any water coming in is investigated before continuing in service.']) +
      '<h3>5.6 Refuelling</h3>' +
      (a.fuel === 'electric' ? ul(['Charge only from a suitable supply, to the maker’s instructions, with cables in good condition.', 'Do not leave charging unattended unless the system is designed for it.', 'No passengers on board during connection and disconnection.']) :
        ul(['Refuel only at a proper fuel berth or from an approved container, with no passengers on board.', 'Engines stopped; no smoking or naked flames; electrical equipment not needed switched off.', 'Spill kit at hand and absorbent around the filler.', 'Check it is the right fuel (' + fuelTxt + ') and the right tank; do not overfill.', a.fuel === 'petrol' ? 'Petrol: ventilate the engine space and check for vapour before starting.' : '', 'Close the filler, wipe up drips and check for leaks before starting the engines.', 'Report any spill under Section 6.13.'])) +
      '<h3>5.7 Conduct of passengers and crew</h3>' +
      ul(['Crew follow the alcohol and drugs policy (1.4) and wear lifejackets on deck.', 'Passengers stay ' + seated + ' while underway and follow crew instructions.', 'No smoking or vaping on board.', 'The Master may refuse to carry, or land at the nearest safe place, any passenger whose behaviour endangers others.']) +
      '<h3>5.8 Communications and shore check-in</h3>' +
      ul(['Carried on board: ' + comms + '.', 'Before each trip the Master tells the person ashore: departure time, route, number of persons on board and expected return.', 'Check in on return to base' + (a.operation === 'transfer' ? ' and on arrival at each landing place' : '') + '.', 'A means of communication is available at all times, including in an emergency, to reach the emergency services through a shore base (Appendix 7, 7.3).', 'If communications are lost: use the back-up; if contact cannot be made, return to base or the nearest harbour and report.']) +
      '<h3>5.9 Safety briefings</h3><p><strong>Briefing for everyone on board (Appendix 7, 6.2.1).</strong> Before every voyage the Master makes sure everyone is briefed on at least:</p>' +
      ul(['Where lifejackets, thermal protective aids and lifebuoys are kept and how to use them, including fitting children’s lifejackets.', 'What to do in an emergency, including the alarm and where to gather.', 'Staying ' + seated + ' while underway' + (planing ? ', and how to brace at speed (Section 3.3)' : '') + '.', 'Where the first-aid kit and fire extinguishers are.', 'Telling the crew about any medical condition, medication or seasickness.']) +
      '<p><strong>Briefing for a second person (Appendix 7, 6.2.2).</strong> In addition, the Master briefs at least one other person on board' + (single ? ' – when operating single-handed, a suitable passenger –' : '') + ' on:</p>' +
      ul([yes('liferaft') ? 'Where the liferaft is and how to launch it.' : 'Where the survival equipment is and how to use it.', 'How to recover a person from the sea.', 'Where the flares are and how to use them.', 'How to use the radios, including sending a distress alert and Mayday.', 'Where the navigation and other light switches are.', 'Where the firefighting equipment is and how to use it.', 'How to start, stop and control the engine(s).', 'How to navigate to a suitable port of refuge.', 'Where the stability booklet is kept, where provided.']) +
      '<p>A safety card covering these items is kept on board. Safety cards are an acceptable way to give this information.</p>' +
      '<h3>5.10 Emergency towing</h3>' +
      ul(['<strong>Being towed.</strong> Agree the method, towline, speed and communications before connecting. Use the designated strong point, never a fitting not rated for towing. Keep everyone clear of the towline. Tow slowly and be ready to release.', '<strong>Towing another vessel in an emergency.</strong> Only when it is safe and within the capability of ' + name + ' and her crew; think of the passengers first. Keep the line clear of the propeller(s) and have a knife ready. Tell the Coastguard and the person ashore.']) +
      '<h3>5.11 Maintenance routines</h3><p>See Part 9.</p>');

    // ── Part 6 ──
    var mayday = yes('vhfFixed') || yes('vhfHandheld') ? 'VHF Channel 16 / DSC distress, or dial 999 / 112 and ask for the Coastguard' : 'Dial 999 / 112 and ask for the Coastguard';
    P('Part 6 – Vessel Emergency Procedures',
      '<p>Everyone on board understands these procedures (Appendix 7, 7.1). In every emergency the priorities are: protect life; control the vessel; stop the situation getting worse; call for help early; protect the environment; tell the owner / operator.</p>' +
      '<p><strong>HM Coastguard:</strong> ' + mayday + '.</p>' +
      '<h3>6.1 Emergency roles (Appendix 7, 7.2)</h3>' +
      table(['Emergency', 'Master', single ? 'Briefed second person (5.9)' : 'Crew member'], [
        ['Fire', 'Command; keep the fire downwind; stop engines and fuel if an engine fire; Mayday', 'Fight the fire with an extinguisher if safe; move passengers clear, in lifejackets'],
        ['Flooding' + (rib ? ' / tube damage' : ''), 'Command; find the source; slow down; Mayday or Pan-Pan', 'Bilge pumps; stem the leak; passengers in lifejackets'],
        ['Person overboard', 'Manoeuvre; distress alert', 'Shout, point and never lose sight; throw lifebuoy; prepare recovery'],
        ['Abandon ship', 'Mayday; order abandon; last to leave', (yes('liferaft') ? 'Launch liferaft; ' : '') + 'help passengers; take grab bag'],
        ['Medical', 'Head for help; call the Coastguard for advice', 'First aid; reassure']
      ]) +
      (single ? '<p class="qs-note">When operating single-handed the Master carries out all Master duties and directs the briefed second person (Appendix 7, 12.1).</p>' : '') +
      '<h3>6.2 Fire</h3>' + ol(['Raise the alarm.', 'Find the source. Engine fire: stop the engine(s), shut off the fuel' + (yes('fixedFire') ? ', do not open the engine space – discharge the fixed system' : ', do not open the engine cover fully – use the extinguisher through the smallest opening') + '.', 'Electrical fire: isolate the power and use the correct extinguisher.' + (yes('gas') ? ' Gas: shut off at the bottle.' : ''), 'Move passengers away from the fire and into lifejackets; keep exits clear.', 'Manoeuvre to put the fire downwind.', 'Pan-Pan or Mayday' + (yes('liferaft') ? '; prepare the liferaft' : '') + '.', 'If not under control within a minute or two, abandon ship (6.10).', 'Afterwards: no return to service until the cause is found and the boat inspected.']) +
      '<h3>6.3 Flooding' + (rib ? ' or tube damage' : '') + '</h3>' + ol(['Raise the alarm; slow down.', 'Start the bilge pumps; find the source (seacocks, hoses, hull damage, stern gear).', 'Stem the leak – close the seacock, use a bung or whatever is to hand.', 'Passengers into lifejackets; move weight to lift the damage clear.', rib ? 'Tube damage: slow down, use the repair kit, keep the other compartments inflated.' : '', 'Pan-Pan or Mayday; head for the nearest shelter; prepare to abandon.']) +
      '<h3>6.4 Collision</h3>' + ol(['Stop; check for injuries and account for everyone.', 'Check for flooding and damage – follow 6.3 if taking water.', 'Do not pull clear of the other vessel if that may cause flooding.', 'Offer and ask for help; exchange details; tell the Coastguard.', 'Report under Part 8.']) +
      '<h3>6.5 Grounding</h3>' + ol(['Stop the engine(s); do not try to drive off.', 'Check for injuries, flooding and damage to the hull' + (rib ? ', tubes' : '') + ' and propulsion.', 'Assess the tide (rising or falling), weather and exposure.', 'Tell the Coastguard if there is any risk; passengers in lifejackets.', 'Refloat only when sure the boat is sound.', 'Afterwards: inspect the boat out of the water before returning to service; report under Part 8.']) +
      '<h3>6.6 Violent act</h3>' + ol(['The Master keeps control of the boat and the radio; do not confront an aggressor unless needed to protect life.', 'Calm the situation; separate the person from others.', 'Head for the nearest safe landing; call the Coastguard or 999 and ask for the Police to meet the boat.', 'Record names, times and events.', 'Report to the owner / operator.']) +
      '<h3>6.7 Loss of main propulsion</h3>' + ol(['Check position, drift and immediate dangers; warn other traffic.', /2|twin|two/i.test(a.engines || '') ? 'One engine lost: continue on the other at reduced speed to the nearest safe harbour.' : '', sail ? 'Use the sails if conditions allow.' : '', 'Anchor if safe; check fuel, filters, cooling, controls' + (rib || single ? ', kill cord' : '') + '.', 'If drifting towards danger: Pan-Pan or Mayday; arrange a tow (5.10).', 'Keep passengers seated and informed.']) +
      '<h3>6.8 Steering failure</h3>' + ol(['Stop or slow down; warn other traffic.', 'Change to the emergency steering arrangement' + (/2|twin|two/i.test(a.engines || '') ? ', or steer with the engines' : '') + '.', 'If control cannot be held: anchor or call for a tow; Pan-Pan.']) +
      '<h3>6.9 Man overboard</h3>' + ol(['Shout “Man overboard”, point and never lose sight; throw the lifebuoy.', S('plotter') ? 'Press MOB on the plotter; note the position.' : 'Note the position and time.', 'The Master manoeuvres back, with the propeller(s) stopped or in neutral close to the person.', 'Recover using the vessel’s recovery equipment (Code 14.7).', 'Treat for cold shock and hypothermia; keep the person lying down where possible.', 'If not recovered within two minutes, or lost from sight: Mayday immediately.']) +
      '<h3>6.10 Abandon ship</h3>' + ol(['Mayday and distress alert.', 'Everyone in lifejackets and warm clothing; take the grab bag' + (yes('vhfHandheld') ? ', handheld VHF' : '') + ' and flares.', yes('liferaft') ? 'Launch the liferaft on the sheltered side; secure the painter; board passengers one at a time with help.' : 'Stay with the boat if it is afloat – it is easier to find than a person in the water. Keep everyone together.', 'The Master is last to leave.', 'Stay together and await rescue.']) +
      '<h3>6.11 Medical emergency</h3>' + ol(['Give first aid; call the Coastguard for medical advice.', 'Head for the landing place agreed with the Coastguard to meet an ambulance.', 'Record the incident.']) +
      '<h3>6.12 Aid to other vessels</h3>' + ol(['The Master has a duty to help people in distress at sea, so far as it can be done without serious danger to ' + name + ' and those on board.', 'Tell the Coastguard and act under their coordination.', 'Think of the passengers on board – the Coastguard may release ' + name + ' if other help is available.', 'Record what was done.']) +
      '<h3>6.13 Pollution</h3>' + ol(['Stop the source if safe; contain with absorbents.', 'Report spills to the Coastguard and harbour authority.', 'Land contaminated material ashore for proper disposal.']) +
      '<h3>6.14 Enclosed spaces</h3><p>' + name + ' has no enclosed spaces that crew are required to enter, so enclosed-space rescue (Appendix 7, 7.1.11) does not apply. Nobody enters a space with poor ventilation' + (yes('fixedFire') ? ', or after the fixed fire system has been discharged,' : '') + ' until it has been ventilated. If this changes, a procedure will be added.</p>' +
      '<h3>6.15 Drills and exercises</h3><p>Exercises in these emergencies and in evacuation are carried out and recorded, with the names of everyone who took part (Appendix 7, 7.5), using Annex B2. Where possible everyone, ashore and on board, takes part (Appendix 7, 7.6). The Code leaves the frequency to the owner / operator; ours is:</p>' +
      table(['Drill', 'How often'], [
        ['Man overboard (including recovery)', 'Monthly in the operating season'],
        ['Fire', 'Monthly in the operating season'],
        ['Abandon ship / evacuation' + (yes('liferaft') ? ' and liferaft familiarisation' : ''), 'Every 3 months'],
        ['Flooding' + (rib ? ' / tube damage' : ''), 'Every 3 months'],
        ['Loss of propulsion or steering, and towing', 'Every 3 months'],
        ['Shoreside emergency plan (with the person ashore)', 'Once a year'],
        ['New crew member – all drills', 'Before their first trip with passengers']
      ]));

    // ── Part 7 ──
    P('Part 7 – Shoreside Emergency Plan and Person Ashore',
      '<p>Required by Appendix 7, 4.7. The person ashore carries out this plan and liaises with the Master, shore authorities and the emergency services.</p>' +
      '<h3>7.1 Designated person ashore</h3>' +
      kv([['Person ashore', ashore + ' – ' + ashoreTel], a.deputyName ? ['Stand-in', esc(a.deputyName) + (a.deputyPhone ? ' – ' + esc(a.deputyPhone) : '')] : null, ['Competence', 'Briefed on this plan and on how ' + name + ' operates; holds a copy of this Part with current contact numbers (Appendix 7, 4.7.2, 4.7.4)']]) +
      '<p>The Master and the person ashore are in contact at the start and end of each trip (Appendix 7, 4.7.5).</p>' +
      '<h3>7.2 What the person ashore holds</h3>' + ul(['Vessel name and description: ' + name + ', ' + boatDesc + '.', 'The plan for the day: routes and expected return times.', 'Number of persons on board for each trip.', 'The Master’s mobile number: ' + need(a.mobile, 'Mobile carried on the boat', 4) + '.', 'The contact numbers in 7.5.']) +
      '<h3>7.3 Overdue vessel</h3>' + ol(['Check-in missed by 15 minutes: call the Master’s mobile.', 'No contact after 30 minutes: call 999, ask for the Coastguard, and give the vessel details, route, last known position and number of persons on board.', 'Tell the owner / operator.', 'Stay by the phone, keep a note of calls and follow the Coastguard’s instructions.']) +
      '<h3>7.4 On receiving an emergency call from the vessel</h3>' + ol(['Write down the time, position, what has happened, persons on board and injuries.', 'Make sure the Coastguard has been told.', 'Tell the owner / operator; arrange to meet the boat.', 'Refer any press enquiries to the owner / operator.']) +
      '<h3>7.5 Emergency contacts</h3>' +
      table(['Contact', 'Number'], [
        ['HM Coastguard', '999 / 112' + (yes('vhfFixed') || yes('vhfHandheld') ? ' – VHF Channel 16' : '')],
        ['Owner / operator', hs + ' – ' + need(a.hsPhone, 'Phone for the person responsible for health and safety', 3)],
        ['Person ashore', ashore + ' – ' + ashoreTel],
        ['Harbour master – base', need(a.harbour, 'Harbour master', 6)],
        ['MAIB (24 hours)', '+44 (0)23 8023 2527'],
        ['Certifying Authority', need(a.ca, 'Certifying Authority', 6)],
        ['Engineer / service agent', need(a.engineer, 'Engineer / service agent', 6)],
        ['Insurer', need(a.insurer, 'Insurer', 6)]
      ]));

    // ── Part 8 ──
    P('Part 8 – Reporting of Accidents',
      '<h3>8.1 Internal reporting</h3><p>All accidents, incidents and near misses are recorded and reported to the owner / operator, who puts corrective action in place (Appendix 7, 8.3). Reports are used to learn, not to blame.</p>' +
      ol(['Make the situation safe.', 'Tell the Master at once.', 'The Master tells the owner / operator as soon as practicable – immediately for anything reportable under 8.2.', 'Complete the incident / near-miss report (Annex B3) within 24 hours.', 'The owner / operator looks into the causes and records what will be done to stop it happening again.']) +
      '<h3>8.2 External reporting</h3><p>Accidents are reported to the Administration (Appendix 7, 8.2):</p>' +
      ul(['<strong>MAIB</strong> – report marine accidents by the quickest means on +44 (0)23 8023 2527 (24 hours), under the Merchant Shipping (Accident Reporting and Investigation) Regulations 2012 (Code 3.6.1; see MIN 724).', '<strong>Certifying Authority</strong> – tell them as soon as reasonably practicable about any accident or damage affecting the safety of the vessel (Code 3.6.2).', '<strong>Coastguard / harbour authority</strong> – pollution and dangers to navigation.']) +
      '<p>Responsible for making external reports: ' + hs + '. Evidence (logs, plotter tracks, damaged equipment) is kept, and nothing is done to interfere with an investigation.</p>' +
      '<h3>8.3 Investigation and corrective action</h3><p>The investigation is in proportion to how serious the event was. It considers: what happened; the conditions; the state of the vessel; whether procedures existed, were followed and were good enough; equipment, training, fatigue and communication; and what will prevent it happening again. Each action has an owner and a date.</p>');

    // ── Part 9 ──
    P('Part 9 – Maintenance of the Vessel and Equipment',
      '<p>' + name + ' and her equipment are maintained in line with the makers’ recommendations (Code 3.5; Appendix 7, 9.1). The owner / operator sets the inspection and maintenance intervals below, and all inspections and maintenance are recorded (Appendix 7, 9.2). Service dates, certificates and reminders are kept in CodedOK.</p>' +
      '<h3>9.1 Vessel and machinery</h3>' +
      table(['When', 'What'], [
        ['Before every departure', 'Annex B1 checklist: engine(s), fuel, steering, bilges, ' + (rib ? 'tubes, ' : '') + 'lights, radio, safety equipment'],
        ['Weekly in season', 'Fuel filter / water separator; batteries; hose clips; engine mounts; bilge' + (sail ? '; standing and running rigging' : '')],
        ['To the engine maker’s schedule', need(a.engines, 'Engines', 1) + ' – oil and filters, fuel filters, cooling system, belts, anodes. Engine hours recorded.'],
        ['Monthly', (rib ? 'Tube seams and valves; ' : '') + 'seats, handholds and fixings; through-hull fittings; bilge pumps and switches' + (yes('gas') ? '; gas system and detector' : '')],
        ['Yearly', 'Full engine service by a competent engineer; hull inspection out of the water; seacocks; steering system; towing and lifting points' + (sail ? '; mast and rigging inspection' : '')]
      ]) +
      '<h3>9.2 Safety equipment</h3>' +
      table(['Item', 'Requirement', 'Record'], [
        ['Inflatable lifejackets', 'Serviced every year in line with the maker’s instructions (Code 14.4.9)', 'CodedOK equipment record'],
        yes('liferaft') ? ['Liferaft', 'Serviced at an approved service station at the maker’s interval', 'Service certificate'] : null,
        ['Portable fire extinguishers', 'Serviced by a competent person (Code 16.3.1.7)', 'Service record'],
        yes('fixedFire') ? ['Fixed fire system', 'Serviced to the maker’s schedule', 'Service certificate'] : null,
        yes('beacon') ? ['EPIRB / personal locator beacon', 'Battery expiry checked; self-test monthly; registration current', 'CodedOK equipment record'] : null,
        ['Flares', 'Replaced before expiry; old flares disposed of properly', 'CodedOK equipment record'],
        ['First-aid kit', 'Checked monthly; contents in date', 'CodedOK equipment record'],
        ['Navigation lights, radio and navigation equipment', 'Tested before departure', 'Annex B1']
      ]) +
      '<h3>9.3 Defects and return to service</h3>' +
      table(['Category', 'Examples', 'Action'], [
        ['A – Safety-critical', 'Steering defect; fuel leak; ' + (rib ? 'tube compartment failure; ' : 'water coming in; ') + 'missing or defective life-saving or firefighting equipment', 'The boat does not sail with passengers. Back in service only when fixed and agreed by the owner / operator'],
        ['B – Significant', 'Developing leak; intermittent alarm; unusual vibration', 'Owner / operator told the same day; risk assessed; repair date set'],
        ['C – Routine', 'Cosmetic damage; ordinary wear', 'Recorded and repaired at the next planned maintenance']
      ]));

    // ── Part 10 ──
    var sys = [
      S('plotter') ? ['Chart plotter / GPS', 'Navigation', 'Loss of electronic navigation', 'Paper charts, compass, visual navigation'] : null,
      S('radar') ? ['Radar', 'Navigation', 'Loss of collision avoidance in poor visibility', 'Lookout, reduced speed, sound signals'] : null,
      S('ais') ? ['AIS', 'Navigation', 'Other vessels not shown / wrong positions', 'Lookout, radar where fitted'] : null,
      yes('vhfFixed') ? ['VHF / DSC radio', 'Communications', 'Loss of distress alerting', (yes('vhfHandheld') ? 'Handheld VHF, ' : '') + 'mobile phone'] : null,
      S('engine') ? ['Engine electronics and displays', 'Control', 'Engine shutdown or loss of control', 'Emergency procedures 6.7; anchor'] : null,
      S('phone') ? ['Phone or tablet used for navigation', 'IT', 'Loss of secondary navigation', 'Fixed equipment, paper charts'] : null,
      S('booking') ? ['Booking system and passenger lists', 'IT (ashore)', 'Not knowing who is on board', 'Headcount on boarding; numbers given to the person ashore'] : null,
      S('wifi') ? ['Wi-Fi on board', 'IT', 'Route into other systems', 'Kept separate from navigation equipment; strong password'] : null
    ].filter(Boolean);
    P('Part 10 – Cyber Security Measures',
      '<p>Required by Appendix 7, 10. The measures are in proportion to a single small vessel (10.2) and are available to the Certifying Authority for review.</p>' +
      '<h3>10.1 Systems that would affect operations if disrupted (10.2.1)</h3>' +
      (sys.length ? table(['System', 'Type', 'Effect if disrupted', 'Back-up'], sys) : '<p>' + name + ' does not rely on any electronic system for safe operation.</p>') +
      '<h3>10.2 Who manages it (10.2.2)</h3><p>Cyber security is managed by ' + hs + '. The Master reports any suspected cyber incident at once.</p>' +
      '<h3>10.3 Protection, detection and recovery (10.2.3–10.2.7)</h3>' +
      ul(['Navigation and engine software is updated only from the maker; no unknown USB devices are plugged into navigation equipment.', 'Strong passwords on apps, Wi-Fi and booking systems; default passwords changed.', 'Signs of an attack: position jumps, GPS or AIS oddities, unexplained alarms or messages – cross-check with visual bearings and the chart.', 'If an attack is suspected: switch to back-up navigation, isolate the affected system, tell the person ashore and head for a safe haven (10.6).', 'Routes, waypoints and settings are backed up so equipment can be reset and restored.', 'Any cyber security alert is shown at the steering position (10.4).']) +
      '<h3>10.4 Remote access log (10.5)</h3><p>' + (yes('remote') ? 'A log is kept of the systems that may be accessed remotely and of every occasion of remote access: ' + need('', 'Which systems can be accessed remotely, and where the log is kept', 7) + '.' : 'No system on board can be accessed remotely, so there is nothing to log.') + '</p>' +
      '<h3>10.5 Cyber risk assessment (10.3)</h3><p>The assessment covers IT systems, operating and control systems, remotely operable equipment, communication systems and crew responsibilities in an attack. ' + (yes('remote') ? 'Remote access is the main exposure and is controlled as above. ' : 'With no remote access and the back-ups above, the risk is low. ') + 'It is repeated whenever any of these systems is altered, and at least every five years.</p>');

    // ── Part 11 / 12 / 13 ──
    P('Part 11 – Pollution Prevention',
      ul(['No discharge of oil or oily water; bilges kept clean and absorbent pads used under engines.', 'Used oil, filters and contaminated absorbents landed for proper disposal.', 'All rubbish kept on board and landed ashore.', yes('toilet') ? 'The toilet is not used in harbours or marinas unless it discharges to a holding tank.' : '', a.fuel === 'electric' ? 'Damaged batteries are handled and disposed of to the maker’s instructions.' : 'Refuelling as Section 5.6; spill response as 6.13.']));
    P('Part 12 – Review and Continuous Improvement',
      '<h3>12.1 Review</h3><p>The owner / operator reviews this SMS every year, and in any case at least once every three years (Appendix 7, 11.1), and after any serious incident or significant change. Improvements arising from accidents, incidents, near misses or reviews are put in place at the earliest opportunity (Appendix 7, 11.2).</p>' +
      '<p>Each review looks at: incidents and near misses; defects and breakdowns; maintenance done and overdue; training and qualifications; drills; Certifying Authority findings; and changes in routes, landing places, crew or rules. CodedOK reminds the owner / operator when the review is due and keeps a record of each one.</p>' +
      '<h3>12.2 Document control</h3>' + ul(['The master copy is held by the owner / operator; controlled copies are listed at the front.', 'Each revision is numbered and dated; old copies are removed from the boat.', 'Changes are explained to all Masters and crew, who confirm they have read the new issue (Part 13).']));
    var acks = (doc && doc.acknowledgements) || [];
    P('Part 13 – Approval and Acknowledgement',
      kv([['Approved by', doc && doc.signed_at && signedName ? esc(signedName) : ''], ['Date of issue', doc && doc.signed_at ? esc(fmt(doc.signed_at)) : ''], ['Next review due', doc && doc.review_due_at ? esc(fmt(doc.review_due_at)) : '']]) +
      '<p><strong>Master and crew acknowledgement.</strong> I have read and understood this Safety Management System, including the Master’s overriding authority and the alcohol and drugs policy, and I will comply with it.</p>' +
      table(['Name', 'Date'], acks.length ? acks.map(function (k) { return [esc(k.name), esc(fmt(k.at))]; }) : [['&nbsp;', ''], ['&nbsp;', ''], ['&nbsp;', '']]));

    // ── Annex A ──
    P('Annex A – Code Cross-Reference Statement',
      '<p>This statement is made under Appendix 7, 3.2. ' + co + ' confirms that the risk assessments for all applicable elements of the Sport or Pleasure Vessel Code are included, and that every section of the Code that requires reference to the Safety Management System is covered in this SMS as follows.</p>' +
      table(['Code reference', 'Requirement', 'SMS section'], [
        ['30.2.1.1', 'SMS proportionate to the vessel and operation; shore and sea', 'Introduction; 3.2'],
        ['App 7, 2', 'Health, Safety and Environmental Protection Policy; appointed person; alcohol and drugs policy', 'Part 1'],
        ['App 7, 3; Code 3.13', 'Risk assessments for all operations; persons more likely to be injured', 'Part 3'],
        ['App 7, 4.1–4.4', 'Roles and responsibilities; Master’s overriding authority', 'Part 2'],
        ['App 7, 4.7', 'Person ashore and shoreside emergency plan', 'Part 7'],
        ['App 7, 5; Code 28', 'Training, familiarisation, qualifications, hours of rest', 'Part 4'],
        ['App 7, 6.1', 'Standard operating procedures (all eight items)', 'Part 5'],
        ['App 7, 6.2', 'Safety briefings – everyone, and a second person', '5.9'],
        ['App 7, 7', 'Emergency procedures, roles, communications, drills with names', 'Part 6; 5.8'],
        ['App 7, 8; Code 3.6', 'Reporting of accidents', 'Part 8'],
        ['App 7, 9; Code 3.5', 'Maintenance of the vessel and equipment; records', 'Part 9'],
        ['App 7, 10', 'Cyber security measures; risk assessment; remote access log', 'Part 10'],
        ['App 7, 11', 'Review at least every three years; continuous improvement', 'Part 12'],
        single ? ['App 7, 12', 'Single-handed operation – requirements not applicable and alternatives', 'Introduction; 5.9; 6.1'] : null,
        ['14.4.9', 'Lifejacket servicing', '9.2'],
        ['14.7', 'Recovery of persons from the water', '6.9; 4.2'],
        ['14.8', 'Training manual', '4.3'],
        ['16.3.1.7', 'Portable extinguisher servicing', '9.2'],
        planing ? ['25.7', 'High-speed / planing passenger operation', '3.3'] : null
      ]));

    if (wb) {
      // Appendix 8 does not ask for a cross-reference statement, but the table
      // still shows the surveyor where each element is covered.
      parts[parts.length - 1] = { title: 'Annex A – Code Cross-Reference', html:
        '<p>This table shows where each element of Appendix 8, and the related sections of the Workboat Code, is covered in this SMS.</p>' +
        table(['Code reference', 'Requirement', 'SMS section'], [
          ['31.2.1', 'SMS proportionate to the vessel and operation; shore and sea', 'Introduction'],
          ['App 8, 2', 'Safety and Environmental Protection Policy', 'Part 1'],
          ['App 8, 3; §§3.14', 'Risk assessments for safe working; persons more susceptible to injury', 'Part 3'],
          ['App 8, 4', 'Health and Safety Protection Policy; competent person; alcohol and drugs policy', 'Part 1'],
          ['App 8, 5', 'Responsibilities of the Master and personnel; Master’s authority', 'Part 2'],
          ['App 8, 6', 'Person ashore', 'Part 7'],
          ['App 8, 7; §§28', 'Training and familiarisation', 'Part 4'],
          ['App 8, 8', 'Procedures for safe operation (all eight items)', 'Part 5'],
          ['App 8, 9', 'Safety briefings – everyone, and a second person', '5.9'],
          ['App 8, 10', 'Emergency procedures, roles, communications, exercises recorded with names', 'Part 6; 5.8'],
          ['App 8, 11; §§3.6', 'Reporting of accidents', 'Part 8'],
          ['App 8, 12; §§3.5', 'Maintenance of the vessel and equipment; records', 'Part 9'],
          ['App 8, 13', 'Review at least every three years', 'Part 12'],
          ['31.3', 'Cyber security measures; risk assessment; remote access log', 'Part 10'],
          single ? ['28.2', 'Single-handed operation – only as permitted by the Certifying Authority', 'Introduction; 5.9'] : null,
          ['14.7', 'Recovery of persons from the water', '6.9; 4.2'],
          ['14.8', 'Training manual', '4.3'],
          ['14.11', 'Drills, training and recording of drills', '6.15'],
          planing ? ['25.4', 'High-speed / planing operation', '3.3'] : null
        ]) };
    }

    // ── Annex B ──
    P('Annex B – Forms and Records',
      '<h3>B1 Pre-departure checklist – ' + name + '</h3><p>Date: ________ &nbsp; Master: ________________ &nbsp; Engine hours: ______</p>' +
      table(['Check', '✓ / defect'], checkItems(a, v).map(function (c) { return [esc(c), '']; })) +
      '<h3>B2 Drill / exercise record</h3>' + table(['Date', 'Drill', 'Who took part (names)', 'Lessons / actions'], [['&nbsp;', '', '', ''], ['&nbsp;', '', '', ''], ['&nbsp;', '', '', '']]) +
      '<h3>B3 Incident / near-miss report</h3>' + kv([['Date, time and place', '&nbsp;'], ['People involved', ''], ['What happened', '<br><br>'], ['Injuries or damage', ''], ['Immediate cause', ''], ['What will stop it happening again', '<br>'], ['Reported to (MAIB / Certifying Authority / Coastguard)', ''], ['Completed by', '']]) +
      '<h3>B4 Familiarisation record</h3>' + table(['Name', 'Role', 'Date completed (all items in 4.2)', 'Signed off by'], [['&nbsp;', '', '', ''], ['&nbsp;', '', '', '']]));

    var lg = (doc && doc.sections && doc.sections.quick && doc.sections.quick.logs) || [];
    if (lg.length) {
      var drills = lg.filter(function (l) { return l.kind === 'drill'; });
      var incs = lg.filter(function (l) { return l.kind === 'incident'; });
      var checks = lg.filter(function (l) { return l.kind === 'check'; });
      P('Annex C – Records',
        '<p>Records logged in CodedOK under this SMS, newest first.</p>' +
        '<h3>C1 Drills and exercises (Appendix 7, 7.5)</h3>' +
        (drills.length ? table(['Date', 'Drill', 'Who took part', 'Lessons / actions'], drills.map(function (l) { return [esc(fmt(l.at)), esc(l.label), esc(l.who || '–'), esc(l.notes || '–')]; })) : '<p>None recorded yet.</p>') +
        '<h3>C2 Accidents, incidents and near misses (Appendix 7, 8.3)</h3>' +
        (incs.length ? table(['Date', 'What happened', 'Injury / damage', 'Action to prevent it'], incs.map(function (l) { return [esc(fmt(l.at)) + (l.where ? '<br>' + esc(l.where) : ''), esc(l.what || '–'), esc(l.harm || 'None'), esc(l.action || '–')]; })) : '<p>None recorded.</p>') +
        '<h3>C3 Pre-departure checks</h3>' +
        (checks.length ? '<p>' + checks.length + ' check' + (checks.length === 1 ? '' : 's') + ' recorded. Most recent:</p>' +
          table(['Date', 'Master', 'Persons on board', 'Result'], checks.slice(0, 30).map(function (l) { return [esc(fmt(l.at)), esc(l.by || '–'), esc(l.pob == null ? '–' : l.pob), l.defect ? 'Defect noted: ' + esc(l.defect) : 'All checks passed']; })) : '<p>None recorded yet.</p>'));
    }

    var body = front + parts.map(function (p) { return '<h2>' + esc(p.title) + '</h2>' + p.html; }).join('') +
      '<p class="qs-foot">Prepared with CodedOK from the answers given by the owner / operator. The owner / operator is responsible for making sure this SMS is accurate, put into practice and kept under review. The Certifying Authority reviews it against Appendix 7 (Code 30.1.3).</p>';
    // The risk assessment on its own – the Certifying Authority asks to see it
    // before a certificate is issued or renewed (Code 3.13.1).
    var p3 = parts.filter(function (p) { return p.title.indexOf('Part 3') === 0; })[0];
    var ra =
      '<div class="qs-cover"><div class="qs-cover-co">' + co + '</div><h1>Risk Assessment</h1><div class="qs-cover-v">' + NAME + '</div></div>' +
      kv([
        ['Vessel', name + ' – ' + boatDesc],
        ['Operation', opLabel],
        ['Area category of operation', areaTxt],
        ['Persons on board (maximum)', totalTxt],
        ['Standard applied', wb ? 'MCA Workboat Code Edition 3 – Section 3.14' + (planing ? ' and 25.4' : '') + '; Appendix 8, element 3' : 'MCA Sport or Pleasure Vessel Code 2025 – Section 3.13' + (planing ? ' and 25.7.2' : '') + '; Appendix 7, element 3'],
        ['Assessed by', signedName ? esc(signedName) + ' for ' + co : co],
        ['Issue', 'Issue ' + issue + (doc && doc.signed_at ? ' – approved ' + esc(fmt(doc.signed_at)) : ' – draft for approval')],
        ['Next review', (doc && doc.review_due_at ? esc(fmt(doc.review_due_at)) + ', or sooner ' : 'Every year, or sooner ') + 'after an incident or a change to the area, use or equipment (Code 3.13.2)']
      ]) +
      '<p class="qs-note">This risk assessment forms Part 3 of the Safety Management System for ' + name + '. Section and Part numbers refer to that document.</p>' +
      (p3 ? p3.html : '') +
      '<h3>Sign-off</h3>' +
      table(['', 'Name', 'Signature', 'Date'], [['Owner / operator', signedName ? esc(signedName) : '&nbsp;', '', doc && doc.signed_at ? esc(fmt(doc.signed_at)) : ''], ['Master', '&nbsp;', '', '']]) +
      '<p class="qs-foot">Prepared with CodedOK from the answers given by the owner / operator, who is responsible for checking each line against the boat and how she is used.</p>';
    if (wb) { body = toWorkboat(body, workers); ra = toWorkboat(ra, workers); }
    return { html: body, todo: todo, ra: ra };
  }

  // ───────────────────────── Saving ─────────────────────────

  function findDoc(id) { return (Store.snapshot().sms_documents || []).filter(function (d) { return d.id === id; })[0] || null; }
  function plain(html) { var d = document.createElement('div'); d.innerHTML = html.replace(/<\/(p|h1|h2|h3|li|tr|div)>/g, '$&\n').replace(/<\/t[dh]>/g, ' | '); return (d.textContent || '').replace(/\n{3,}/g, '\n\n').trim(); }

  function saveDoc(st) {
    var v = Store.getVessel(st.vesselId);
    var d = st.docId ? findDoc(st.docId) : null;
    var wasSigned = d && d.status === 'signed';
    if (!d) {
      d = Store.addSmsDocument({ org_id: v.org_id, vessel_id: v.id, type: 'full_sms', status: 'draft', version: 1,
        title: 'Safety Management System – ' + (v.name || 'Vessel') });
    }
    var q = (d.sections && d.sections.quick) || {};
    var patch = { sections: { quick: { answers: st.a, code: isSpv(Store.getVessel(st.vesselId) || {}) ? 'spv2025' : 'wbc3', signed_name: wasSigned ? null : (q.signed_name || null), logs: q.logs || [] } }, updated_at: new Date().toISOString() };
    if (wasSigned) {
      // An approved SMS that changes becomes a new draft issue; the crew
      // read it again (document control, Part 12.2).
      patch.status = 'draft'; patch.version = (d.version || 1) + 1; patch.signed_at = null; patch.review_due_at = null; patch.acknowledgements = [];
    }
    d = Store.updateSmsDocument(d.id, patch) || d;
    var g = generate(st.a, v, d);
    Store.updateSmsDocument(d.id, { body: plain(g.html) });
    if (Store.appendSmsEdit) Store.appendSmsEdit(d.id, { note: wasSigned ? 'Answers changed – new draft issue' : 'Answers saved' });
    try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
    return d;
  }

  // ───────────────────────── Wizard ─────────────────────────

  var W = null; // { docId, vesselId, a, step }

  function overlay(id) {
    var old = document.getElementById(id); if (old) old.remove();
    var el = document.createElement('div'); el.id = id; el.className = 'qs-ov';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    document.body.appendChild(el); return el;
  }
  function closeOv(id) { var el = document.getElementById(id); if (el) el.remove(); }

  function spvVessels() {
    var vs = Store.snapshot().vessels || [];
    if (window.filterByVesselScope && Store.getCurrentUser && Store.getCurrentUser()) vs = filterByVesselScope(vs);
    return vs;
  }

  function start(vesselId, docId, step) {
    var d = docId ? findDoc(docId) : null;
    if (d) { W = { docId: d.id, vesselId: d.vessel_id, a: JSON.parse(JSON.stringify(d.sections.quick.answers)), step: step || 0 }; return renderWizard(); }
    var vs = spvVessels();
    if (!vs.length) {
      var any = (Store.snapshot().vessels || []).length;
      if (window.toast) toast('Add your boat first, then come back.');
      if (!any && window.go) go('s-onboard');
      return;
    }
    var v = vesselId ? Store.getVessel(vesselId) : null;
    if (!v) {
      var active = window.getActiveVesselId ? Store.getVessel(getActiveVesselId()) : null;
      v = active || (vs.length === 1 ? vs[0] : null);
    }
    if (!v) return pickVessel(vs);
    // An SMS already exists for this boat → open it rather than start again.
    var existing = (Store.snapshot().sms_documents || []).filter(function (x) { return isQuick(x) && x.vessel_id === v.id; })[0];
    if (existing) return view(existing.id);
    var a = defaults(v), saved = null;
    try { saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (_) {}
    if (saved && saved.vesselId === v.id && saved.a) { a = saved.a; }
    W = { docId: null, vesselId: v.id, a: a, step: (saved && saved.vesselId === v.id && saved.step) || 0 };
    renderWizard();
  }

  function pickVessel(vs) {
    var el = overlay('qs-wiz');
    el.innerHTML = '<div class="qs-bar"><button type="button" class="qs-x" data-qs="close">Cancel</button><div class="qs-bar-t">Quick SMS</div><span class="qs-bar-r"></span></div>' +
      '<div class="qs-body"><h2 class="qs-h">Which boat?</h2><p class="qs-sub">Each boat has its own Safety Management System.</p>' +
      vs.map(function (v) { return '<button type="button" class="qs-pick" data-qs-vessel="' + esc(v.id) + '"><strong>' + esc(v.name) + '</strong><span>' + esc(window.vesselCodeLabel ? vesselCodeLabel(v) : (v.type || '')) + '</span></button>'; }).join('') + '</div>';
  }

  function fieldHtml(f, a) {
    if (f.showIf && !f.showIf(a)) return '';
    var val = a[f.k], id = 'qs-f-' + f.k, h = '<div class="qs-field"><label class="qs-label" for="' + id + '">' + esc(f.label) + '</label>';
    if (f.type === 'chips' || f.type === 'multi') {
      h += '<div class="qs-chips" role="group" aria-label="' + esc(f.label) + '">' + f.options.map(function (o) {
        var on = f.type === 'multi' ? (val || []).indexOf(o[0]) >= 0 : val === o[0];
        return '<button type="button" class="qs-chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-qs-k="' + f.k + '" data-qs-v="' + esc(o[0]) + '" data-qs-multi="' + (f.type === 'multi' ? 1 : 0) + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div>';
    } else if (f.type === 'yn') {
      h += '<div class="qs-chips qs-yn" role="group" aria-label="' + esc(f.label) + '">' + [['y', 'Yes'], ['n', 'No']].map(function (o) {
        return '<button type="button" class="qs-chip' + (val === o[0] ? ' on' : '') + '" aria-pressed="' + (val === o[0]) + '" data-qs-k="' + f.k + '" data-qs-v="' + o[0] + '" data-qs-multi="0">' + o[1] + '</button>';
      }).join('') + '</div>';
    } else if (f.type === 'area') {
      h += '<textarea class="qs-input" id="' + id + '" rows="3" data-qs-in="' + f.k + '" placeholder="' + esc(f.ph || '') + '">' + esc(val || '') + '</textarea>';
    } else {
      h += '<input class="qs-input" id="' + id + '" data-qs-in="' + f.k + '" type="' + (f.type === 'tel' ? 'tel' : 'text') + '"' + (f.type === 'number' ? ' inputmode="numeric" pattern="[0-9]*"' : '') +
        (f.type === 'tel' ? ' autocomplete="tel"' : ' autocomplete="off"') + ' placeholder="' + esc(f.ph || '') + '" value="' + esc(val || '') + '">';
    }
    return h + (f.hint ? '<div class="qs-hint">' + esc(f.hint) + '</div>' : '') + '</div>';
  }

  function renderWizard() {
    var el = document.getElementById('qs-wiz') || overlay('qs-wiz');
    var s = STEPS[W.step], v = Store.getVessel(W.vesselId), last = W.step === STEPS.length - 1;
    var wb = !!v && !isSpv(v);
    var forCode = function (o) { if (!wb || !o.wb) return o; var c = {}, k; for (k in o) c[k] = o[k]; for (k in o.wb) c[k] = o.wb[k]; return c; };
    var fields = s.fields.filter(function (f) { return wb || !f.wbOnly; }).map(forCode);
    s = forCode(s);
    el.innerHTML =
      '<div class="qs-bar"><button type="button" class="qs-x" data-qs="close">Close</button>' +
        '<div class="qs-bar-t">' + esc(v ? v.name : 'Quick SMS') + '</div><span class="qs-bar-r">' + (W.step + 1) + ' of ' + STEPS.length + '</span></div>' +
      '<div class="qs-prog" role="progressbar" aria-valuemin="1" aria-valuemax="' + STEPS.length + '" aria-valuenow="' + (W.step + 1) + '"><i style="width:' + Math.round((W.step + 1) / STEPS.length * 100) + '%"></i></div>' +
      '<div class="qs-body"><h2 class="qs-h">' + esc(s.title) + '</h2><p class="qs-sub">' + esc(s.sub) + '</p>' +
        fields.map(function (f) { return fieldHtml(f, W.a); }).join('') +
        '<p class="qs-skip">Not sure? Leave it blank. We will mark it “to confirm” so you can fill it in later.</p></div>' +
      '<div class="qs-foot-bar">' + (W.step > 0 ? '<button type="button" class="qs-btn qs-btn-2" data-qs="back">Back</button>' : '') +
        '<button type="button" class="qs-btn" data-qs="next">' + (last ? 'Write my SMS' : 'Next') + '</button></div>';
    var body = el.querySelector('.qs-body'); if (body) body.scrollTop = 0;
  }

  function keepDraft() {
    if (!W || W.docId) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ vesselId: W.vesselId, a: W.a, step: W.step })); } catch (_) {}
  }

  // ───────────────────────── Viewer ─────────────────────────

  function view(docId) {
    var d = findDoc(docId); if (!d || !isQuick(d)) return;
    var v = Store.getVessel(d.vessel_id) || { name: 'Vessel' };
    var g = generate(d.sections.quick.answers, v, d);
    var signed = d.status === 'signed';
    var crew = (Store.vesselCrew(v.id) || []);
    var acks = d.acknowledgements || [];
    var acked = function (id) { return acks.some(function (k) { return k.crew_id === id; }); };
    var due = signed && Store.isSmsReviewDue && Store.isSmsReviewDue(d);
    var days = Store.smsReviewDays ? Store.smsReviewDays(d) : null;
    var el = overlay('qs-view');
    el.innerHTML =
      '<div class="qs-bar"><button type="button" class="qs-x" data-qs="close-view">Done</button><div class="qs-bar-t">Safety Management System</div><span class="qs-bar-r"></span></div>' +
      '<div class="qs-body qs-view-body">' +
        '<div class="qs-status ' + (signed ? 'ok' : 'draft') + '"><div><strong>' + (signed ? 'Approved' : 'Draft') + ' · Issue ' + (d.version || 1) + '</strong>' +
          '<span>' + (signed ? 'Signed ' + esc(fmt(d.signed_at)) + (d.sections.quick.signed_name ? ' by ' + esc(d.sections.quick.signed_name) : '') + (d.review_due_at ? ' · review by ' + esc(fmt(d.review_due_at)) : '')
            : (g.todo.length ? g.todo.length + ' thing' + (g.todo.length === 1 ? '' : 's') + ' still to fill in' : 'Ready for you to read and approve')) + '</span></div></div>' +
        (due ? '<div class="qs-card qs-review"><strong>Yearly review ' + (days != null && days < 0 ? 'overdue' : 'due') + '</strong><p>Read it through. If nothing has changed, confirm and you are done for another year.</p>' +
          '<div class="qs-row"><button type="button" class="qs-btn" data-qs="review-ok" data-id="' + esc(d.id) + '">Nothing has changed</button><button type="button" class="qs-btn qs-btn-2" data-qs="edit" data-id="' + esc(d.id) + '">Update it</button></div></div>' : '') +
        (g.todo.length ? '<div class="qs-card"><strong>Still to fill in</strong>' + g.todo.map(function (t) {
          return '<button type="button" class="qs-todo-row" data-qs="edit" data-id="' + esc(d.id) + '" data-step="' + t.step + '"><span>' + esc(t.label) + '</span><em>Add</em></button>'; }).join('') + '</div>' : '') +
        useCard(d) +
        '<div class="qs-actions">' +
          (!signed ? '<button type="button" class="qs-btn" data-qs="sign" data-id="' + esc(d.id) + '">Approve and sign</button>' : '') +
          '<button type="button" class="qs-btn qs-btn-2" data-qs="edit" data-id="' + esc(d.id) + '">Change answers</button>' +
          '<button type="button" class="qs-btn qs-btn-2" data-qs="word" data-id="' + esc(d.id) + '">Share as Word</button>' +
          '<button type="button" class="qs-btn qs-btn-2" data-qs="print" data-id="' + esc(d.id) + '">Print or save PDF</button>' +
        '</div>' +
        '<div class="qs-card"><strong>Risk assessment on its own</strong><p class="qs-card-p">Your surveyor asks to see this before a certificate is issued or renewed. Same content as Part 3, as a separate document.</p>' +
          '<div class="qs-row"><button type="button" class="qs-btn qs-btn-2" data-qs="word-ra" data-id="' + esc(d.id) + '">Share as Word</button><button type="button" class="qs-btn qs-btn-2" data-qs="print-ra" data-id="' + esc(d.id) + '">Print or save PDF</button></div></div>' +
        (signed ? '<div class="qs-card"><strong>Crew have read it · ' + crew.filter(function (c) { return acked(c.id); }).length + ' of ' + crew.length + '</strong>' +
          (crew.length ? crew.map(function (c) {
            return '<div class="qs-crew"><span>' + esc(c.name) + '<small>' + esc(acked(c.id) ? 'Confirmed ' + fmt((acks.filter(function (k) { return k.crew_id === c.id; })[0] || {}).at) : (c.role || 'Crew')) + '</small></span>' +
              (acked(c.id) ? '<em class="qs-tick">Read</em>' : '<button type="button" class="qs-btn qs-btn-s" data-qs="ack" data-id="' + esc(d.id) + '" data-crew="' + esc(c.id) + '">Confirm</button>') + '</div>';
          }).join('') : '<p>Add your crew under the boat’s Crew tab, then each person confirms here that they have read it.</p>') + '</div>' : '') +
        '<div class="qs-paper qs-doc">' + g.html + '</div>' +
        '<button type="button" class="qs-del" data-qs="delete" data-id="' + esc(d.id) + '">Delete this SMS</button>' +
      '</div>';
  }

  function signForm(docId) {
    var d = findDoc(docId); if (!d) return;
    var u = (Store.getCurrentUser && Store.getCurrentUser()) || Store.snapshot().user || {};
    var a = d.sections.quick.answers;
    var el = overlay('qs-sign');
    el.classList.add('qs-ov-sheet');
    el.innerHTML = '<div class="qs-sheet"><h2 class="qs-h">Approve this SMS</h2>' +
      '<p class="qs-sub">By signing you confirm you have read it, it describes how you really operate, and you will put it into practice.</p>' +
      '<div class="qs-field"><label class="qs-label" for="qs-sign-name">Your full name</label><input class="qs-input" id="qs-sign-name" type="text" autocomplete="name" value="' + esc(a.hsName || u.name || '') + '"></div>' +
      '<div class="qs-row"><button type="button" class="qs-btn qs-btn-2" data-qs="sign-cancel">Cancel</button><button type="button" class="qs-btn" data-qs="sign-ok" data-id="' + esc(d.id) + '">Sign</button></div></div>';
    setTimeout(function () { var i = document.getElementById('qs-sign-name'); if (i) i.focus(); }, 50);
  }

  function docHtmlForExport(d, which) {
    var v = Store.getVessel(d.vessel_id) || { name: 'Vessel' };
    var g = generate(d.sections.quick.answers, v, d);
    return which === 'ra' ? g.ra : g.html;
  }
  var EXPORT_CSS = 'body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45;color:#111}h1{font-size:26pt;color:#03203D;margin:0 0 6pt}h2{font-size:15pt;color:#03203D;border-bottom:1pt solid #9aa7b4;padding-bottom:3pt;margin:20pt 0 8pt;page-break-after:avoid}h3{font-size:12pt;color:#1e3454;margin:14pt 0 4pt;page-break-after:avoid}' +
    'table{border-collapse:collapse;width:100%;margin:6pt 0 10pt}th{background:#e2e8f0;color:#03203D;font-weight:bold;text-align:left;font-size:10pt;padding:4pt 6pt;border:1pt solid #9aa7b4}td{border:1pt solid #9aa7b4;padding:4pt 6pt;vertical-align:top;font-size:10pt}' +
    '.qs-cover{text-align:center;padding:50pt 0 30pt}.qs-cover-co{font-size:14pt;color:#475569}.qs-cover-v{font-size:20pt;font-weight:bold;color:#1e3454}.qs-box{border:1.5pt solid #03203D;padding:8pt 10pt;margin:10pt 0}.qs-note{font-size:9.5pt;color:#475569;font-style:italic}mark.qs-todo{background:#fff200}.qs-foot{font-size:9pt;color:#64748b;border-top:1pt solid #cbd5e1;margin-top:24pt;padding-top:8pt}';

  function exportWord(docId, which) {
    var d = findDoc(docId); if (!d) return;
    var v = Store.getVessel(d.vessel_id) || { name: 'Vessel' };
    var title = (which === 'ra' ? 'Risk Assessment - ' : 'Safety Management System - ') + (v.name || 'Vessel');
    var html = '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
      '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]--><style>@page{size:A4;margin:22mm 20mm}' + EXPORT_CSS + '</style></head><body>' + docHtmlForExport(d, which) + '</body></html>';
    var blob = new Blob(['﻿', html], { type: 'application/msword' });
    var file = title.replace(/[^a-z0-9\-_ ]/gi, '_') + '.doc';
    if (window.CodedokFiles && window.CodedokNative && CodedokNative.isNative) {
      CodedokFiles.share(blob, file, 'application/msword').catch(function () { if (window.toast) toast('Could not share the Word file'); });
      return;
    }
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = file; document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 300);
  }

  function printDoc(docId, which) {
    var d = findDoc(docId), target = document.getElementById('print-pack'); if (!d || !target) return;
    target.innerHTML = '<style>.print-pack .qs-doc{font-family:Arial,sans-serif}' + EXPORT_CSS.replace(/(^|})([^{}]+)\{/g, function (m, close, sel) {
      return close + sel.split(',').map(function (x) { return '.print-pack .qs-doc ' + (x.trim() === 'body' ? '' : x.trim()); }).join(',') + '{'; }) + '</style><div class="qs-doc">' + docHtmlForExport(d, which) + '</div>';
    setTimeout(function () { window.print(); }, 80);
  }


  // ───────────────────────── Using the SMS: checks, drills, incidents ─────────────────────────
  //
  // The records a Certifying Authority asks to see (Appendix 7, 7.5 drills
  // with names; 8.3 incidents and near misses; 6.1.1 testing before a
  // passage). Stored with the SMS document so they sync with it and print in
  // Annex C.

  var MAX_LOGS = 600;
  function logsOf(d) { return (d && d.sections && d.sections.quick && d.sections.quick.logs) || []; }
  function addLog(docId, entry) {
    var d = findDoc(docId); if (!d) return;
    var q = d.sections.quick;
    entry.id = 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    entry.at = entry.at || new Date().toISOString();
    var logs = [entry].concat(q.logs || []).sort(function (x, y) { return String(y.at).localeCompare(String(x.at)); }).slice(0, MAX_LOGS);
    Store.updateSmsDocument(docId, { sections: { quick: { answers: q.answers, code: q.code, signed_name: q.signed_name || null, logs: logs } }, updated_at: new Date().toISOString() });
  }
  function daysSince(iso) { return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); }
  function drillStatus(d) {
    var logs = logsOf(d).filter(function (l) { return l.kind === 'drill'; });
    return drillTypes(d.sections.quick.answers).map(function (t) {
      var last = logs.filter(function (l) { return l.drill === t.k; })[0];
      var since = last ? daysSince(last.at) : null;
      return { k: t.k, label: t.label, every: t.every, last: last ? last.at : null, due: since == null || since > t.every };
    });
  }
  function docFor(vesselId) {
    var docs = (Store.snapshot().sms_documents || []).filter(isQuick);
    if (vesselId) return docs.filter(function (d) { return d.vessel_id === vesselId; })[0] || null;
    return docs[0] || null;
  }
  function names(d) {
    var a = d.sections.quick.answers, out = [];
    String(a.masters || '').split(',').concat(String(a.crewNames || '').split(',')).forEach(function (n) { n = n.trim(); if (n && out.indexOf(n) < 0) out.push(n); });
    (Store.vesselCrew(d.vessel_id) || []).forEach(function (c) { if (c.name && out.indexOf(c.name) < 0) out.push(c.name); });
    return out;
  }
  function localNow() { var n = new Date(); n.setMinutes(n.getMinutes() - n.getTimezoneOffset()); return n.toISOString().slice(0, 16); }

  var L = null; // open log form: { kind, docId, ... }

  function useCard(d) {
    var st = drillStatus(d), due = st.filter(function (x) { return x.due; });
    var logs = logsOf(d), lastCheck = logs.filter(function (l) { return l.kind === 'check'; })[0];
    return '<div class="qs-card qs-use"><strong>Use it</strong>' +
      '<button type="button" class="qs-use-row" data-ql="check" data-id="' + esc(d.id) + '"><span>Pre-departure check<small>' + (lastCheck ? 'Last done ' + esc(fmt(lastCheck.at)) : 'Tick it off before you sail') + '</small></span><em>Start</em></button>' +
      '<button type="button" class="qs-use-row" data-ql="drill" data-id="' + esc(d.id) + '"><span>Log a drill<small class="' + (due.length ? 'qs-warn' : '') + '">' +
        (due.length ? esc(due.length === st.length ? 'No drills logged yet' : due.length > 2 ? due.length + ' drills due' : 'Due: ' + due.map(function (x) { return x.label.toLowerCase(); }).join(', ')) : 'All drills up to date') + '</small></span><em>Log</em></button>' +
      '<button type="button" class="qs-use-row" data-ql="incident" data-id="' + esc(d.id) + '"><span>Report an incident or near miss<small>Something went wrong, or nearly did</small></span><em>Report</em></button>' +
      (logs.length ? '<div class="qs-recs"><div class="qs-recs-h">Recent records · ' + logs.length + '</div>' + logs.slice(0, 5).map(function (l) {
        var what = l.kind === 'check' ? 'Pre-departure check' + (l.defect ? ' – defect noted' : '') : l.kind === 'drill' ? 'Drill: ' + l.label : (l.near ? 'Near miss' : 'Incident') + ': ' + (l.what || '').slice(0, 60);
        return '<div class="qs-rec"><span>' + esc(what) + '</span><small>' + esc(fmt(l.at)) + '</small></div>'; }).join('') + '</div>' : '') +
      '</div>';
  }

  function logShell(title, inner, saveLabel) {
    var el = overlay('qs-log');
    el.innerHTML = '<div class="qs-bar"><button type="button" class="qs-x" data-ql="cancel">Cancel</button><div class="qs-bar-t">' + esc(title) + '</div><span class="qs-bar-r"></span></div>' +
      '<div class="qs-body">' + inner + '</div><div class="qs-foot-bar"><button type="button" class="qs-btn" data-ql="save">' + esc(saveLabel) + '</button></div>';
    return el;
  }
  function chipRow(label, key, options, multi) {
    return '<div class="qs-field"><div class="qs-label">' + esc(label) + '</div><div class="qs-chips" role="group" aria-label="' + esc(label) + '">' + options.map(function (o) {
      var on = multi ? (L[key] || []).indexOf(o[0]) >= 0 : L[key] === o[0];
      return '<button type="button" class="qs-chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-ql-k="' + key + '" data-ql-v="' + esc(o[0]) + '" data-ql-multi="' + (multi ? 1 : 0) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div></div>';
  }
  function input(label, key, ph, type, hint) {
    var v = L[key] == null ? '' : L[key];
    return '<div class="qs-field"><label class="qs-label" for="ql-' + key + '">' + esc(label) + '</label>' +
      (type === 'area' ? '<textarea class="qs-input" id="ql-' + key + '" rows="3" data-ql-in="' + key + '" placeholder="' + esc(ph || '') + '">' + esc(v) + '</textarea>'
        : '<input class="qs-input" id="ql-' + key + '" data-ql-in="' + key + '" type="' + (type === 'when' ? 'datetime-local' : 'text') + '"' + (type === 'number' ? ' inputmode="numeric" pattern="[0-9]*"' : '') + ' placeholder="' + esc(ph || '') + '" value="' + esc(v) + '">') +
      (hint ? '<div class="qs-hint">' + hint + '</div>' : '') + '</div>';
  }

  function renderLog() {
    var d = findDoc(L.docId); if (!d) return;
    var a = d.sections.quick.answers, v = Store.getVessel(d.vessel_id) || {};
    var who = names(d).map(function (n) { return [n, n]; });
    if (L.kind === 'check') {
      var items = checkItems(a, v), max = maxPersons(a, v), pob = Number(L.pob), over = max && pob > max;
      logShell('Pre-departure check',
        '<h2 class="qs-h">' + esc(v.name || 'Before you sail') + '</h2><p class="qs-sub">Tap each line as you check it.</p>' +
        (who.length ? chipRow('Who is skippering?', 'by', who) : input('Who is skippering?', 'by', 'Name')) +
        input('People on board, including crew', 'pob', max ? 'Up to ' + max : 'Number', 'number', over ? '<span class="qs-warn">That is more than the ' + max + ' this boat may carry. Do not sail over the limit.</span>' : (max ? 'This boat may carry up to ' + max + '.' : '')) +
        '<div class="qs-field"><div class="qs-check-head"><span class="qs-label">Checks</span><button type="button" class="qs-link" data-ql="all">' + (L.ok.length === items.length ? 'Clear all' : 'Tick all') + '</button></div>' +
        items.map(function (it, i) { var on = L.ok.indexOf(i) >= 0;
          return '<button type="button" class="qs-tickrow' + (on ? ' on' : '') + '" role="checkbox" aria-checked="' + on + '" data-ql-tick="' + i + '"><i aria-hidden="true"></i><span>' + esc(it) + '</span></button>'; }).join('') + '</div>' +
        input('Anything wrong? (optional)', 'defect', 'Describe any defect or item you could not check', 'area', 'A safety-critical defect means the boat does not sail with passengers until it is fixed (Part 9.3).'),
        L.ok.length === items.length ? 'Save check' : 'Save (' + L.ok.length + ' of ' + items.length + ' ticked)');
    } else if (L.kind === 'drill') {
      var types = drillStatus(d);
      logShell('Log a drill',
        '<h2 class="qs-h">Which drill?</h2><p class="qs-sub">The Code asks for drills to be recorded with the names of everyone who took part.</p>' +
        chipRow('Drill', 'drill', types.map(function (t) { return [t.k, t.label + (t.due ? ' · due' : '')]; })) +
        input('When', 'when', '', 'when') +
        (who.length ? chipRow('Who took part?', 'who', who, true) : '') +
        input(who.length ? 'Anyone else' : 'Who took part?', 'whoOther', 'Names') +
        input('What did you learn? (optional)', 'notes', 'e.g. Recovery sling took too long to rig – now kept at the helm', 'area'),
        'Save drill');
    } else {
      logShell('Report an incident',
        '<div class="qs-urgent"><strong>Is anyone hurt or in danger right now?</strong> Call the Coastguard first: VHF Channel 16, or 999.</div>' +
        '<h2 class="qs-h">What happened?</h2><p class="qs-sub">Near misses count. Reports are for learning, not blame.</p>' +
        chipRow('Type', 'near', [['n', 'Incident or accident'], ['y', 'Near miss']]) +
        input('When', 'when', '', 'when') + input('Where', 'where', 'e.g. Half a mile north of the harbour') +
        input('What happened', 'what', 'Describe it in your own words', 'area') +
        input('Who was involved', 'people', 'Names') +
        input('Any injury or damage', 'harm', 'Leave blank if none', 'area') +
        input('What will stop it happening again', 'action', 'You can add this later', 'area') +
        '<div class="qs-card qs-report"><strong>Does it need reporting?</strong><p>Accidents must be reported to the Marine Accident Investigation Branch by the quickest means. That includes someone seriously hurt or lost overboard, and collision, grounding, fire, flooding or loss of control. If in doubt, phone and ask.</p>' +
        '<a class="qs-btn qs-btn-2 qs-tel" href="tel:+442380232527">Call MAIB · 023 8023 2527</a>' +
        '<p>If the boat is damaged in a way that affects its safety, tell your Certifying Authority as soon as you can (Code 3.6.2).</p></div>',
        'Save report');
    }
  }

  function openLog(kind, docId) {
    var d = docId ? findDoc(docId) : docFor();
    if (!d) { if (window.toast) toast('Write your SMS first, then you can log checks and drills.'); return start(); }
    var who = names(d);
    L = { kind: kind, docId: d.id, when: localNow(), ok: [], by: who.length === 1 ? who[0] : '', who: [], near: 'n' };
    renderLog();
  }

  document.addEventListener('input', function (e) {
    var k = e.target && e.target.getAttribute && e.target.getAttribute('data-ql-in');
    if (!k || !L) return;
    L[k] = e.target.value;
    if (k === 'pob') { // live over-limit warning without losing focus
      var d = findDoc(L.docId), max = d ? maxPersons(d.sections.quick.answers, Store.getVessel(d.vessel_id)) : 0;
      var hint = e.target.parentNode.querySelector('.qs-hint');
      if (hint && max) hint.innerHTML = Number(L.pob) > max ? '<span class="qs-warn">That is more than the ' + max + ' this boat may carry. Do not sail over the limit.</span>' : 'This boat may carry up to ' + max + '.';
    }
  });

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-ql],[data-ql-k],[data-ql-tick]');
    if (!t) return;
    if (t.hasAttribute('data-ql-tick')) {
      var i = Number(t.getAttribute('data-ql-tick')), at = L.ok.indexOf(i);
      if (at >= 0) L.ok.splice(at, 1); else L.ok.push(i);
      return keepScroll(renderLog);
    }
    if (t.hasAttribute('data-ql-k')) {
      var k = t.getAttribute('data-ql-k'), val = t.getAttribute('data-ql-v');
      if (t.getAttribute('data-ql-multi') === '1') { var arr = (L[k] || []).slice(), ix = arr.indexOf(val); if (ix >= 0) arr.splice(ix, 1); else arr.push(val); L[k] = arr; }
      else L[k] = val;
      return keepScroll(renderLog);
    }
    var act = t.getAttribute('data-ql');
    if (act === 'check' || act === 'drill' || act === 'incident') return openLog(act, t.getAttribute('data-id'));
    if (act === 'cancel') { closeOv('qs-log'); L = null; return; }
    if (act === 'all') {
      var d0 = findDoc(L.docId), n = checkItems(d0.sections.quick.answers, Store.getVessel(d0.vessel_id) || {}).length;
      L.ok = L.ok.length === n ? [] : Array.apply(null, { length: n }).map(function (_, j) { return j; });
      return keepScroll(renderLog);
    }
    if (act === 'save') {
      var d = findDoc(L.docId), a = d.sections.quick.answers, v = Store.getVessel(d.vessel_id) || {};
      var say = function (m) { if (window.toast) toast(m); };
      if (L.kind === 'check') {
        var items = checkItems(a, v), max = maxPersons(a, v), pob = L.pob === '' || L.pob == null ? null : Number(L.pob);
        if (max && pob > max) return say('Too many people on board – the limit is ' + max);
        var missed = items.filter(function (_, j) { return L.ok.indexOf(j) < 0; });
        if (missed.length && !String(L.defect || '').trim()) return say('Tick every line, or say what is wrong');
        addLog(d.id, { kind: 'check', by: L.by || '', pob: pob, total: items.length, ok: L.ok.length,
          defect: [String(L.defect || '').trim(), missed.length ? 'Not ticked: ' + missed.join('; ') : ''].filter(Boolean).join(' · ') });
        say(missed.length || L.defect ? 'Check saved with a defect noted' : 'Check saved – safe trip');
      } else if (L.kind === 'drill') {
        var ty = drillTypes(a).filter(function (x) { return x.k === L.drill; })[0];
        if (!ty) return say('Pick which drill');
        var who = (L.who || []).concat(String(L.whoOther || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean));
        if (!who.length) return say('Add who took part');
        addLog(d.id, { kind: 'drill', drill: ty.k, label: ty.label, at: new Date(L.when || Date.now()).toISOString(), who: who.join(', '), notes: String(L.notes || '').trim() });
        say('Drill logged');
      } else {
        if (!String(L.what || '').trim()) return say('Say what happened');
        addLog(d.id, { kind: 'incident', near: L.near === 'y', at: new Date(L.when || Date.now()).toISOString(), where: String(L.where || '').trim(), what: String(L.what).trim(),
          people: String(L.people || '').trim(), harm: String(L.harm || '').trim(), action: String(L.action || '').trim() });
        say('Report saved');
      }
      if (window.CodedokNative && CodedokNative.haptic) { try { CodedokNative.haptic('success'); } catch (_) {} }
      var id = L.docId; closeOv('qs-log'); L = null;
      if (document.getElementById('qs-view')) view(id); else refresh();
    }
  });
  function keepScroll(fn) {
    var b = document.querySelector('#qs-log .qs-body'), y = b ? b.scrollTop : 0;
    fn(); b = document.querySelector('#qs-log .qs-body'); if (b) b.scrollTop = y;
  }

  // Re-draw the screen underneath so it reflects what just changed.
  function refresh() {
    var cur = document.querySelector('.shell.on');
    if (cur && window.go && /^s-(sms|home|vessel-detail)$/.test(cur.id)) go(cur.id);
  }

  // ───────────────────────── Events ─────────────────────────

  document.addEventListener('input', function (e) {
    var k = e.target && e.target.getAttribute && e.target.getAttribute('data-qs-in');
    if (!k || !W) return;
    W.a[k] = e.target.value; keepDraft();
  });

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-qs],[data-qs-k],[data-qs-vessel]');
    if (!t) return;
    if (t.hasAttribute('data-qs-vessel')) { closeOv('qs-wiz'); return start(t.getAttribute('data-qs-vessel')); }
    if (t.hasAttribute('data-qs-k')) {
      if (!W) return;
      var k = t.getAttribute('data-qs-k'), val = t.getAttribute('data-qs-v');
      if (t.getAttribute('data-qs-multi') === '1') {
        var arr = (W.a[k] || []).slice(), i = arr.indexOf(val);
        if (i >= 0) arr.splice(i, 1); else arr.push(val);
        W.a[k] = arr;
      } else { W.a[k] = W.a[k] === val ? '' : val; }
      keepDraft(); return renderWizard();
    }
    var act = t.getAttribute('data-qs'), id = t.getAttribute('data-id');
    if (act === 'close') { keepDraft(); closeOv('qs-wiz'); W = null; refresh(); }
    else if (act === 'back') { W.step = Math.max(0, W.step - 1); keepDraft(); renderWizard(); }
    else if (act === 'next') {
      if (W.step < STEPS.length - 1) { W.step++; keepDraft(); return renderWizard(); }
      var d = saveDoc(W); W = null; closeOv('qs-wiz'); view(d.id);
      if (window.CodedokNative && CodedokNative.haptic) { try { CodedokNative.haptic('success'); } catch (_) {} }
    }
    else if (act === 'close-view') { closeOv('qs-view'); refresh(); }
    else if (act === 'edit') { closeOv('qs-view'); start(null, id, Number(t.getAttribute('data-step')) || 0); }
    else if (act === 'sign') { signForm(id); }
    else if (act === 'sign-cancel') { closeOv('qs-sign'); }
    else if (act === 'sign-ok') {
      var nm = (document.getElementById('qs-sign-name') || {}).value || '';
      if (!nm.trim()) { if (window.toast) toast('Type your name to sign'); return; }
      var doc = findDoc(id), q = doc.sections.quick, due = new Date(); due.setFullYear(due.getFullYear() + 1);
      Store.updateSmsDocument(id, { status: 'signed', signed_at: new Date().toISOString(), review_due_at: due.toISOString().slice(0, 10), last_reviewed_at: today(),
        sections: { quick: { answers: q.answers, code: q.code, signed_name: nm.trim(), logs: q.logs || [] } } });
      Store.updateSmsDocument(id, { body: plain(docHtmlForExport(findDoc(id))) });
      if (Store.appendSmsEdit) Store.appendSmsEdit(id, { note: 'Approved and signed by ' + nm.trim() });
      closeOv('qs-sign'); view(id); if (window.toast) toast('SMS approved');
    }
    else if (act === 'review-ok') {
      var due2 = new Date(); due2.setFullYear(due2.getFullYear() + 1);
      Store.updateSmsDocument(id, { signed_at: new Date().toISOString(), review_due_at: due2.toISOString().slice(0, 10), last_reviewed_at: today() });
      if (Store.appendSmsEdit) Store.appendSmsEdit(id, { note: 'Yearly review – no changes' });
      view(id); if (window.toast) toast('Review recorded');
    }
    else if (act === 'ack') {
      var c = (Store.snapshot().crew || []).filter(function (x) { return x.id === t.getAttribute('data-crew'); })[0];
      if (c) { Store.ackSms(id, c.id, c.name); view(id); }
    }
    else if (act === 'word') { exportWord(id); }
    else if (act === 'print') { printDoc(id); }
    else if (act === 'word-ra') { exportWord(id, 'ra'); }
    else if (act === 'print-ra') { printDoc(id, 'ra'); }
    else if (act === 'delete') {
      if (!confirm('Delete this Safety Management System? This cannot be undone.')) return;
      if (Store.updateSmsDocument) Store.updateSmsDocument(id, { deleted_at: new Date().toISOString(), status: 'draft' });
      var list = Store.snapshot().sms_documents, ix = list.findIndex(function (x) { return x.id === id; });
      if (ix >= 0) list.splice(ix, 1);
      if (Store._persist) Store._persist(Store.snapshot());
      closeOv('qs-view'); refresh();
    }
  });

  // Quick SMS documents open in this viewer instead of the legacy sheet.
  function hook() {
    var orig = window.openSmsDoc;
    if (!orig || orig.__qs) return;
    var wrapped = function (id) { var d = findDoc(id); return isQuick(d) ? view(id) : orig(id); };
    wrapped.__qs = true; window.openSmsDoc = wrapped;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();

  // Card for the SMS hub and anywhere else that wants to offer it.
  function hubCard() {
    var docs = (Store.snapshot().sms_documents || []).filter(isQuick);
    var draft = null; try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (_) {}
    var sub = docs.length ? 'Open, update or share the SMS for your boat.'
      : draft ? 'You are part-way through. Pick up where you left off.'
      : 'Answer a few plain questions. We write the whole document to your boat’s Code, ready to sign.';
    return '<div class="qs-hub" role="button" tabindex="0" onclick="QuickSms.start()">' +
      '<div class="qs-hub-k">About 10 minutes</div><div class="qs-hub-t">' + (docs.length ? 'Your Safety Management System' : draft ? 'Finish your SMS' : 'Write my SMS for me') + '</div>' +
      '<div class="qs-hub-s">' + sub + '</div><span class="qs-hub-go">' + (docs.length ? 'Open' : draft ? 'Continue' : 'Start') + '</span></div>';
  }

  window.QuickSms = { start: start, view: view, isQuick: isQuick, generate: generate, hubCard: hubCard, defaults: defaults, STEPS: STEPS,
    log: openLog, docFor: docFor, drillStatus: drillStatus };
})();
