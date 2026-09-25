# Remaining blockers to a 10/10 platform

Current state checked today: no build errors, no runtime errors in the preview. One minor warning (preview page code not split, slightly larger download).

## A. Blocked on you (I cannot finish these alone)
1. Revora site going live — publishing unlocks only after Stripe confirms the $750 setup payment.
2. Second-industry proof site — needs one real business's name, services, contact details and hours.
3. Northline test site rebuild — needs your go-ahead (uses part of the $100/month AI allowance; pictures about $1–2 each).
4. Google Business Profile — remove "Telemarketing" if you don't offer it.
5. Google Ads free credit — claim it in the setup card if you want it.

## B. Unproven (built and tested automatically, never run on a real AI build)
6. AI-designed motion and hover/touch effects.
7. "Review every page at 5 sizes" screenshot fix loop.
8. Buttons and cards still appear correctly after name-based shortcuts were removed.

## C. Growth gaps (hurt traffic and paying customers)
9. No sign-ups yet — offer is unproven; ads may spend without results.
10. City/industry pages rank on Google page 3+ — need stronger, specific content.
11. Google Business Profile reviews/hours sync not built.
12. No real customer reviews on the site (trust score capped until they exist).

## D. Housekeeping
13. Stale roadmap items (trial length, old phase lines) still marked open — close them.
14. Preview page code-splitting warning — small speed fix.
15. Old dead Stripe sandbox keys stored — remove.

## What I'll do on approval
- Run one real AI build to prove items 6–8, report results honestly.
- Fix items 13–15.
- Strengthen the top 10 near-ranking pages (item 10) with truthful content.
- Items in A stay open until you supply what's listed.

## Technical notes
- Split `PreviewRoute` out of `src/routes/p.$token.tsx`.
- Delete secrets STRIPE_SANDBOX_API_KEY, PAYMENTS_SANDBOX_WEBHOOK_SECRET.
- Clean roadmap.md.
