# Finish the "reference-video quality" pass for every new website

Goal: every new customer site (especially homepage signups) finishes with real photos, full-width cinematic layouts and business-specific interactions at the CarVault / Vice Key / Regent standard — never a text-only, generic result.

## What is already in place (from the last pass)
- Builds now require an AI-written photo plan (at least 5 pictures with subject and description) plus layout direction, with one AI repair attempt; otherwise the build stops for retry instead of finishing empty.

## Remaining steps, in order

1. **Remove the leftover old estimate form** on the test site's Book page (it still shows old Revora services/prices). Confirm where it comes from first, then make the builder never carry a previous business's services into a new site.
2. **Make sure the photo plan actually becomes pictures.** Confirm the pictures step creates and saves images from the plan (last time it finished in under a second with zero images). Fix so finished pages show real photos in the opening section and key sections.
3. **Fix layout gaps**: the blank desktop column and repeated text seen on the test pages. Add a check so duplicated wording and empty columns are sent back for AI repair.
4. **Finish-line quality gate**: before a build is marked done, require: photos present and saved, opening section is visual (not text-only), every page has its own sections, at least one business-specific interactive piece where facts allow (quote, before/after, booking). Anything not measured is reported as "not checked", never as passed.
5. **Homepage signup brief carry-through**: confirm what a visitor types at signup reaches the build's creative direction, and fix any gap so their wording and goals shape the site.
6. **One more approved test build** (mobile detailing, single build, already-approved credits). Check every page on phone and desktop, view the photos, and report honestly against the reference videos. Nothing is published.
7. **Restore the Revora owner workspace** from the saved backup after the test, so your real business details are back in place.

## Safety
- No publishing, emails, or extra paid AI beyond the one approved test build.
- No made-up reviews, prices or facts; prices only from the business's own saved services.
- Tenant and account boundaries unchanged.

## Technical notes
- Work in the existing first-build pipeline (collective-first-build, saved-coverage, stage checkpoints); no second builder or template path.
- Add focused tests for each new gate; run affected test files and the build log before reporting.
