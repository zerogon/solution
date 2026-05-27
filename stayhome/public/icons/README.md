# PWA Icons

Replace the placeholder files in this directory with real icons before deploying:

- `icon-192.png` — 192×192 PNG
- `icon-512.png` — 512×512 PNG
- `icon-maskable-512.png` — 512×512 PNG with ~10% safe-zone padding (`purpose: "maskable"`)
- `apple-touch-icon.png` — 180×180 PNG (optional but recommended)

Tools:
- https://realfavicongenerator.net/
- https://maskable.app/editor

The PWA install prompt and `manifest.json` reference these paths. Missing icons won't break the install prompt UI but will cause 404s in the manifest validator.
