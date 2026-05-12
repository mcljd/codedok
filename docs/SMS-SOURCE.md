# CodedOK SMS — canonical source

The 11-section Safety Management System template inside CodedOK (the
one the AI generator and the manual builder both produce) is built
directly from the **Sport or Pleasure Vessel Code 2025, Appendix 7**.

The PDFs that this is built from live alongside this doc:

- `The_sport_or_pleasure_vessel_code 2025 Published.pdf`
- `Workboat_Code_Edition_3 - UPDATED.pdf`

## Section mapping — schema id ↔ Code §

| CodedOK section id | Title | SPV Code 2025 reference |
|---|---|---|
| `meta`         | Vessel & company                        | App. 7 §1 — General |
| `hs_policy`    | Health, Safety & Environmental Policy   | App. 7 §2 |
| `risk`         | Risk Assessments                        | App. 7 §3 |
| `roles`        | Roles & Responsibilities                | App. 7 §4 (including §4.7 Person Ashore) |
| `training`     | Training & Familiarisation              | App. 7 §5 (refs Section 28 Manning) |
| `sop`          | Standard Operating Procedures           | App. 7 §6 (incl. §6.2 Safety Briefing) |
| `emergency`    | Emergency Procedures                    | App. 7 §7 |
| `reporting`    | Accident & Incident Reporting           | App. 7 §8 (MAIB / MIN 724) |
| `maintenance`  | Maintenance of Vessel & Equipment       | App. 7 §9 (refs §3.5) |
| `cyber`        | Cyber Security                          | App. 7 §10 *(new in 2025)* |
| `review`       | Review & Continuous Improvement         | App. 7 §11 (≥ every 3 years) |

§12 of Appendix 7 ("Application to Owners/Operators of Single-handed
Vessels") is not a separate schema section — single-handed operators
fill in the same 11 sections and mark which requirements are not
applicable.

## Why this matters

A surveyor receiving a CodedOK-generated SMS can verify, section by
section, that it covers exactly what the Code requires. The badge on
each section in the app (`📖 Satisfies SPV Code 2025 App. 7 §X`) makes
this verifiable at a glance without flicking back to the source PDF.

## When the Code is revised

If the MCA issues an SPV Code 2026 (or amends Appendix 7), update
`app/codes.js` → `SMS_SCHEMA`:

1. Replace the source PDF in `/docs/`.
2. Bump each section's `ref` field to the new numbering.
3. Update `blurb` text where the Code language has changed.
4. Update default text where it now contradicts the new Code.
5. Add a new entry to the schema header comment with the new source line.

The AI generator output picks up the changes automatically — no app
release needed for users beyond a cache refresh.

## Wider regulatory cross-refs the SMS_SCHEMA respects

- **MIN 724** — accident reporting thresholds (used in `reporting`).
- **COSWP Chapter 1** — risk-assessment guidance (used in `risk`).
- **IMO MSC.428(98)** — cyber-risk in SMSs (used in `cyber`).
- **IEC 61162-420 / IEC 63154** — maritime cyber (used in `cyber`).
- **Workboat Code Ed 3** — operationally aligned; CodedOK targets sport
  or pleasure but the schema is also a near-superset of Workboat Ed 3
  SMS requirements.
