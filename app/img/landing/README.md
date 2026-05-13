# Landing-page imagery

Drop real boat photographs here and they'll appear on the landing page.

## Slots wired up in `app/index.html` → `#s-land`

| Filename                  | Where it shows               | Suggested size / crop                 |
|---------------------------|------------------------------|---------------------------------------|
| `hero-boat.jpg`           | Hero, beside the phone mock  | 1200 × 900, landscape, room for type left |
| `feature-coded.jpg`       | "Skippers & operators" pillar background | 800 × 600, vessel on water     |
| `feature-surveyor.jpg`    | "Surveyors" pillar background | 800 × 600, dockside / yard work       |
| `feature-crew.jpg`        | "Crew" pillar background     | 800 × 600, crew with kit              |
| `og-card.jpg`             | OpenGraph share card          | 1200 × 630, full-bleed brand        |

## Source

Use photos **you have the right to use** — your own work, McCollam Marine
images you have permission for, or licensed stock. Don't hot-link from
external sites; the assets directory is served by Cloudflare Workers and
needs the file in the repo.

## Format guidance

- WebP preferred (smaller). JPEG is fine.
- Compress to ~150 KB each before committing.
- Keep aspect ratios consistent within each slot so the layout doesn't
  shift between feature cards.

## Once dropped

Push to `claude/test-github-push-IySCw` (or main). The GitHub Actions
deploy picks them up automatically — no code change needed because the
slots are already wired in `index.html`.
