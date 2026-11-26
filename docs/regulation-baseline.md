# CodedOK regulation baseline

What the app assumes the rules are, where each assumption lives in the code,
and whether it has been checked against an authoritative source.

- **Generated from the code**, not from general knowledge. Every row points at
  the line that implements it.
- **Last full check:** 2026-11-26.
- **Scope:** time-based rules only — validity periods, service and examination
  intervals, deadlines and thresholds. Quantity rules (how many lifebuoys, which
  extinguisher rating) are not listed here; they live in `app/codes.js` with
  their own `ref` fields.

## How to read the confidence column

| Value | Meaning |
|---|---|
| **HIGH** | The Code text in `docs/` was read on the "last verified" date and states this value. |
| **PARTIAL** | The Code says something narrower or different. The note explains the gap. |
| **MISMATCH** | The app's value does not match the Code text. Needs a decision. |
| **UNVERIFIED** | No authoritative source was found or could be read. Check by hand. |
| **APP POLICY** | Not a rule from any Code. It is CodedOK's own choice. |

Sources read: `docs/The_sport_or_pleasure_vessel_code 2025 Published.pdf`
(published 20 November 2025) and `docs/Workboat_Code_Edition_3 - UPDATED.pdf`.
Section numbers are from those files.

---

## 1. Sport or Pleasure Vessel Code 2025

