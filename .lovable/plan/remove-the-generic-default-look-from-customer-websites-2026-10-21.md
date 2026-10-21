# Remove the generic "default look" from customer websites

## What the screenshots show (Elite mobile detail, 390px)
- Plain white header bar and cream page: this business's saved colours are black / white / gold, and the site falls back to a neutral white style whenever the design is thin.
- Large empty space at the top of the page (no hero image or design filled it in).
- Blurry grey smudges behind the header (a leftover background effect).
- The FAQ is a bare list with grey lines and a plain black button, which is the built-in fallback styling, not something the AI designed.
- Step cards are plain white boxes with no brand character.

## Goal
Every visible part of a customer site (colours, background, header, menu, buttons, cards, FAQ, forms, footer, spacing, motion) comes from the AI team's design for that business. The renderer stops adding its own "safe default" look. Safety checks for contrast, accessibility, truthfulness and tenant isolation stay, because they're review rules, not design choices.

## Steps

1. **Audit the fallback styling**
   List every place the site renderer adds its own look when the AI didn't specify one: the white surface and ink-black buttons in the site theme, the header bar, mobile menu, backdrop blobs, default FAQ/accordion, plain card boxes, form fields, footer, and the gray "pending section" placeholders. The output is an inventory, and nothing changes in this step.

2. **Make the AI design required, with no neutral substitute**
   - The design stage (Sol designs, Terra reviews) must produce a complete design for every part of the site: page and section surfaces, header and menu, buttons, cards, FAQ, forms and footer. If any part is missing, Terra sends it back to Sol to fill in. Nothing is filled in with a preset.
   - Remove the white/black neutral fallback from the site theme. A site without an approved AI design doesn't render as a "generic" site. Instead, the owner's preview shows "Design in progress" with a button to run the design pass, and the public site keeps its last approved version.
   - Treat saved colours that are only an old placeholder (pure black + pure white, as on this site) as "no brand." The AI then authors a real palette, unless the owner actually picked those colours.

3. **Delete the old generic pieces**
   - Remove the backdrop smudge effect when the AI didn't ask for one.
   - Replace the bare FAQ, plain card boxes and default button with versions that only take the AI's design choices. These versions have no built-in look of their own.
   - Remove the leftover deterministic styling classes and dead code they relied on.

4. **Stricter quality gate before a build counts as done**
   Add these to the existing rendered review at 390px and 1280px:
   - Large empty areas: blank stretches taller than about half a screen.
   - Missing hero: a site with no designed first impression.
   - Unstyled parts: any of the parts listed in step 2 still using the plain default.
   
   Any failure goes back through the AI repair loop. A build is never marked passed just because a check didn't run.

5. **Existing sites**
   Published customer sites are not changed automatically. For Elite mobile detail (and any other site the audit flags), a "Redesign with AI team" action runs a fresh design pass for owner review. It only runs when you tap it, because it uses AI credits.

6. **Verify**
   - Render a test site with no AI design and confirm it shows "Design in progress" rather than a white generic page.
   - Render a site with an AI design and confirm every part uses that design.
   - Run the full test suite, typecheck and lint.
   - Check 390px and 1280px screenshots.

## What stays the same
Truthful-content rules, contrast and accessibility checks, tenant isolation, publishing, custom domains and billing. No new spending, publishing or emails happen without your approval.

## Technical details
- `src/lib/site-theme.ts`: drop the `#ffffff` / ink fallback in `siteThemeStyle`. Callers get `undefined` and render the "design pending" state.
- `src/routes/s.$slug.$page.tsx`, `p.$token*`, `draft.$slug`: gate rendering on a complete AI design (tokens + chrome), and show the pending state otherwise.
- `src/lib/site-engine.worker.server.ts` (around lines 1306–1318 and 2070): classify `#000000`/`#FFFFFF` placeholder profiles as no owner brand, and require complete component tokens from the identity stage, with Terra repairing anything missing.
- `src/components/site/AiSiteHeader.tsx`, `SiteBackdrop.tsx`, `SiteSections.tsx`, `CustomBlock.tsx`, `FreeformBlock.tsx`, `CompositionRenderer.tsx`: remove hardcoded `bg-background`/`border-border` defaults and unrequested blob effects, so they're driven only by design tokens.
- Visual QA: add empty-space, missing-hero and unstyled-component checks graded as repair-required.
- Tests: no-design renders the pending state, and a placeholder black/white profile is not treated as owner brand.
