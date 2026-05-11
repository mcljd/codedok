// CodedOK — survey-report import parser.
// Loads PDF.js on demand, extracts text, applies heuristic patterns to pull
// out vessel particulars, certificates, equipment items, and deficiencies.
//
// This is the v1 implementation with no LLM call. It's intentionally
// conservative — better to return a small number of high-confidence items
// the user can review, than 100 items full of false positives.
//
// Future: swap parseFromText() for an edge-function call to Claude with a
// JSON schema. Public surface stays the same.
(function () {
  'use strict';

  const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

  let pdfjsPromise = null;
  function loadPdfJs() {
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = import(PDFJS_CDN).then((mod) => {
      const pdfjsLib = mod.default || mod;
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return pdfjsLib;
    });
    return pdfjsPromise;
  }

  async function extractText(blob) {
    const pdfjs = await loadPdfJs();
    const buf = await blob.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      // Join items with a space; PDF.js gives us per-string fragments that
      // already preserve enough spatial info for line-level patterns.
      const txt = tc.items.map((it) => (it.str || '').trim()).filter(Boolean).join(' ');
      pages.push(txt);
    }
    return pages.join('\n');
  }

  // ---------- Heuristic patterns ----------

  // Match common date formats: 15/09/2026, 15-09-26, 15 Sep 2026, Sep 15 2026.
  const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
  const DATE_PATTERNS = [
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/i,
    new RegExp('(\\d{1,2})\\s+(' + MONTHS + ')[a-z]*\\s+(\\d{2,4})', 'i'),
    new RegExp('(' + MONTHS + ')[a-z]*\\s+(\\d{1,2}),?\\s+(\\d{2,4})', 'i')
  ];

  function isoFromMatch(m, ordering) {
    // ordering: 'dmy' | 'mdy' | 'dmonthy' | 'monthdy'
    const monthMap = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',sept:'09',oct:'10',nov:'11',dec:'12' };
    let d, mo, y;
    if (ordering === 'dmy') {
      d = m[1]; mo = m[2]; y = m[3];
    } else if (ordering === 'dmonthy') {
      d = m[1]; mo = monthMap[m[2].slice(0,3).toLowerCase()]; y = m[3];
    } else if (ordering === 'monthdy') {
      mo = monthMap[m[1].slice(0,3).toLowerCase()]; d = m[2]; y = m[3];
    }
    if (!d || !mo || !y) return null;
    if (y.length === 2) y = (parseInt(y, 10) > 50 ? '19' : '20') + y;
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }

  function findDate(line) {
    let m = line.match(DATE_PATTERNS[0]); if (m) return isoFromMatch(m, 'dmy');
    m = line.match(DATE_PATTERNS[1]); if (m) return isoFromMatch(m, 'dmonthy');
    m = line.match(DATE_PATTERNS[2]); if (m) return isoFromMatch(m, 'monthdy');
    return null;
  }

  function findField(text, label) {
    // Match "Label: value" or "Label  value" across line breaks.
    const re = new RegExp(label + '\\s*[:\\-]?\\s*([^\\n,]+?)(?=\\s{2,}|\\s[A-Z][a-z]+\\s*:|\\n|$)', 'i');
    const m = text.match(re);
    return m ? m[1].trim() : null;
  }

  function parseVessel(text) {
    const name = findField(text, '(?:Vessel name|Vessel|Name of vessel|Boat name)');
    const ssr = findField(text, '(?:SSR|Registration|Reg(?:istration)? number|Official number)');
    const port = findField(text, '(?:Port of registry|Home port|Port)');
    const lengthRaw = findField(text, 'Length(?:\\s+overall)?');
    const personsRaw = findField(text, '(?:Persons|Max persons|POB|Passengers)');
    const categoryRaw = findField(text, '(?:Category|MCA category|Cat\\.?)');
    const makeModel = findField(text, '(?:Make(?: and model)?|Manufacturer|Model|Builder)');
    const engine = findField(text, '(?:Engine|Propulsion)');

    const lengthMatch = lengthRaw && lengthRaw.match(/(\d+\.?\d*)/);
    const personsMatch = personsRaw && personsRaw.match(/(\d+)/);
    const catMatch = categoryRaw && categoryRaw.match(/(\d|[IVX]+|workboat|wb)/i);

    if (!name) return null;
    return {
      name: name.replace(/[,\.]$/, ''),
      ssr: ssr || '',
      port: port || '',
      length: lengthMatch ? parseFloat(lengthMatch[1]) : null,
      persons: personsMatch ? parseInt(personsMatch[1], 10) : null,
      category: catMatch ? `Cat ${catMatch[1]}` : '',
      make: makeModel || '',
      engine: engine || ''
    };
  }

  // Known cert keywords mapped to a clean name + likely category.
  const CERT_HINTS = [
    { kw: /coding (?:cert|certificate)|YDSA coding/i,         name: 'YDSA Coding Certificate', category: 'vessel',    icon: '📋' },
    { kw: /public liability|PLI/i,                            name: 'Public Liability Insurance', category: 'insurance', icon: '🛡️' },
    { kw: /P\s*&\s*I|protection (?:and|&) indemnity/i,         name: 'P&I Insurance',             category: 'insurance', icon: '🛡️' },
    { kw: /ship radio licen[cs]e|VHF licen[cs]e|radio licen[cs]e/i, name: 'Ship Radio Licence (VHF)', category: 'vessel', icon: '📡' },
    { kw: /MMSI/i,                                            name: 'MMSI Licence',              category: 'vessel',    icon: '📡' },
    { kw: /stability (?:book|booklet|info)/i,                 name: 'Stability book',            category: 'vessel',    icon: '📋' },
    { kw: /pyro(?:technic)?s?/i,                              name: 'Pyrotechnics',              category: 'equipment', icon: '🧨' },
    { kw: /life ?raft service|liferaft service|LRS/i,          name: 'Life raft service',         category: 'equipment', icon: '🛟' },
    { kw: /SOLAS/i,                                           name: 'SOLAS pack',                category: 'equipment', icon: '🧨' },
    { kw: /EPIRB/i,                                           name: 'EPIRB',                     category: 'equipment', icon: '📡' },
    { kw: /first aid/i,                                       name: 'First aid kit',             category: 'equipment', icon: '🩹' },
    { kw: /fire ext(?:inguisher)?/i,                          name: 'Fire extinguishers',        category: 'equipment', icon: '🧯' },
    { kw: /life ?jacket/i,                                    name: 'Lifejackets',               category: 'equipment', icon: '🦺' }
  ];

  // Walk the text line-by-line; whenever a line contains a known keyword AND
  // a date, treat it as a cert/equipment row. The date is the expiry / next-due.
  function parseLineItems(text) {
    const lines = text.split(/\s{4,}|\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const certs = [];
    const equipment = [];
    const seen = new Set();
    lines.forEach((line) => {
      const date = findDate(line);
      if (!date) return;
      const hint = CERT_HINTS.find((h) => h.kw.test(line));
      if (!hint) return;
      const dedupeKey = hint.name + '|' + date;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      // Try to extract a reference / serial.
      const refMatch = line.match(/\b([A-Z]{2,5}[\-\/]?\d{2,}[A-Z0-9\-\/]*)/);
      const issuerMatch = line.match(/(YDSA|Survitec|Ocean Signal|Pains Wessex|Crewsaver|Pantaenius|Topsail|Chubb|Icom|Ofcom)/i);
      const row = {
        kind: 'auto',
        name: hint.name,
        icon: hint.icon,
        category: hint.category,
        number: refMatch ? refMatch[1] : '',
        issuer: issuerMatch ? issuerMatch[1] : ''
      };
      if (hint.category === 'equipment') {
        equipment.push(Object.assign({}, row, { next_service_at: date }));
      } else {
        certs.push(Object.assign({}, row, { expires_at: date }));
      }
    });
    return { certs, equipment };
  }

  function parseDeficiencies(text) {
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const startIdx = lines.findIndex((l) => /^(deficien|defects?|action items?|observations?)/i.test(l));
    if (startIdx < 0) return [];
    const items = [];
    for (let i = startIdx + 1; i < lines.length && i < startIdx + 40; i++) {
      const l = lines[i];
      // Stop at next section header.
      if (/^[A-Z][A-Z\s]{4,}$/.test(l)) break;
      // Numbered or bulleted item.
      const m = l.match(/^(?:\d+[\.\)]\s*|[\-\*•]\s*)(.+)/);
      if (m) items.push({ description: m[1].trim() });
      else if (items.length > 0 && l.length > 8) {
        // Continuation line — append to previous.
        items[items.length - 1].description += ' ' + l;
      }
    }
    return items.slice(0, 12);
  }

  function parseFromText(text) {
    if (!text || text.length < 40) return { vessel: null, certs: [], equipment: [], deficiencies: [] };
    const vessel = parseVessel(text);
    const { certs, equipment } = parseLineItems(text);
    const deficiencies = parseDeficiencies(text);
    return { vessel, certs, equipment, deficiencies };
  }

  async function parseSurveyReport(blob) {
    const text = await extractText(blob);
    const parsed = parseFromText(text);
    parsed.__raw = text;
    return parsed;
  }

  window.SurveyImport = {
    parseSurveyReport,
    parseFromText,
    extractText,
    loadPdfJs
  };
})();
