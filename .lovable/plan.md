# Finish the rest of the open list

Step 1 of the last plan is done: the launch score now counts the real visual check. This plan covers what's left.

## 1. Revora site: hours, check, publish
- Ask the AI to add "Open 24 hours" to the Revora draft. The AI does the edit itself; the words come from the business profile.
- Run the visual check on every page at phone, tablet and desktop sizes. If it fails, use "Fix with AI" (up to 3 rounds).
- Look at the new launch score on the launch page and confirm it matches the check.
- Approve the site and publish it at its free /s/ address. Then open the live page on phone and desktop, starting from the top.

## 2. Northline test site
- Rebuild it and confirm the buttons and service cards still show up now that the AI has to ask for them.
- Re-run its visual check so its score matches the current version of the site.

## 3. Builds that fail or retry
- Review how builds retry and recover:
  - An old attempt must never overwrite a newer one.
  - A failed build must always bring back the previous site.
- Add tests for both. Fix any gap found.

## 4. Final security, billing and publishing review
- Run a new security scan and the database checks.
- Review who can reach billing, trials and publishing. Fix anything found.
- Run all tests and the code check.

## Left for later
- More design and effect options, and AI review of screenshots. These are larger projects and will get their own plan.

## Technical details
- Steps 1–2 use the admin session in a headless browser. The builder's own flows run: an AI edit request, VisualCheckPanel, then approve and launch.
- Publishing must pass the existing database publish check, which stays unchanged.
- Step 3 covers site-engine.worker.server.ts attempt fencing, builder-queue.ts claim/retry, and restore_website_state. Tests go in final-blockers.test.ts.
