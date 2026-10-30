# Revora builder vs Lovable — everything that doesn't work (2026-10-29)

Audit only: no code changed, no builds, no paid calls. Code refs are `lovable-sync` @ 243634d4.

## How Lovable builds a site end to end
1. **One prompt is enough.** You describe the site, and the agent infers pages, sections, copy and images ([Lovable quick start](https://docs.lovable.dev/introduction/getting-started)).
2. **Plan, then build.** Plan mode proposes a plan first, and Build mode writes the code across files ([Lovable docs](https://docs.lovable.dev/tips-tricks/from-idea-to-app), [Build mode](https://docs.lovable.dev/features/agent-mode)).
3. **The agent writes real code.** It writes React + Tailwind on TanStack Start, with no fixed block vocabulary ([Lovable websites](https://lovable.dev/use-cases/websites)).
4. **It fills its own gaps.** It searches the web, fetches URLs and generates or edits images itself when you give none ([Lovable Agent](https://lovable.dev/blog/agent)).
5. **It checks itself.** It builds, previews, runs browser and frontend tests, and fixes the errors it finds ([Build mode](https://docs.lovable.dev/features/agent-mode)).
6. **The first version takes minutes.** You then refine by chat or visual edits and publish ([Lovable quick start](https://docs.lovable.dev/introduction/getting-started)).

Key difference: Lovable never stops a build because something is missing. It fills the gap and keeps going. Revora is designed to stop.

## A. Builds can't finish (blockers)
1. **No build has ever completed end to end in production.** `roadmap.md:222, 290, 319` records it as blocked by the workspace daily AI limit, the $5/day paid cap and a rate-limited free pool. The Phase A test build is parked at 74%.
2. **The live site still runs the old engine.** The new worker and the $20 cap only take effect "after publish" (`roadmap.md:290`), and the project hasn't been published in Lovable.
3. **The $5/day paid cap is platform-wide** (`ai/paid-budget.server.ts:20`). One healthy build costs about $1.90 (`builder/build-spend.ts`), so about two builds a day are possible across every customer, demo and autopilot job combined.
4. **The most expensive picture model is tried first.** The image order starts with `gpt-image-2.5-sunburst` at about $0.25 per picture (`ai/config.ts:75`). Cheaper Lovable image models in your catalogue (`gemini-3.1-flash-image`, `gemini-2.5-flash-image`, `gpt-image-1-mini`) aren't in the list, so pictures alone use most of the daily cap.
5. **The daily site limit is stuck at 5** "until a build passes" (`roadmap.md:222`). It's a chicken-and-egg problem.
6. **One hard section fails the whole site.** "A section still without a valid AI layout stops the build" (`first-build-compositions.server.ts:12, 642`). A page is abandoned after 2 failed calls. Lovable would fix the error and continue.
7. **The rules are very heavy.** Every layout call carries about 15k characters of RULES, about 10k of primitive guide and about 3.7k of trade playbook. That's roughly 7–8k tokens of constraints to satisfy at once, which raises rejection and repair rates and cost.

## B. Low-input customers (few photos, little information)
8. **No photos plus failed image generation means the build stops.** `site-engine.worker.server.ts:1926-1937` throws when there are zero owner photos and zero generated pictures. There's no fallback.
9. **The free licensed stock-photo source isn't used by the first build.** `builder/stock-photos.ts` (Openverse, commercial-use licences only) is wired only to a separate function and a Jarvis diagnostic tool, not to the first-build picture stage.
10. **Signup refuses to continue without a service name** (`onboarding.tsx:641-649`, message at line 1157). Nothing suggests services from the industry, and Lovable would infer them.
11. **No "one sentence → site" path for customers.** Onboarding is a multi-step form (name, city, services, photos, contact, proof). There's no prompt box where an owner types "pressure washing in Raleigh" and gets a site.
12. **Google listing import and website import can't be verified.** They depend on `GOOGLE_PLACES_API_KEY` (`integrations/google.server.ts:311`, `maps-photos.server.ts:13`). Whether it's set in production can't be checked from here, and if it's missing the "few details" customer gets nothing auto-filled.
13. **Demos have no owner photos**, so they can never show the video's before/after or brush reveal.

## C. The video beats never appear
14. **The signup photo picker has no Before/After option** (`OwnerPhotoUpload.tsx:17`, `owner-photos.ts:28`: hero / work / team / premises only). The reveal needs `media_category` before/after (`first-build-compositions.server.ts:186`), so no first build ever gets the brush game or "Same house. One visit."
15. **There's no photo-series upload**, so the scroll sequence (2–6 frames of one subject, `composition-tree.ts:657`) rarely has material.
16. **No "how you work" questions**, so the PSI or method dial has no real facts and is either skipped or made up.

## D. Look and quality
17. **Every business gets the same dark look.** "Every page of every business … obsidian studio canvas (#0a0d10)" (`first-build-compositions.server.ts:125`, `industry-playbook.ts:432`, `service-packages.ts:5`). Render time also forces light sections dark (`studio-canvas.ts:43`). A bakery looks like a detailer.
18. **The AI can only assemble about 40 approved building blocks**, within 600 nodes and 12 levels deep (`composition-tree.ts:19, 255`). That's safe for many customers on one platform, but it can't match Lovable's freedom to write any component. `custom-block.ts` and `freeform.ts` exist but only for owner-requested widgets.
19. **Video models are unused.** `veo-3.1`, `veo-3.1-fast` and `veo-3.1-lite` are in your Lovable catalogue but never referenced, so there are no hero videos or motion loops like the top sites.
20. **Owner-photo upgrades are unused.** Image editing waits for a proven free edit (`image-studio.server.ts:128-140`), so owner photos are never cleaned up or improved.

## E. Truth and safety holes
21. **The truth screen lets invented claims through.** It allowed "Fully insured", "20 years of experience", "Serving Raleigh since 2009", "1,200 driveways cleaned", "Trusted by 300+ neighbors", "Same-day service", "Eco-friendly, pet-safe soap" and dial numbers like "3,000-4,000 PSI" (`business-dna.ts:85-121`). It did catch "Licensed", "5 stars" and "100%".
22. **Years and founding dates aren't checked** against the "Years in business" field.

## F. Live site and operations
23. **The live seed site still shows fake reviews.** `revoragrowthsystems.com/s/elite-mobile-detailing` is empty but indexable and listed in the sitemap. It serves `aggregateRating` 5 from 3 seed reviews (re-checked live today), plus a fake phone, email and Instagram.
24. **Empty sites aren't hidden from Google.** There's no automatic noindex or sitemap exclusion when the home page has no sections.
25. **Authenticated pages sometimes load blank or time out** under the runtime audit (`roadmap.md:213`).
26. **Demo status and inventory disagree.** One demo shows `not_started` while its preview returns 200 with `build: null` (issue #361).
27. **Email, CRM and Stripe sandbox aren't verified.** The integration preflight shows missing test secrets.
28. **The database drift check can't run** without `SUPABASE_DB_URL`.
29. **The "Supabase Preview" check is red.** It's linked to the unused project `xmkckvtdzieiubbqvmto`.
30. **The repo's own audits all pass (20/20)** but grade code structure, not real built sites, so they hide everything above.
31. **Stale work is open:** issue #303 (no detail), PR #317 (idle since 10-24) and PR #302 (old sync).
