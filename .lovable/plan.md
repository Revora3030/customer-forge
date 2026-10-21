# Next upgrade wave (no spend, no publishing, no emails)

Every open item that needs AI spending, publishing, Meta credentials or a real business is left out of this wave. This wave covers the items that can be finished safely right now.

## 1. Builder preview polish
- Fullscreen preview: keep the keyboard focus inside it, close it with Escape, and put focus back on the button that opened it.
- If the preview frame fails to load (network error or timeout), show a clear "Preview couldn't load" message with a Retry button. No more blank pane.

## 2. Admin numbers check
- Compare Analytics, Payments, Monthly, Outreach and Clients totals against the source records, using read-only queries.
- Fix any total that disagrees with the source. Show "unavailable" when a source can't be read, never a made-up 0.

## 3. Launch checklist with fact sources (Phase C)
- The launch card lists each business fact on the site (name, services, area, contact) with where it came from: owner-entered, Google Maps, or unverified.
- Unverified facts are flagged before publishing. Nothing gets invented to fill gaps.

## 4. Daily brief upgrade (Phase E)
- Jarvis's daily brief adds: builds waiting on capacity and their retry times, demos waiting for approval, and the funnel numbers. All figures come from aggregate data only.

## Still blocked (needs you)
- Live AI build and publishing test: needs approval to spend.
- Instagram: needs Meta app credentials.
- Second-industry build: needs a real business's details.

## Technical details
- Preview: add a focus trap and an iframe `onError`/timeout state in `BuilderPreview.tsx`, with tests for the timeout logic.
- Admin: write read-only SQL comparisons, then make fixes in the existing admin server functions while keeping the customer-workspace filter.
- Provenance: derive each fact's source from the saved brief's `factAnswers` and Maps place data; only additive changes, no migration expected.
- Run focused tests, the full suite and a typecheck after each section.