| # | Rule | Value the app uses | Source | Implemented at | Last verified | Confidence |
|---|---|---|---|---|---|---|
| S1 | Certificate validity | 60 months | SPV §4.2.2: "valid for not more than five years from the date of examination" | `app/codes.js:70` | 2026-11-26 | HIGH |
| S2 | Annual identification disc | 12 months | SPV §4.2.4: "shall annually issue an identification disc" | `app/codes.js:77` | 2026-11-26 | HIGH |
| S3 | Owner's annual examination (Group 1) | 12 months | SPV §4.3.2.3, §4.5.2.1 | `app/codes.js:137` | 2026-11-26 | PARTIAL — the Code also sets a window ("within 3 months either side of the anniversary", "intervals not exceeding 15 months"). The app does not encode the window for SPV boats. |
| S4 | RIB / inflatable airtightness test by owner | 12 months | SPV §4.9.1.1: "Annually by the vessel owner/managing agent" | `app/codes.js:114`, `:142` | 2026-11-26 | HIGH |
| S5 | Radio survey (GMDSS fitted) | 60 months, not required | SPV §17.10.1: "recommended to undertake a survey ... every 5 years" | `app/codes.js:117` | 2026-11-26 | HIGH — a recommendation, and the app marks it optional. |
| S6 | Safety Management System review | 36 months | SPV Appendix 7 §11.1: "at least once every three years" | `app/codes.js:88` | 2026-11-26 | HIGH — see P5: the app reminds yearly, which is stricter. |
| S7 | Medical stores checklist | 12 months | SPV §23.1.4: "an annually reviewed checklist of the medical stores" | `app/codes.js:98` | 2026-11-26 | HIGH |
| S8 | Medical stores kit (Category A, B, C) | 12 months | SPV §23.1.4 | `app/codes.js:324`, `:326`, `:327` | 2026-11-26 | PARTIAL — the Code's annual item is the checklist review, not a service of the kit. |
| S9 | Liferaft service | 12 months | SPV §14.2.1.1 | `app/codes.js:192` | 2026-11-26 | PARTIAL — the Code says "in accordance with the manufacturer's recommended service schedule". A maximum of annual intervals applies only to valise rafts and two other listed cases. §14.2.1.2 allows up to 30 months under a General Exemption (MIN 724). The app's 12 months is a cautious simplification. Already flagged `verify` in code. |
| S10 | Hydrostatic release unit | 12 months | SPV §14.2.1.4, §14.2.3.1: "serviced at maximum of annual intervals" | `app/codes.js:197` | 2026-11-26 | HIGH — re-usable units only; disposable units follow the maker's life. |
| S11 | Inflatable lifejacket service | 12 months | SPV §14.4.9: "Inflatable lifejackets shall be serviced annually" | `app/codes.js:204` | 2026-11-26 | HIGH — applies to inflatable jackets; the app applies it to the lifejacket record generally. |
| S12 | Portable fire extinguisher service | 12 months | SPV §16.3.1.7 → MGN 276 (M+F) Table 1 | `app/codes.js:263` | 2026-11-26 | UNVERIFIED — the Code defers to MGN 276 Table 1, which is not in this repository. Already flagged `verify` in code. |
| S13 | Fixed fire extinguishing system | 12 months | SPV §16.4.1.2: "serviced at minimum on an annual interval or ... as per manufacturer's recommendations, whichever is more frequent" | `app/codes.js:272` | 2026-11-26 | HIGH |
| S14 | Insurance | 12 months | None. The Code sets no policy period. | `app/codes.js:85` | 2026-11-26 | UNVERIFIED — an assumption that policies run for a year. |
| S15 | Area category limits (distance, weather, daylight) | Cat 0 unrestricted; 1: 150 nm; 2: 60 nm; 3: 20 nm; 4: 20 nm fair weather daylight; 5 and 6: 3 nm | SPV §3.10.1 | `app/sms-quick.js:213`, `app/home.js:24` | 2026-11-26 | UNVERIFIED for SPV — the distances were read in the Workboat Code (W15) but §3.10.1 of the SPV Code was not re-read in this check. |
| S16 | Wind and wave limits by area | Cat 0–1: over F8, over 4 m; 2–3: up to F8, 4 m; 4–6: up to F6, 2 m | SPV Table 3.10.2 | `app/sms-quick.js:213` | 2026-11-26 | HIGH |
| S17 | Hours of rest | 10 hours in any 24; 77 hours in any 7 days | SPV §28.6 | `app/sms-quick.js:525` | 2026-11-26 | HIGH |
| S18 | Code in force | 12 December 2025 | SI 2025/1195 regulation 1 | `app/codes.js:1285` | 2026-11-26 | UNVERIFIED — the date is not in the Code PDF (published 20 November 2025). It comes from the statutory instrument, which could not be opened from the build environment. S19, S20 and S21 all depend on it. |
| S19 | Existing vessels comply by | Next renewal examination or 12 December 2028, whichever is later | SPV Appendix 12 §3: "next renewal examination or three years after the date of entry into force" | `app/codes.js:1285` | 2026-11-26 | HIGH for the rule. The date depends on S18. |
| S20 | Safety Management System required by | 12 December 2028 | SPV §30.1.1: "within 3 years of the Code coming into force" | `app/codes.js:1285`, `app/screens.js:119` | 2026-11-26 | HIGH for the rule. The date depends on S18. |
| S21 | Firefighting course completed by | 12 December 2030 | SPV §28.10.2–28.10.3: "no later than 5 years after the date of entry into force" | `app/codes.js:1285` | 2026-11-26 | HIGH for the rule. The date depends on S18. |

---

## 2. Workboat Code Edition 3

