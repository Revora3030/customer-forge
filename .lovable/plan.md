# Finish the 58 remaining Customer Forge upgrades

## Goal
Complete the remaining builder work as one controlled program: improve first-build quality, make the free-model team useful and auditable, enforce real rendered quality before readiness, finish the preview-first editing experience, and add durable production verification without weakening tenant, billing, publishing, or fact-safety boundaries.

“Finished” means implemented, exercised through the real customer journey, and backed by saved evidence. A feature that depends on an unavailable genuinely free provider or missing third-party credentials will remain visibly blocked rather than being simulated.

## Workstream A — Model team and orchestration

1. Route every substantial fresh-site build through the existing qualified free-model collective; retain the deterministic engine as the guaranteed floor.
2. Keep tiny literal edits deterministic and immediate instead of invoking the whole model pool.
3. Select models by verified task capability, health, free eligibility, language, context size, and quota—not simply catalogue presence.
4. Replace winner-takes-most consensus with a dedicated synthesis stage that combines compatible strengths from validated proposals.
5. Preserve the owner’s facts, exact wording, brand locks, and rejected styles through proposal and synthesis stages.
6. Add adversarial review seats for unsupported claims, unsafe links, accessibility, security, SEO, conversion, and visual coherence.
7. Add industry-specific review panels so the evaluation criteria adapt to the generated business category.
8. Add multilingual routing and language-preservation checks without translating literal customer wording unless requested.
9. Use strict, task-specific structured outputs and reject malformed responses without mutating the site.
10. Persist ensemble participants, exact serving model/provider, validation result, disagreements, synthesis rationale, timing, and final selection per build.
11. Apply workspace usage limits and concurrency controls to ensemble calls as well as individual routed calls.
12. Isolate circuit-breaker, cooldown, quota, and job state by tenant, provider, model, and task.
13. Correct failover so one model’s invalid request can quarantine that incompatible model without incorrectly ending eligible provider fallback.
14. Retry only rate limits and temporary provider failures with bounded backoff; all other failures terminate that attempt cleanly.
15. Add quota forecasting and park work before a free allowance is exceeded.
16. Refresh provider catalogues automatically, capability-probe candidates, and quarantine retired, paid, mislabelled, or failing models.
17. Cache safe repeated analysis and deduplicate concurrent identical work while keeping tenant boundaries intact.
18. Surface honest admin status for builder AI eligibility, provider health, free allowance, recent serving model, and fallback outcome.

## Workstream B — Luna and zero-cost guarantees

19. Require an explicit affirmative Luna enable switch in addition to the configured key and exact model.
20. Keep Luna advisory-only for planning, design review, visual review, repair prioritization, and final evidence review; it never becomes the sole builder.
21. Split the existing hard $20 monthly Luna ceiling into tenant-aware allocations under the same global cap.
22. Preserve no auto-top-up, no silent overage, no silent paid fallback, and atomic reservation/settlement behavior.
23. Show Luna as disabled, capped, unavailable, or used with truthful evidence rather than implying it participated.
24. Add regression tests proving external paid calls remain impossible in zero-cost mode and Luna cannot bypass its enablement or budget gates.

## Workstream C — First-build creative and content quality

25. Make the fresh-customer pipeline explicit: intake → industry intelligence → buyer intent → conversion strategy → creative direction → fingerprint → sitemap → content → imagery → composition → materialization.
26. Generate a complete, editable first site with at least the appropriate home, services, about, contact, and supporting intent page when the business brief warrants them.
27. Build an intelligent sitemap from business goals and buyer journeys, with navigation and contextual links preventing stranded pages.
28. Assign each page a distinct job, conversion action, search intent, and truthful content depth target.
29. Make every shell, navigation, hero, section order, grid, typography, spacing, surface, border, radius, background, media treatment, footer, transition, and CTA respond to the persisted design fingerprint.
30. Add cross-site uniqueness checks across industry fixtures so materially different briefs do not converge on the same composition contract.
31. Add an explicit creative-director pass that chooses a coherent system rather than random visual variation.
32. Preserve customer assets first, avoid duplicate imagery, and require useful alt text plus decorative-image classification.
33. Enforce imagery order: customer assets → correctly licensed free stock → verified genuinely free generation → truthful abstract artwork or explicit placeholder.
34. Never generate or imply business-specific photography, testimonials, credentials, awards, prices, results, statistics, guarantees, or integrations without supplied evidence.
35. Track field-level fact provenance and render `UNKNOWN` or an honest prompt wherever a required business fact is missing.
36. Add field-level locks for customer-authored and explicitly quoted text so broad redesigns cannot overwrite it.
37. Deepen thin pages with useful industry structure while separating strategic guidance from claims about the customer.
38. Validate real contact, quote, booking, menu, phone, and CTA destinations; block dead or misleading conversion paths.
39. Add first-class safe section regeneration that preserves locked facts, linked pages, and unaffected sections.

## Workstream D — Enforced render, review, repair, and readiness gate

