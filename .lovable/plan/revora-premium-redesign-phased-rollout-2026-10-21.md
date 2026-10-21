# Revora premium redesign — phased rollout

Both briefs ask for one cohesive black-and-gold, cinematic redesign across ~100 pages (58 public/top-level route files, 44 signed-in). The current design already uses dark carbon surfaces with Revora gold, so this plan builds on that system rather than replacing it. The two screen recordings mentioned in the brief were not attached; direction comes from the written brief.

## Ground rules (from the briefs and standing rules)
- Visual and layout changes only. No changes to billing, sign-in, permissions, publishing, outreach, Autopilot or database rules.
- Pricing copy stays exactly: 3-day full-access trial, no card; $350 one-time setup at launch; first month of $100/month free; first charge 30 days later.
- No invented testimonials, metrics, logos or results. No phone number on public pages.
- Approval gates stay visible on anything that sends, publishes, posts or spends.
- Respect reduced-motion; touch targets at least 44px; checked at 320, 390, 768, 1280 and 2560 widths.

## Phase 1 — Design system upgrade
- Refine tokens: obsidian layers, warm gold plus champagne highlight, hairline gold borders, ambient glow and grain, depth shadows.
- Typography: editorial serif display (e.g. Instrument Serif or Cormorant) for headlines, keep a clean sans for body and data; fluid heading sizes.
- Motion tokens: entrance reveal, hover lift, gold shimmer, particle field — all disabled under reduced motion.
- Shared primitives: section shell, eyebrow/headline block, premium card, stat tile, empty/loading/error states, page header for signed-in screens.

## Phase 2 — Public site
- Homepage: cinematic opening with animated luminous particle field and the BUILD / ATTRACT / AUTOMATE / CONVERT / GROW story; asymmetric sections instead of uniform card grids.
- Pricing, about, states/city and service pages, contact, legal pages, auth (sign in / sign up), onboarding steps restyled with the shared primitives. SEO titles, headings and content keep their current meaning.

## Phase 3 — Signed-in app shell
- Sidebar, top bar and mobile drawer redesigned (existing focus trap kept).
- Dashboard, Builder, Jarvis, Leads/CRM, Quotes, Bookings, Analytics, Settings, Billing: new page headers, cards, tables and states built from Phase 1 primitives.

## Phase 4 — Admin pages
- Admin analytics, payments, clients, outreach, Growth Engine restyled with the same system; numbers and logic unchanged.

## Phase 5 — Verification
- Browser screenshots of every route at mobile and desktop, checking for page errors and sideways scrolling.
- Full test suite, typecheck and lint.
- Route-by-route checklist marking each page verified or not verified, honestly.

I'll start with Phases 1 and 2 in the first pass, then continue with 3–5 in follow-ups, because doing ~100 pages at once risks breaking working screens.

## Technical details
- Tokens in `src/styles.css` (oklch, `@theme inline`); fonts loaded via `<link>` in `__root.tsx`.
- Particle field is a lightweight canvas component, client-only, paused off-screen and under `prefers-reduced-motion`.
- Existing shadcn components get new variants instead of hardcoded colors.
- No migrations, server function or route-path changes.
