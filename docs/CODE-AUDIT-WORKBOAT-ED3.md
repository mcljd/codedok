# CodedOK — Workboat Code Edition 3 (updated) audit of `app/codes.js`

Source checked: MCA *The Workboat Code Edition 3 – The Safety of Small Workboats and Pilot Boats – A Code of Practice*, published 22 Jan 2025 (`wbc.pdf`, 349 pp.). Legal effect: Merchant Shipping (Small Workboats and Pilot Boats) Regulations 2023 (SI 2023/1216). Entry into force: 13 Dec 2023 (§1.11, p13).

**How to read the page numbers.** "pNN" is the PDF page, counted by form feeds in `wbc.txt`. I checked it against the printed footer on rendered pages (106, 107, 112, 113, 136, 218 and 220), and the two always match. The Code's own contents page (pp4–11) is out of date by 1–3 pages, so don't use it. For example, it puts §14 on p104, but §14 actually starts on p105.

---

## (a) Summary

1. **Workboats currently get SPV Cat 2 data without any warning.** `shortIdFromCategory('Workboat')` finds no digit and falls back to `'cat2'` (codes.js lines 564–568). The `'Workboat'` value in the `vessel_cat` enum (`app.js:69`) mixes up two things: which Code applies and which area category the vessel is in. Under the Workboat Code (WBC), every workboat also has an area category from 0 to 6 (§3.10.1, p36–37).
2. **The area categories have the same definitions in WBC and SPV.** See WBC §3.10.1 (p36–37) and SPV 2025 §3.10.1 (p37–38). The `CATEGORIES` descriptions in codes.js are wrong under both Codes:
   - **Cat 4** must also say "in daylight".
   - **Cat 5** is not "5 nm summer / 3 nm winter". It is: within 3 miles of land and no more than 3 miles' radius from the point of departure to sea (or from the seaward boundary of categorised waters), in favourable weather.
   - **Cat 6** is the same as Cat 5, with "and daylight" added.
3. **What WBC covers that SPV doesn't:**
   - Workboats going to sea, plus all dedicated pilot boats, including those that only work inside categorised waters.
   - Vessels may carry cargo. The limit is 12 passengers and industrial personnel combined. SPV allows no cargo and up to 12 passengers (WBC §3.1.1, p31; SPV §3.1.1, p33).
   - WBC has five certificate types: Workboat, Pilot Boat, Workboat with Pilot Boat Endorsement, Light Duty Workboat, and a Statement of Compliance.
   - It also has endorsements: towing, single-handed operation, and "Area Category 3 Restricted".
   - It has sub-regimes for pilot boats (§27), towing (§26), cargo, lifting, diver lifts and high speed (§25), industrial personnel (§22.4), dangerous goods (§29), remotely operated unmanned vessels (Annex 2) and police boats (Annex 3).
   - There is no separate wind-farm or dive-support sub-code. Wind-farm work is covered by "industrial personnel"/"offshore industrial activities" and by §5.7 Offshore Energy Service Vessels. Diving is covered by §25.3 diver lifts.
4. **Survey regime:**
   - The Certificate is valid for up to 5 years.
   - An annual examination is due within 3 months either side of the anniversary, and never more than 15 months apart.
   - The vessel must be examined out of the water at least every 3 years.
   - An identification disc is issued every year.
   - Dedicated pilot boats may do their own annual examination if the Certifying Authority (CA) authorises it.
   - The SMS (Appendix 8) and cyber security (§31.3) become **mandatory from 13 Dec 2026** for manned vessels. That is 3 years after entry into force, and 22 days from today.
5. **The existing SPV-style data would be wrong for workboats in many places.** Some examples:
   - Liferafts are required in **every** WBC category; codes.js has none for Cat 5/6.
   - Cat 0 requires **2 EPIRBs** and Cat 0–2 require a SART.
   - TPAs are required for each person in Cat 0–5.
   - Medical stores are Category A for Cat 0, B for Cat 1, and C for Cat 2–6. codes.js uses B/A ("basic") for Cat 4–6.
   - Lifejackets are 100% of persons, plus 2 spares if inflatable. codes.js uses ×1.1.
   - Cat 0–2 must carry GNSS, a log, 3 cm radar and AIS.
   - A fixed VHF DSC set is required in Cat 0–5.
   - Two anchors are required in Cat 0–4.
   - Skipper certificates are quite different. Day Skipper is accepted only for Cat 4 and 6, in daylight only. Powerboat Level 2 is accepted only in Cat 6, and only for open boats or RIBs under 3 GT.
6. **Stability under WBC does not depend on length.** A Stability Information Booklet is triggered by any of: Cat 0/1, 16 or more persons, cargo over 1,000 kg, cargo with free-surface effect, a lifting device, towing more than twice the vessel's own displacement, or being a seagoing pilot boat (§12.1.1.3, p81–82). Every other vessel uses the simplified heel test, with the maximum permissible weight recorded on the Certificate.
7. **Things I could not settle from the Code alone** (details in section d):
   - The Code contradicts itself on EPIRB and PLB carriage for Cat 3–6: Table 14.1.2 disagrees with Table 17.2.1.
   - The Cat 5 lifebuoy column in Table 14.1.2 doesn't add up.
   - The Code doesn't name ENG1/ML5 or SRC/GOC. It refers you to MIN 698 or to Ofcom instead.
   - It gives no service interval for fire extinguishers (it points to MGN 276) and no expiry rule for pyrotechnics.

