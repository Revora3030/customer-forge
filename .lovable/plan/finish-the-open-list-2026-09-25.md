# Finish the open list

## 1. Launch score counts the real visual check
- The launch score's design part is always 0 right now. Change it so that when the site's current version has a passing visual check, that check's score is used.
- Trust: when no reviews or credentials exist, don't count that area at all instead of scoring it 0. We never make up reviews.
- Publishing: count the site's free /s/ address as a valid address, so you don't need your own domain to reach the score.
- Add tests: a site without reviews can reach 95, and a failed or out-of-date visual check still blocks publishing.

## 2. Revora site: add hours, check it, publish it
- Ask the AI to add "Open 24 hours" to the Revora draft.
- Run the visual check on every page at phone, tablet and desktop sizes. Use "Fix with AI" (up to 3 rounds) if anything fails.
- Approve the site and publish it at /s/ (no custom domain). Check the live page on phone and desktop, starting from the top of the page.

## 3. Rebuild the Northline test site
- Rebuild it and confirm the buttons and service cards still show up now that the AI has to ask for them. Then re-run its visual check.

## 4. Builds that fail or retry
- Review how builds retry and recover. Confirm an old attempt can never overwrite a newer one, and a failed build always brings back the previous site. Add tests for both.

## 5. Final security, billing and publishing review
- Run a new security scan and the database checks.
- Review who can reach billing, trials and publishing.
- Fix anything the review finds. Then run all tests and the code check.

## Left for later
- More design and effect options, and AI review of screenshots. These are larger projects and will get their own plan.

## Technical details
- launch-quality-signals.ts: set visual_design from the latest website_visual_reports row that has passed=true and a revision_hash matching private.site_revision_hash(org). Skip the trust area when there's no review or credential evidence, and share its weight among the other areas. publishing: a working /s/:slug address counts as the domain.
- The database publish check (guard_production_activation) stays as it is.
- Retry review covers site-engine.worker.server.ts, builder-queue.ts and restore_website_state.
