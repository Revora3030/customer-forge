# Direct AI Style Control Repair

## Goal
Make plain-language design requests reliably produce visible changes across draft and published customer websites, while preserving security, tenant isolation, truthful content, accessibility, and rollback.

## Confirmed root cause
- The reported command was accepted and saved, but the AI changed one cream background to an almost identical cream, so it appeared unchanged.
- The AI planning contract can change only global theme colors and a narrow section-composition vocabulary. It cannot currently request the full safe style system already supported by the renderer.
- Planning does not receive existing section/component style settings, so it cannot compare or intentionally replace prior overrides.
- Restore snapshots currently omit section/component settings and media URLs, risking incomplete rollback of visual edits.
- Validation silently drops unsupported style fields, allowing an incomplete plan to look successful.

## Implementation
1. **Complete the visual action contract**
   - Add safe section and component style actions for background, text color, typography, spacing, sizing, borders, imagery, buttons, layout, and per-device overrides.
   - Keep values validated and CSS-injection-safe; do not permit arbitrary scripts or untrusted CSS.
   - Include every supported action in the AI planner instructions and human-readable change review.

2. **Give the AI accurate current-state context**
   - Load existing section/component settings and current theme values into planning.
   - Require direct requests to change only the requested properties unless the owner asks for a redesign.
   - Require vague visual changes to be materially perceptible and contrast-safe, rather than choosing a near-identical value.

3. **Eliminate silent no-ops**
   - Report rejected or unsupported model fields instead of silently claiming success.
   - Compare global theme and block-style actions against current values before applying.
   - Verify that targeted rows were actually updated and that the saved value can be read back.

4. **Fix persistence and preview fidelity**
   - Preserve all section/component settings and media URLs in restore points.
   - Ensure the draft preview reloads after theme and visual-style changes, not only content changes.
   - Keep the same rendering source for draft and published pages so approved styling cannot diverge.

5. **Regression coverage and verification**
   - Test global background changes, section backgrounds, typography, spacing, responsive overrides, unsupported fields, no-op detection, rollback fidelity, and preview refresh.
   - Run focused tests, full tests, lint, and inspect the current build signal.
   - Exercise a safe test workspace and confirm the rendered color changes visibly without altering the customer’s live site.

## Safety boundaries retained
- Tenant permissions, authentication, content truth checks, safe-link rules, style sanitization, accessibility contrast, atomic rollback, billing limits, and publishing gates remain enforced.
- “Full control” means full control of the supported visual system—not access to secrets, arbitrary code, unsafe CSS, or another customer’s data.