### Proposed model (task 3)

```js
vessel = {
  code: 'spv' | 'workboat',                 // which Code applies (replaces the 'Workboat' value of vessel_cat)
  category: 'cat0' … 'cat6',                // area category — required for BOTH codes (WBC §3.10.1)
  wbc_cert_type: 'workboat' | 'pilot_boat' | 'workboat_pilot' | 'light_duty' | null,   // WBC App.10
  endorsements: ['towing', 'single_handed', 'area3_restricted', ...],                    // §26.1.5, §28.2.3, App.1
  gmdss_area: 'A1' | 'A1+A2' | 'A1+A2+A3' | 'A1+A2+A3+A4',  // stated on certificate (§17.1.1, p134) — drives Table 17.2.1
  persons, length, gt, installed_kw, cargo_kg, open_boat, decked, substantial_enclosure,
  inflatable_lifejackets, liferaft_count, sst_10_or_less, lifting_device, towing,
  tow_over_2x_displacement, pilot, mlc, carries_dg, has_radar, has_ecs, ...
}
```

- Add `getCodeData(vessel)` to return `{ certs, equipment, crew, stability, sms }`. It should dispatch on `vessel.code` to either the existing SPV tables or the new `WBC_*` tables, keyed by `vessel.category`. **Remove the silent `'cat2'` fallback.** If the category is missing, return an error state.
- Migration: any vessel with `vessel_cat === 'Workboat'` gets `code: 'workboat'` and `category: null`, and is flagged so the owner sets the area category from their Workboat Certificate.
- Light Duty Workboats are SPV-certified vessels that also hold a WBC certificate (§3.9.3). They need `code: 'spv'` plus `wbc_cert_type: 'light_duty'`. They must meet the **union** of SPV equipment requirements and WBC manning, training and operational requirements (§3.9.3.4, p36).
- `OWNER_DECLARATIONS` (the four SPV annual declarations) **must not be applied to workboats**. WBC has no such declarations. The nearest equivalents are the owner's declarations recorded in the SWB2 (§3.8.4, p34) and the dedicated pilot boat self-examination (§4.4.2, p42).
- SMS: the codes.js `SMS_SCHEMA` sections line up well with WBC App. 8, but every `ref` cites SPV App. 7. For workboats, show the refs from `WBC_SMS_REFS`. Note that WBC adds a separate **Safety briefing** element (App. 8 §9) and puts cyber security in **§31.3**, outside App. 8.

---

## (b) Requirements by area category (with citations)

### B1. Scope and vessel types

| Item | Requirement | Ref |
|---|---|---|
| Applies to | Workboats operating to sea (beyond categorised waters), and **all** dedicated pilot boats, at sea or in categorised waters. Commercial use, not sport or pleasure | §1.1–1.2 p12; §3.1.1 p31; "To sea" p28 |
| Size | "Workboat" = small vessel, i.e. < 24 m load line length | §2 "Small vessel" p28, "Workboat" p30 |
| Persons | Cargo and/or no more than 12 passengers and industrial personnel combined (crew are extra) | §3.1.1 p31 |
| Industrial personnel | Must meet §22.4.1 (able-bodied, medical standard, basic safety training, briefing, PPE). Otherwise they count as passengers, within the limit of 12 | §22.4 p158; definitions p22, p25 |
| Excluded | Underwater vessels, hovercraft, sport/pleasure use, bulk cargo in holds or tanks | §3.1.2 p31; §1.4, §1.9 p12 |
| Rescue boats | May use the Rescue Boat Code (MGN 466) instead | §1.5 p12 |
| High-speed craft | Exempt from the HSC Regs if WBC-certified and carrying ≤ 12 passengers + industrial personnel | §3.1.5 p31 |
| Pilot boats | Dedicated Pilot Boat Certificate, or Workboat Certificate with Pilot Boat Endorsement. A non-seagoing dedicated pilot boat working in daylight meets the Cat 6 requirements; working at night, the Cat 3 requirements | §3.10.4 p37; §27.1–27.2 p176; Table 27.2.3 p177–178 |
| Light Duty Workboat | Vessel certified under another small commercial vessel code (e.g. SPV), doing occasional work duties. No cargo over 1 t, no lifting device, limited towing, no heavy pushing, no dangerous goods. Valid only while the SPV certificate is valid | §3.9.3.1–3.9.3.6 p35–36 |
| Towing | Requires a Workboat Certificate with towing endorsement | §26.1.5 p171 |
| Remotely operated unmanned vessels / police / alternative fuels | Annex 2 / Annex 3 / Annex 1 (not audited in detail) | §1.6–1.8 p12; Annex 1 p252, Annex 2 p268, Annex 3 p296 |
| Hull limits by category | Cat 0–2 need a full watertight weather deck and permanent accommodation. Vessels without a full deck: Cat 3–6 only. Without a deck **and** without a substantial enclosure: Cat 4 and 6 only | §5.1.2–5.1.4 p49 |
| Open boats / RIBs | No cargo over 1,000 kg, no lifting device and no towing unless the CA permits | §5.1.5 p49 |

### B2. Area categories

