# Customer Forge PR Regression Audit

Audit baseline: main @ 0798da814be9d078299fcbb6c2271fadd7dac0f0 (merge of PR #169, verified from repository commit history on 2026-09-19).

## Executive summary

Read-only historical inventory covered PRs #1–#169, followed by a current-main trace of high-risk areas. Titles, screenshots, and green checks were not treated as proof.

### Verified findings
1. PR #169: router-wide catch reporting, window error/unhandled-rejection capture, SSR 500 capture, and mobile matchMedia guards survive in main. The remaining hardening found here was client-controlled organization attribution in unauthenticated error reporting; that is removed on this repair branch and covered by a regression test.
2. Browser QA: the historical smoke failure was a screenshot-command failure. The current script has diagnostics and 60s command timeout; this repair branch pins @playwright/cli@0.1.21. Playwright 0.1.20 fixed explicit nested screenshot filename failures, so pinning removes CLI-version drift as a variable.
3. PRs #145/#146 accessibility work are closed without merge. Current code search did not find the unmerged findAccessibilityFindings implementation, so their review findings do not survive into main.
4. PR #162 had a Codacy/TSQLLint syntax-near-$ comment. Current main contains valid PostgreSQL dollar-quoted PL/pgSQL; the historical tooling finding is not evidence of a surviving runtime defect.
5. PR #167 had historical Stylelint findings. Stylelint is not currently a required repository quality step, so these are recorded as tooling/configuration debt rather than falsely marked fixed.
6. Live Supabase still reports 1 authenticated SECURITY DEFINER execution warning, 1 leaked-password-protection warning, 3 missing FK indexes, and 7 RLS auth init-plan warnings. Repository migrations intended to remediate these are not present in the live migration history. This is confirmed deployment drift.
7. Sentry production delivery is inconclusive because the current toolset exposes no Sentry project/event connector. Source code has an in-app error store and optional Sentry forwarding.

## Complete PR inventory

| PR | Title | Historical state |
|---:|---|---|
| 1 | SEO: fix trade-name casing in industry page titles | merged |
| 2 | SEO: use proper-cased trade name in industry page titles/descriptions | merged |
| 3 | Update interpreter.ts | merged |
| 4 | Update deterministic.ts | merged |
| 5 | Update styles.css | merged |
| 6 | Update visual-composition.ts | merged |
| 7 | Update s.$slug.tsx | merged |
| 8 | Update get-started.tsx | merged |
| 9 | Create genericity | merged |
| 10 | Create genericitcy test | merged |
| 11 | Create genericity.ts | merged |
| 12 | Create color-variation.ts | merged |
| 13 | Create site-color-variation.test.ts | merged |
| 14 | Update industry.ts | merged |
| 15 | Update s.$slug.tsx | merged |
| 16 | Update public-site.functions.ts | merged |
| 17 | Update public-site.functions.ts | merged |
| 18 | Update SiteForms.tsx | merged |
| 19 | Update SiteForms.tsx | merged |
| 20 | Create genericity.test.ts | merged |
| 21 | Update site-effects.ts | merged |
| 22 | Update EffectStudio.tsx | merged |
| 23 | Update design.ts | merged |
| 24 | Update deterministic.ts | merged |
| 25 | Update EffectStudio.tsx | merged |
| 26 | Update genericity.ts | merged |
| 27 | Update quality.ts | merged |
| 28 | Update deterministic.ts | merged |
| 29 | Update interpreter.ts | merged |
| 30 | Update design-brief.server.ts | merged |
| 31 | Update orchestrator.server.ts | merged |
| 32 | Create master-engine.ts | merged |
| 33 | Update deterministic.ts | merged |
| 34 | Update copy.ts | merged |
| 35 | Update copy.ts | closed-unmerged |
| 36 | Update copy.ts | closed-unmerged |
| 37 | Fixing | merged |
| 38 | Update quality.ts | merged |
| 39 | Update visual.ts | merged |
| 40 | Update industry.ts | merged |
| 41 | Update industry.ts | closed-unmerged |
| 42 | Update industry.ts | merged |
| 43 | Update local-inference.ts | merged |
| 44 | Update interpreter.ts | merged |
| 45 | Update interpreter.ts | closed-unmerged |
| 46 | Update industry.ts | merged |
| 47 | Update industry.ts | merged |
| 48 | Update master-engine.ts | merged |
| 49 | Update deterministic.ts | merged |
| 50 | Update copy.ts | merged |
| 51 | Update quality.ts | merged |
| 52 | Update visual.ts | merged |
| 53 | Update presentation.ts | merged |
| 54 | Create visual-intelligence.ts | merged |
| 55 | Create asset-intelligence.ts | merged |
| 56 | Update site-agent.ts | merged |
| 57 | Update asset-intelligence.ts | merged |
| 58 | Update site-agent.ts | merged |
| 59 | Update asset-intelligence.ts | merged |
| 60 | Create 20260911224000_builder_restore_point_fix.sql | merged |
| 61 | Update site-agent.atomic.test.ts | merged |
| 62 | Add files via upload | merged |
| 63 | Add files via upload | merged |
| 64 | Add files via upload | merged |
| 65 | Add files via upload | merged |
| 66 | Add files via upload | merged |
| 67 | Add files via upload | merged |
| 68 | Add files via upload | merged |
| 69 | Add files via upload | merged |
| 70 | Add files via upload | merged |
| 71 | Add files via upload | merged |
| 72 | Phase 1: interpreter whole-site safety fix | closed-unmerged |
| 73 | docs: add Revora design system implementation guide | merged |
| 74 | Feature/site quality benchmark | merged |
| 75 | feat: add generated-site quality benchmark foundation | merged |
| 76 | Feature/live quality gate | merged |
| 77 | chore: apply live quality gate patch safely | merged |
| 78 | Fix: remove unreachable luxury mood check in visual-intelligence.ts | merged |
| 79 | chore: queue builder master improvements | merged |
| 80 | chore: apply verified builder recovery | merged |
| 81 | chore: queue typecheck blocker fixes | merged |
| 82 | chore: retrigger verified builder fixes | merged |
| 83 | fix: harden free-first builder and AI provider fallback | merged |
| 84 | chore: validate builder production hardening | merged |
| 85 | chore: prepare validated builder fixes | merged |
| 86 | fix: resolve AI builder typecheck errors and test failures | merged |
| 87 | fix: marketing site SEO metadata and canonical tags | merged |
| 88 | fix: consolidate billing RLS security and repair builder request reliability | merged |
| 89 | docs: define Elite Mobile Detailing premium visual theme | merged |
| 90 | fix: land stranded verified builder fixes and retire the patch-apply pipeline | merged |
| 91 | feat: premium ambient background system and global visual polish | merged |
| 92 | feat: master polish pass — motion, living preview, OG card | merged |
| 93 | feat: Revora 10/10 security and performance hardening | merged |
| 94 | feat: add final production quality gate | merged |
| 95 | feat: master builder reliability and connector quality hardening | merged |
| 96 | fix: Revora security and performance hardening | merged |
| 97 | feat: master builder intelligence upgrade | merged |
| 98 | feat: 10x autonomous builder intelligence | merged |
| 99 | feat: autonomous builder brain and experience intelligence | merged |
| 100 | feat: strengthen autonomous builder quality contract | merged |

> GitHub's normalized PR connector did not consistently expose per-PR head refs in batch responses. Missing branch names are not invented. Base flow is the canonical main branch.

## High-risk trace

| PR range | Area | Disposition |
|---|---|---|
| 72 | builder whole-site safety | closed without merge; does not survive |
| 81–86 | CI/typecheck/builder recovery | later repair PRs merged; no surviving blocker established from current source |
| 88, 93–96 | billing/RLS/Supabase hardening | source controls survive; live DB drift remains |
| 90, 106–107 | CI/patch pipeline | retirement/repair survives in main |
| 108–115 | autonomous planning | current main traced |
| 125–144 | autonomous/visual/mobile/SEO | current main traced |
| 145–146 | accessibility v1/v2 | closed without merge; findings do not survive |
| 147–150 | browser QA/auto-repair/intelligence | current main traced |
| 151–154 | roadmap/elite quality/marketing | current main traced |
| 155–157 | served-site verification | dedicated repair PRs followed historical failures |
| 158 | platform security/release hardening | current main traced |
| 159–161 | autonomous engineering/capability expansion | current main traced; later type/lint repairs were required |
| 162–164 | Supabase/production hardening | source controls survive; live migration drift remains |
| 165–168 | whole-repo/visual/browser/autopilot | current main traced; browser gate remains runtime-sensitive |
| 169 | mobile crash/observability | telemetry/mobile guards survive; client tenant attribution fixed on this branch |

## Repair branch

- Branch: fix/full-pr-regression-audit
- Route error boundary: error is typed as unknown, matching the React/TanStack Router contract.
- Client crash reporting: browser input can no longer supply organizationId.
- Browser QA: Playwright CLI pinned to 0.1.21; deterministic Chromium config retained.
- Regression test: client error reporting explicitly rejects client-supplied tenant attribution.

## Supabase live evidence

- Security: authenticated execution of public.provision_workspace(...).
- Security: leaked-password protection disabled.
- Performance: 3 missing FK indexes.
- Performance: 7 RLS auth init-plan warnings.
- Performance: 107 unused-index INFO notices.

The three FK indexes and seven RLS rewrites are represented in repository migrations. Live migration history does not include the 20260919 workspace-provisioning/outcome-RLS hardening migrations.

Production DB migration was not applied during this source repair because the repository's server-only provisioning migration reconstructs the privileged function body and must be verified on a non-production database before release. This remains an explicit manual release item.

## Sentry

Source code records errors in public.error_events and forwards to Sentry when SENTRY_DSN is configured. A connected Sentry event API was unavailable, so production delivery is inconclusive rather than assumed healthy.

## Historical failure classes

Recent history contains typecheck, lint, whole-repository visual-contract, served-page verification, browser screenshot QA, and Codacy/TSQLLint/Stylelint findings. Several had later repair PRs. The audit traces failures forward rather than treating historical red checks as current defects.

## Deferred/manual items

1. Enable Supabase leaked-password protection in project Auth settings.
2. Verify the server-only provisioning migration on non-production Supabase before production application.
3. Verify Sentry delivery with controlled non-production and production event evidence.
4. Decide whether Stylelint becomes a required CI gate.

## Conclusion

No historical branch was rewritten or reopened. Repairs target current main on a dedicated branch. CI is the final execution evidence before merge.