# First-paint harness (PR3, local only)

Compares how the builder preview reaches first paint, using the real section
renderer and a FICTIONAL sample page (no real business, no database, no AI,
no network beyond 127.0.0.1).

- BEFORE (`:4528`): the old `/draft` model. Empty HTML shell → bundle →
  "Loading your draft…" → fetch the draft (simulated DB round trip) → draw.
- AFTER (`:4529`): the new `/p` model. The server waits the same simulated
  DB round trip, sends the drawn page with a `<link rel="preload">` for the
  hero picture (from `heroPreloadLink`), then the bundle hydrates.

```
python3 make-hero.py
npx vite build -c vite.config.ts
npx vite build -c vite.config.ts --ssr entry-server.tsx --outDir dist/server
node server.mjs   # DB_MS=250 by default
```

Then run Lighthouse against both ports (see `measure.sh`). The real app bundle
is much larger than this harness bundle, so the harness understates the
BEFORE cost.