All seven categories are defined in §3.10.1 (p36–37), and the RCR design category mapping is in Table 3.10.2 (p37).

| Cat | Limit | RCR min | Notes |
|---|---|---|---|
| 0 | Unrestricted | A | — |
| 1 | Up to 150 miles from a safe haven | A | — |
| 2 | Up to 60 miles from a safe haven | B | — |
| 3 | Up to 20 miles from a safe haven | B | The CA may restrict it further (§3.10.3 p37) |
| 4 | Up to 20 miles from a safe haven, favourable weather **and daylight** | C | "Daylight" = 1 h before sunrise to 1 h after sunset (p19) |
| 5 | Within 3 miles of land and ≤ 3 miles' radius from the departure point or the seaward boundary of categorised waters, favourable weather | C | — |
| 6 | As Cat 5, **plus daylight** | C | — |

"Up to" means strictly less than the figure (p29). For the "Area Category 3 Restricted" endorsement for RIBs and open boats working outside daylight, see App. 1 (p199–200).

### B3. Certificates, documents and examination intervals (all categories unless stated)

| Document / event | Interval | Ref |
|---|---|---|
| Workboat / Pilot Boat Certificate | Up to 5 years. An interim certificate can last up to 5 months. The certificate is cancelled automatically on sale | §4.3.2 p41; §4.13.1 p47; §3.8.4 p34 |
| Identification disc | Issued annually and displayed so it is visible from outside the vessel | §4.3.4 p41 |
| SWB2 (signed, up to date) | Kept on board, or ashore if that isn't practicable | §4.1.3 p40; §3.8.2 p34 |
| Annual examination | Anniversary ± 3 months, no more than 15 months apart. The certificate becomes invalid if this is missed | §4.4.1.1 p42; §3.8.3 p34 |
| Pilot boat annual exam | Dedicated pilot boats may self-examine if the CA authorises it | §4.4.2 p42; §4.8.3.2 p45 |
| Out-of-water (intermediate) exam | No more than 3 years between out-of-water exams. An in-water exam by diver or ROV is allowed only in exceptional cases | §2 p16; §4.5.1–4.5.2 p43 |
| Renewal exam | Out of water, before expiry. If done within 3 months of expiry, the new certificate runs 5 years from the old expiry date | §4.6 p44 |
| Emergency exam | After a collision, grounding, fire or damage to hull, rudder, propulsion, machinery or critical equipment. Report to the CA before the next voyage | §4.7 p44–45; §3.6.2 p33 |
| RIB airtightness test | Annually by the owner, and by a competent person at compliance and renewal exams; a declaration goes to the CA | §4.9 p46 |
| Pilot boat propeller shaft | Drawn at least every 3 years (every 10 years if running in oil and wear is insignificant) | §4.10 p46 |
| Certificate of construction | Needed to show structural strength | §5.2–5.3 p50–51 |
| Stability | An approved Stability Information Booklet (§12B.6), or simplified test results with the maximum permissible weight on the Certificate (§12A.2.6) | §12.1.1.3 p81–82; §12B.6 p99–100 |
| Ship's Radio Licence (Ofcom) | Required in all categories. The Code states no validity period | §17.9.1 p139 |
| MMSI and call sign marked on the fixed radio | — | §17.3.4 p135 |
| Radio survey | Every 5 years where GMDSS equipment is fitted | §17.10.1 p139 |
| EPIRB/PLB registration | Mandatory, under MGN 665 | §17.5.4 p138 |
| Official Log Book | 25 GT and over | §3.12.1 p38 |
| Operations risk assessment | Shown to the CA before the certificate is issued or renewed. Redone if the area category, use or equipment changes | §3.14 p38 |
| SMS | Mandatory from 13 Dec 2026 for manned vessels. Reviewed at least every 3 years | §31.1 p197; App. 8 §13.1 p237 |
| Cyber risk assessment and remote-access log | At least every 5 years, or whenever systems change | §31.3 p197–198 |
| Fire control and safety plan | Displayed at the control position | §15.8 p127 |
| Compass deviation record | Re-adjust if 2 years pass with no record kept | §19.2.4–19.2.6 p143–144 |
| Medical stores checklist | Cat 0/1, reviewed annually | §23.1.4 p160 |
| Towing gear service | No more than 12 months apart | §26.1.7 p171 |
| Lifting device thorough exam | Annually (LOLER) | §25.2.3.2 p168 |
| EIAPP + technical file | Diesel engines over 130 kW built after 1 Jan 2000 | §30.5.1 p193 |
| Garbage plan / record book / placards | Plan: 100 GT+ or 15+ persons. Record book: over 100 GT on international voyages, or 15+ persons. Placards: over 12 m | Table 30.3.3 p193 |
| SOPEP | 400 GT and over | §30.6.3 p194 |
| DoC for dangerous goods | Dangerous goods above IMDG limited quantities | §29.2.1 p183 |
| MLC inspection report | Cat 0–2 on international voyages or more than 60 miles from a UK safe haven, with seafarers on board | App. 10 p241/244/247 |
| Insurance | **Encouraged, not required** by the Code. Local authorities may require it | §1.16 p14; §1.12 p13 |
| Load line | Over 1,000 kg of cargo: comply with the Load Line Regs 1998. The WBC certificate is equivalent to a Load Line Exemption Certificate | §13.2.1 p101; §13.4.3 p104; App. 10 p240 |

