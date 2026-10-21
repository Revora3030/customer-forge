# Redesign phase 2 — remaining public pages

Continue the approved redesign from the homepage onto Revora's own public pages, using the gold/editorial styles added in phase 1. Customer website pages (/s, /p, share, portal) are excluded so customer sites stay exactly as built.

## Pages
- Shared header and footer: refined gold hairline, serif wordmark accents, better mobile menu spacing.
- Pricing: serif headline, a featured gold-edged offer panel. Terms stay word-for-word: 3-day trial, no card; $350 setup at launch; first month of $100/month free; first charge 30 days later.
- About, contact, get started, growth assessment, website audit, tools.
- Sign in / sign up / reset password / invite: centered premium panel with subtle particle backdrop; same form fields and behavior.
- Search pages (industries, locations, states, local, CRM, compare, guides): editorial page header and consistent card styling. Titles, headings and text meaning unchanged for search.
- Privacy and terms: readable editorial typography only.
- Not-found page restyled.

## Rules
- Visual only: no copy claims added, no testimonials or numbers invented, no phone number, no changes to sign-in, billing or tracking.
- Motion respects reduced-motion settings.

## Verification
- Screenshot each page at 390 and 1280 widths; check for page errors and sideways scrolling.
- Run the full test suite and fix anything broken.

## Technical details
- Add a reusable `PageHero` marketing component (eyebrow, serif title, lead, optional particles) and apply it to page headers instead of editing each layout from scratch.
- Reuse `font-editorial`, `gold-sheen`, `hairline-gold` utilities; no hardcoded colors.
- No route, server function or database changes.
