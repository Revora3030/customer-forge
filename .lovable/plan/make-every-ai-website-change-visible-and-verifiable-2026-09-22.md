# Make every AI website change visible and verifiable

## Confirmed root causes

The September 22 request **“Change front and background color”** did save successfully, but the result did not match the request:

1. Revora interpreted **“front” as “foreground colour,” not “font.”** The saved plan contains only one `set_theme` action and explicitly says it retained the existing typography.
2. The saved font value is a descriptive sentence — `Bodoni Moda editorial display serif headings with Manrope...` — but the renderer accepts only exact supported family names. It therefore ignores that value and shows the fallback font.
3. The site-wide background is only a base colour. **29 of the site’s 65 sections have their own saved colours**, including the previous cream and dark colours, so those sections override the new site-wide colour.
4. The site is still in **Preview** with no previous publish date. Draft changes can appear in the builder preview, but customers cannot see them on a public address until Publish is completed.
5. The apply result currently proves that a database row changed, not that every visual part requested became visibly different. That is why the UI could honestly say “1 change applied” while the requested font did not visibly change.

## Implementation

### 1. Correct request interpretation
- Teach the planner that “front/fronts” in styling requests commonly means “font/fonts”; use “foreground” only when the customer explicitly asks for text/foreground colour.
- For ambiguous style wording, either apply the clearly requested font and background together or ask one concise question before changing anything.
- Keep the customer’s original wording visible while normalizing only the planner’s internal intent.

### 2. Make typography fully actionable
- Replace the free-form font field in the AI contract with exact supported heading and body font families.
- Support a validated heading/body font pair site-wide, load both real families, and apply them through the existing theme variables.
- Reject an unsupported family before saving instead of recording a change the renderer will ignore.
- Preserve block-level font overrides where the customer explicitly asks for a different treatment.

### 3. Make site-wide colour requests actually site-wide
- Detect section and component colours that override the site theme.
- When the customer says “whole site,” “all pages,” or equivalent, have the plan update the base theme plus every conflicting visible section/component across all pages.
- When they name one page or block, scope the change only there.
- Keep automatic contrast correction, safe colour parsing, and responsive variants; these protect readability without blocking the chosen direction.

### 4. Add requested-result coverage checks
- Derive concrete requested dimensions from each instruction: typography, background, text colour, imagery, layout, copy, page creation, and so on.
- Before applying, verify that the proposed actions actually cover each requested dimension and target.
- After applying, reload the saved site tree and verify that each requested value is both persisted and consumed by the renderer.
- If a request is only partially applied, report the exact missing part and never show a blanket success message.

### 5. Remove non-security no-op paths
- Audit every supported AI action from planning through validation, saving, restoration, draft rendering, and public rendering.
- Remove stale allowlists, aliases, and conversions that silently discard valid safe values.
- Keep hard blockers for invented business facts, unsafe code/URLs, cross-customer access, authentication, billing, and publishing permissions.
- For genuinely unsupported requests, show a specific limitation rather than pretending a change was made.

### 6. Clarify draft versus live visibility
- After a successful draft change, show whether the customer is viewing the refreshed draft or the public version.
- Force the preview frame to reload from the newly saved draft after every successful batch.
- Show “Draft updated — publish to make this public” when the site is not live, rather than implying customers can already see it.
- Do not auto-publish; retain the owner’s Publish control and existing release checks.

## Verification

- Re-run the exact request “Change font and background color” on Supreme detailing and confirm the plan contains both typography and colour actions.
- Verify the chosen heading/body fonts render rather than falling back.
- Compare all 65 sections before and after; no old section-level colour should survive a true site-wide request unless the AI deliberately preserves it and says so.
- Verify draft refresh on mobile and desktop at 320, 375, 390, 430, 768, 1024, 1280, and 1440 pixels.
- Verify single-block requests remain scoped, undo restores the previous site, and public pages remain unchanged until Publish.
- Run the full tests, type checks, lint, build, and an authenticated browser test of request → apply → refreshed preview → publish-status message.