### B4. Life-saving appliances

Sources: Table 14.1.2 (p106–107), Table 14.2.5.1 (p112–113), and §14 (p105–117).

| Item | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| Liferaft | Yes; 100% capacity with any one raft lost | Yes; same as Cat 0 if 16+ persons, otherwise 100% | 100% | 100% | 100% | 100% | 100% |
| Liferaft construction | SOLAS/UKCA/MER/DfT | Same, or ISO 9650-1 Type 1 Group A | Same as Cat 1 | Same as Cat 1 | Same as Cat 1 | Same as Cat 1 | Same as Cat 1, or open reversible raft (HSC Code) |
| Liferaft insulation | Yes | Yes, unless the water is always ≥ 10 °C | Only outside the UK SRR where water < 10 °C | Same as Cat 2 | Not required | Not required | Not required |
| Liferaft pack | SOLAS A | SOLAS A | SOLAS B | SOLAS B | DfT "E" equivalent | DfT "E" equivalent | DfT "E" equivalent |
| Lifebuoys, <16 persons: total (light / line / plain) | 2 (1/1/0) | 2 (1/1/0) | 2 (1/1/0) | 2 (1/1/0) | 2 (0/1/1) | 2 (1/1/1) ⚠ | 2 (0/1/1) |
| Lifebuoys, 16+ persons: total (light / line / plain) + extra line | 4 (2/1/1)+1 | 4 (2/1/1)+1 | 4 (2/1/1)+1 | 4 (2/1/1)+1 | 4 (0/1/3)+1 | 4 (2/1/3)+1 ⚠ | 4 (0/1/3)+1 |
| Lifejackets | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| Light on lifejackets | Yes | Yes | Yes | Yes | No | Yes | No |
| Lifejacket re-arming kits | 100% | 100% | 100% | — | — | — | — |
| Spray hoods | Required | Required | Required | Recommended | Recommended | Recommended | Recommended |
| TPA | 100% | 100% | 100% | 100% | 100% | 100% | Conditional |
| Portable VHF | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| EPIRB (Table 14.1.2) | 2 | 1 | 1 | none ⚠ | none ⚠ | none ⚠ | none ⚠ |
| PLB (Table 14.1.2) | Yes | Yes | Yes | Recommended ⚠ | none ⚠ | none ⚠ | none ⚠ |
| SART | 1 (+2nd) | 1 (+2nd) | 1 (+2nd) | — | — | — | — |
| General alarm | If 16+ persons | If 16+ persons | If 16+ persons | — | — | — | — |
| Parachute flares | 12 | 6 | 4 | 4 | 0 | 4 | 0 |
| Red hand flares | 6 | 6 | 6 | 6 | 2 | 6 | 2 |
| Smoke signals | 2 (table reads "buoyant held") ⚠ | 2 buoyant | 2 buoyant or hand-held | 2 buoyant or hand-held | 2 buoyant or hand-held | 2 buoyant or hand-held | 2 buoyant or hand-held |
| Recovery means, training manual, maintenance manual, life-saving signals table | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Searchlight / signalling lamp (§14.12.1) | Yes | Yes | Yes | Yes | — | Yes | — |

**Rules that apply to the whole table:**
- **Lifebuoys:** never inflatable. Marked with the vessel's name plus one other identifier. Buoyant lines are at least 18 m (§14.3, p109–110).
- **Lifejackets:**
  - Each person gets a suitable lifejacket, including people under 32 kg. Add 2 spares if the jackets are inflatable (§14.4.4, p110).
  - Inflatable jackets must use compressed gas and have an oral top-up valve. Oral-only jackets are not allowed (§14.4.5, §14.4.8).
  - Inflatables are serviced within 1 month either side of the compliance, renewal and intermediate exams, and at least annually in between (§14.4.9, p110–111).
  - No more than 2 types on board, with donning instructions displayed (§14.4.11–12, p114).
- **TPAs:**
  - In Cat 6, TPAs are needed only if the sea is ≤ 10 °C or the raft is open reversible. They are not needed if the raft is canopied (§14.5.2–14.5.3, p114).
  - If immersion suits are provided for everyone, only 2 TPAs are needed (§14.5.6).
- **Immersion / dry suits:** Cat 0–2 in water ≤ 10 °C need one per person (§22.2.6.2, p157).
- **Liferaft and HRU servicing:**
  - Liferafts follow the manufacturer's schedule; valise rafts are serviced at least annually.
  - Reusable HRUs are serviced annually.
  - Service certificates are shown at the compliance and renewal exams (§14.2.1.1–3, p105; §14.2.3.1, p109).
  - The crew must demonstrate physical deployment of the raft at the compliance and renewal exams (§14.2.2.3, p108).
- **General alarm:** required in **any** category if installed power is over 750 kW (§14.6.1, p114).
- **Pyrotechnics:** must be MER-approved or comply with MSN 1676 (Note A, p108).
- **Drills:** recorded in the Official Log Book if the vessel is over 25 GT. MOB drills must be done in a range of light and weather conditions (§14.11, p116).

⚠ = see section (d).

### B5. Fire safety

Sources: §15 (p118–127) and §16 (p128–133). Fire requirements depend mainly on how the vessel is configured, not on its category.

