# Remove the keyword gate that blocks AI changes

## Root cause (confirmed in code)
After the AI team plans and reviews a change, an old word-matching check scans the customer's message. If the message contains words like "picture", "photo", "font", "color" or "background", it requires one specific kind of step, such as generating an image. If that step is missing, the whole request is marked "didn't work". This check also replaces the AI's own checklist.

In your screenshot, "every picture" triggered it. The AI's six-page rewrite was approved, but the check still rejected it because no image-generation step was included. Words in a message can't tell whether an AI plan is complete, so the same failure can happen with fonts, colors and backgrounds.

## What changes
1. Delete the word-matching check completely. The AI team's own list of what it handled will be the only record.
2. When something really can't be done, the chat will list it as "still open" but won't block the approved changes. The AI will say what it still needs, such as real photos or service details.
3. Before this reaches the chat, Sol will get one more try at any requested part the AI planner itself says it hasn't handled. That includes adding a picture step when you ask for new pictures. Terra still has to review that extra work.
4. Search for any other place where words in the message force a pass/fail result on the AI's work. Remove each one found and add a test that fails if this kind of gate comes back.

## Protections that stay
These protections stay in place: truth checks (no invented facts, prices or reviews), Terra's safety review, separation between customer accounts, publishing checks, accessibility checks and manual undo.

## Technical details
- Delete `coveredRequestDimensions` from `src/lib/builder/request-coverage.ts` and its call and override in `src/lib/site-agent.functions.ts`, around line 594. Keep the harmless font-typo note.
- In `src/lib/builder-requests.hooks.ts`, uncovered requirements become advisory whenever steps exist. The partial-apply change is already done.
- In `src/lib/builder/ai-agent-plan.server.ts`, when a requested requirement has no matching action, run one targeted Sol revision followed by Terra review.
- Update the tests that expect the old check, add a test so it can't return, then run the type check and the builder and AI test suites.
