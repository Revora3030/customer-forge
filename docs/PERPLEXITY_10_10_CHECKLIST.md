# Perplexity 10/10 Verification Checklist

Use this checklist to independently audit Customer Forge. Mark each item PASS, PARTIAL, or FAIL and cite the exact file, workflow, test, GitHub setting, Supabase configuration, or production evidence used.

## 1. Security
- [ ] No tracked real environment files (.env, .env.development, .env.production, .env.local, .env.test).
- [ ] .env.example contains names/placeholders only and no credential-shaped values.
- [ ] Current repository is scanned for credential patterns.
- [ ] Git history has been reviewed for previously committed credentials.
- [ ] Any historically exposed credentials have been rotated/revoked.
- [ ] GitHub secret scanning/push protection is enabled or its absence is explicitly reported.
- [ ] Browser-visible VITE_* variables contain only publishable values.
- [ ] Server-only secrets are never imported into browser code.
- [ ] Supabase RLS is enabled on every tenant-sensitive table.
- [ ] Server-side authorization independently validates workspace/organization access.
- [ ] Cross-tenant read/write attempts are covered by adversarial tests.
- [ ] Storage policies prevent cross-tenant object access.
- [ ] Invite/share/portal/preview tokens are opaque, sufficiently random, scoped, expiring, revocable, and replay-safe.
- [ ] Token endpoints enforce tenant boundaries server-side.

## 2. Revenue-Critical Reliability
- [ ] Signup works end to end.
- [ ] Onboarding works end to end.
- [ ] Workspace creation works end to end.
- [ ] Builder generation/edit/apply works end to end.
- [ ] Lead capture works end to end.
- [ ] CRM/customer flow works end to end.
- [ ] Trial creation and expiration work end to end.
- [ ] Stripe checkout/payment state synchronization works end to end.
- [ ] Billing/webhook failure paths are handled safely.
- [ ] Invite/share/portal flows work end to end.
- [ ] Publishing works end to end.
- [ ] Custom-domain flow is validated where configured.
- [ ] Recovery/error states are usable.
- [ ] Critical flows have automated browser/E2E coverage where the environment permits it.

## 3. CI/CD and Release Safety
- [ ] Typecheck passes.
- [ ] Lint passes.
- [ ] Unit/integration tests pass.
- [ ] Build passes.
- [ ] CodeQL passes.
- [ ] Codacy/security scan passes.
- [ ] Repository security audit passes.
- [ ] Required merge checks are enforced in GitHub branch protection.
- [ ] Production deployment requires successful quality/security checks.
- [ ] Release versioning is documented.
- [ ] Release notes/changelog process is documented.
- [ ] Database migration process is documented.
- [ ] Rollback procedure is documented and practical.
- [ ] A pre-release readiness checklist exists.

## 4. Builder Quality Contract
- [ ] Generated pages have a real headline.
- [ ] No placeholder/draft text remains.
- [ ] Internal links are reachable.
- [ ] CTAs have real destinations or forms.
- [ ] Contact/conversion paths exist when appropriate.
- [ ] Forms have usable labels and submission behavior.
- [ ] Images have appropriate alternative text.
- [ ] Mobile viewport metadata exists.
- [ ] Title and meta description are present and useful.
- [ ] Canonical URLs are present where appropriate.
- [ ] Structured data is valid and relevant.
- [ ] Business/contact information is present when required by the site type.
- [ ] Accessibility issues are surfaced before publication.
- [ ] Security issues are surfaced before publication.
- [ ] Excessive page payload is surfaced before publication.
- [ ] Critical failures can block or prevent unsafe publication.
- [ ] Warnings are clearly distinguished from publication-blocking failures.

## 5. Visual and Functional QA
- [ ] Generated sites are tested at desktop dimensions.
- [ ] Generated sites are tested at mobile dimensions.
- [ ] Navigation works on small screens.
- [ ] No horizontal overflow is present.
- [ ] Touch targets are usable.
- [ ] Forms work on mobile.
- [ ] Keyboard navigation works.
- [ ] Focus states are visible.
- [ ] Reduced-motion behavior is respected.
- [ ] Images load correctly and do not create obvious layout failures.
- [ ] Public links resolve to intended destinations.
- [ ] Visual regression evidence exists where practical.

## 6. Safe Editing and Publishing
- [ ] Draft, preview, and live states are clearly separated.
- [ ] Users can review changes before publishing.
- [ ] Version history is preserved where supported.
- [ ] Undo/restore behavior is available where supported.
- [ ] Failed AI revisions do not silently destroy known-good work.
- [ ] Publish actions have clear confirmation/state feedback.
- [ ] Existing production sites remain protected during AI edits.

