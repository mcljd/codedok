# SPV Code 2025 audit of `app/codes.js`

**Source:** *The Sport or Pleasure Vessel Code* (MCA, published 20 November 2025; legal effect via SI 2025/1195), `spv.pdf` (281 pp).
**Page numbers:** "p" = PDF page. In this PDF the printed page number matches the PDF page number. I checked this on pp 3, 33, 115, 137, 143, 231 and 235.
**Method:** I read the full text of every section relevant to the app's data. I rendered the complex tables to images and read them (14.1.2, 14.2.5.1, 16.1.1.1, 17.2.1, A5.1, A5.2, A5.3) because pdftotext scrambles their columns.

---

## (a) Summary: the biggest errors

1. **Skipper qualifications are wrong in a way that could leave a skipper unqualified** (Table A5.1, p231):
   - The app accepts **Day Skipper for Cat 2 and Cat 3**. The Code accepts Day Skipper (daylight only) **only in Cat 4 and Cat 6**. Cat 2 needs **Yachtmaster Offshore** or higher. Cat 3 needs **Yachtmaster Coastal / Boatmaster / Powerboat Advanced / CoC**.
   - The app accepts **Powerboat Level 2 for Cat 5**. PB2 is valid **only in Cat 6**, only on open boats, RIBs and inflatables under 10 m, and only with 12 months' experience.
   - The app accepts **Yachtmaster Offshore for Cat 0**. Cat 0 needs **Yachtmaster Ocean or an STCW Master (unlimited)** qualification.
   - Every category also requires a **second person**, and that requirement is missing from the app. The standard rises with the category: Cat 1 needs a Yachtmaster Coastal, and Cat 0 needs a Yachtmaster Offshore or higher.
2. **Area category definitions.** Cat 5 is shown as "5 nm summer / 3 nm winter". The Code says Cat 5 is **within 3 miles of land and no more than 3 miles' radius from the point of departure (or the seaward boundary of categorised waters), in favourable weather**. Cat 4 is missing **"and in daylight"** (§3.10.1, p37).
3. **Liferafts are required in every category, 0 to 6** (Table 14.1.2, p115). The app has none for Cat 5 or Cat 6, and shows "liferaft / lifebuoy" for Cat 4. Liferaft standards are also wrong:
   - The pack is **SOLAS B for Cat 2–3**, not A.
   - Cat 0 rafts must be SOLAS standard. ISO 9650 rafts are not allowed in Cat 0.
   - Cat 0, and Cat 1 vessels carrying 16 or more persons, need **redundant capacity**: enough to carry everyone with any one raft lost.
4. **Lifejackets**:
   - The app accepts **100N lifejackets (Cat 4/5)**. The Code accepts only **150 N, 275 N or SOLAS** standards (§14.4.1).
   - Quantity is **100% of persons plus 2 spares if inflatable**, not ×1.1 (§14.4.4).
   - Lifejacket lights are required in Cat 0, 1, 2, 3 and 5.
   - **TPAs for 100% of persons** (Cat 0–5) are missing from the app.
5. **Flares are wrong in Cat 0, 1, 3, 4, 5 and 6** (Table 14.1.2). The Code requires:

   | Category | 6 | 5 | 4 | 3 | 2 | 1 | 0 |
   |---|---|---|---|---|---|---|---|
   | Parachute | 0 | 4 | 0 | 4 | 4 | 6 | 12 |
   | Red hand | 2 | 6 | 2 | 6 | 6 | 6 | 6 |
   | Smoke | 2 | 2 | 2 | 2 | 2 | 2 (buoyant) | 2 (buoyant) |

   Only the app's Cat 2 values are right.
6. **Radio**:
   - A **fixed VHF DSC is required in Cat 0–5**. The app has only a handheld for Cat 4/5 and no radio at all for Cat 6. Cat 6 needs a fixed **or** portable VHF DSC.
   - **NAVTEX** is required in Cat 0–3 and is missing everywhere.
   - **EPIRB**: Cat 0 needs 2, Cat 1–2 need 1, and Cat 3/4 need 1 (see the conflicts in section d). The app has no EPIRB for Cat 3–4 and Cat 0 inherits only 1.
   - **SART ×2** is required for Cat 0/1 and missing.
   - **MF DSC or satellite** is required in Sea Area A2 and above, and is missing.
   - The app makes the **PLB mandatory in Cat 3**. It is only recommended there.
   - A **Ship Radio Licence** is required for every vessel (§17.9.1). The app omits it for Cat 6.
7. **Medical stores**: the Code requires **Cat A for Cat 0, Cat B for Cat 1, Cat C for Cat 2–6** (§23.1.1). The app uses Cat B for Cat 4/5 and "Basic" for Cat 6, and gives Cat 0/1 Cat C.
8. **Stability**:
   - **15 m is not the trigger for a Stability Information Booklet.** A booklet is required for:
     - Cat 0/1;
     - 16 or more persons;
     - activity-related equipment over 1000 kg or with free-surface effect;
     - a lifting device (§12.1.1.3).

     The 15 m threshold only changes the heel-test calculation (§12A.2.4).
   - The "owner declaration + naval architect" route does not exist. Stability information is **approved by the Certifying Authority**.
