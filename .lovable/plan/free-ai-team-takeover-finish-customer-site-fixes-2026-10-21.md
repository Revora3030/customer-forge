# Free AI team takeover + finish customer-site fixes

## Part A: The free AI team covers every role when paid money runs out

Today the free team already handles writing, design, review, coding, vision and transcription. The gaps are pictures, and the risk of a build stalling quietly when one free provider hits its limit.

1. **Role coverage check.** Add one automated check that lists every AI job in the builder and Jarvis and confirms each has at least one free model ready to take it over when money runs out. The jobs are: Sol (design and writing), Terra (review), Luna (search details and fact checks), Astra (chat), coding, vision, transcription, pictures and motion. Any job with no free backup shows as a gap in the Jarvis status panel. It is never reported as working.
2. **Pictures.** When paid image models are out, pictures come from the free image tools that are already set up (Cloudflare's free image model, Hugging Face and Pollinations). After that come free stock photos and Google Maps photos for the business, with credits shown. If none of these work, the build pauses and waits for capacity. It never ships a blank picture.
3. **Motion.** No free video model is set up, so motion uses AI-written animation styles instead of video. The status panel says so plainly.
4. **Seamless handoff.** When a paid model reports it's out of money, the job moves to the free team within the same build stage, using the progress already saved. If every free provider is at its limit, the build uses the existing pause-and-resume path. It shows the reason and when it will retry. It never falls back to a preset design.
5. **Kept the same:** Luna's $100 monthly cap, approval for paid Perplexity research, and no spending without your approval.

## Part B: Finish the customer-site fixes (customer websites only)

1. **Questions (FAQ).** Remove the plain built-in style: grey lines, a bare list and the "⌄" arrow. The question list will only use the AI design's surface, borders, spacing, corners and type. If the design leaves any of these out, Terra sends the section back to Sol to finish.
2. **Step cards.** Remove the plain white box default. Cards will use the AI design's card surface, border, shadow and number style.
3. **Buttons.** Remove the black fallback button. Buttons will use the AI design's own button style, with a readable text colour that still passes the contrast check.
4. **Blurry header smudges.** Find which background layer draws the blobs behind the header. Stop drawing it unless the AI design deliberately asked for it, and never draw it behind the header bar.
5. **Stricter build review** (phone and desktop), using the existing rendered check:
   - Fail when a blank area is taller than about half a screen.
   - Fail when the first page has no main picture or designed opening section at the top.
   - Fail when a question list, step card or button is still in the plain default look.
   
   A failed check goes back to the AI repair loop. A check that couldn't run is marked as missing evidence, never as passed.
6. **"Redesign with AI team" button.** Add it in the builder for each customer site. Tapping it shows what it does and that it uses AI credits (or the free team when money is out), then queues a fresh design build within the daily limit of 5. Nothing publishes on its own, and the live site stays as it is until you approve.

## Verification
- Add tests for each rule:
  - Every job has a free backup or is shown as a gap.
  - A large empty area fails the build.
  - A missing opening picture fails the build.
  - The plain FAQ, card and button defaults are gone.
  - The redesign button queues a build without publishing.
- Check a site preview at 390px and 1280px. Run the full test suite, typecheck and lint.
- No paid rebuild, no publishing and no emails.

## Technical details
- `src/lib/ai/free.ts`, `config.ts`, `free-only-policy.server.ts`:
  - Add a `freeRoleCoverage()` report over all `ModelRole` values, surfaced in the Jarvis readiness panel.
  - Add the image role to the free chain via existing Cloudflare, Hugging Face and Pollinations adapters, then stock and Maps.
  - Hand off on paid-exhausted errors (402 or insufficient balance) inside the router.
- `src/components/site/CompositionRenderer.tsx`: remove hardcoded `.rv-cn-faq*` defaults (chevron, borders) and white card/button defaults so they read only design tokens.
- `src/lib/builder/design-tokens.ts`: add required `faq`, `card` and `button` token groups. Terra's review rejects drafts that are missing them.
- `src/components/site/SiteBackdrop.tsx`, `VisualComposition.tsx`, `AiSiteHeader.tsx`: suppress blob or blur layers behind the header, and draw them only when authored.
- `src/lib/builder/launch-review.ts` and visual-check: add `large_empty_gap`, `missing_hero` and `unstyled_component` findings, graded as repair-required.
- Builder: add a "Redesign with AI team" action that enqueues through the existing build queue and daily-cap check, with the publish state untouched.
- Admin workspace styles are not touched.