- **Portable extinguishers:**
  - At least one 5A/34B in each accommodation space (§16.2.1.2, p129).
  - Machinery spaces per Table 16.1.1.1 (p128): outboards ≤ 220 kW need one 34B; outboards over 220 kW need a total B rating of 0.3 × P.
  - Inboard diesel < 120 kW: one multipurpose extinguisher at the space entrance.
  - Engine box above deck: a portable extinguisher through a fire port, or a fixed system.
  - Engine compartment below deck: a fixed system.
  - Open boats and RIBs ≤ 8 m with no enclosure and no cooking: at least two 34B (note d, p128).
  - Cooking or heating spaces: Table 16.2.3.1 (p130).
  - Location rules: within 2 m of the control position and of appliances, and within 3 m of fire ports and outboards (§16.3.1.3, p130).
  - Servicing at the MGN 276 Table 1 intervals (§16.3.1.8, p131).
  - Portable CO₂ extinguishers: 2 kg maximum, not in sleeping spaces (§16.3.2, p131).
- **Fixed system:** must be an approved type, serviced at least annually, with a discharge alarm (§16.4.1, p131–132).
- **Fire pump:** power-driven self-priming or hand pump, with a hose, a 10 mm jet nozzle and a spray nozzle. It is not required on open boats or RIBs under 8 m with no enclosure (§16.4.2, p132–133).
- **Fire blanket:** where the CA identifies a need (§16.5, p133).
- **Fire buckets:** 2, where practicable (§16.6, p133).
- **Detectors:**
  - EN 54 fire detectors in machinery spaces, accommodation, appliance spaces and electrical spaces (§15.6.2, p125).
  - CO detectors where there are open-flame, gas or liquid-fuel appliances, or where exhaust can build up (§15.6.3, p125–126).
  - Hydrocarbon gas detectors (§15.6.4, p126).
- **Means of escape:** 2 escape routes from sleeping spaces and from machinery spaces, with some exceptions (§15.7, p126–127).
- **Fire control and safety plan:** required (§15.8, p127).
- **Category-related fire rule:** extra machinery-space insulation applies to vessels with 16+ persons, or in Cat 0/1, or with more than 750 kW per machinery space (§15.1.3.2, p120–122).

### B6. Radio

Table 17.2.1 (p136, notes p137) sets the requirements by category column (0–4, 5, 6) and by GMDSS sea area. The vessel's GMDSS area is stated on its certificate (§17.1.1, p134).

**In every category:**
- 1 portable VHF DSC, plus 1 for each liferaft if more than one raft is carried. It must have 8 hours of battery or charging (§17.4, p135–137).
- 1 VHF Channel 70 DSC watch installation.
- A continuous watch on Ch 70, MSI broadcasts and (where practicable) Ch 16/13 (§17.8, p139).
- Equipment tested before departure (§17.7, p138).

**By category:**

| Item | Cat 0–4 | Cat 5 | Cat 6 |
|---|---|---|---|
| Fixed VHF DSC | 1 | 1 | Fixed **or** portable |
| A2/A3/A4 radio (MF DSC, satellite, or MF/HF DSC with NBDP) | Depends on sea area | Depends on sea area | Satellite only where condition C1 applies |
| NAVTEX | 1 (Cat 4 in A1: recommended only, if voyages < 12 h) | Required where condition C1 applies | Recommended (C3) |
| PLB | 1 | A1: recommended; A1+A2: PLB or EPIRB | A1: C2; beyond A1: PLB or EPIRB |
| EPIRB | 1 (in A1, Note A complicates this for Cat 3/4) | A1: recommended; A1+A2: PLB or EPIRB; A3/A4: 1 | Same as the PLB row |

- C1 means required where up-to-date navigation and weather information can't be obtained reliably by other means (p137).
- Cat 0 needs a second EPIRB that can be put in the liferaft (§17.5.2, p138).
- At least one crew member on open deck must wear a GPS PLB with a light (§17.6.2, p138).
- Exceptions: Cat 4–6 need no GMDSS MSI receiver if information can be obtained by other means. Cat 6 needs no second distress alert means if it has an approved alternative (§17.1.3, p134).

### B7. Navigation

**All categories:**
- Lights, shapes and sound signals per COLREGs and SI 1996/75 (§18, p140–142).
- An adjusted magnetic compass (§19.2, p143–144).
- A signalling lamp (§19.4, p144).
- An echo sounder (§19.5, p144).
- A radar reflector. Cat 6 may be excused if fitting one is impracticable, but then must not go out in fog (§19.6, p144–145).

**By category:**
- Compass light: Cat 0, 1, 2, 3 and 5 (§19.2.7, p144).
- Charts and publications: every category except Cat 6 (§19.3, p144).
- Cat 0–2 must also carry GNSS, a distance log, 3 cm radar and AIS (§19.7, p145).
- Anchors: 2 in Cat 0–4 and 1 in Cat 5–6. Sizes per Tables 20.1 and 20.2. Cable at least 4 × mean length or 30 m (§20.1, p146–147; §20.4.1, p148).
- A towline on every vessel (§20.4.7, p149).

### B8. Medical stores

Medical stores are set in §23.1.1 (p160):