9. **Owner declarations**:
   - The four annual declarations (compliance, manning, stability, radio) **do not exist in the Code**. All four `ref`s point to unrelated paragraphs: "§2.4" is in the definitions, "§6.2" is doorways/hatches, "§4.3" is the examination regime, and "§5.7" is RIB construction.
   - What the Code does require from the owner:
     - the **owner's annual examination**, with the SCV2 signed and sent to the CA (Group 1 vessels only);
     - an annual RIB airtightness declaration;
     - notifying the CA before any modification;
     - reporting incidents to the CA.
10. **Certificates that should be removed.** None of these are in the Code:
    - GMDSS GOC, IAMSAR evidence, "SOLAS LSA cert", sea-trials documents and "structural fire protection records ≥15 m".
    - Load line and tonnage certificates. The Code applies only to vessels under 24 m load line length, and the SPV certificate is equivalent to a Load Line Exemption Certificate (p263).
    - STCW Basic Safety Training for Cat 0 crew. The Code requires RYA Basic Sea Survival or Personal Survival Techniques.
11. **Insurance (`pli`)** is marked `required: true`. The Code only *encourages* insurance (§1.13), though local authorities may require it (§1.9).
12. **Certificates missing from the app**:
    - **SCV2**;
    - annual **identification disc** (§4.2.4);
    - **SMS**, due within 3 years of entry into force and reviewed at least every 3 years;
    - EPIRB registration for all categories;
    - **EIAPP** for diesel engines over 130 kW;
    - a fire control plan where a Stability Information Booklet is required or power is 750 kW or more;
    - a garbage management plan for 15 or more persons.
13. **Fire**:
    - The extinguisher formula (length/5, length/6) is not in the Code. Requirements are set per space (Tables 16.1.1.1 and 16.2.3.1).
    - The app is missing:
      - fire pump, or 13A/113B extinguishers (1 if under 15 m and 15 or fewer persons; otherwise 2);
      - fire, CO and gas detectors;
      - fire buckets.
    - A fire blanket is only one option for open-flame cooking, not a fixed requirement.
14. **Bilge pumps**: every category needs **one hand pump and one powered pump** (§11.2.1.1). The app shows 1 for Cat 3–5. Cat 0/1 need a combined 210 L/min. Bilge alarms are missing.
15. **Navigation**:
    - Cat 0–2 need **GNSS, log, AIS and 3 cm radar** (§19.7), all missing.
    - Echo sounder, radar reflector and signalling lamp are required in all categories and missing.
    - Cat 0–3 need **two anchors**, and Cat 4/5 need two at 90% mass.
16. **Crew training**:
    - Missing from the app:
      - **sea survival** for all crew;
      - **fire-fighting course** (within 5 years);
      - **radar course** for Cat 0–2;
      - **stability course** where a booklet is required;
      - engineering qualifications (Table A5.2).
    - First aid for Cat 0/1 needs **Proficiency in Medical Care** for the Master.
    - The Code does **not** name ENG1/ML5 or VHF SRC. It only requires "a valid medical fitness certificate (see MIN 724)", and radio operator certificates come from Ofcom licensing.
17. **SMS refs (App. 7 §1–§11) are all correct.** Minor fixes:
    - Add **§12 (single-handed operation)**.
    - Use the Code's exact section titles.
    - Cite §30.1.1 (3-year deadline).
    - The MAIB "within 24 hours" text and phone number are not from the Code.
    - The file header calls this "Edition 1". The Code says it is the **second edition** (§1.8).

---

## (b) Discrepancy table

Legend: **W** = wrong, **M** = missing, **R** = should be removed, **V** = needs verifying (Code silent or self-contradictory).

### Categories, scope, dates

| # | App value | Code value | Code ref (PDF p) | |
|---|---|---|---|---|
| 1 | cat4 "Up to 20 nm in favourable weather" | Up to 20 miles from a safe haven, **in favourable weather and in daylight** | §3.10.1 (p37) | W |
| 2 | cat5 "5 nm summer / 3 nm winter from safe haven" | Within 3 miles of land **and** ≤3 miles radius from point of departure to sea / seaward boundary of categorised waters, favourable weather (no summer/winter split) | §3.10.1 (p37) | W |
| 3 | cat6 "Up to 3 nm in favourable weather, daytime only" | As Cat 5 + daylight ("daylight" = 1 h before sunrise to 1 h after sunset) | §3.10.1 (p37); Defs (p20) | W (incomplete) |
| 4 | cat0–3 descriptions | Correct ("up to" = not including the limit) | §3.10.1 (p38); Defs (p31) | OK |
| 5 | — | RCR design category ↔ area: 0/1 → A, 2/3 → B, 4/5/6 → C | Table 3.10.2 (p38) | M |
| 6 | — | Scope: ≤12 passengers, no cargo, <24 m load line length ("small vessel") | §1.1 (p12), §3.1.1 (p33), Defs (p29) | M |
| 7 | — | Exam Group 1 = ≤15 persons and Cat 2–6; Group 2 = ≥16 persons and/or Cat 0/1 | §4.3.1 (p42) | M |
| 8 | Header "Edition 1" | "This is the second edition of the Code" | §1.8 (p12) | W |
| 9 | — | Entry-into-force date **not stated in Code**. Existing vessels comply by next renewal or 3 years after entry into force (whichever is later). SMS within 3 years. Fire-fighting/stability courses within 5 years | App. 12 §3 (p253); §30.1.1 (p210); §28.10 (p205); Table A5.3 (p235) | M / V |

