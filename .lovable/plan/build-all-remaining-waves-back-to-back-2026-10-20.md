# Build all remaining waves back to back

These are the waves from the plan you approved, built one after another without stopping for check-ins. Pricing ($350 setup, first month free, then $100/month, 3-day trial), the free-only AI switch, the 5-sites-per-day limit and the email approval rule all stay as they are.

## Already done
- Builds cut off on their last try now wait and resume from their last saved step.
- Builds that fail at the page-plan step because the free models are busy now wait and retry instead of failing.

## Wave 1 (rest): See the build as it happens
- The builder and Jarvis show each finished page and section as soon as it's ready, plus the current step and the "resumes at" time.
- A failed build keeps the last good version of the site on screen, with one Retry button.

## Wave 2: Every button works
- Click through every button on the Jarvis page and the customer builder chat, on a phone and on a desktop.
- Fix anything that errors or does nothing.
- Every button shows a clear state: loading, done, or error with the next step.

## Wave 3: Builder features
- Point-and-edit: tap a heading, picture or button in the preview and ask the AI to change just that.
- Versions: compare before and after side by side, and restore with one tap.
- A launch checklist before publishing.
- Each fact on the site shows where it came from.
- Instant sharing for drafts: a share link, a QR code and a phone preview.

## Wave 4: Polish every page
- Audit every public page and every customer app page on a phone and on a desktop.
- Fix spacing, empty, loading and error screens, wording and each page's main action.
- Make claiming a demo, signing up and checking out one smooth flow, tested in test mode only.

## Wave 5: Jarvis daily brief
- New leads, demo views, claims, trials ending, failed builds, and suggested next steps.
- Follow-ups are drafted for your approval, never sent automatically.

## Wave 6: Platform quality
- Speed, accessibility and search checks.
- The full test suite.
- Tests that one customer can't see another customer's data.
- Clean up dead code.

## Honest limits
This is a lot of work. I'll finish as many waves as fit, test each one, and tell you exactly which waves are done, which are partly done and which haven't started. Nothing is sent, charged or published without you.

## Off-limits
- No paid AI spending, no emails sent, no charges, no pricing changes, no deleting data.

## Technical details
- Partial-section rendering from the existing section checkpoints. Reuse the existing site snapshots, launch-review gates and the existing edit pipeline.
- Database changes are additive only, set up in the order GRANT, then RLS, then policies.
- Playwright at 390px and 1280px. Vitest, TypeScript and lint after each wave.
