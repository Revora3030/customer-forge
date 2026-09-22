# Simplify the Customer Forge builder

## Goal
Rebuild the website builder as a calm, chat-first workspace inspired by the supplied Lovable mobile reference, while preserving all existing build, edit, preview, history, rollback, publishing, and safety behavior.

## What will change
- Replace the four-mode strip and stacked status panels with one compact builder header: menu, project name, save state, preview, and publish.
- Make the conversation the primary surface, with a clean continuous transcript and assistant responses directly on the page.
- Keep the website preview one tap away on mobile and visible beside the conversation on larger screens.
- Move history, detailed settings, manual editing, checks, and secondary tools into a single menu/sheet instead of showing them all at once.
- Simplify request cards: plain-language progress, compact completed work, expandable details, and clear approval/retry actions.
- Keep the prompt box anchored near the bottom with photo, voice, and send controls; retain a small set of context-aware suggestions.
- Keep focus in the prompt after sending and after work completes, maintain automatic scrolling, and show immediate acknowledgment while Revora plans and applies changes.

## Visual direction
- Match the reference’s restraint: generous spacing, quiet borders, compact rounded controls, readable type, and minimal card chrome.
- Retain Revora’s existing semantic colors and gold identity rather than copying Lovable branding.
- Optimize the mobile layout first at the supplied 390px view, then verify desktop split-view behavior.

## Safety and compatibility
- Preserve the current request queue, approval gates, atomic rollback, tenant permissions, truth checks, publishing controls, and model telemetry.
- Do not change billing, authentication, database policies, AI routing, generated-site rendering, or customer website design.

## Validation
- Verify the signed-in builder on mobile and desktop.
- Test sending, queued/planning/building/completed/failed states, preview switching, history/settings access, and publish controls.
- Confirm build output and affected tests remain clean.
