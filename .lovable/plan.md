# Finish the open list

## 1. Revora site: add a main headline
- Ask the AI builder to add one main headline, using only real business details (name, what Revora does, the $750 setup / first month free / $100/month offer). No city, no made-up claims.
- Confirm the page now has exactly one main headline, and that "Open 24 hours" is still there.
- Check the gold button text is easy to read. If it isn't, have the AI fix the contrast.

## 2. Revora site: check, approve and publish
- Run the visual check on phone, tablet and desktop. Use "Fix with AI" (up to 3 rounds) if it fails.
- Confirm the launch score reaches the 95 needed to publish, then approve and publish.
- Open the live site on phone and desktop, take screenshots, and look at them.
- If the "Back to builder" button still covers the bottom button on phones, move it. Only you see it, but it's still in the way.

## 3. Northline test site
- Rebuild it and confirm its buttons and service cards still show up now that the AI has to ask for them.
- Re-run its visual check.

## 4. Final review
- Run a full security scan and the database checks.
- Check that only the right people can reach billing, trials, publishing and site edits.
- Run all automated tests and the code check.

## 5. Report
- What passed, with proof (screenshots, scores, test counts).
- Anything still open, with the reason. Nothing will be called done unless it has been checked.

## Technical details
- The headline check (`src/lib/agent/verify.ts`) looks for a single `<h1>`. The composition renderer only outputs `h1` when the AI sets `level: 1`. Neither section of the Revora site has that right now.
- Two fixes from this turn now guard edits: `applyReview` keeps a new section that another change fills in, and after an edit only problems that edit caused undo it (compared with a check run before the edit).
- Publishing goes through `private.guard_production_activation()`, which needs a passing visual report for the current version.