| # | Rule | Value the app uses | Source | Implemented at | Last verified | Confidence |
|---|---|---|---|---|---|---|
| W1 | Certificate validity | 60 months | WBC §4.3.2: "valid for not more than five years"; §4.6.5 | `app/codes.js:872` | 2026-11-26 | HIGH |
| W2 | Annual identification disc | 12 months | WBC §4.3.4 | `app/codes.js:873` | 2026-11-26 | HIGH |
| W3 | Annual examination | 12 months; window 3 months; maximum 15 months | WBC §4.4.1.1: "within 3 months either side of the anniversary date ... at intervals not exceeding 15 months" | `app/codes.js:875` | 2026-11-26 | HIGH |
| W4 | Out-of-water (intermediate) examination | 36 months | WBC §4.5.1.1: "interval between successive out of water examinations ... does not exceed three years" | `app/codes.js:876` | 2026-11-26 | HIGH |
| W5 | Renewal examination | 60 months | WBC §4.6.1, §4.6.5 | `app/codes.js:877` | 2026-11-26 | HIGH |
| W6 | Radio survey (GMDSS fitted) | 60 months, required | WBC §17.10.1: "shall undertake a survey of the radio installation every 5 years" | `app/codes.js:881` | 2026-11-26 | HIGH — mandatory here, only recommended under the SPV Code (S5). |
| W7 | Safety Management System review | 36 months | WBC Appendix 8 §13.1: "at least once every three years" | `app/codes.js:884` | 2026-11-26 | HIGH |
| W8 | Cyber security risk assessment | 60 months | WBC §31.3.3: "where alterations are made ... or at least every five years" | `app/codes.js:885` | 2026-11-26 | HIGH |
| W9 | Medical stores checklist | 12 months, Category 0 and 1 only | WBC §23.1.4 | `app/codes.js:889` | 2026-11-26 | HIGH |
| W10 | Medical stores kit (Category A, B, C) | 12 months | WBC §23.1.1–23.1.6 | `app/codes.js:1094` | 2026-11-26 | PARTIAL — the annual checklist review in §23.1.4 applies only to area categories 0 and 1. No annual interval was found for a Category C kit. |
| W11 | Towing equipment service | 12 months | WBC §26.1.7: "no more than 12 months between services" | `app/codes.js:897` | 2026-11-26 | HIGH |
| W12 | Lifting device thorough examination | 12 months | WBC §25.2.3.2: "shall be carried out annually" | `app/codes.js:898` | 2026-11-26 | HIGH |
| W13 | RIB / inflatable airtightness test by owner | 12 months | WBC §4.9.1–4.9.2 | `app/codes.js:899` | 2026-11-26 | HIGH |
| W14 | Propeller shaft drawn (pilot boats) | 36 months | WBC §4.10.1: "at an interval not exceeding three years" | `app/codes.js:900` | 2026-11-26 | HIGH |
| W15 | Area category limits (distance, weather, daylight) | Same values as S15 | WBC §3.10.1 | `app/sms-quick.js:213`, `app/home.js:24` | 2026-11-26 | HIGH |
| W16 | Wind and wave limits by area | Same values as S16 | WBC Table 3.10.2 | `app/sms-quick.js:213` | 2026-11-26 | HIGH |
| W17 | Liferaft service | No fixed interval | WBC §14.2.1.1: manufacturer's schedule; "valise liferafts ... serviced at a maximum of annual intervals" | `app/codes.js:963` | 2026-11-26 | HIGH — the app records no interval and explains the valise rule in a note. |
| W18 | Hydrostatic release unit | 12 months | WBC §14.2.1.3, §14.2.3.1 | `app/codes.js:969` | 2026-11-26 | HIGH |
| W19 | Inflatable lifejacket service | 12 months | WBC §14.4.9 | `app/codes.js:980` | 2026-11-26 | **MISMATCH** — the Code says "serviced in accordance with the manufacturer's recommendations within a maximum of one month either side of the compliance, renewal and intermediate examinations". It does not say annually. The Quick SMS repeats the annual wording for Workboat boats at `app/sms-quick.js:659`. |
| W20 | Portable fire extinguisher service | No fixed interval | WBC §16.3.1.8 → MGN 276 (M+F) Table 1 | `app/codes.js:1049` | 2026-11-26 | UNVERIFIED — defers to MGN 276 Table 1, not in this repository. Note the SPV side uses 12 months (S12); the two should agree once MGN 276 is checked. |
| W21 | Fixed fire extinguishing system | 12 months | WBC §16.4.1.2 | `app/codes.js:1055` | 2026-11-26 | HIGH |
| W22 | Insurance | 12 months | None. The Code sets no policy period. | `app/codes.js:901` | 2026-11-26 | UNVERIFIED — an assumption. |
| W23 | Code in force | 13 December 2023 | WBC §1.11: "13 December 2023, the date of entry into force of the Code" | `app/codes.js:1287` | 2026-11-26 | HIGH |
| W24 | SMS and cyber measures required by | 13 December 2026 | WBC §31.1.1: "3 years after the Code comes into force" | `app/codes.js:1220` | 2026-11-26 | HIGH |
| W25 | Existing vessels comply by | Next renewal examination or 13 December 2026, whichever is later | WBC Appendix 9 §3 | `app/screens.js:263` | 2026-11-26 | HIGH |
| W26 | Single-handed operation limits | Area 3–6 only; not over 8 hours; not when towing, transferring personnel, as a diving platform, or in restricted visibility | WBC §28.2.1–28.2.2 | `app/sms-quick.js:335` | 2026-11-26 | HIGH |

