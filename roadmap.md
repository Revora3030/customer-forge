# Builder 10/10 upgrade

## Hall of Fame first-build architecture rebuild
- [x] Compile industry strategy, buyer objections, conversion architecture, design fingerprint, visual direction, and honest asset requirements before page materialization.
- [x] Materialize and publicly render fingerprint-driven page shells, section compositions, imagery treatments, motion, and mobile behavior.
- [x] Isolate AI-provider cooldowns per tenant and persist explicit first-preview evidence states instead of claiming unmeasured quality.
- [x] Harden all customer-supplied website/domain requests against private, metadata, loopback, redirect, and DNS-rebinding targets.
- [x] Verify the signed-in builder workspace, full tests, types, production build, billing/link security, and current commit.
- [ ] Fresh-customer generation and visual QA at 320/375/390/414/768/1024/1280/1440+ — blocked: no locally renderable customer preview; hosted preview requires the platform login.
- [ ] Remove the remaining nested dependency advisory — blocked: the scanner attributes it to the framework although the production lock resolves js-yaml 4.3.2.

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

## Gap-closing pass: interactive blocks + evidence-gated repair
- The builder can now create six further interactive things beyond the original
  seven: expandable answers (accordion), timelines, filterable lists with tag
  chips, yes/no eligibility checkers, booking selectors (service + time, routed
  to the existing contact path) and progress strips. All are validated data-only
  specs drawn by trusted components — nothing generated runs in a visitor's
  browser, off-site call-to-action links are rewritten to the contact anchor,
  and every figure and word comes from the owner.
- Auto-repair is now evidence-gated: a repair is only ever reported as kept when
  rendered before/after evidence shows measured problems fell. Missing evidence
  is NOT_VERIFIED and the repair is rolled back; a repair that leaves blocking
  problems or makes things worse is FAIL and rolled back.
- VERIFIED: real browser check at 320/390/768/1280/1440 — all six blocks render,
  zero sideways overflow at every width, no console errors; tag filter narrows
  the list, the eligibility checker returns the pass result after two answers,
  the accordion opens.
- Billing safety re-verified against the live database: members can only read
  subscription rows; every write is denied to members and anon and must come
  through the payment webhook path.
- 1,128 tests (171 files), typecheck clean, production build OK.
- Still open and honestly labelled: visual click-to-edit canvas, draft/branch
  experiments, free-form generated code beyond the safe block format, screenshot
  review by a vision model on every build, live Core Web Vitals measurement,
  picture editing (no free edit-capable model), and email/CRM/Stripe checks
  (need credentials).

## Real website speed measurement (VERIFIED_LIVE 2026-09-20)
- Published customer sites now measure the visitor's actual experience in their
  own browser (main content paint, layout steadiness, tap response, first paint,
  server response) using standard browser APIs — no third-party script, no cost,
  nothing personal stored beyond an opaque per-visit token.
- New `site_vitals` table: visitors' browsers may record only for published
  sites, one row per visit/metric/page (unique index), members read, nobody can
  edit or delete recorded numbers.
- Owner sees the measured figures on the Analytics page at the 75th percentile,
  with anything unmeasured shown as "not measured yet" instead of scored.
- VERIFIED: real browser visit to a live customer site recorded lcp/fcp/cls/ttfb
  rows; a second visit produced its own single set (no double counting); the
  owner panel renders at 390px and 1280px with no overflow and no console errors.
  1,135 tests (172 files), typecheck clean.
- Still open: click-and-drag canvas is built (BuilderCanvas), free-form code
  generation, draft/branch experiments, vision review of screenshots, large-build
  speed, motion depth, multi-page storytelling. Picture editing BLOCKED (no free
  edit-capable model). Email/CRM + Stripe BLOCKED on credentials.

## Security warnings closed (2026-09-20)
- Domain/SEO probes: every outbound check (redirects, robots/sitemap/canonical,
  SEO report) already runs through net-guard.server guardedFetch — public DNS
  names only, resolved addresses verified globally routable, no IP literals,
  no credentials in the URL, standard ports only, redirects never auto-followed.
  Re-verified: no unguarded fetch of a user-supplied host remains.
- Billing: live policy check shows members can only read their subscription row;
  insert/update/delete are denied by restrictive policies. No self-granting.
- Link addresses: now enforced in the database itself
  (website_components_link_url_safe_scheme) plus the two remaining code paths
  (QA repair, page duplicate). New src/lib/link-safety.test.ts.
