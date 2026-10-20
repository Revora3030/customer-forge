# Site-wide upgrade: every page, start to finish

The site has about 96 pages: 53 public pages (marketing, SEO and customer-site previews) and 43 signed-in app pages. This is too much for one pass, so the work runs in waves. Each wave starts by checking the real pages, then fixes what it finds, then re-checks them. Each wave ends with something you can see.

## Wave 0: Check every page (no changes)
- Open every public page and every signed-in page on phone (390px) and desktop (1280px).
- Record broken links, console errors, failed requests, text or buttons that run off the screen, empty or placeholder content, slow loads, missing page titles and descriptions, and pricing text that disagrees with the real offer.
- Run the SEO and security scans.
- Output: a page-by-page scorecard (0–10 per page) that sets the order of the fixes. Nothing gets "fixed" that wasn't found.

## Wave 1: Homepage and the signup path
Homepage, pricing, get-started, growth assessment, website audit, sign in and sign up, password reset, invite.
- Stronger first screen on phone, one clear main button, and fewer sections that repeat each other.
- Real product visuals instead of generic blocks.
- Jarvis chat works on phone.
- Pricing copy reads from one source everywhere.
- Every form shows loading, error and success states. The full path from signup to trial to setup payment is tested, without charging anyone.

## Wave 2: Marketing and SEO pages
About, contact, industries, CRM pages, compare, guides, local, locations, states, tools, demo, share, privacy and terms.
- One consistent design system, so the pages stop looking like templates.
- Real internal links, unique titles and descriptions, and correct structured data.
- Remove filler copy and anything that can't be backed up.

## Wave 3: The signed-in app
Dashboard, website builder, Jarvis, CRM (leads, customers, appointments, quotes), automations, reviews, analytics, billing, settings and team.
- Every screen gets polished empty, loading and error states.
- Phone layouts for the tables and builder.
- Fix broken actions found in Wave 0.
- Test each workspace's isolation, and that roles are respected.

## Wave 4: Customer-site previews and publishing
- Shared preview links (/p/...), customer-site pages (/s/...), the draft view, and the builder preview that hides the whole site while a build runs.
- Publish gate and rollback checks.

## Wave 5: Final pass
- Full re-check of every page on phone and desktop, plus SEO, security and the full test suite.
- Before/after scorecard delivered.

## Hard limits (unchanged)
- No pricing or trial changes: today's code says $350 setup, 3 days of full access, first month free, then $100/month. That still conflicts with the older $750 plan, and only you can decide which is right.
- No publishing, no emails or texts to customers, no charges, no raised AI spend limits, no weakening of security or workspace isolation.
- Your AI team keeps creative control of customer websites. Customer sites get no templates.
- Nothing invented: no fake reviews, stats, logos or phone numbers.

## What "10/10" means here
Every page needs a measured result:
- Zero console errors and zero broken links.
- No sideways scrolling at 320, 390, 768 and 1280px.
- Text contrast meets accessibility standards, and tap targets are at least 44px.
- Unique page titles and descriptions.
- Working forms.
- Tests pass and the build is clean.
I'll report anything that misses this, with the reason.

## Technical notes
- Wave 0 uses Playwright scripts under /tmp/browser, a signed-in session for the app pages, and the SEO and security scanners.
- All colors and styles move into the shared design tokens in `src/styles.css`. Shared marketing parts are fixed once and reused, not copied.
- Every fixed form or flow gets regression tests next to the existing tests.
- After each wave, the scorecard is updated in `roadmap.md`.
