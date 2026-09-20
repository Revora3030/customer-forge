# Builder 10/10 upgrade

- [x] New sites automatically receive an industry-specific look (palette, fonts, backdrop, section variants, effects) at first build.
- [x] Every saved visual choice now renders visibly on the public site (widths, card styles, image treatments, section variants, mobile fallbacks).
- [x] Builder shows the live step timeline, before/after per change, a "Updating your preview…" state, and warns honestly on partial application.
- [x] Preview refresh now waits for the correct data to reload.
- [x] Repeat/duplicate apply presses replay the real earlier result (counts, notice, per-change detail) instead of empty or broken numbers.
- [x] Regression test for industry-specific design contracts on generated sections.
- [x] Types, 1013 tests, build, and desktop/phone render checks pass with no overflow or console errors.

## Open (blocked on external keys)
- [ ] Transactional email (Resend/Brevo) and CRM (HubSpot/Salesforce) live verification — blocked: no API keys in this workspace.

- [x] Website variety: 26 site archetypes (restaurant, clinic, shop, fitness, hotel, real estate, agency, nonprofit, education, care, automotive, portfolio, SaaS, venue, travel, pets, legal/finance, industrial, weddings, consulting, emergency, catering, salon, construction, therapy, local service) classify each business and drive first-build structure plus assistant whole-site plans. Structure only — no invented facts.

- Builder pass: model team settles as soon as 3 seats agree or after 10s (faster big requests); every design variant now has real CSS + scroll-in motion; apply reports only genuine changes (already-correct steps counted separately).

## Luna paid orchestrator
- Luna (gpt-5.6-luna) wired as coordinator-only lane with a $20/month hard cap ledger. VERIFIED_LIVE: real call returned text, spend recorded, admin panel reads it.

## Custom interactive blocks (the "build me something new" gap)
- The builder can now create blocks that do not exist in the fixed section list: price
  estimators, guided "which service fits" pickers, comparison tables, step-by-step
  timelines, checklists, tabbed panels and figure strips.
- Each one is a validated data-only spec stored on the section and drawn by trusted
  components — nothing generated ever runs in a visitor's browser, and an invalid spec is
  rejected with an exact reason instead of shipping broken.
- Estimators must carry an "estimate only" note; every figure and word comes from what the
  owner supplied.
- VERIFIED: real browser check at 390px and 1280px — estimator maths correct ($80 base +
  SUV $40 + 2 seats x $15 = $150), picker result appears, tabs switch, no overflow, no
  console errors. 1,060 tests, typecheck and production build pass.
- Still open and honestly labelled: free image generation (no genuinely free image provider
  in this workspace — every option costs credits, which breaks the $0-AI rule), and the
  paid frontier-model quality ceiling (a deliberate cost choice, not a defect).