### VESSEL_CERTS

| # | App value | Code value | Code ref (PDF p) | |
|---|---|---|---|---|
| 10 | `coding` "MCA Coding Certificate", 60 months, `renew_annual` | "Sport or Pleasure Vessel Certificate", **≤5 years** (CA may set less). Annual exam ±3 months (≤15 months apart): **owner** for Group 1, **Authorised Person** for Group 2. Intermediate exam so ≤36 months between AP exams. Renewal before expiry. Suspended if exam missed | §4.2.2 (p42); Table 4.3.1 (p43-44); §4.5–4.7 (p44-47); §4.10.5 (p49) | W (name / detail) |
| 11 | — | SCV2 (signed, current) carried on board or kept ashore | §4.1.1.5 (p41) | M |
| 12 | — | Identification disc issued **annually**, displayed visibly | §4.2.4 (p42) | M |
| 13 | `stability` for cat2/cat3 only | Stability Information Booklet required for Cat 0/1, ≥16 persons, activity equipment >1000 kg or free-surface effect, or lifting device. Otherwise §12A assessment; results approved by CA | §12.1.1.3 (p87-88); §12A.1 (p90); §4.2.1.2 (p42) | W |
| 14 | `radio` Ship Radio Licence, 120 months; absent for cat6 | Required for **all** vessels incl. Cat 6. Validity not given in Code (Ofcom) | §17.9.1 (p147) | W / V |
| 15 | `pli` required:true, 12 months | Insurance only **encouraged/advised**; local authorities may require | §1.9 (p13); §1.13 (p13-14) | W |
| 16 | `mmsi` cat2–3 | MMSI marked on fixed radio; implied wherever DSC is fitted (cat 0–6) | §17.3.4 (p145) | W (scope) |
| 17 | `loadline`, `tonnage` (≥24 m) | Out of scope (<24 m load line length). SPV certificate "is equivalent to UK Load Line Exemption Certificate" | Defs "Small vessel" (p29); App. 14 (p263) | R |
| 18 | `gmdss_goc` (cat0/1) | Not in Code | — | R |
| 19 | `epirb_registry` cat0/1 only, 24 months | Registration (MGN 665) required for **every** EPIRB/406 PLB, any category. Interval not given in Code | §17.5.5 (p147) | W / V |
| 20 | `fire_structural` (≥15 m) | Not a Code document. Machinery-space insulation tables apply to ≥16 persons, Cat 0/1 or >750 kW per space | §15.1.3.2 (p128-129) | R |
| 21 | `sea_trials` | Not in Code | — | R |
| 22 | `solas_lsa` (cat0), `iamsar_compl` (cat0) | Not in Code | — | R |
| 23 | — | Safety Management System (App. 7), review ≤3 years | §30 (p210); App. 7 §11.1 (p245) | M |
| 24 | — | Operational risk assessment presented at issue/renewal | §3.13 (p39) | M |
| 25 | — | Certificate of construction / evidence of strength | §5.3 (p53-55) | M |
| 26 | — | Fire control & safety plan (Stability Information Booklet vessels or ≥750 kW; recommended otherwise) | §15.8 (p135-136) | M |
| 27 | — | EIAPP certificate + Technical File (diesel >130 kW, built ≥2000) | §29.5.1 (p208) | M |
| 28 | — | Garbage Management Plan (≥100 GT or ≥15 persons); placards >12 m | Table 29.3.3 (p208) | M |
| 29 | — | Official Log Book (UK-registered ≥25 GT) | §3.16.1 (p40) | M |
| 30 | — | Medical stores checklist reviewed annually | §23.1.4 (p170) | M |
| 31 | — | Radio survey every 5 years (recommended, GMDSS radio) | §17.10.1 (p147-148) | M (optional) |
| 32 | — | MLC inspection report (Cat 0–2 international or >60 miles with seafarers) | App. 14 (p264) | M / V |

### OWNER_DECLARATIONS and stability

