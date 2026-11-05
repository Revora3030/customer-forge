# Ladle component catalog (BRF-02)

Local React workshop for `src/components/ui` primitives.

- License: `@ladle/react` **5.1.1** (MIT; LICENSE verified on [tajo/ladle](https://github.com/tajo/ladle)).
- Dev dependency only — not bundled into the customer app.
- Run: `bun run ladle` then open http://localhost:61000
- Build static catalog: `bun run ladle:build` → `ladle-build/` (gitignored if present)

Visual regression screenshots are intentionally **not** wired into CI here (no workflow edits). Use Ladle locally; a Playwright baseline suite can follow in a separate PR.
