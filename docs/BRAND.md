# CodedOK brand & design system

Blue for trust, one warm accent, Apple's rules inside the app.

## Colours

| Name | Hex | Use for |
|---|---|---|
| **Navy** | `#03203D` | The brand: app icon, website and ad backgrounds, the vessel header, boat cards. |
| **Harbour Blue** (tint) | `#1F6FB5` | Everything you can tap in the app: buttons, links, the active tab. Nothing else. |
| **Stone Blue** | `#639CC5` | Soft support: icon waves, light fills, secondary highlights. |
| **Brass Sand** | `#F2C98A` | The one warm accent, **marketing only**: the highlighted headline line and the main button on navy. |

### Status (Apple system colours, in-app only)

| Meaning | Text | Fill |
|---|---|---|
| Valid | `#248A3D` | `rgba(52,199,89,.14)` |
| Due soon | `#C93400` | `rgba(255,149,0,.15)` |
| Overdue | `#D70015` | `rgba(255,59,48,.12)` |

## The rules

1. **Red is never the brand.** It appears only to mean "overdue" — the same
   way Apple's Reminders app uses it. A compliance product's promise is
   "you're safe", so the brand stays calm blue.
2. **One tint for interaction** (Apple HIG): if it's Harbour Blue, it's tappable.
3. **Sand stays on marketing.** In the app it would be confused with "due soon".
4. **Inside the app:** system font (SF on Apple devices), grey grouped
   background `#F2F2F7`, white cards with no borders or heavy shadows,
   12px corners on controls. Large titles at 34pt bold.
5. **The iPhone build sells nothing in-app.** Paid plans carry the
   `.paid-only` class and are hidden when running natively.

## Why blue

Navy and cobalt are the established colours of trust in banking,
insurance and fintech. It's a strong industry convention rather than a
proven statistic — so the plan is to A/B-test ad creative (via the UTM
`utm_content` tag on each Meta ad) rather than rely on colour folklore.

The in-app styles live in the "APPLE DESIGN LAYER" block at the end of
`app/style.css`.
