# Play Store phone screenshots

Captured with Playwright against the local Capacitor WebView UI (`http://127.0.0.1:3000`) at **360×800 CSS px**, `deviceScaleFactor: 3` → **1080×2400** PNGs.

| File | Scene |
|------|--------|
| [01-home-list.png](01-home-list.png) | ZIP **98042** + grocery list |
| [02-stores.png](02-stores.png) | Expanded stores picker (Prefer / Include / Exclude) |
| [03-plan-live.png](03-plan-live.png) | Recommended plan after Dev +15 → Optimize |
| [04-shop.png](04-shop.png) | Let’s shop mode with **Back to plan** |

## Live vs modeled

This capture set shows **live-first labels** on the plan:

- Plan cards / Total: **mostly live**
- Line items at Fred Meyer / QFC: **live** where matched
- Some non-Kroger stops (e.g. Safeway) still show **modeled** / **mostly modeled** — expected for banners without a live API

Kroger status banner reported live pricing available at capture time. Prefer a warm `prices:refresh` cache before re-shooting for marketing.

## Regenerate

```powershell
# Dev server on :3000, then:
$env:PLAYWRIGHT_BROWSERS_PATH = "$env:LOCALAPPDATA\Temp\cursor-sandbox-cache\74ac3dd106425a4b52331ccd43db6e77\playwright"  # if using cached browsers
npm install --no-save playwright@1.49.1   # only if needed
node scripts/capture-play-screenshots.mjs
```

Do not commit secrets or `.env.local`. These PNGs are listing assets (git-ok).
