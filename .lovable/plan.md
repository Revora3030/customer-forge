# Close the remaining gaps

Your screenshots show the real problem clearly: the site's structure and words are good, but text is unreadable in several places and some areas render empty. Everything else (security, tests, billing, publishing) is already clean.

## What is wrong, confirmed

1. **White text on cream backgrounds.** "Supreme detailing", "One clear service", "Offer", "Full" are all near-white on a pale background. The AI chooses a text colour for a section, and it is applied exactly as written with nothing checking it is readable against the background that actually appears. There is no readability check anywhere in the rendering path.
2. **Grey haze over whole sections.** The darkening layer meant to sit over a photo is being applied to sections with no photo, turning cards and prices muddy grey.
3. **The top bar sits on top of content.** The brand name and "Menu" are faint, and the page scrolls underneath the bar instead of below it.
4. **Empty areas.** A blank cream band where a hero picture should be, an empty dark-green band above the car photo, "ESTIMATED RANGE" with no number, and a feature that just says "All".
5. **Pictures cropped to slivers.** Some images render as a thin horizontal strip instead of a proper image.
6. **"Back to builder" button is invisible** — white on cream.

## What I will change

**Readability guaranteed, AI still in control.** The AI keeps choosing colours freely. Right before a colour is saved, it is paired with the background it will actually appear on: if the combination is unreadable, the text colour is snapped to the readable end of the same colour (so gold stays gold, just dark enough to read) rather than being thrown away or replaced with a template colour. Same rule for headings, body text, prices, buttons and the top bar.

**Darkening layer only over pictures.** The haze is tied to an actual image being present, so sections without a photo render clean.

**Top bar fixed.** Solid enough to read, with the page content starting below it instead of sliding under it.

**No empty areas shipped.** A section with no picture, no number or a one-word filler value ("All", a blank price) is treated as a failure: the builder fills it or removes it before the page is shown, the same way placeholder words are already rejected.

**Pictures render at full size.** Images get a real minimum height so a picture can never collapse into a strip.

**Readability check added to the automated review.** Every generated page is checked at all eight screen widths for unreadable text, empty blocks and collapsed pictures, and repaired in the existing repair loop before it reaches you.

Then: full test run, type and quality checks, a fresh test build of Supreme Detailing to confirm the screenshots above look correct, and publish.

## Two items I cannot finish alone

- **Gemini models** — the Google key currently saved is rejected by Google. I need a valid one to switch Gemini on. Your main model team works without it.
- **Automated billing tests** — real billing works; automated tests against it need test-mode payment credentials from you.

## Technical notes

- Contrast pairing helper (WCAG AA, 4.5:1 body / 3:1 large) applied in `normalizeStyleInput`/`readLayer` in `src/lib/site-style.ts`, so every path that writes a block style inherits it; `src/lib/site-theme.ts` gains the same pairing for derived tokens.
- Wire the unused `src/lib/accessibility/a11y-contract.ts` into `src/lib/builder/qa-loop.server.ts` and `qa-auto-repair.ts` with contrast, empty-block and collapsed-media signals.
- Scope `.rv-media-role-background` scrim rules in `src/styles.css` to a media-present marker set by `SiteSections.tsx`; add `min-height` to `.rv-media-frame`; make the header in `src/routes/s.$slug.$page.tsx` opaque and non-overlapping.
- Extend the existing content-integrity rejection in `src/lib/builder/ai-design-contract.ts` to cover blank numeric values and one-word filler features.
- `BuilderReturnBar.tsx` gets explicit foreground/background tokens.
- Regression tests for each rule; no change to RLS, tenant isolation, Stripe, publishing, or the model routing.
