---
name: Product-Led Growth & Zero-Cost Acquisition Audit
description: Comprehensive audit of Revora acquisition assets, 15 code-level findings, 5 connected product-led growth systems, and 150 experiments
type: strategy
---

# Product-Led Growth & Zero-Cost Acquisition Audit

## Strategic North Star
Turn Revora's existing tools and calculators into a connected, evidence-backed customer acquisition engine. Give prospective businesses a tangible, useful result before asking them to buy, while eliminating attribution leaks, credibility gaps, and compliance risks.

## The 15 Verified Code-Level Audit Findings
1. **Database Identity Mismatch**: Config references `smqngrtayopyirrqcbhq` while some environments point to alternates; ensure runtime identity and migration versions are verified before measuring customers.
2. **Sentry Issue Triage**: Unresolved front-end issues on `/`, `/auth`, `/admin/city`, `/p/[token]` must be triaged to protect user acquisition and onboarding.
3. **Assessment Credibility**: `/website-audit` is a self-reported questionnaire, not an automated web crawler; label as "Business Growth Readiness Assessment" or pair with an objective URL inspection.
4. **Transparent Scenario Assumptions**: `src/lib/assessment.ts` contains hardcoded leak rates (6%, 12%, 22%, 14%, 11%); label clearly as scenario models with user-adjustable assumptions rather than guaranteed losses.
5. **CAN-SPAM Address Compliance**: Public email template in `src/lib/distribution.ts` requires a valid physical postal address element alongside opt-out instructions.
6. **WhatsApp Attribution**: `distribution.ts` reuses `smsBody` with `utm_source=sms`; give WhatsApp its own distinct `utm_source=whatsapp` tracking link.
7. **Grounded Attribution Claims**: `/share` attribution copy should acknowledge device switching and storage constraints rather than promising 100% infallible multi-device tracking.
8. **Nominatim Compliance**: Bounded caching, rate limiting (< 1 req/sec), and configured endpoints for OpenStreetMap Nominatim in `osm-prospects.server.ts`.
9. **Internationalized Prospecting**: Parameterize country and region rather than hardcoding `, USA` in geocoding search.
10. **Free-Only Policy Consistency**: Harmonize `freeAiOnly` and `paidCollectiveAllowed` in `src/lib/ai/free-only-policy.server.ts` so undeclared flags resolve to an unambiguous, single-policy state.
11. **Deduplicated Assessment Analytics**: Unify server-side `submitAssessment` and client-side `trackConversion` into a single idempotent submission event.
12. **Authoritative Conversion Reporting**: Replace legacy `checkout_completed` telemetry with confirmed billing account states in `getConversionReport`.
13. **Geographic Page Value Gates**: Ensure programmatic industry/location pages provide genuine local utility and concrete workflow examples rather than thin doorway content.
14. **Local QR Code Generation**: Replace external third-party API (`api.qrserver.com`) with local SVG/canvas QR generation to keep target tokens and URLs private.
15. **Trial Messaging Context**: Align homepage pricing copy so "no charge during 3-day access" is distinct from the $350 setup charged upon live site launch.

## The 5 High-Leverage Product-Led Acquisition Systems
1. **System 1: Useful-Tool -> Saved Workspace**
   - Visitor uses live calculator $\to$ models scenario $\to$ optionally saves calculation $\to$ account created with prefilled industry settings.
2. **System 2: Evidence-Backed Audit -> Repair Plan**
   - Owner submits URL $\to$ automated checks verify contact link, mobile viewport, and schema $\to$ combined with self-reported gaps into a prioritized action plan.
3. **System 3: Template -> Operational Workspace**
   - Owner uses free printable estimate or crew checklist $\to$ upgrades to managed digital version with automated client approvals.
4. **System 4: Existing Website -> Small Integration (Widget)**
   - Owner embeds lightweight quote/booking widget on current site $\to$ experiences Revora speed-to-lead without needing a full redesign upfront.
5. **System 5: Partner -> Repeatable Implementation**
   - Agencies and web professionals deploy pre-packaged industry packs with clear handoff kits and documentation.

## 150 Growth Experiment Clusters (A through O)
- **A-C**: Free tool libraries, evidence audits, production-ready templates.
- **D-F**: Embeddable widgets, shared client portals, low-friction migration importers.
- **G-I**: Trade partner programs, verified evidence case studies, operational guides.
- **J-L**: High-intent search landing pages, community value posts, client referral loops.
- **M-O**: Localized international experiences, developer components, funnel conversion optimization.
