# Live AI Workspace Upgrade

## Goal
Turn the website builder into one distinctive, Lovable-like conversation-first workspace where customers speak directly to Revora, watch real work progress, preview changes immediately, undo safely, and publish through the existing protected launch flow.

## Build
1. **Unify the AI experience**
   - Keep one builder conversation and remove the duplicate owner-side chatbot from settings.
   - Move photo and voice into the active composer instead of opening an unrelated settings panel.
   - Keep full conversational context, current page/block selection, progress, errors, approvals, and results together.
   - Add an inline undo/history action after completed changes.

2. **Recompose the builder workspace**
   - Match the selected direct AI workspace: compact project header, strong Chat/Preview switcher, unframed transcript, live canvas, anchored composer, contextual tools.
   - Hide brand/style controls from the default conversation; the AI remains the creative authority.
   - Use high-contrast suggestion borders with subtle shadows, as requested.
   - Keep business facts, advanced operations, history, and manual editing available through the secondary tools menu.

3. **Bring the product to life**
   - Apply Carbon + Signal Red tokens with restrained warm-gold continuity.
   - Use Space Grotesk headings and DM Sans body text.
   - Extend the ambient background into authenticated product pages, add restrained status/entrance motion, and preserve reduced-motion behavior.
   - Normalize overlays and remove visually inconsistent light or hardcoded surfaces.

4. **Secure live actions**
   - Route website review state changes through server validation rather than direct browser writes.
   - Require recorded AI design, image, and QA evidence before production activation while preserving roles, payment, tenant isolation, rollback, and admin recovery paths.
   - Verify every publish button still uses the one protected launch flow.

5. **Validate end to end**
   - Check desktop and phone layouts, conversation input, suggestions, photo/voice actions, preview switching, AI request/apply flow, undo/history, and publish gating.
   - Run the project quality checks and inspect runtime, console, and network errors.

## Technical notes
- Reuse the installed AI Elements conversation, message, prompt-input, and shimmer primitives.
- Keep the current AI model team and server-side safeguards; this changes the customer interaction and execution surface, not the model roster.
- Preserve truthful-content rules, reversible changes, accessibility, billing, domains, analytics, and existing customer sites.