| # | App value | Code value | Code ref (PDF p) | |
|---|---|---|---|---|
| 33 | `decl_compliance` "SPV Code 2025 §2.4", annual, all cats | No such declaration. §2 is Definitions. Nearest real requirement: owner's **annual examination** with signed SCV2 (Group 1 only) | §4.3.2.3 (p43); §4.5.2 (p45) | W |
| 34 | `decl_manning` "§6.2" | No manning declaration in Code. §6.2 = doorways & hatchways | §6.2 (p61) | R |
| 35 | `decl_stability` "§4.3" | No annual stability declaration. §4.3 = examination regime. Real duty: notify CA of modifications; lightship check | §3.5.8 (p35); §12.1.1.6 (p88) | W / R |
| 36 | `decl_radio` "§5.7"; "GMDSS-qualified operator" | No radio declaration. §5.7 = RIB construction. No GMDSS operator requirement | §5.7 (p58) | R |
| 37 | — | RIB/inflatable airtightness test annually by owner + declaration to CA | §4.9 (p48-49) | M |
| 38 | — | Report incidents to CA (non-reporting invalidates certificate) | §4.8.1, §4.8.5 (p47-48) | M |
| 39 | `stabilityRouteFor`: <15 m → simplified declaration; ≥15 m → booklet | Trigger is §12.1.1.3 (category / persons / equipment / lifting), **not length**. 15 m only adds the GM formula to the heel test | §12.1.1.3 (p87-88); §12A.2.4 (p90-91) | W |
| 40 | "Owner declaration + naval architect" | Tests by a competent person; results **approved by the CA**; max weight on certificate | §12A.1.1–12A.1.2 (p90) | W |
| 41 | — | Damage stability: ≥16 persons, or Cat 0/1 with ≥7 persons | §12B.1 (p98) | M |
| 42 | — | Re-check lightship after modification (>5% change → reassess) and at the renewal after 20 years | §12.1.1.6–7 (p88-89) | M |

### EQUIPMENT: life-saving appliances (Table 14.1.2, p115)

| # | App value | Code value | Code ref (PDF p) | |
|---|---|---|---|---|
| 43 | Liferaft cat2–4 only; cat5/6 none | Liferaft **required in all categories 0–6** | Table 14.1.2 (p115) | M |
| 44 | cat2 "ISO 9650-1 Group A or SOLAS" | Cat 0: SOLAS only + A pack. Cat 1: SOLAS or ISO 9650-1 **Type 1** + A pack. Cat 2–3: + **SOLAS B pack**. Cat 4–5: E pack. Cat 6: also open reversible | Table 14.2.5.1 (p119) | W |
| 45 | qty "capacity for all persons" (all) | Cat 0 and Cat 1 ≥16 persons: enough capacity with **any one raft lost** | §14.2.4.1 (p118) | W |
| 46 | Liferaft service 12 months | Per manufacturer's schedule. Annual for valise rafts, Cat 2/3 outside UK SRR <10 °C, and Cat 6 open reversible rafts. Up to 30 months under General Exemption. HRU annual | §14.2.1.1–2 (p114); §14.2.1.4 (p117) | V |
| 47 | Lifejacket qty ceil(persons × 1.1) | 100% of persons (incl. <32 kg sizes) **+2 spare if inflatable** | §14.4.4 (p121) | W |
| 48 | Lifejacket "100N+" (cat4/5) | Only SOLAS/UKCA/MED/DfT, ISO 12402-3 (150) or 12402-2 (275). Light on Cat 0/1/2/3/5. Inflatables serviced annually | §14.4.1–14.4.9 (p121-122) | W |
| 49 | — | Spray hoods 100% (Cat 0/1); rearming kits recommended (0/1) | §14.4.6–7 (p121-122) | M |
| 50 | — | TPAs 100% persons Cat 0–5 (Cat 6 conditional) | §14.5 (p122) | M |
| 51 | Lifebuoy ×1 cat5/6 only | Total 2 (<16 persons) / 4 (≥16) in **every** category. Lights on Cat 0/1/2/3/5. 1 with 18 m buoyant line. Sailing: Dan-buoy (+ light Cat 0–3) | Table 14.1.2 (p115); §14.3 (p121) | W / M |
| 52 | Pyros cat2 "4 para, 6 red hand, 2 smoke" | Correct for Cat 2 | Table 14.1.2 (p115) | OK |
| 53 | Pyros cat3 "2 para, 4 red hand, 2 smoke" | 4 para, 6 red hand, 2 smoke | Table 14.1.2 | W |
| 54 | Pyros cat4 "inshore pack" | 0 para, 2 red hand, 2 smoke | Table 14.1.2 | W |
| 55 | Pyros cat5 "2 red hand, 2 smoke" | **4 para**, 6 red hand, 2 smoke | Table 14.1.2 | W |
| 56 | Pyros cat6 "basic" | 0 para, 2 red hand, 2 smoke | Table 14.1.2 | W |
| 57 | Pyros cat0/1 (= cat2) | Cat 1: 6 para / 6 red / 2 buoyant smoke. Cat 0: **12 para** / 6 red / 2 buoyant smoke | Table 14.1.2 | W |
| 58 | Pyros service_months 36 | Code gives no interval; approval UKCA/MED or MSN 1676; replace by expiry | Table 14.1.2 Note A (p115) | V |
| 59 | — | General alarm (Cat 0/1 with ≥16 persons; or >750 kW any category) | §14.6 (p123) | M |
| 60 | — | Means of recovery from water; training manual; LSA maintenance manual; Life-Saving Signals table | §14.7–14.10 (p123-125) | M |
| 61 | — | Signalling lamp + searchlight (Cat 0/1/2/3/5) | §14.11.1 (p125) | M |
| 62 | `sart` absent | Cat 0/1: 2 SARTs (1 under §14.11.4). Any vessel outside SAR coverage: SART/AIS-SART/EPIRB-AIS | §14.11.2–4 (p125) | M |

