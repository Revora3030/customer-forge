# Lock the $350 setup price everywhere

## What I found
- Everything that sells already uses $350: the pricing page, checkout, Jarvis, outreach emails, the Growth Engine listing packages and saved products.
- No saved record uses $750. I checked products, directory listing packages and the approval inbox.
- $750 now appears only in:
  - your project instructions ("Known business offer: One-time setup: $750")
  - the "Revora security and tenancy" skill text
  - old archived plans and my gap audit, which marked the price as an open question

Nothing customers see needs to change.

## What I'll do
1. Record your decision: $350 setup, first month free, then $100/month, 3-day trial, "everywhere".
2. Mark the price question as resolved in the gap audit and the to-do list.
3. Add one test that fails if any customer-facing offer text, checkout amount or outreach price sentence shows anything other than $350 setup and $100/month.
4. Run the pricing and checkout tests and the full test suite, then report the exact results.

No prices in checkout change, nothing is published, and no emails go out.

## What you need to do
Your project instructions and that skill still say $750, and I can't edit either. Please change both to $350 so future work never brings $750 back:
- **Project instructions:** Project Settings → Knowledge, then edit the "Known business offer" line.
- **Skill:** edit the "Canonical offer" section of the "Revora security and tenancy" skill.

## Technical details
- Canonical source: `src/lib/offer.ts` (`formatRevoraOffer`), checkout in `src/lib/stripe.functions.ts`, prices in `src/lib/stripe-catalog.ts`.
- New test `src/lib/offer-price-lock.test.ts`: checks that the setup amount in the price catalog is 35000 cents, that the offer and outreach strings contain "$350" and "$100/month", and that customer-facing `src/` text contains no "$750".
- Existing fixture `src/lib/monthly-report.test.ts` uses a past $750 payment as historical data. It stays, because real past payments must still be reported as they happened.
- Commands: `bunx vitest run src/lib/offer-price-lock.test.ts src/lib/stripe-catalog.test.ts src/lib/jarvis-acquisition-policy.test.ts`, then `bunx vitest run`.