| Category | Medical stores | Extra requirement |
|---|---|---|
| 0 | Category A | Annual checklist (§23.1.4) |
| 1 | Category B | Annual checklist (§23.1.4) |
| 2–6 | Category C | Sealed kit, reviewed at each annual exam (§23.1.5) |

- Pilot boats also carry a compact stretcher (Table 27.2.3, p177).
- The owner's liability for medical care is in §23.3 (p161).

### B9. Manning and qualifications

Sources: §28 (p179–181) and Appendix 5 (p217–222).

**Master certificates (Table A5.1, p218):**

| Certificate | Accepted in categories |
|---|---|
| STCW Master (Workboat < 500 GT, unlimited) | 0–6 |
| STCW Master (Code vessels < 200 GT, unlimited) | 0–6 |
| Yachtmaster Ocean | 0–6 |
| STCW Master (< 200 GT, 150 miles) | 1–6 |
| Yachtmaster Offshore | 1–6 |
| Boatmasters' Licence | 3–6 |
| Yachtmaster Coastal | 3–6 |
| Advanced Powerboat CoC, or Advanced Powerboat Practical issued before 2005 | 3–6 |
| CoC from a Competent Authority | 3–6 |
| Day Skipper Theory & Practical (daylight only) | 4 and 6 |
| Powerboat Level 2 (open boats and RIBs < 3 GT only) | 6 |
| Local Authority Licence | 6 |

**Notes on master certificates:**
- Towing or high-speed operation requires at least an Advanced Powerboat certificate plus relevant experience (Note F, p219).
- RYA certificates need a commercial endorsement. That requires a medical fitness certificate, Basic Sea Survival or PST, and the PPR course (Note 3, p219).
- Certificates of Competency are revalidated every 5 years (§28.1.7, p179).

**Second person (Table A5.1, p218):**

| Category | Second person required |
|---|---|
| 0 | Yachtmaster Offshore or higher |
| 1 | Yachtmaster Coastal or higher |
| 2 | A person the master judges competent |
| 3–6 | A person the owner judges experienced |

**Engineering (Table A5.2, p220):**
- "Power Vessel W" means a vessel used for towing, lifting, or carrying more than 1 t of cargo.
- Cat 3–6: no engineering certificate.
- Cat 2: Approved Engine Course Part 1 (AEC1), for W vessels only.
- Cat 1: AEC1 for other ("SL") vessels; MEOL for W vessels.
- Cat 0: AEC1 for SL vessels. For W vessels: MEOL below 1,500 kW; SMEOL, C/Eng (Y4) or Small Vessel 2nd Engineer between 1,500 and 3,000 kW; STCW III/2 Small Vessel Chief Engineer below 9,000 kW and 3,000 GT.

**Training (Table A5.3, p221):**
- **Everyone working on board** (§28.1.4–28.1.5, p179):
  - Sea survival: STCW PST, or RYA Basic Sea Survival.
  - A valid medical fitness certificate. The Code refers to MIN 698 and doesn't name ENG1 or ML5.
- **First aid:**
  - Non-MLC vessels, Cat 0/1: the master holds Proficiency in Medical Care.
  - Non-MLC vessels, Cat 2–6: at least one person holds EFA, First Aid at Sea, MFA, RYA First Aid or Seafish first aid, covering Category C stores.
  - MLC vessels: STCW-level first aid.
- **Fire fighting:** one crew member on vessels under 15 m; all crew on vessels of 15 m and over.
- **Equipment courses:**
  - Radar course if radar is carried.
  - A 1-day stability course for the master if a Stability Information Booklet is required.
  - An ECS course if chart plotters are carried.
  - Food hygiene level 2 where appropriate.
- **Other:**
  - Dangerous goods training (App. 5 §4, p222).
  - At least one person qualified in distress radio. The Code does not name the certificate (§28.1.8, p179).

**Single-handed operation** (§28.2, p179–181):
- Banned in Cat 0–2.
- In Cat 3–6, allowed only with CA permission and an endorsement, for no more than 8 hours.
- Not allowed in restricted visibility, when towing, on pilot duties, during personnel transfer, or when used as a diving platform.

**Pilot boats:** manned according to MGN 50 (Table 27.2.3, p177).

### B10. Stability

- Rules for all vessels are in §12.1 (p81–82). Calculations use 82.5 kg per person (§12.1.1.1).
- A Stability Information Booklet is required for any of the triggers in summary point 6 (§12.1.1.3).
- Vessels in icing areas need a booklet with icing conditions, or must avoid those areas in winter (§12.1.1.6).
- All other vessels use the §12A heel test: heel ≤ 7°, or ≤ 10° if the freeboard is sufficient. Vessels over 15 m use a GM formula (minimum GM 0.5 m if displacement is estimated, 0.35 m if verified). The maximum permissible weight is recorded on the Certificate (§12A.2, p83–85).
- Open boats and RIBs also need damage, swamp and recovery tests (§12A.3, p85–87).
- Damage survivability applies with 16+ persons, or in Cat 0/1 with 7+ persons (§12B.1, p89).
- The booklet must be approved before the certificate is issued (§12B.6.8, p100).

### B11. Safety management and risk assessment

