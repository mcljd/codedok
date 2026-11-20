# Landing-page imagery

Three hand-drawn SVG illustrations ship as the default — a harbour
scene at first light, a RIB at speed, and a vessel on the travel lift.
They're brand-aligned, modern editorial style, and licence-free since
we drew them ourselves.

**To replace any of them with a real photograph**, drop a `.jpg` file
with the matching name into this folder. The CSS stacks the `.jpg`
*above* the `.svg`, so as soon as the photo exists it takes over
automatically — no code change needed.

## Required filenames

| Filename                  | Where it shows                                        | Suggested image                       | Crop / size guidance                  |
|---------------------------|-------------------------------------------------------|---------------------------------------|---------------------------------------|
| `hero-boat.jpg`           | Behind the top hero (dark overlay covers it)          | The WD-210 green trawler              | 2000 × 1200, landscape, vessel on the right or centred |
| `in-the-field.jpg`        | Full-bleed quote section between How-it-works + Features | The RIB at speed offshore             | 2000 × 1100, the boat in the right half so the pull-quote sits left  |
| `in-the-yard.jpg`         | Full-bleed "Survey day" section between Features + Pricing | The red RIB on the blue WISE lift     | 2000 × 1400, vessel centred/upper, room below for headline + button |

## Optional later

| Filename     | Where it shows         | Notes                                  |
|--------------|------------------------|----------------------------------------|
| `og-card.jpg`| OpenGraph share card   | 1200 × 630, full-bleed brand           |

## Format guidance

- WebP preferred (smaller files). JPEG is fine.
- Compress to roughly 200-300 KB each before committing — Cloudflare
  serves them, but smaller = faster first paint, better Lighthouse score.
- Keep the hero shot wide / horizontal. The two editorial sections
  also need landscape framing for desktop; mobile crops the centre.
- Save in sRGB colour space (default on phones, but worth checking
  if you've edited in Lightroom / Photos).

## Rights

Use photos **you have the right to use** — your own work, McCollam
Marine images with permission, or licensed stock. Don't reference
external URLs; the Workers Assets pipeline needs the file in the
repo.

## How to add them

From your local clone:

```bash
cd codedok
git pull
# copy the three files into app/img/landing/
cp ~/Downloads/wd-210.jpg     app/img/landing/hero-boat.jpg
cp ~/Downloads/rib-at-speed.jpg app/img/landing/in-the-field.jpg
cp ~/Downloads/rib-on-lift.jpg  app/img/landing/in-the-yard.jpg
git add app/img/landing/*.jpg
git commit -m "Landing: real boat photos"
git push origin claude/test-github-push-IySCw
```

The GitHub Actions deploy picks them up automatically. Hard-refresh
the site with `?reset` once after the green build to bust the SW
cache.