### EQUIPMENT: radio (Table 17.2.1, p143-144)

| # | App value | Code value | Code ref (PDF p) | |
|---|---|---|---|---|
| 63 | `vhf_fixed` cat0–3 only | Fixed VHF DSC (Ch 70 watch) **Cat 0–5**. Cat 6: fixed **or** portable VHF DSC | Table 17.2.1 (p143) | M (cat4/5/6) |
| 64 | `vhf_handheld` cat0–5 | Portable VHF required in **all** categories. 1 per liferaft if >1 raft | §17.4.1, §17.4.8 (p146); Table 14.1.2 | M (cat6) |
| 65 | `epirb` cat0–2 only, ×1, service 60 months | Cat 0: **2**; Cat 1/2: 1; Cat 3/4: 1 (Table 14.1.2; see section d); Cat 5: "R or 1" (A2: 1); Cat 6: R. Maintenance per manufacturer (no 60-month figure) | Table 14.1.2 (p115); Table 17.2.1 Note B (p144); §17.5 (p146-147) | W / M / V |
| 66 | `plb` mandatory cat3; optional cat2 | Recommended Cat 2–6. "Yes" for Cat 0/1 in Table 14.1.2 but "recommended" in §17.6.1. **Mandatory, worn by the Master, when single-handed** | Table 14.1.2; §17.6.1 (p147); §28.2.4.2 (p200) | W / V |
| 67 | `navtex` absent | Cat 0–3: required. Cat 4: required in A2–A4 (A1: not for <12 h voyages). Cat 5: conditional (C1). Cat 6: recommended | Table 17.2.1 + Note C (p143-144) | M |
| 68 | `mf_radio` absent | MF DSC or recognised satellite service in Sea Area A2 (A3: satellite) for Cat 0–5 | Table 17.2.1 + Note A (p143-144) | M |

### EQUIPMENT: fire (Sections 15–16)

| # | App value | Code value | Code ref (PDF p) | |
|---|---|---|---|---|
| 69 | Extinguishers qty max(2, ceil(length/5 or /6)); 2 / 1 | No length formula. Engine protection by power. 1×5A/34B per accommodation space. Galley per Table 16.2.3.1. Open boats ≤8 m: 2×34B. Servicing per MGN 276 | Table 16.1.1.1 (p137); §16.2 (p138); Table 16.2.3.1 (p139); §16.3.1.7 (p139) | W |
| 70 | Fire blanket mandatory (cat2/3) | Only one option for open-flame cooking spaces (or 8A/68B extinguisher, or fixed system) | Table 16.2.3.1 (p139); §16.5 (p141) | W |
| 71 | — | Fire pump, **or** 1×13A/113B (<15 m and ≤15 persons) / 2× (≥15 m or ≥16 persons) | §16.4.2 (p141) | M |
| 72 | `fire_ext_fixed` absent | Optional for inboard engines >120 kW. Annual service | Table 16.1.1.1 (p137); §16.4.1.2 (p140) | M |
| 73 | — | Fire detectors, CO detectors (all accommodation), hydrocarbon gas detector | §15.6 (p133-134) | M |
| 74 | — | 2 fire buckets where practicable | §16.6.1 (p141) | M |

### EQUIPMENT: navigation, anchors, bilge, medical, personnel

