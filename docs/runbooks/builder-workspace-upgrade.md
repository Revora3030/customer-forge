# Builder workspace upgrade: verification and rollout

## Scope
This package targets lovable-sync. It upgrades the shared mobile builder shell, adds scoped responsive chat/preview styles, replaces the unmanaged navigation overlay with the existing Radix Sheet, exposes undo/redo on mobile, supports visualViewport sizing and reduced motion, and repairs fit/compare scale geometry. Preserve the AI-authored composition pipeline, tenant checks, billing/entitlements, request persistence, publishing approval and existing backend endpoints.

## Screenshot findings versus hypotheses
- Confirmed in supplied screenshots: mobile device controls exceed visible toolbar width; chat displays an expired-trial error and a retry button; the UI says AA Pass; desktop and mobile previews show different header presentation.
- An expired-trial response is not proof of provider failure. No billing override is included.
- Raw-looking desktop chrome needs a real iframe/style/network inspection. Scoped shell styles do not certify it fixed.
- An automatic contrast check is not a full WCAG conformance audit. The AA Pass label is unchanged in this package and remains a follow-up.

## Required checks
Run npm run typecheck, npm run lint, npm test and npm run build. Existing geometry tests that assume a minimum 0.1 scale must be reviewed because that floor can exceed a narrow stage's width. New contract tests inspect integration markers; they are not interaction or accessibility proofs.

## Browser acceptance
1. At 320, 390 and 768 pixels, check project title, all toolbar controls, publish action and bottom safe-area spacing.
2. Open and close the navigation sheet via trigger, Escape and backdrop; verify focus trapping and return-to-trigger behavior. Resize to desktop while it is open.
3. Open the iOS keyboard, type a long prompt, hide/show it and rotate the phone. Check the composer remains reachable and transcript scroll is contained.
4. Check phone, desktop and 4K Fit and side-by-side preview; verify toolbar scrolling and page selection.
5. With reduced motion enabled, verify no mandatory pulsing or smooth-scroll transition.
6. Test expired-trial, unauthorized, timeout and provider errors separately. Access restrictions must remain server enforced. Retry controls and ready status need a separate typed error-state integration before those screenshot issues can be marked resolved.
7. Verify destructive edit plans require explicit approval; never auto-publish.
8. Confirm incoming preview messages still enforce origin and iframe-source checks.

## Limits
No provider calls, payments, migrations, publishing or production deployment are performed by this package. No claim of Lovable feature parity, complete accessibility, live preview fidelity or a 10/10 site is made. Authenticated browser checks and full repository CI are still required. Revert with a new commit; do not rewrite Lovable history.

The queue auto-apply predicate now rejects included destructive steps. The existing misleading true assertion is corrected and exclusion/immutability regressions are added. Other queue states, summaries and timeline labels remain unchanged.
