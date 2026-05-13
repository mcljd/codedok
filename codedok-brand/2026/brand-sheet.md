# CodedOK Brand Sheet — 2026

Compliance and inspection-readiness software for UK & Irish coded vessel operators and marine surveyors. The brand should feel like *serious software*: calm, precise, protective. Never enforcement, never luxury.

---

## Logo routes

Three routes are committed under this folder. All share the same palette and type stack so any can ship without breaking adjacent design work.

| Folder | Concept | Strongest use |
|---|---|---|
| `route-1-verified-record/` | A signed-off card. Rounded square + check. | **Recommended.** Reads instantly as "verified / compliant" at every size. |
| `route-2-control-mark/`    | Viewfinder corner brackets + centred tick. | More distinctive at marketing sizes; brackets soften at favicon size. |
| `route-3-safe-passage/`    | Protective circle + forward chevron + anchor dot. | Most premium / abstract; needs the wordmark beside it for context. |

Each folder ships: `icon.svg`, `horizontal.svg`, `stacked.svg`, `icon-reversed.svg` (for dark backgrounds), `icon-mono.svg` (for invoices / forms / 1-colour print).

---

## Palette

| Role | Name | Hex | Where it goes |
|---|---|---|---|
| Primary | **Deep Tide** | `#0F4C5C` | Brand anchor — headers, primary buttons, app-icon fill |
| Accent | **Signal Teal** | `#1E7A86` | Active states, links, the inner mark in Routes 2/3 |
| Ink | **Harbour Black** | `#1C252B` | Body text, dark surfaces |
| Background | **Fog White** | `#F3F5F4` | App + document backgrounds |
| Surface | **Steel Mist** | `#E4E9E7` | Cards, panels, form fields |
| Success | **Kelp Green** | `#4F7A52` | "Ready" status |
| Warning | **Buoy Amber** | `#C58A2A` | "Due soon" |
| Danger | **Rust Red** | `#A14A3B` | "Overdue / missing" |

**Rules.** Solid fills only — no gradients. Reserve amber and red for status, never decoration. Keep backgrounds light and workmanlike; the app should look like a daybook, not a dashboard.

---

## Typography

```css
--fn-display: 'Barlow Condensed', 'Inter', -apple-system, sans-serif;  /* 600 / 700 */
--fn:         'Inter', -apple-system, sans-serif;                       /* 400 / 500 / 600 */
--fn-mono:    ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
```

| Role | Family / weight | Use |
|---|---|---|
| Display | Barlow Condensed 700 | Page titles, hero numbers, big totals |
| Sub-heading | Barlow Condensed 600 | Section labels (`.slbl`) |
| Body | Inter 400 / 500 | Forms, lists, descriptions |
| Strong body | Inter 600 / 700 | Button labels, names, status chips |
| Mono | ui-monospace stack | Certificate numbers, dates in dense tables, audit refs |

Both families are loaded from Google Fonts in `app/index.html`. No paid licences.

---

## Clear space + minimum size

- **Clear space**: leave at least the height of the icon's rounded-square stroke (≈ `1/8` of icon width) on every side of the mark. Don't crowd it with text, buttons, or other marks.
- **Minimum icon size**: 20px square for digital, 12mm for print. Don't go smaller — the tick / chevron loses readability.
- **Minimum horizontal-logo width**: 120px on screen, 30mm on print.
- **Stacked lockup**: only use when the wordmark would otherwise wrap to a second line, or when the layout is narrower than the icon-only mark + 120px of text.

---

## Approved versions

- Full colour mark on **Fog White** background.
- **White-reversed** mark on **Deep Tide** or **Harbour Black** backgrounds.
- **Harbour Black** mono mark for invoices, signed PDFs, embossing, fax-grade prints.

---

## Misuse — do not

- Apply gradients, outer glows, drop shadows, or bevels.
- Outline the mark or change stroke weights.
- Stretch, skew, or rotate it (8° tilt aside, never).
- Use the icon-only mark in marketing copy where the brand name needs to be readable.
- Pair with bright nautical reds, decorative wave patterns, or yacht-club crests.
- Combine with any other logo lock-up (partner co-branding goes side-by-side with a vertical divider, never inside the mark).

---

## Export checklist

The SVGs in this folder are masters. From each `icon.svg` you'll need to derive these raster + favicon outputs before they're shippable:

| Target | Size | Source | Notes |
|---|---|---|---|
| PWA `icon-1024.png` | 1024×1024 | `icon.svg` | Background = Deep Tide `#0F4C5C`; mark scaled to 70% of frame; rounded corners baked in for `maskable` |
| PWA `icon-512.png`  | 512×512   | downscale from 1024 | same |
| PWA `icon-180.png`  | 180×180   | downscale | iOS home screen |
| PWA `icon-167.png`  | 167×167   | downscale | iPad |
| PWA `icon-152.png`  | 152×152   | downscale | iPad |
| PWA `icon-120.png`  | 120×120   | downscale | iPhone |
| Favicon `favicon-32.png` | 32×32 | `icon.svg` | Transparent background, mark only |
| Social avatar | 512×512 | `icon.svg` | Deep Tide background, mark centred |
| OpenGraph card | 1200×630 | `horizontal.svg` | Fog White background, mark left, app screenshot right |

**Quickest path**: open the SVG in https://cloudconvert.com/svg-to-png (or Figma → Export), set the target pixel size, and tick "preserve transparency" for the favicon. For the maskable app icon, bake in a Deep Tide background so iOS / Android don't draw their own letterbox.

Before exporting any `horizontal.svg` or `stacked.svg` for PDF / print, **outline the text** in Figma/Illustrator (Type → Convert to Outlines) so the file doesn't depend on the Barlow Condensed web font being installed at the destination.

---

## Voice (calibration only — apply via UI copy, not assets)

| Surface | Example |
|---|---|
| Onboarding heading | *Add your vessel and start with the certificates already on board.* |
| Primary CTA | *Upload certificate.* |
| Push reminder | *Fire extinguisher service due in 14 days.* |
| Overdue prompt | *Liferaft service has lapsed. Book a Survitec station →* |
| Empty state | *Nothing needs you today. We'll nudge before anything expires.* |

Practical, present-tense, no exclamation marks. Never "Welcome aboard!", never "Let's get started!", never emoji as decoration.
