# Major upgrades: finish the open fixes, then go beyond Lovable and Framer

Built in waves, each tested before the next. Pricing ($350 setup, first month free, then $100/month, 3-day trial), the free-only AI switch, the 5-sites-per-day limit and the email approval rule all stay as they are.

## Wave 1: Finish the open fixes (first)
- Builds that keep getting cut off pick up from their last saved step, through the same wait-and-retry path, instead of stopping with "interrupted".
- Check why World of Service (18%) and Ultimate Tree Service (46%) haven't moved, and get them unstuck the same way.
- Live build view: show each finished page and section as soon as it's ready, with the current step and the "resumes at" time.
- A failed build keeps the last good version of the site on screen, with one Retry button.

## Wave 2: Every button works (Jarvis and the customer builder)
- Click through every button on a phone and on a desktop:
  - Jarvis: send, voice, approve/decline, build demo, preview, email draft, retry, cancel, autopilot, the approval log.
  - Builder: send, stop, retry, undo/restore, phone/desktop preview, pages, publish checks, image upload.
- Fix everything that errors, does nothing, or gives no feedback. Every button shows a clear state: loading, done, or error with the next step.

## Wave 3: Builder features that beat Lovable and Framer
- **Point-and-edit:** tap any heading, picture or button in the preview and ask the AI to change just that. Only that part is rebuilt.
- **Versions:** every AI change saves a version. See before and after side by side, and restore any version with one tap.
- **Launch checklist:** before publishing, one screen checks your facts, pictures, phone layout, contrast, page titles, broken links and your domain. Each item shows pass or fix.
- **Proof of facts:** every claim on the site links back to where it came from (the owner, Google Maps, or the owner's photos). Anything without a source is flagged and never published silently.
- **Instant share:** a share link, a QR code and a phone preview for any draft.

## Wave 4: Every marketing page and app page, polished
- Audit every page on your public site and in the customer app on a phone and on a desktop.
- Fix inconsistent spacing and type, and make empty, loading and error screens clear.
- Tighten wording and make each page's main action obvious.
- Make the demo-to-signup-to-checkout path one smooth flow, so a prospect can claim their demo site in under a minute. Tested in test mode only, with no real charge.

## Wave 5: Jarvis as your daily operator
- Daily brief: new leads, demo views, claims, trials ending, failed builds, and what Jarvis suggests doing next.
- Follow-ups are drafted for your approval and never sent automatically.

## Wave 6: Platform quality
- Re-run the speed, accessibility and search checks after each wave.
- Run the full test suite.
- Tests that one customer can't see another customer's data.
- Clean up dead code and duplicated pieces found along the way.

## What stays off-limits
- No paid AI spending, no emails or texts sent, no real charges, no pricing changes, no deleting data.
- Publishing is your call, after each wave.

## Technical details
- **Wave 1:** handle lease-expired, out-of-attempts jobs in `closeAbandonedJobs` through the existing capacity deferral (bounded by `MAX_CAPACITY_DEFERRALS`), never a second wait path. Render partial pages from section checkpoints in the draft view.
- **Wave 3:** element targeting through data attributes on rendered sections, with edits scoped to one section through the existing edit pipeline. Versions reuse the existing site snapshots. The checklist reuses the launch-review and publishing gates.
- **Database changes:** additive only, set up in the order GRANT, then RLS, then policies.
- **Checks:** Playwright at 390px and 1280px, signed in as admin and as a test customer. Vitest, TypeScript and lint after every wave.