| # | App value | Code value | Code ref (PDF p) | |
|---|---|---|---|---|
| 75 | Compass cat2/3 only | Compass **all categories**; compass light Cat 0/1/2/3/5; deviation record | §19.2 (p153-154) | M |
| 76 | Nav lights cat2/3 only | All vessels (COLREGs). <12 m: efficient sound signal. 12–20 m: whistle. 20–24 m: + bell | §18, Table 18.4 (p149-152) | M |
| 77 | Horn cat2 only | Sound signal per COLREGs, all vessels | §18.3 (p149) | W |
| 78 | Torch cat2 | Not a Code item. Code needs a **waterproof electric signalling lamp** (all) | §19.4.1 (p154) | W |
| 79 | — | Charts/publications; echo sounder; radar reflector (all; Cat 6 may be excused) | §19.3, 19.5, 19.6 (p154-155) | M |
| 80 | — | Cat 0–2: GNSS, log, AIS, 3 cm radar | §19.7.1 (p155) | M |
| 81 | Anchor ×1 (all) | Cat 0–3: **2 anchors** per Table 20.1.1. Cat 4/5: 2 at ≥90%. Cat 6: 1 at ≥ kedge mass | §20.1 (p156); Table 20.1.1 (p157) | W |
| 82 | Bilge pump 1 (cat3–5) / 2 (cat2) / bailer (cat6) | **1 hand + 1 powered** in every category. Cat 0/1: ≥210 L/min combined (powered ≥140). Open boats <6 m in Cat 6: hand pump, bailer or 10 L bucket | §11.2 (p84-85) | W |
| 83 | — | Bilge alarm in machinery compartment(s) | §11.3 (p85-86) | M |
| 84 | First aid cat2/3 C; cat4/5 B; cat6 "Basic" (A); cat0/1 inherit C | Cat 0 → **A**; Cat 1 → **B**; Cat 2–6 → **C** | §23.1.1 (p170) | W |
| 85 | `first_aid_c` note "MGN 71(M)+(F)" | Code refers to MIN 724 for current requirements | §23.1.1 (p170) | V |
| 86 | Kill cord optional, cat2 | Mandatory (+ spare) for open boats/RIBs/inflatables, or wherever the helm could fall overboard | §8.9.2 (p71-72) | W |
| 87 | — | Safety harnesses: min 2 on decked vessels; 1 per person on sailing vessels; jackstays (sailing, Cat 0–3) | §22.2.4 (p167) | M |
| 88 | `EQUIPMENT.cat0/cat1 = cat2.slice()` | Cat 0/1 differ: spray hoods, SART, 2 EPIRBs (Cat 0), medical A/B, pyros, liferaft standard, bilge capacity | multiple | W |

### CREW_REQS (App. 5, p231-235; §28, p198-205)

| # | App value | Code value | Code ref (PDF p) | |
|---|---|---|---|---|
| 89 | cat0 "Yachtmaster Offshore (Commercial) or higher" | **Yachtmaster Ocean**, STCW Master <200 GT unlimited, or STCW Master Workboat <500 GT | Table A5.1 (p231) | W |
| 90 | cat1 Yachtmaster Offshore | Correct (YM Offshore or higher). Also needs a 2nd person with Yachtmaster Coastal | Table A5.1 (p231) | OK / M |
| 91 | cat2 Day Skipper (Commercial) | **Yachtmaster Offshore or higher**. 2nd person competent and briefed | Table A5.1 (p231) | W |
| 92 | cat3 Day Skipper | **Yachtmaster Coastal**, Boatmaster, Powerboat Advanced, or CoC (or higher) | Table A5.1 (p231) | W |
| 93 | cat4 Day Skipper or PB Level 2 | Day Skipper T&P (daylight) **OK**. **PB2 not accepted** in Cat 4. Also Coastal/Boatmaster/PB Advanced/CoC | Table A5.1 (p231) | W |
| 94 | cat5 PB Level 2 | **Not accepted**. Needs Coastal/Boatmaster/PB Advanced/CoC (Day Skipper not accepted either) | Table A5.1 (p231) | W |
| 95 | cat6 PB Level 2 | Accepted only with 12 months' experience and only for open boats/RIBs/inflatables <10 m. Also Day Skipper (daylight), Local Authority Licence, or any higher | Table A5.1 Note H (p231-232) | W (incomplete) |
| 96 | — | RYA/MCA certificates must be **commercially endorsed** | §28.1.5 (p198); Note 3 (p232) | M |
| 97 | — | Second person on board (all categories; standard varies by category) | Table A5.1 (p231) | M |
| 98 | "ENG1 medical or ML5" | Code requires "a valid medical fitness certificate (see MIN 724)". ENG1/ML5 not named | §28.1.3 (p198) | V |
| 99 | "VHF SRC / GMDSS GOC" | Not in Code (Ofcom licensing) | — | V / R (GOC) |
| 100 | cat0 "STCW Basic Safety Training" (skipper + crew) | **RYA Basic Sea Survival or Personal Survival Techniques** for all crew (PST if on STCW route) | Table A5.3 (p235) | W |
| 101 | First aid (RYA) cat0–3 | Cat 0/1: Master **Proficiency in Medical Care** (unless crew has equivalent) + STCW medical first aid. Cat 2–6: one person EFA/RYA First Aid/SeaFish Basic. App has none for Cat 4–6 | Table A5.3 (p235); §23.2.1 (p170) | W / M |
| 102 | — | Fire-fighting course: <15 m Master **or** 1 crew; ≥15 m Master **and** 1 crew (within 5 years) | §28.10 (p205) | M |
| 103 | — | Radar course for Master + watchkeepers in Cat 0–2 | §28.8.1 (p204) | M |
| 104 | — | Stability course for Master where a Stability Information Booklet is required (within 5 years) | Table A5.3 (p235) | M |
| 105 | — | Engineering: Table A5.2 (Cat 0/1 sail: RYA Diesel; power: AEC1 / MEOL…) | Table A5.2 (p233) | M |
| 106 | — | Single-handed operation prohibited in Cat 0–2 | §28.2.1 (p199) | M |
| 107 | — | CoCs and Boatmaster licences revalidated every 5 years | §28.1.10 (p198) | M |

