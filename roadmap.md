# Roadmap — close the ten builder gaps vs Lovable

Ordered by user-felt impact. Each item: extend existing code, never duplicate.

- [ ] 1. Streaming chat replies (live token-by-token assistant reply + step activity)
- [ ] 2. Click-to-edit on the preview (select a section, talk about it)
- [ ] 3. Plan shown for approval before large changes
- [ ] 4. Browsable version timeline with preview + jump-to-version
- [x] 5. AI asks a clarifying question instead of guessing
- [ ] 6. Reference screenshot as a design brief (drop image -> styling)
- [ ] 7. Blog / repeating collections on generated sites
- [ ] 8. Custom embed block (booking widget, map, third-party)
- [ ] 9. Preview device switching (phone / tablet / desktop)
- [ ] 10. Before/after comparison after a change lands

## Constraints
- Typed sanitized style/content tokens only; no arbitrary CSS/JS.
- Truthful content gates stay. RLS/tenant isolation, Stripe, publishing untouched.
- No deterministic template authority; AI keeps creative control.
- Verify each batch: tsgo --noEmit, vitest, lint, build log.

## Current requests (Sep 23)
- [x] Fix 14 TS errors on PR #175 branch — blocked: branch lives in godbody4040-oss/customer-forge, no write access from here
- [x] Email for notify.revoragrowthsystems.com — already verified and sending
- [x] Live test of gpt-6-sol/astra/luna + minis — all answered; o3-mini returned empty text at small token limit
- [x] Homepage metadata + hero copy with $750 / first month free / $100/mo
- [ ] Sora-2 video hero — next build (needs video job pipeline, storage, and renderer support)

## AI sole creative authority migration
- [x] Phase 1 (part): fingerprint pools decommissioned, template gallery removed from UI, firewall test added
- [x] Phase 1: firewall for story-pass / motion-pack / first-build-creative / native-first-build callers
- [x] Phase 2: open composition tree
- [x] Phase 3: tree renderer (old section types kept as compatibility)
- [x] Phase 4: keyword sorter + industry design fallback removed; builder told to prefer compositions (destructive-step approval kept on purpose)
- [x] Phase 5a: redesign failure fixed (Sol reply was cut off at 6000 tokens; cap raised, cut-off replies now hand over)
- [x] Phase 5b: fallback guard tests, 7 unused rule-based modules deleted, quality gate green
- [x] Phase 5c: fingerprint/story/motion/first-build-creative modules still imported by live code — retire gradually
- [x] Terra (gpt-5.6-terra) rejected by OpenAI with 401 — key lacks access
- [x] Phase 6a: AI custom layouts are the default for builds/redesigns/edits; approval only for destructive, fact, billing and account actions; fallback guard tests
- [x] Phase 6b (= 5c): retire leftover fingerprint/story/motion/first-build-creative helpers still read by live sites
- [x] Phase 7: remove every remaining old design layer (style lists, Motion/story rules, first-build presets, industry guides, photo-style list, default looks, request reader, seeded pickers). Guard tests in authority-firewall.test.ts.

- [x] Phase 8: removed last built-in looks (style library, font list in prompts, default colors, rule-based layer designer, default effect map, preset quick-button wording); AI-authored backgrounds added

## World-class AI builds (plan 2026-09-24)
- [x] 1. Built-in first-build copy writer removed; Sol writes all words, Terra checks, build stops if key words are missing
- [x] 2. AI chooses pages/sections and now writes every section heading (built-in headings no longer reach first builds)
- [x] 3. Every first-build content section laid out by Sol as its own composition (forms/booking kept working)
- [x] 4. AI-designed menu and footer (Sol designs both on first builds; plain menu stays for older sites)
- [x] 5. New building blocks (tabs, accordion, compare, toggle, marquee, gallery, quote)
- [x] 6. Hero video idea written by Sol in first build; owner clicks to make it (no automatic video spend)
- [x] Toggle building block added
- [x] Monthly AI spend limit raised to $100 (owner choice)
- [x] Non-AI backups removed (built-in review, on-device model, built-in engine report, built-in business strategy)
- [ ] Fixed starting page list (planSiteContent) + candidate menu — next
- [ ] Old section layouts + style-token squeezing — needs AI restyle of existing customer sites first (would change their look)