## 7. Product Coherence and Activation
- [ ] A first-time contractor can understand the primary next step immediately.
- [ ] Onboarding leads toward a measurable first win.
- [ ] Activation is defined with a concrete event.
- [ ] Activation funnel is measured from signup through first value.
- [ ] Public CTAs lead to complete user journeys.
- [ ] Marketing, demo, pricing, signup, onboarding, builder, CRM, and portal experiences form a coherent journey.
- [ ] Feature breadth does not obscure the primary workflow.
- [ ] User feedback can be collected and connected to product decisions.

## 8. Conversion and Analytics
- [ ] Visitors are measured without double counting.
- [ ] Accounts created are measured accurately.
- [ ] Trials started are measured accurately.
- [ ] Active trials are measured accurately.
- [ ] Paid customers are measured accurately.
- [ ] Key CTA clicks and completion events are measurable.
- [ ] Funnel drop-offs are visible.
- [ ] Conversion experiments can be evaluated using outcome data.
- [ ] Analytics events cannot be trivially inflated by repeated client-side calls.

## 9. SEO and Content Quality
- [ ] Sitemap is valid.
- [ ] Robots rules are intentional.
- [ ] Canonicals are correct.
- [ ] Programmatic industry/location pages provide unique useful content.
- [ ] Thin/duplicate pages are prevented or excluded.
- [ ] Internal linking supports important pages.
- [ ] Structured data matches page content.
- [ ] Service geography is accurate.
- [ ] Metadata is unique and useful.
- [ ] Noindex/canonical strategy is intentional for utility, duplicate, or thin pages.
- [ ] Search-console/indexing issues are monitored.

## 10. Accessibility
- [ ] Semantic heading hierarchy is maintained.
- [ ] Forms have labels.
- [ ] Errors are understandable and associated with fields.
- [ ] Keyboard navigation works.
- [ ] Focus management works in dialogs/menus.
- [ ] Contrast meets an appropriate WCAG target.
- [ ] Interactive controls have accessible names.
- [ ] Screen-reader behavior is checked for critical flows.
- [ ] Reduced motion is respected.

## 11. Observability and Operations
- [ ] Production errors are captured.
- [ ] Structured logs exist for important server operations.
- [ ] Critical alerts have owners.
- [ ] Uptime/availability monitoring exists.
- [ ] Performance monitoring exists.
- [ ] Payment/webhook failures generate actionable visibility.
- [ ] Incident response procedure is documented.
- [ ] Rollback procedure is documented.
- [ ] Customer communication procedure exists for material incidents.
- [ ] Recovery objectives are defined.

## 12. Backup and Disaster Recovery
- [ ] Database backups are enabled.
- [ ] Storage/assets backup strategy is documented.
- [ ] Configuration recovery is documented.
- [ ] Restore has been tested, not merely assumed.
- [ ] Recovery time objective is documented.
- [ ] Recovery point objective is documented.
- [ ] Deploy rollback has been tested.

## 13. Documentation and Engineering Hygiene
- [ ] README explains product purpose, architecture, setup, testing, deployment, and security.
- [ ] AGENTS/developer instructions are consistent with actual workflows.
- [ ] Production-readiness documentation is current.
- [ ] Security policy is current.
- [ ] CI workflows are documented.
- [ ] Migration/release practices are documented.
- [ ] Issue/backlog process exists.
- [ ] Technical debt/security/customer-request tracking exists.
- [ ] Fast PR cadence is balanced by automated gates and review discipline.

## 14. Evidence Rules
Perplexity must distinguish:
- PASS = directly verified with current evidence.
- PARTIAL = implementation exists but live/provider/configuration evidence is missing.
- FAIL = evidence shows the requirement is not satisfied.
- UNVERIFIED = the repository cannot establish the claim.

Do not award 10/10 merely because documentation says something exists. Verify implementation and, where applicable, live GitHub/Supabase/Stripe/Cloudflare configuration and production behavior.

## Final assessment
Report:
1. Total PASS / PARTIAL / FAIL / UNVERIFIED.
2. The exact remaining blockers.
3. The exact evidence for each blocker.
4. Whether any claim in the previous review is now obsolete.
5. Which items require external production configuration rather than code changes.
6. A concise release-readiness conclusion without inventing evidence.
