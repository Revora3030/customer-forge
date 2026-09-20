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

## Design identity + generated artwork (closes the media and sameness gaps)
- Every website now has a lasting design identity derived from the business itself
  (name, trade, town, audience, goal, how much content and how many photos exist):
  hero composition, background system, section rhythm, navigation, calls to action,
  cards, proof, pricing, FAQ, gallery, stats, forms, footer, decoration, type and
  colour, motion level and density. It is deterministic, so a rebuild keeps the same
  character, and wide enough that two firms in the same trade get materially
  different sites. Styles the owner rejects are never offered again.
- Where no photo exists, the page now shows abstract artwork generated from that
  identity (soft shapes, arcs, rings, waves, dot fields, bars) instead of an empty
  frame. It is drawn from a data-only spec by a trusted component — no provider, no
  cost, nothing generated runs in a visitor's browser — is hidden from screen
  readers, and never depicts or implies anything about the business.
- Media sources now report an honest state: owner photos (available only when real
  photos exist), generated artwork (always available, free), free stock search (only
  when a free-tier key is actually stored), and AI image generation (BLOCKED — every
  image model reachable here costs credits per picture). Spots that need a real
  photograph of the business are left out rather than filled with artwork.
- VERIFIED: real browser check of a live customer site with no hero photo at 1280px
  and 390px — artwork renders behind the hero, no overflow, no console errors.
  1,082 tests, typecheck and production build pass.
- Still open and honestly labelled: free AI image generation (no genuinely free
  provider here), transactional email and CRM live checks (no keys), and the paid
  frontier-model quality ceiling (a deliberate cost choice).

## Design vocabulary + identity wiring (VERIFIED_LIVE 2026-09-20)
- design-fingerprint.ts pools widened to the required minimums: 32 heroes, 25 navs,
  32 backgrounds, 20 colour systems, 20 type systems, 25 CTAs, 25 card systems,
  25 section compositions, 20 each of proof/pricing/FAQ/gallery/stats/process/forms/footers,
  15 decorative, 15 motion patterns, 15 image treatments, 15 section transitions,
  15 page shells, 20 design families. New fields: family, timelineLayout,
  sectionTransition, pageShell, imageTreatment, motionPattern.
- The identity is now read (or created once) and briefed to the planner on every
  builder request in site-agent.functions.ts, and persisted into
  website_settings.generation.designFingerprint so later edits cannot redesign the site.
- Evidence: 1,087 tests, typecheck clean, production build OK, browser render at
  320/390/768/1280/1440 with zero horizontal overflow.
- Still BLOCKED on external credentials: free AI image generation (no zero-cost provider),
  transactional email (Resend/Brevo), CRM (HubSpot/Salesforce).
