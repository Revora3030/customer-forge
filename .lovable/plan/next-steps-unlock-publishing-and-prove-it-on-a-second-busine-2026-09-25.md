# Next steps: unlock publishing and prove it on a second business

## 1. Run the site's visual check on the test site
- Open the builder as the admin account and run the visual check on every page at small phone, phone, tablet and desktop widths.
- If anything still fails, press "Fix with AI" (up to 3 rounds) and check again.
- The goal is a passing score for the current version of the site, which is what unlocks publishing.

## 2. Remove automatic buttons and cards
- Stop the site assembly step from adding buttons or service cards on its own because of what a section is called. From now on, the AI's design decides.
- Add a test that proves nothing is added unless the AI asked for it.
- Rebuild the test site once to confirm it still looks complete.

## 3. Second-industry build, end to end
- Create a new test business in a different industry, using only real details (no made-up reviews or results).
- Run a full AI build, pass the visual check, approve it and publish it.
- Show the finished public site on phone and desktop.

## 4. Continue the hardening list
- Prove the old design shortcut can't control new builds, then remove it.
- Clean up old build records so they don't pile up forever.
- Do a fresh security scan and fix anything it finds.

## Technical details
- Visual check: VisualCheckPanel runs a browser measurement at each width. The result is tied to the site's current revision, and the publish guard needs that result to be passing.
- Automatic buttons and cards: the role-based button/card additions in site-materialize.server.ts get removed. Structure must come only from the AI's composition, and a regression test goes in final-blockers.test.ts.
- Old design shortcut: blankDesignFingerprint() gets proven unreachable, then deleted. For old build records, add a retention cleanup for idempotency claims.
- Checks after each step: full tests, type check and a clean build.
