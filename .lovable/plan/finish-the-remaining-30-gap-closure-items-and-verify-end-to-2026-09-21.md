# Finish the remaining 30-gap closure items and verify end to end

## Goal
Finish the remaining builder-quality work so first builds create richer, more complete customer websites, every generated change reaches the visitor-facing site, and the release evidence is honest rather than fake-green.

## Confirmed current state
- The first-build image lane exists and saves safe generated starter images into private tenant media, but its evidence still reports `attached: 0` before materialization updates the true count.
- Generated image slots are currently limited to safe hero/service/background/CTA/social placements, and proof/gallery/team/result placements are excluded.
- Visitor rendering now reads component `settings` and prefers signed media URLs, while retaining the raw path only as a fallback.
- The builder report still hardcodes CRM as connected even when no live CRM path has been verified.
- Base64 image decoding still uses browser globals in server-side image storage helpers.
- Focused image/materialization/router tests existed and previously passed, but full typecheck/lint/build/security/browser verification has not been run after the latest image/rendering changes.

## Implementation plan
1. **Finish first-build image truth**
   - Make image evidence report the real post-materialization attachment count.
   - Keep owner uploads first, free generated pictures second, paid pictures only when explicitly enabled, and abstract artwork as the honest fallback.
   - Ensure generated starter images never populate proof, reviews, team, gallery, awards, results, or before/after sections.

2. **Add safe paid image fallback only where allowed**
   - Wire `gpt-image-2` as an explicitly enabled, budget-gated fallback after the verified free image path fails.
   - Reuse the existing durable monthly cap rules and report exact blocker names when disabled, missing credentials, denied, rate limited, over budget, or unavailable.
   - Do not call paid image generation in zero-cost/default mode.

3. **Fix server runtime safety**
   - Replace server-side `atob`/`btoa` image conversion with Worker-safe byte conversion.
   - Keep provider calls, credentials, prompts, and storage writes server-side only.

4. **Fix CRM/report honesty**
   - Replace the hardcoded CRM “Connected” report with a credential/runtime-backed status.
   - Show “Not connected” or an explicit missing-credential status unless a real integration check exists.

5. **Lock render/update path with tests**
   - Add tests proving generated hero/service/CTA images attach to saved page components and render through signed URLs.
   - Add tests proving generated images are omitted from gallery/proof/team/result slots.
   - Add tests for first-build shot deduping, owner-photo priority, fallback evidence, and CRM truth.

6. **Wire checks into launch confidence**
   - Ensure the builder Checks/Publish area surfaces image generation status, visual QA status, live-sync status, and external integration `NOT_TESTED` statuses clearly.
   - Keep publishing gated by real checks and never mark external integrations as passing without credentials/evidence.

7. **Run full verification**
   - Run focused unit tests for image generation/materialization/rendering.
   - Run the repository’s full test suite, typecheck, lint, production build, security audit, readiness audits, and durable browser journey smoke.
   - Use Playwright screenshots at 320, 768, and 1280px for the generated-site path when an authenticated test session and safe fixture are available.
   - Report any unavailable external proof as blocked/not tested, not as passed.

## Safety boundaries
- Preserve authentication, tenant isolation, billing, Stripe, publishing, rollback, analytics, and existing customer websites.
- Do not add or expose secrets, and do not create browser-visible secret variables.
- Do not weaken security scans, database policies, or publish gates to make tests pass.
- Do not invent reviews, awards, prices, results, phone numbers, credentials, or integration status.

## Definition of done
- First-build sites can receive safe generated starter images when no owner photos exist.
- Saved builder changes and generated media are visible on the visitor-facing preview after refresh.
- CRM/image/external-integration statuses are truthful.
- Automated tests and browser evidence either pass or report precise external blockers.