### SMS_SCHEMA (App. 7, p239-245)

| # | App ref / text | Code | Code ref (PDF p) | |
|---|---|---|---|---|
| 108 | `meta` "App. 7 §1 — General"; blurb cites §30.1.2 | App. 7 §1.1 is the list of required headings. §30.1.2 is correct | App. 7 §1.1 (p239); §30.1.2 (p210) | OK (minor) |
| 109 | `hs_policy` §2, §2.2, §2.3, §2.4 | Correct | App. 7 §2 (p239) | OK |
| 110 | `risk` §3, §3.2 | Correct. Also links to §3.13 risk assessment | App. 7 §3 (p240) | OK |
| 111 | `roles` §4, §4.2.1, §4.4, §4.7 | Correct | App. 7 §4 (p240-241) | OK |
| 112 | `training` §5, §5.2, "Section 28" | Correct | App. 7 §5 (p241-242) | OK |
| 113 | `sop` §6, §6.1, §6.2 | Correct | App. 7 §6 (p242-243) | OK |
| 114 | `emergency` §7, §7.1, §7.2, §7.5 | Correct. Also §7.3 continuous comms with shore base | App. 7 §7 (p243) | OK |
| 115 | `reporting` §8.1–8.3, "Section 3", MIN 724 | Correct. **MAIB "within 24 hours" and phone/email are not from the Code** | App. 7 §8 (p243-244); §3.6 (p35) | V |
| 116 | `maintenance` §9.1, §9.2, §3.5 | Correct | App. 7 §9 (p244) | OK |
| 117 | `cyber` §10.2, §10.3 (5-year refresh) | Correct. Missing §10.4 alert at control position, §10.5 electronic log of remote access, §10.6 back-up plan | App. 7 §10 (p244-245) | M (minor) |
| 118 | `review` §11.1 (≥ every 3 years), §11.2 | Correct | App. 7 §11 (p245) | OK |
| 119 | — | §12 single-handed vessels: identify N/A items and alternatives | App. 7 §12 (p245) | M |
| 120 | — | SMS must comply within 3 years of entry into force. Bareboat charterers exempt from App. 7 §9–11 | §30.1.1, §30.2.2.2 (p210) | M |

---

## (c) Corrected JavaScript

Notes for integration:
* **Same shapes and same `kind` ids** as `codes.js` where an item already existed: `coding, stability, stability_simplified, radio, pli, mmsi, epirb_registry, liferaft, lifejacket, lifebuoy, epirb, sart, plb, vhf_fixed, vhf_handheld, mf_radio, navtex, pyrotechnics, fire_ext_portable, fire_ext_fixed, fire_blanket, first_aid_a/b/c, anchor, bilge_pump, nav_lights, compass, kill_cord, decl_compliance`.
* **New kinds** (snake_case):
  - certificates and documents: `scv2, id_disc, sms, risk_assessment, construction_cert, medical_stores_checklist, fire_control_plan, eiapp, garbage_plan, official_log_book, rib_airtightness, radio_survey, mlc_inspection`;
  - life-saving and personnel: `hru, lifebuoy_danbuoy, lifejacket_spray_hood, lifejacket_rearm_kit, tpa, general_alarm, recovery_means, training_manual, lsa_maintenance_manual, lifesaving_signals_table, searchlight, harness`;
  - fire: `fire_pump, fire_bucket, fire_detector, co_detector, gas_detector`;
  - navigation and bilge: `charts, signalling_lamp, echo_sounder, radar_reflector, gnss, log, ais, radar, bilge_alarm`;
  - owner declarations: `decl_rib_airtightness, decl_modification, decl_incident`.
* **Kinds to delete:** `loadline, tonnage, gmdss_goc, fire_structural, sea_trials, solas_lsa, iamsar_compl, decl_manning, decl_stability, decl_radio, horn` (replaced by `nav_lights`), `torch` (replaced by `signalling_lamp`).
* The lists are built per category by explicit functions. This avoids the `cat1 = cat2.slice()` inheritance bug, because every category-dependent value is keyed on the category number. `qty` functions return **0** where an item doesn't apply to that vessel, so the UI should hide those rows.
* The `stabilityRouteFor()` signature is unchanged, but it now also reads `vessel.category`.
* The literal below has been checked with Node: it parses and evaluates for every category.
* Copy of the code: `/tmp/claude-0/-home-user-codedok/354758c1-4fbb-5a45-bae8-c860ab93c6d2/scratchpad/codes/spv-corrected.js`

