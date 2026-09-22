# Master Builder 42-Blocker Migration

This specification is tracked by GitHub Issue #175 and this pull request.

## Goal

Make Sol the sole creative authority for active website generation, redesign, direct-edit, motion, responsive, media, and architecture paths while preserving security, tenant isolation, truth, accessibility, rollback, integrity, and publish-safety controls.

## Canonical pipeline

Sol -> CreativeSiteContract validation -> safety/integrity validation -> materialization -> renderer

## Required migration

- Remove active deterministic creative authority from fallbackBrief, fallbackCopy, generateWebsitePlan, planSiteContent, createDesignFingerprint and equivalent planners.
- Replace deterministic page/section/design vocabularies with an expressive AI-authored CreativeSiteContract.
- Allow AI-authored pages, section roles, compositions, visual systems, responsive behavior, motion, interactions, media treatment and conversion flows.
- Expand direct-edit actions and visual primitives without weakening sanitization.
- Support advanced safe CSS/visual capabilities and extensible interaction composition.
- Replace action/context/output truncation with resumable continuation/chunking.
- Remove deterministic redesign, motion, story/link and responsive creative decisions.
- Remove fixed identity/media catalogs and deterministic image assignment.
- Ensure QA blocks only objective safety, truth, accessibility, integrity and schema failures—not aesthetic preference.
- Preserve backward compatibility for already-published legacy sites through passive adapters only.
- Add architecture, property, integration and E2E tests proving legacy creative authority cannot become active again.

## Acceptance

Search for and eliminate/neutralize active callers of:

fallbackBrief
fallbackCopy
generateWebsitePlan
planSiteContent
createDesignFingerprint
creative-brief
rendererVariant
sectionDesignFromFingerprint
compileExecutableCreativeSection
resolveExecutableCreativeSection
buildMotionPlan
planMotionAssignments
buildStoryPlan
responsive-intelligence
site-design-system
legacy AI composition planners
fixed creative vocabularies/catalogs

Run typecheck, lint, unit/integration/builder tests and the new end-to-end coverage. Report changed files, remaining blockers, test results and commit SHA.

See Issue #175 for the complete 42-item implementation specification.