- **Operations risk assessment and risk assessment of persons on board:** §3.14 (p38).
- **SMS:** §31.2 (p197), with contents set out in App. 8 (p233–237):
  - Policy
  - Risk assessment
  - Health & safety policy, including drugs and alcohol
  - Master's authority, in writing
  - **Person Ashore**
  - Familiarisation training
  - Procedures
  - **Safety briefing**
  - Emergencies (11 scenarios, exercises recorded)
  - Accident reporting
  - Maintenance
  - Review at least every 3 years
- **Cyber security:** §31.3 (p197–198).
- **Deadline:** 13 Dec 2026 (§31.1.1).
- **Other risk assessments the Code requires:** high-speed operations (§25.4.2, p169), towing (§26.3), and Appendix 1 night operations.

### B12. Audit of the existing `codes.js` data if it were applied to workboats

| codes.js item | Problem against WBC | WBC ref |
|---|---|---|
| `CATEGORIES` cat4/5/6 | Wrong descriptions (see summary point 2) | §3.10.1 p36–37 |
| `shortIdFromCategory('Workboat')` | Returns `'cat2'` | — |
| `VESSEL_CERTS` "MCA Coding Certificate", `renew_annual` | The document is the Workboat Certificate (5 years) plus an annual exam and disc, not an annual renewal | §4.3–4.4 p41–42 |
| `pli` `required: true` | WBC only encourages insurance | §1.16 p14 |
| cat6 has no radio licence | A licence is required in all categories | §17.9.1 p139 |
| cat2/3 `stability` book always | A booklet is required only when triggered; otherwise the simplified route | §12.1.1.3 p81 |
| cat1 `gmdss_goc`, `fire_structural` ≥ 15 m, `sea_trials`; cat0 `solas_lsa`, `iamsar_compl`; `epirb_registry` 24 months | **Not WBC requirements** as written. Structural fire triggers are 16+ persons, Cat 0/1 or > 750 kW, not 15 m. The radio certificate is not named | §15.1.3.2 p120; §28.1.8 p179 |
| `loadline`/`tonnage` ≥ 24 m | Irrelevant: WBC vessels are < 24 m LLL. Load-line duties are triggered by cargo > 1 t | §13.2.1 p101 |
| `OWNER_DECLARATIONS`, `stabilityRouteFor` (15 m rule) | SPV only; neither exists in WBC | §12.1.1.3 p81 |
| `EQUIPMENT` lifejackets ×1.1 | 100%, plus 2 if inflatable | §14.4.4 p110 |
| cat0/1 = cat2 slice | Cat 0 needs 2 EPIRBs and 12 parachute flares; Cat 1 needs 6 parachute flares; the medical category differs; SART needed | Table 14.1.2 p106–107 |
| cat3 pyros "2 para, 4 red hand" | WBC: 4 parachute, 6 red hand, 2 smoke | Table 14.1.2 p107 |
| cat4 "inshore pack" | WBC: 0 parachute, 2 red hand, 2 smoke | p107 |
| cat5 "2 red hand, 2 smoke" | WBC: 4 parachute, 6 red hand, 2 smoke | p107 |
| cat4/5/6 no liferaft | Liferaft required in every category | p106 |
| no TPA / SART / NAVTEX / radar / AIS / GNSS | Required as tabled above | — |
| cat4–6 no fixed VHF | Fixed VHF DSC required in Cat 0–5 | Table 17.2.1 p136 |
| first aid A/B/C mapping | Cat 0 = A, Cat 1 = B, Cat 2–6 = C | §23.1.1 p160 |
| fire extinguisher qty from length | Not in WBC; set by configuration | Tables 16.1.1.1, 16.2.3.1 |
| anchors ×1 | 2 anchors in Cat 0–4 | §20.1.1 p146 |
| `CREW_REQS` Day Skipper for Cat 2/3; PB2 for Cat 5; "STCW Basic Safety Training"; "ENG1 or ML5" | See B9. Day Skipper is not valid in Cat 2/3. PB2 is not valid in Cat 5. The Code names neither STCW BST nor ENG1/ML5 | Table A5.1 p218; Table A5.3 p221 |
| `SMS_SCHEMA` refs | Cite SPV App. 7. WBC = App. 8 + §31.3 | p197, p233–237 |
| app.js:6641 placeholder "Workboat Ed.3 Annex L" | WBC has no Annex L; the Annexes are 1–3 | contents p11 |
| `blog/workboat-vs-spv-code.html:117` "commercial inshore fishing — you're Workboat Code" | WBC never mentions fishing vessels as in scope. They normally come under the fishing vessel regulations, but the Code text doesn't settle this. **verify** | §3.1 p31 |

---

## (c) JavaScript data (same shapes as codes.js, every item has `ref`)

The same file was syntax-checked and run under node with a sample vessel, and every item has a `ref`. Copy is at `/tmp/claude-0/-home-user-codedok/354758c1-4fbb-5a45-bae8-c860ab93c6d2/scratchpad/codes/wbc-data.js`.

```js
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
```

---

## (d) What I could not determine (all marked `verify: true` in the data)