40. Replace the current unverified first-preview record with a real gate: materialize → render → inspect → screenshot → review → repair → rerender → recheck → save evidence.
41. Run every generated page at 320, 375, 390, 414, 768, 1024, 1280, and 1440 pixels.
42. Capture overflow, clipping, overlap, sticky-header, long-word, touch-target, keyboard, focus, landmark, heading, label, contrast, reduced-motion, console, network, and failed-resource evidence.
43. Measure real page performance: Core Web Vitals, layout shift, response timing, image/font/script weight, request count, and loading priorities.
44. Enforce page-specific budgets for performance, images, fonts, scripts, and requests, with honest `NOT_VERIFIED` when measurement cannot run.
45. Check metadata uniqueness, canonical behavior, Open Graph fields, structured data safety, sitemap coverage, indexability, and internal-link completeness.
46. Check conversion continuity and factual completeness without turning unsupported proof into fabricated content.
47. Feed screenshots only to a currently eligible vision reviewer; treat all findings as untrusted suggestions that must map to supported repair kinds.
48. Auto-repair only bounded safe failures, create a restore point first, and roll back any repair without improved before/after evidence.
49. Repeat render and measurement after every kept repair; cap repair loops and expose unresolved blockers.
50. Prevent “ready” or completion messaging whenever a required page has failed, blocked, or missing evidence.
51. Persist per-page/per-viewport findings, repairs, before/after evidence, final verdict, and exact reviewer participation for later audits.

## Workstream E — Builder experience and visual editing

52. Stream calm, compact build stages in the preview-first workspace and collapse them into a concise evidence summary when complete.
53. Link each quality finding to the affected page and editable element, with one useful repair action in plain language.
54. Complete visual editing round trips: select element → contextual controls → preview → Apply/Cancel → persistence → Undo/Redo → rollback after reload.
55. Add first-class image controls for upload, licensed search, crop/focal point, alt text, replacement, removal, and provenance; enable AI editing only after a genuinely free edit-capable model passes a live probe.
56. Add side-by-side before/after review for AI and manual changes while preserving drafts, branches, versions, publishing safeguards, and mobile usability.

## Workstream F — Production proof and release

57. Build a durable end-to-end suite covering fresh-customer onboarding, multiple industry fixtures, all eight widths, five-page navigation, visual edits, provider failures, malformed AI output, zero-cost enforcement, image fallback, first-preview gating, accessibility/SEO/performance, tenant isolation, secret leakage, drafts, rollback, and publishing-safe behavior.
58. Run the full release proof: targeted tests, full tests, type checks, lint/build, dependency and security audits, authenticated browser journeys, database/RLS attack checks, and available integration checks; report exact evidence, changed files, commit SHA, and only reproducible blockers.

## Technical approach

- Extend the existing router, registry, ensemble, composition, worker, quality-gate, visual-review, repair, preview, and versioning paths rather than introducing competing systems.
- Add append-only, organization-scoped evidence records only where current settings/progress storage cannot represent the audit trail. Any new public table will include explicit grants, RLS, tenant policies, indexes, retention bounds, and service-role access in the same migration.
- Keep provider prompts, credentials, model identifiers, and diagnostic details server-side. Customer-facing surfaces show capability and outcome, not secrets.
- Use browser automation against the actual generated routes and authenticated builder. Synthetic checks supplement real rendering; they never replace it.
- Keep changes incremental. Each workstream lands behind passing contract tests before the next one changes readiness behavior.

## Delivery order

1. **Safety foundation:** 11–18, 19–24, evidence schema and regression tests.
2. **Generation quality:** 1–10 and 25–39 using deterministic fallback throughout.
3. **Readiness enforcement:** 40–51, initially recording evidence before it becomes release-blocking, then enabling the hard gate.
4. **Builder completion:** 52–56.
5. **Production proof:** 57–58 and final report.

## Acceptance and real blockers

- A fresh customer can create a materially distinct, truthful, complete multi-page site and cannot receive a ready state until required rendered evidence passes.
- Every model contribution is free-eligible, task-qualified, bounded, isolated, recorded, and optional; deterministic generation still succeeds when all providers fail.
- Luna remains explicitly enabled, advisory-only, and inside the hard global $20 monthly cap with tenant-aware allocation.
- No repair survives without better rerendered evidence; no customer fact or exact wording changes without authorization.
- Tenant isolation, auth, billing, publishing, custom domains, analytics definitions, versions, and rollback remain intact.
- **External blocker:** AI picture editing cannot be marked complete until a genuinely zero-cost edit-capable provider passes a live request. Until then the controls remain honestly unavailable and non-AI image tools continue working.
- **External blocker:** live email/CRM/payment-provider checks require the corresponding connected accounts. Their local contracts can be tested, but live delivery or transaction success will not be claimed without provider confirmation.
- **Dependency blocker:** the nested `js-yaml` advisory will be resolved only through a compatible framework/dependency update or upstream fix; it will not be hidden or bypassed.
