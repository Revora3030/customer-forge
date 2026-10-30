# Website Factory audit — 2026-10-29

Read-only review (issue #361). No paid model calls, builds, image generation, retries, publishing or deployments were run. Evidence is file:line at `lovable-sync` 243634d4, live HTTP fetches, and offline unit probes run against the real validator and truth screen.

Question asked: why don't Jarvis and AI City produce sites like the Kestrel reference video (scroll sequence with a progress ring, a "Clean this driveway" brush game, "Same house. One visit." before/after, a PSI dial, "Price your house in 20 seconds"), and what keeps them from competing with Lovable-class builders?

## Summary

The building blocks for every beat in the video exist, validate and render (`reference-standard.test.ts`, `cinematic-primitives.test.ts`, `composition-reveal.test.ts`). The factory still doesn't ship those sites, for three reasons:

1. **No build has ever finished end to end in production.** Spend caps and rate limits stop builds before they finish, and the published worker still runs the old engine.
2. **Signup never collects the material the video's beats need.** There's no way to label photos as before/after, no method or process facts, and no photo series of one subject. The truth rules (correctly) refuse to fake that material, so the centrepiece beats can never appear on a first build.
3. **Every site is forced into the same dark "obsidian studio" look**, so a bakery, a dentist and a pressure washer all look alike. That works against "compete with Lovable".

On top of that, the truth screen has holes that let invented claims through, and the only live customer site is an empty seed site that publishes fake reviews in Google-visible markup.

## Findings by priority

### P0 — Live site publishes fake reviews and contact details
- `https://revoragrowthsystems.com/s/elite-mobile-detailing` is the only entry in `/sitemaps/sites.xml`. It's a seed org (`11111111-1111-4111-8111-111111111111`) with `content: null` and `nav: []`, and it renders only "This website is still being built" (`src/routes/s.$slug.tsx`, PublicSiteView with no sections).
- It is still indexable (canonical set, `max-image-preview`). Its LocalBusiness JSON-LD carries phone `(512) 555-0142`, `hello@elitemobiledetailing.example`, `instagram.com/example`, and `aggregateRating` 5 built from 3 seed reviews ("Priya N."). Google treats that as fake review markup, and it can hurt the whole domain.
- Fix: (a) the owner unpublishes the seed site; (b) code: emit `noindex` and leave the site out of the sitemap when the home page has no sections; (c) never emit `aggregateRating` from seed or sample reviews, or when the site has no content.

### P0 — No build completes end to end
- `docs/roadmap.md` (~lines 112, 222, 290, 319) says there's no successful live end-to-end build yet, and that the "published worker still runs the old engine until the owner publishes" (line 113).
- Economics: `src/lib/builder/build-spend.ts` puts a healthy build at about $1.90 and a failing one at $2.40–4, against a platform-wide $5/day paid cap. That's about two builds a day for all customers, demos and autopilot combined, after which work falls to a free pool that is rate-limited and times out.
- Strictness: `first-build-compositions.server.ts:12, 642` says any section still without a valid AI layout stops the whole build, with no substitute. A page is abandoned after 2 failed calls (line ~646), and each section has 3 attempts plus rescue passes. The rules a model has to satisfy at once are large: RULES is about 15k characters, PRIMITIVE_GUIDE about 10k, and the trade playbook about 3.7k. That's roughly 7–8k tokens of constraints per call, so each extra rule raises the odds of a rejection.
- Fix: publish in Lovable so the new engine runs. Raise the paid daily cap (env: `AI_PAID_DAILY_CAP_USD` / per-build `BUILD_SPEND_CAP_USD`; an owner decision) or reserve cap for paying customers ahead of demos and autopilot. Downgrade non-safety design findings to warnings on rescue passes so one difficult section can't sink a site. Then run one approved live test build and record the result.

### P1 — Signup can't collect the video's material, so the beats never appear
| Video beat | What it needs | What signup collects | Result |
|---|---|---|---|
| "Clean this driveway" brush and "Same house. One visit." | An owner photo pair tagged `before`/`after` (`ownerPairRole`, `first-build-compositions.server.ts:186`, which reads `settings.media_category`) | The onboarding photo picker (`OwnerPhotoUpload.tsx:17`, `owner-photos.ts:28`) offers only hero / work / team / premises. Before/after exists only later in the Media Library (`src/lib/media.ts`). | No pair on any first build, so no reveal |
| Scroll sequence with a progress ring | 2–6 ordered frames of one subject (`composition-tree.ts:657`) | Loose photos with no "series" concept | Rarely possible |
| PSI / method dial | Real per-surface method facts | No field (`onboarding.tsx` asks name, industry, city, services and prices, contact, years, certifications, awards, testimonials) | The AI either skips it or invents numbers (see P1 truth gaps) |
| Price in 20 seconds | Services prices | Collected ("Starting at ($)") | Works when prices are entered |
| Prospect demos (AI City / Jarvis) | Owner photos | None (a prospect hasn't uploaded anything) | Demos can never show a reveal |

- Fix: add "Before" and "After" (and a "pair" link) to the onboarding photo picker, plus a "photo series of one job" upload. Add an optional "How you work" step (surfaces and methods, settings, time per job) that feeds the dial and copy as supplied facts. For demos, show an honest "your before/after goes here" placeholder that converts in the sales pitch, instead of leaving the beat out.

### P1 — Truth screen lets invented claims through
An offline probe of `screenText` (`collective-copy.ts:98` → `screenClaims`, `business-dna.ts:85-121`), using facts with no certifications, testimonials or counts, accepted all of these:
`"Fully insured"`, `"20 years of experience"`, `"Serving Raleigh since 2009"`, `"1,200 driveways cleaned"`, `"Trusted by 300+ neighbors"`, `"Same-day service"`, `"Eco-friendly, pet-safe soap"`, and dial readings such as `"3,000-4,000"` PSI.
It correctly caught `"Licensed"`, `"5 stars"` and `"100%"`.
- Causes: the credential pattern catches only "insured and bonded". The count pattern needs 2–3 digits followed by a fixed noun list (no commas, no "homes/driveways/jobs/neighbors"). Nothing checks years or founding dates against the "Years in business" field. Dial values aren't tied to supplied facts.
- Fix: widen the patterns (insured/bonded alone; `\d[\d,]*\+?\s+\w+ (cleaned|served|completed)`; years and since-dates checked against `years_in_business`; "same-day", "eco", "pet-safe" and "non-toxic" treated as claims needing support). Allow dial readings only from the method facts in P1 above. Add adversarial tests.

### P1 — Every business gets the same dark look
- `first-build-compositions.server.ts:125`: "Every page of every business … uses the obsidian studio canvas (#0a0d10)". The same rule appears in `industry-playbook.ts:432` and `service-packages.ts:5` ("Every trade shares one obsidian studio; only the words change"). At render time, `studio-canvas.ts:43` (`studioSectionColor`) and `s.$slug.$page.tsx` force light sections to obsidian.
- That is a fixed template in practice. It conflicts with AGENTS.md ("Design is AI-authored from composition primitives, not fixed templates") and with the goal of distinctive sites. Lovable, Framer and Webflow output varies in palette, type and density by brand.
- Fix: make the canvas a per-archetype choice (light editorial for bakery, salon, dental, childcare; dark studio for detailing, exterior and auto), driven by the owner's colours and the playbook. Keep obsidian as one option, not the rule, and stop the render-time recolouring of light sections unless the page chose studio.

### P2 — Other issues
- Demo previews (`/p/$token`) can't be inspected from outside. Issue #361 notes org `61b2473d-…` showing `not_started` while its preview returns 200 with `build: null`. The demo status and inventory disagree, so an admin can't tell which demos are real.
- `supabase:drift` can't run without `SUPABASE_DB_URL`. `integrations:preflight` shows email, CRM and Stripe sandbox as NOT VERIFIED, so cold email and billing are unproven.
- The "Supabase Preview" check fails because it's linked to the unused project `xmkckvtdzieiubbqvmto`. Disconnect it in Supabase → Project Settings → Integrations → GitHub.
- The repo's own audit scripts (security, repo, production readiness and controls, builder ultimate 20/20, visual output) all pass. They grade code structure, not live output, so passing them doesn't mean sites are good.
- Stale work: issue #303 "Fix home page" (no detail), PR #317 (cinematic 3D, idle since 10-24) and PR #302 (old Lovable sync).

## Recommended order
1. Unpublish the seed site, then ship the noindex and no-fake-rating fix.
2. Publish in Lovable (new engine), set a workable paid cap, and approve one live test build.
3. Add before/after, photo-series and "how you work" intake.
4. Close the truth-screen gaps, with tests.
5. Make the canvas per-archetype.
6. Fix demo status and inventory, then verify email and Stripe preflight.