---

## 3. Irish Passenger Boat Licence

The app has **no rules engine for Ireland**. It has one screen of fixed text.
Nothing below is cited in the code.

| # | Rule | Value the app shows | Source | Implemented at | Last verified | Confidence |
|---|---|---|---|---|---|---|
| I1 | Licence needed to carry passengers for reward | "Ireland requires a Passenger Boat Licence (PBL) from the Marine Survey Office" | None cited in code | `app/index.html:2759` | 2026-11-26 | UNVERIFIED — no source in the repository, and the official Irish sites could not be opened from the build environment. |
| I2 | Licence classes | P1: 13+ passengers, any area. P2: up to 12, exposed waters. P3: up to 12, partially smooth waters. P4: up to 12, smooth waters. P5: inland waterways. P6: open angling, 3 passengers or fewer, smooth waters | None cited in code | `app/index.html:2769-2809` | 2026-11-26 | UNVERIFIED — no source in the repository, and the official Irish sites could not be opened from the build environment. |
| I3 | Licence period | "Annual — issued by MSO" | None cited in code | `app/index.html:2831` | 2026-11-26 | UNVERIFIED — no source in the repository, and the official Irish sites could not be opened from the build environment. |
| I4 | Initial survey before first licence | "Required before first licence issue" | None cited in code | `app/index.html:2822` | 2026-11-26 | UNVERIFIED — no source in the repository, and the official Irish sites could not be opened from the build environment. |
| I5 | Annual inspection | "MSO or approved surveyor" | None cited in code | `app/index.html:2838` | 2026-11-26 | UNVERIFIED — no source in the repository, and the official Irish sites could not be opened from the build environment. |
| I6 | Open angling exemption | "no more than 3 passengers (not for reward) may be exempt ... An annual declaration must be filed with the MSO" | None cited in code | `app/index.html:2849` | 2026-11-26 | UNVERIFIED — no source in the repository, and the official Irish sites could not be opened from the build environment. |
| I7 | UK-coded boats in Irish waters | "You must hold a valid Irish Passenger Boat Licence to operate commercially in Irish waters, regardless of UK coding status" | None cited in code | `app/index.html:2709` | 2026-11-26 | UNVERIFIED — no source in the repository, and the official Irish sites could not be opened from the build environment. |

---

## 4. CodedOK's own settings (not from any Code)

| # | Setting | Value | Implemented at | Confidence |
|---|---|---|---|---|
| P1 | Server reminder timings | 90, 60, 30 and 7 days before, then overdue | `supabase/functions/send-reminders/index.ts:147` | APP POLICY |
| P2 | On-phone reminder timings | 30 days, 7 days, and on the day | `app/ios-features.js:112` | APP POLICY — differs from P1 and from the App Store listing, which promises 90/60/30/7. |
| P3 | "Due soon" on Home and the gap check | 30 days or less | `app/home.js:47`, `app/screens.js:77`, `:83` | APP POLICY |
| P4 | Code deadline warning | 60 days or less | `app/screens.js:131`, `:173` | APP POLICY |
| P5 | SMS review reminder | 365 days after signing | `app/store.js:1159`, `:1165` | APP POLICY — stricter than the 3 years in S6 and W7. The Quick SMS text says "every year, and in any case at least once every three years". |
| P6 | Drill schedule | Man overboard and fire: monthly (31 days). Abandon ship, flooding, loss of propulsion: quarterly (92 days). Shoreside plan: yearly (366 days) | `app/sms-quick.js:201-206` | APP POLICY — both Codes require drills to be carried out and recorded but leave the frequency to the owner. |

---

## 5. Open items to check by hand

