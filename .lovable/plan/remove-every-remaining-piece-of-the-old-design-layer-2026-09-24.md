# Remove every remaining piece of the old design layer

Goal: no built-in style list, preset, industry recipe, motion rule, story rule or default design is left in the code. The AI (Sol, reviewed by Terra) makes every design choice. Safety checks stay: facts, security, accessibility, contrast, schema, restore points, cost limits, publish checks.

The one thing we can't just delete: existing customer sites have their old look saved as data. The renderer has to keep reading that saved data, or live sites would lose their styling. That becomes a plain "display saved values" reader with no choices in it. It never picks or makes up a style.

## Work, in order (each step must pass the full check before the next starts)

1. **Open the first-build style list.** Remove the fixed hero/card/background/nav choices Sol is told to pick from. Sol writes its own design tokens and composition. The validator only checks the values are safe (colors, sizes, contrast).
2. **Hand the Motion button to the AI.** The upgrade panel's Motion action sends the site to Sol with a motion brief and applies what comes back as a normal AI edit, with a restore point. Delete `motion-pack.ts`.
3. **Delete the first-build design step.** Remove `first-build-creative.ts`, `native-first-build.ts`, `creative-brief.ts`, `creative-authority.ts`, `executable-creative.ts`. Picture planning reads image slots from Sol's plan, not from preset looks. Checks read Sol's saved design record.
4. **Stop default section styling.** Materialize writes only what the AI wrote. If a section is missing required style fields, the job fails and retries through the next model. No stamped defaults.
5. **Remove the industry guides.** Delete `industry.ts` (3,800 lines). Customer worries and "things to avoid" come from the owner's answers plus Sol's own research brief. Anything the owner didn't say isn't invented.
6. **Remove picture-style picking.** The photo style comes from Sol's plan and the owner's request only.
7. **Remove the default design record.** The redesign and builder steps pass "no saved design" to Sol instead of making a plain one.
8. **Delete the old request reader** (`interpreter.ts`) once its type imports move into a small types file.
9. **Delete the story upgrade code** and its switched-off paths in `site-upgrade.functions.ts`.
10. **Shrink `design-fingerprint.ts`** to a saved-data reader for existing sites: types plus "read stored values, validate, render". No pools, no picking, no generating.
11. **Guard tests.** Fail the build if any deleted file returns, if any creative preset list reappears, or if a failed model leads to anything other than the next model or a clear "try again".
12. **Full check and live look.** Type check, lint, all tests, build. Then load an existing site and a fresh build at 320, 390, 768 and 1440 wide to confirm old sites look the same and new ones render.

## Technical details

- Files touched: routes `s.$slug.tsx`, `s.$slug.$page.tsx`, `app.website.tsx`; `SiteSections.tsx`, `DesignIdentity.tsx`, `BuilderWizard.tsx`, `SiteUpgradePanel.tsx`; `site-materialize.server.ts`, `site-engine.functions.ts`, `site-engine.worker.server.ts`, `site-agent.functions.ts`, `site-upgrade.functions.ts`; builder modules `ai-redesign-direction.server.ts`, `ai-page-architecture(.server).ts`, `collective-first-build.server.ts`, `first-build-images.server.ts`, `image-layout-intelligence.ts`, `screenshot-reference.ts`, `site-campaign.ts`.
- Deleted: `motion-pack.ts`, `first-build-creative.ts`, `native-first-build.ts`, `creative-brief.ts`, `creative-authority.ts`, `executable-creative.ts`, `industry.ts`, `interpreter.ts`, plus their tests.
- No database changes. Stored fingerprint and style columns stay, so existing sites keep rendering.
- Risk: first builds depend on AI output only, so a full provider outage means a clear retry message instead of a site. That's the intended trade-off.
- Nothing goes live until you publish.
