# Next: Jarvis page controls and remaining builder checks

Free models only (paid AI stays off until you add funds). Daily site limit stays at 5. No publishing, emails, billing or extra spending without your OK.

## 1. Jarvis page controls
- Test every safe button on the Jarvis page on phone and desktop: build cards, preview links, retry, approval log, operations panel, autopilot settings (view only), voice button (no playback).
- Fix any button that does nothing, opens the wrong place, gets covered by other buttons, or shows wrong status.
- Make sure finished AI work (pages, sections, pictures) shows on the build card, and failed builds show a clear reason plus a Retry button.

## 2. The three waiting builds
- Check Harbor Line Plumbing, World of Service and Ultimate Tree Service builds.
- If they are paused waiting for free AI capacity, show the real retry time; resume them on free models only, one at a time, within the 5-per-day limit.
- Draft (do not send) the outreach emails for the two prospect demos and show them to you.

## 3. Customer builder leftovers
- Run one small point-and-edit change on the test workspace (free models) and confirm the preview updates and Undo works.
- Confirm the empty-suggestions fix and the failed-build Retry button in the browser.

## 4. Checks
- Run the related tests and type checks; screenshot each fixed screen.
- Update the roadmap with what is done and what is still blocked.

## Technical details
- Files likely touched: `src/routes/_authenticated/admin.jarvis*.tsx`, `src/components/jarvis/*`, `OperationsPanel.tsx`, `BuildLive.tsx`, `BuilderAssistant.tsx`.
- Resume uses the existing worker capacity-deferral and stage checkpoints only; no new deferral path, no template fallback.
- Playwright with the owner session; risky actions (publish, send, delete, autopilot on) are not clicked.