1. **W19 — Workboat lifejacket servicing.** The app says annual; the Code ties
   servicing to the compliance, renewal and intermediate examinations.
2. **S12 and W20 — portable extinguishers.** Both defer to MGN 276 Table 1.
   The SPV side assumes 12 months and the Workboat side assumes nothing.
3. **S9 — SPV liferaft servicing.** 12 months is correct for valise rafts but
   the general rule is the manufacturer's schedule.
4. **S8 and W10 — medical kits.** The annual requirement is a checklist
   review, and under the Workboat Code only for area categories 0 and 1.
5. **S3 — SPV annual examination window** is not encoded.
6. **S14 and W22 — insurance period** is assumed, not sourced.
7. **S15 — SPV area distances** were not re-read in this check.
8. **S18 — the SPV in-force date**, and with it S19, S20 and S21.
9. **Section 3 — everything Irish.**
10. **Section 6 — every link.**
11. **P1 and P2 — reminder timings disagree** with each other and the listing.

---

## 6. Sources to monitor

**None of these addresses has been confirmed.** The environment this file was
written in cannot reach gov.uk, legislation.gov.uk, gov.ie or
irishstatutebook.ie, so every link below is a best-known address that was
*not* loaded. Open each one once, correct it if it has moved, and change
"Checked" to the date you did so.

| # | Source | Publisher | Address (not confirmed) | Checked |
|---|---|---|---|---|
| M1 | Marine Guidance Notes (MGNs) | Maritime and Coastguard Agency | `https://www.gov.uk/government/collections/marine-guidance-notices-mgns` | NOT CHECKED |
| M2 | Merchant Shipping Notices (MSNs) | Maritime and Coastguard Agency | `https://www.gov.uk/government/collections/merchant-shipping-notices-msns` | NOT CHECKED |
| M3 | Marine Information Notes (MINs) | Maritime and Coastguard Agency | `https://www.gov.uk/government/collections/marine-information-notes-mins` | NOT CHECKED |
| M4 | Workboat Code Edition 3 publication page | Maritime and Coastguard Agency | `https://www.gov.uk/government/publications/the-workboat-code-edition-3` | NOT CHECKED |
| M5 | Sport or Pleasure Vessel Code publication page | Maritime and Coastguard Agency | Address not known. Search gov.uk for "Sport or Pleasure Vessel Code". | NOT CHECKED |
| M6 | SI 2025/1195, Merchant Shipping (Vessels in Commercial Use for Sport or Pleasure) Regulations 2025 | legislation.gov.uk | `https://www.legislation.gov.uk/uksi/2025/1195` | NOT CHECKED |
| M7 | SI 2023/1216 (cited on the Workboat certificate) | legislation.gov.uk | `https://www.legislation.gov.uk/uksi/2023/1216` | NOT CHECKED |
| M8 | MGN 276 (M+F), fire extinguisher servicing | Maritime and Coastguard Agency | Address not known. Listed under M1. | NOT CHECKED |
| M9 | MIN 698 and MIN 724 (courses, medical fitness, exemptions cited by the Codes) | Maritime and Coastguard Agency | Address not known. Listed under M3. | NOT CHECKED |
| M10 | Irish Marine Notices | Department of Transport, Ireland | Address not known. Search gov.ie for "Marine Notices". | NOT CHECKED |
| M11 | Passenger boat licensing, Marine Survey Office | Department of Transport, Ireland | Address not known. Search gov.ie for "passenger boat licence". | NOT CHECKED |
| M12 | Irish Statute Book (the Act and regulations behind passenger boat licences) | Office of the Attorney General, Ireland | `https://www.irishstatutebook.ie` | NOT CHECKED |

Notice numbers that the code or the Codes rely on, and so are worth watching
by name: **MGN 276**, **MGN 280** (the old standard being replaced),
**MGN 436** (vibration), **MIN 698**, **MIN 724**.

## 7. Change log

| Date | Change |
|---|---|
| 2026-11-26 | First baseline. Rows checked against the two Code PDFs in `docs/`. Web sources not reachable; all links and all Irish rows unverified. |