```js
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
  entry_into_force: null, verify: true,     // NOT stated in the Code text — take from SI 2025/1195
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
  list.splice(2, 0, { kind: 'stability', name: 'Stability information (see stabilityRouteFor)', required: true, validity_months: null,
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

if (typeof module !== 'undefined') module.exports = { CATEGORIES, SPV_SCOPE, VESSEL_CERTS, OWNER_DECLARATIONS, stabilityRouteFor, EQUIPMENT, CREW_REQS, SMS_REFS };
```

---

## (d) What I could not determine from the Code (marked `verify: true`)

1. **Entry-into-force date.** The Code only refers to "the date of entry into force". The date comes from SI 2025/1195, which is not in this PDF. All the transitional deadlines depend on it (App. 12 3 years, SMS 3 years, courses 5 years).
2. **EPIRB for Cat 3 and Cat 4.** The Code contradicts itself:
   - Table 14.1.2 (p115) says 1 for both.
   - Table 17.2.1 Note B (p144) says an EPIRB is required only in Sea Areas A2–A4, and is only *recommended* in A1 where non-GMDSS alerting is ineffective.

   Most UK coastal Cat 3/4 work is in A1, so this decides whether the app flags a missing EPIRB as non-compliant. The corrected data follows Table 14.1.2 (the stricter reading) with `verify: true`. Cat 5 has a similar issue ("R or 1" versus 1 in A2).
3. **Personal emergency radio devices (PLB / AIS MOB) for Cat 0/1.**
   - Table 14.1.2 says "Yes".
   - §17.6.1 and Table 17.2.1 say "recommended", and give no quantity.
4. **DSC on the handheld VHF for Cat 3–5.** Table 14.1.2 says "Portable VHF with DSC: 1" for all categories. Table 17.2.1 shows "Portable VHF DSC: 0" for Cat 3–5. A portable VHF is definitely required (§17.4.1). Whether it must have DSC is unclear.
5. **Table 17.2.1 layout defects** in the published PDF:
   - "Error! Bookmark not defined" text appears in the table.
   - The Class M VHF MOB rows are duplicated and part-shaded black.
   - The Sea Area A4 cells are blank.
   - "C1" sits in the Cat 6 satellite cell, but C1's note is about MSI/NAVTEX.

   I could not establish the MF/satellite requirement for Cat 6 in A2, or any A4 requirement.
6. **Service intervals the Code leaves to other documents** or to manufacturers:
   - pyrotechnic expiry;
   - EPIRB battery/service;
   - fire extinguisher servicing (MGN 276 Table 1);
   - liferaft (manufacturer schedule; the 30-month exemption is in MIN 724);
   - EPIRB/PLB re-registration interval (MGN 665);
   - Ships' Radio Licence validity (Ofcom).

   I kept the app's numbers only where the Code gives one: lifejacket 12, HRU 12, fixed system 12, medical checklist 12, SMS review ≤36, cyber RA ≤60. Everything else is marked `verify`.
7. **Medical fitness certificate type.** The Code says only "valid medical fitness certificate. See MIN 724" (§28.1.3). Whether ENG1 and/or ML5 (and which for which category) are accepted is in MIN 724, which is not provided.
8. **Radio operator qualifications** (VHF SRC, LRC, GOC). The SPV Code does not set them. They come from Ofcom licensing. Keep them only as a labelled non-Code legal requirement.
9. **Content of the owner's declarations in the SCV2.** §3.8.4 and §4.4.4 mention "owner's declarations documented in the SCV2" and "required declarations", but the SCV2 form is not reproduced in this PDF.
10. **Medical stores contents** (Categories A/B/C) and the MGN number: the Code defers to MIN 724.
11. **Fire extinguisher count** cannot be computed from length and persons alone. It needs engine power, engine position, and the number and type of accommodation/galley spaces (Tables 16.1.1.1, 16.2.3.1). The corrected `qty` returns a descriptive string except in the simple open-boat case.
12. **MLC inspection report applicability.** The trigger is stated only on the sample certificate (App. 14, p264): Cat 0–2, international or >60 miles, with seafarers. Confirm against MLC guidance.
13. **Code cross-reference errors** to be aware of (they don't change the requirements):
    - Table 14.1.2 cites "14.4.5" for rearming kits; the text is §14.4.6.
    - Table 14.1.2 cites "14.4.6" for spray hoods; the text is §14.4.7.
    - §16.3.1.7 cites "Appendix 7, 12.2", which doesn't exist.
    - App. 7 §1.1 numbers both cyber security and review as ".9".
    - §15.6.1 is printed as "14.6.1.1".

### Not changed / out of scope
* `SMS_TEMPLATES` (permit to work, toolbox talks, etc.) are not Code requirements. They are harmless operator aids.
* SMS field **default texts** are operator boilerplate, not Code text. I checked only that they don't misstate the Code. The one problem is the MAIB "within 24 hours" text and phone number (row 115).
