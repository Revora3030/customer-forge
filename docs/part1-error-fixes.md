# Part 1 platform repairs — 29 October 2026

Changes are in the preview, not published. No pricing, Stripe settings, auth providers, RLS policies, database schema/data, paid services, outbound sends, or live AI builds were changed/run.

| # | Status | What changed or was established | Not verified / next action |
|---|---|---|---|
| 1 | Partly fixed (already working on apex) | Live HTTP apex `/` and `/pricing` return 301, preserving query strings. Reported 500 not reproduced. | HTTP www still returns 302 upstream. |
| 2 | Needs hosting action | Live HTTPS www returns 302 to apex, preserving path/query. Domain setup is connected and www redirects to the primary. No application patch can replace a response issued before the application. | Lovable documents no status-code selector. Keep apex primary; hosting must change the managed www redirect to 301/308. Feedback submitted; resolution not verified. Do not unset primary or change DNS merely to hide this. |
| 3 | Partly fixed | Protected login retains its return URL; confirmation links return to `/auth`; signup uses the returned session instead of mislabelling every login failure as email confirmation; account/profile errors are visible; failed membership reads no longer masquerade as new accounts. | Actual new-account email confirmation and provisioning unrun. Historical 7/0 counts included owner-confirmed tests, not proven customer losses. Providers/settings unchanged. |
| 4 | Partly fixed | Checkout return no longer claims payment from a query parameter. Welcome refreshes verified billing state every 3 seconds for at most 2 minutes, with retry/error guidance; waits for workspace identity before consuming return parameters. | No real checkout/payment or webhook replay performed. Existing events include verified/processed subscription and invoice events; zero completions is not evidence the webhook is broken. Event settlement/release fault handling still needs lifecycle tests. |
| 5 | Needs owner action | Verified these are DIFFERENT organizations: `elite-mobile-detailing` is a published demo; `elite-mobile-detail` is the completed customer draft (`preview`, `published=false`). Current draft/public lookup uses the same organization slug. | Redirecting one to the other would route visitors to the wrong workspace. Owner must choose whether to publish the actual draft through existing gates or explicitly map a truly historical, unoccupied alias. No publishing/alias mutation performed. |
| 6 | Fixed in preview | Client list route renders the nested detail outlet. Signed-in direct client-detail load now shows the actual business, launch checklist, publishing and subscription panels—not the list. | Production requires publishing. Every detail mutation unrun. |
| 7 | Needs owner action | Confirmed three Shined Up demo organizations; existing import/job/send deduplication does not deduplicate separate demo organizations. | Atomic owner+listing reservation requires an additive schema change; manual entries lack stable listing identity. No unsafe name-only merge, deletion or RLS change. Survivor/reference cleanup requires explicit review. |
| 8 | Partly fixed | Primary retry allowance is per section, so unrelated failures do not abandon a page. Existing roster failover, backoff, capacity parking and validated checkpoints retained. | Historical failures remain audit evidence, not automatically rerun. No paid live retry/model rate measured. Safe deterministic templates intentionally not added: they conflict with the sole-AI creative-authority requirement. Unresolved sections stay incomplete, not fake successful. |
| 9 | Partly fixed | Primary layout uses one section per call, two calls per page and two pages concurrently; output allowance is 12k instead of 24k tokens per call. Existing job/input-matched identity and section checkpoints retained. | Total fixed prompt/context remains; no live median, cost or success-rate improvement measured. Calls may increase despite smaller outputs. No guarantee of <90 seconds or 95% success. |
| 10 | Partly fixed | Failed/cancelled historical attempts no longer block a replied pitch shell; active/completed demos are not restarted. Settings/job/status read errors and queue errors are surfaced rather than silently reported as no work. | Eight recorded prospect demos currently have no generation job, not eight proven running stalls. No live restart initiated; origin of missing historical jobs remains unverified. |
| 11 | Not verified (not reproduced) | Signed-in `/admin/jarvis` with saved messages loaded without page errors. No speculative date/randomness or suppression patch. | Reported React #418/#520 stacks not available; cross-timezone and published reproduction remain unrun. |
| 12 | Fixed / already permitted | Existing CSP allows fonts.googleapis.com in style-src and fonts.gstatic.com in font-src. Added regression coverage; live response carries these directives. | Exhaustive every-page policy/font check unrun. Self-hosting optional, not implemented. |
| 13 | Partly fixed | `/auth` now server-renders the actual form and preloads the real logo. Desktop/mobile render and matching hydration checked; 390px no horizontal overflow. | Published Lighthouse/Web Vitals not rerun; local development timings do not prove production performance. |
| 14 | Fixed in preview | Product tour heading changed h3 → h2 without visual restyling. Browser outline now starts h1 → h2. | Full axe/accessibility audit unrun; production requires publishing. |
| 15 | Partly fixed | GA4 and Ads wait for the existing regional consent/opt-out decision before injection; consent updates include analytics storage; private paths cannot load platform tags. Acceptance can load without reload. First-party funnel unchanged. | Fresh mobile and rejected sessions had zero Google tag/Ads requests. Accepted-session dispatch and Lighthouse score unverified. Already loaded scripts cannot be unloaded; hosting bot-management cookie remains outside application control. |

## Evidence

- Signed-in local client detail and Jarvis checked without mutations; auth form present in raw server HTML.
- Mobile `/auth` at 390×844: no page errors, no horizontal overflow, no Google tags before consent or after rejection.
- Homepage rendered heading outline checked.
- Focused initial combined regression run: 13 files, 78 tests passed. Follow-up results are recorded in the final chat.
- Changed-code ESLint passed; automatic preview checks reported build OK.
- Screenshot evidence under `/tmp/browser/part1/`; not a published-deployment acceptance report.

## Builder-upgrade continuation: repository map and grounded boundaries

- Intake/facts: `src/lib/business-dna.ts`, saved brief and `platform-funnel.functions.ts`.
- Creative stages/prompts: `src/lib/builder/collective-first-build.server.ts`, `first-build-compositions.server.ts`, `world-class-craft.ts`, `industry-playbook.ts` and `reference-standard.ts`.
- Model/budget dispatch: `src/lib/ai/thinker.server.ts`, `router.server.ts`; existing Luna and daily reservations stay authoritative.
- Media and checkpointing: `first-build-images.pipeline.test.ts` covers pipeline behavior; `first-build-section-checkpoints.ts`, `job-stage-checkpoints.ts` and worker stores preserve accepted outputs.
- Renderer/primitives: `src/components/site/VisualComposition.tsx`, `src/lib/builder/composition-tree.ts`, existing site widgets.
- QA: `design-quality.ts`, review panel/improvement gates, saved-coverage checks and existing browser scripts.
- Publish: `src/lib/production.functions.ts`, `publishSiteNow`; draft `/draft/$slug`, public `/s/$slug` retain independent authorization/publication gates.

The upload's claims (3/10 score, empty FAQs, image counts, missing widgets, false Live label, model failure rates) require current saved content and rendered evidence. They are not all established defects. The two Elite addresses are not aliases. Known layout timing of the completed draft was about 341 seconds, before these unmeasured changes.

Do not adopt fixed per-trade templates, mandatory widget/motion counts, fabricated stock proof or fixed palettes from the older upload. Preserve original AI composition, verified facts and accessible progressive enhancement. An 8/10 target is an acceptance goal, not a measured result.