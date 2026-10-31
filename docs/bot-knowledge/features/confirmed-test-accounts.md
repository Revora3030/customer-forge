---
name: confirmed-test-accounts
description: bigdawg09091@gmail.com and danaysiaingram42@gmail.com are owner-confirmed Revora test accounts — never treat their activity as prospects or customers
type: constraint
---

Owner confirmed on 2026-10-29 that `bigdawg09091@gmail.com` and `danaysiaingram42@gmail.com`
are Revora's own test accounts, not prospects or customers.

- Their funnel activity must never be reported as signups, checkouts, leads or revenue.
- Historical rows were deleted from `marketing_conversions` (whole browser sessions, the same
  rule used for staff sessions), and the addresses are listed in `TEST_ACCOUNT_EMAILS` in
  `src/lib/staff-sessions.ts` so reports keep dropping them.
- The auth accounts behind both addresses no longer exist, so any new event carrying one of
  these emails is Revora's own testing, not a visitor.
- Do not flag either address as a money leak, an abandoned checkout or a lead to follow up.
