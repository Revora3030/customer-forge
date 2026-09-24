# Make the AI build world-class sites from start to finish

This plan removes the last blockers from the audit. From now on, every first build has its words, page list, section order, layouts, menu and footer written by Sol, then checked by Terra. The only thing the site code does is display that work safely.

## What changes for you

1. **The AI writes all first-build words.** The built-in copy writer is removed. That was the one that wrote "{Service} in {City}" headlines, five fixed benefits and fixed FAQs. Sol now writes all the words using only your real business facts. Terra checks them for accuracy. If the AI can't write the copy, the build stops with a clear message and never falls back to template wording.
2. **The AI chooses the pages and sections.** The fixed home page order is removed (hero → trust bar → intro → services → benefits → FAQ → call to action). So are the fixed headings like "What we do" and "Common questions". Sol decides which pages exist, which sections each page has and what order they go in. Terra reviews the plan.
3. **Every first-build section gets a custom AI layout.** New sites no longer use the built-in section templates. Sol designs each section from scratch. The built-in templates stay only so older sites keep displaying the same way.
4. **The AI designs the menu and footer.** Sol writes the top menu and footer as custom layouts, such as a sticky glass menu or a large footer. The accessible fallback menu stays for sites that don't have a custom one yet.
5. **More building blocks for the AI.** The AI gets new pieces to build with: tabs, before/after sliders, pricing toggles, accordions, image grids, marquee strips and testimonial showcases. Every piece stays safe and accessible, keeps a 44px minimum tap size, turns movement off for visitors who ask for reduced motion, and stacks into one column on phones.
6. **Video in the first build.** Sol can ask for a moving hero background as part of its first design. The video uses the existing video system, which already has spending caps and a private upload. The hero still image always stays in place as the backup.

## Kept on purpose

Fact checks, the no-invented-claims rules, security and account separation, billing, contrast and tap-size minimums, reduced motion, restore points, AI spending caps, publish checks, and how existing sites look today.

## Technical details

- Delete `fallbackCopy` in `site-engine.server.ts`. `site-engine.worker.server.ts` then calls a new Sol copy pass, with Terra reviewing and Luna tightening the page descriptions. An empty or rejected result is a hard failure.
- In `site-materialize.server.ts`, `planSiteContent` only accepts the architecture from `proposePageArchitecture`. The renderer-authored candidate (`deriveCandidateArchitecture`) and the hardcoded headings are removed.
- The first build writes a `composition` section for every section (`validateComposition` plus the truth screen, with repair loops). Legacy `SiteSectionBody` kinds are still displayed but no new site creates them.
- New `site_chrome` settings hold header and footer composition trees. `SiteFooter` and the header render them when present.
- New primitives go in `composition-tree.ts` and `CompositionRenderer.tsx`: `tabs`, `accordion`, `compare`, `toggle`, `marquee`, `gallery`, `quote`. The validator and tests are extended.
- An optional `heroVideo` request in Sol's direction goes to `site-video.functions` through the existing caps.
- Guard tests fail if `fallbackCopy`, fixed section orders or hardcoded headings return.
- After the changes, run typecheck, lint, tests and a build. Then do a real first build and check it on phone, tablet and desktop.