1. **EPIRB and PLB carriage for Cat 3–6.** Table 14.1.2 (p107) says no EPIRB for Cat 3–6, and no PLB for Cat 4–6 (Cat 3 is only "R", recommended). Table 17.2.1 (p136) says Cat 0–4 need a PLB and an EPIRB (1 each) in every GMDSS area. For Cat 5–6 it gives PLB/EPIRB options by sea area. Note A (p137) then says an EPIRB is only "recommended" for Cat 3/4 in A1. On top of that, §17.6.2 (p138) requires at least one crew member on open deck to wear a GPS PLB, on every vessel. In the data I marked EPIRB and PLB as `mandatory: null, verify: true` for Cat 3–6. **Ask the MCA or a CA which table takes precedence.**
2. **The Cat 5 lifebuoy column in Table 14.1.2 (p106) doesn't add up.** The sub-rows (1 with light + 1 with line + 1 plain) come to 3, but the total row says 2. For 16+ persons they come to 6 against a total of 4. Every other column adds up. Cat 5 is probably meant to match Cat 3 for the "without attachments" row, but I haven't assumed that.
3. **Cat 0 smoke signals.** The Cat 0 cell reads "2 buoyant held" (rendered p107). It is unclear whether this means buoyant only, or buoyant or hand-held.
4. **Footnotes 80 and 83–87 in Table 17.2.1 (p136) are missing.** The table refers to them (A1⁸⁰, EPIRB⁸³, Ch70⁸⁴, PLB⁸⁵⁻⁸⁷), but they aren't printed. Footnotes with those numbers elsewhere in the Code are about other things.
5. **Type of medical fitness certificate.** §28.1.5 (p179) says only "valid medical fitness certificate. See MIN 698". The Code never mentions ENG1 or ML5. MIN 698 was not provided.
6. **Radio operator qualification.** §28.1.8 (p179) requires one person with a valid licence or CoC "appropriate to the area category", issued by Ofcom. SRC, LRC and GOC are never named.
7. **Service intervals the Code leaves to other documents:**
   - Portable extinguishers follow MGN 276 Table 1 (§16.3.1.8, p131). Not reviewed.
   - Pyrotechnics have no interval in the Code, so the manufacturer's expiry applies.
   - Liferafts (other than valise rafts) and EPIRBs follow the manufacturer's schedule.
   - The validity of the Ship's Radio Licence is not stated.
   - The EPIRB registration renewal period is in MGN 665, not reviewed.
   - The validity period of the DoC for dangerous goods was not reviewed.
8. **Wording of §14.12.1 (p117).** It says "a waterproof electric signalling lamp **and** either (.1) a waterproof electric signalling lamp and (.2) a searchlight, **or** (.3) a daylight lamp with searchlight capability". The clause repeats itself, so I can't be sure of the minimum kit.
9. **Second SART, §14.12.4 (p117).** The exemption conditions (dedicated SAR area **and** an EPIRB with 121.5 MHz that is non-float-free) are hard to apply. I recorded them verbatim.
10. **Radio survey trigger, §17.10.1 (p139).** It applies "where a vessel is fitted with GMDSS radio equipment". The Code doesn't say whether a VHF-DSC-only installation counts.
11. **Load Line certificate.** For cargo over 1 t, §13.2.1 (p101) requires compliance with the LL Regs 1998, while App. 10 says the WBC certificate "is equivalent to a UK Load Line Exemption Certificate". Whether a separate LL certificate is issued is unclear. §1.10 (p13) says one "may additionally be issued". No tonnage certificate requirement appears anywhere in the Code.
12. **Table A5.1 second-person rows vs. single-handed operation.** The table doesn't say whether the Cat 3–6 "second person" row still applies when the CA has endorsed the vessel for single-handed operation under §28.2.
13. **Table A5.2 (p220).** Note 2 points to "Table A7.1", which doesn't exist (App. 7 is about oil pollution). It is probably a typo for A5.1. It is also unclear whether the STCW III/2 Small Vessel Chief Engineer row applies to Cat 0 "W" vessels only.
14. **Cross-reference typos in Table 14.1.2.** The rearming-kit row cites §14.4.5, but the rule is in §14.4.6. The spray-hood row cites §14.4.6, but the rule is in §14.4.7. I used the text sections.
15. **The meaning of "Personal Emergency Radio Devices"** in Table 14.1.2. I assumed it means PLBs, matching §17.6.
16. **Pilot boat pyrotechnics.** Table 27.2.3 (p177) lists 6 red rocket parachute flares. It doesn't say whether these replace or add to the Table 14.1.2 quantity.
17. **Documents the Code refers to that I couldn't read:** MIN 698, MGN 50 (pilot boat manning), MSN 1676 (pack contents), MGN 496, MGN 411 and MGN 665. Any requirement that rests on these is marked `verify`.
18. **The MLC certificate statement** (App. 10 p241, p244, p247, p251) makes the certificate valid for some voyages only with an MLC report. The trigger conditions are paraphrased.
19. **Not audited in detail:** Annex 1 (alternative fuels), Annex 2 (remotely operated unmanned vessels), Annex 3 (police boats), the §15.1.3 structural-fire insulation tables, the §21B MLC accommodation rules, the §25/26 cargo, lifting and towing detail, and the §29 dangerous goods detail. Each is cited, but not turned into data.
20. **The SPV side of codes.js was not audited against the SPV Code**, apart from confirming that the area category definitions are the same (SPV §3.10.1, p37–38). In particular I have not checked the SPV references in `OWNER_DECLARATIONS` and `stabilityRouteFor` (SPV §2.4, §4.3, §5.7, §6.2).
