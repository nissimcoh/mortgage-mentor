# MortgageMentor brand assets

Created 2026-10-09. Original vector mark: an ivory house enclosing a mint M on
deep navy. Geometry uses two rounded paths, without fonts, animation or an icon
library. The existing site wordmark supplies the product name.

| Asset | Use |
| --- | --- |
| `public/brand/mortgagementor-120.png` | Google Auth Platform logo upload, 120 × 120 PNG, under 1 MB |
| `public/brand/mortgagementor-512.png` | General square brand image |
| `public/brand/mortgagementor-1024.png` | Larger raster export |
| `public/brand/mortgagementor.svg` | Scalable master, transparent outer corners |
| `app/icon.svg` | Browser icon, served using Next.js metadata conventions |
| `app/favicon.ico` | 16, 32 and 48 px browser fallback |
| `app/apple-icon.png` | Opaque 180 px Apple touch icon |

`components/BrandMark.tsx` contains matching inline geometry for the site header
and printed mortgage report. Keep its paths/colors synchronized with the SVG
master. The adjacent text carries the accessible name; the decorative SVG is
hidden from assistive technology.

After editing the master, regenerate static assets with
`node scripts/generate-brand-assets.mjs` (after `npm ci`). The script uses Sharp,
which is already installed with Next.js; it is not shipped to the browser.

Palette: navy `#102f40`, ivory `#f5faf8`, mint `#88dfc0`.
Use the mark without extra gradients, effects or text inside the square so it
remains legible at small sizes. Google needs the PNG, not the SVG or ICO.
