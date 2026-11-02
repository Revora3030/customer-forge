# Personal-data breach response

> Review with a lawyer before relying on this. This is an operating checklist,
> not legal advice. Breach-notice laws depend on where the affected people live,
> so confirm the obligations with counsel each time.

Use this alongside `incident-response.md` (P0). A "breach" here means
unauthorized access to, or acquisition of, personal information we hold: account
data, our clients' leads and customers, prospect contact data, or credentials.

## First hour: contain
1. Follow the P0 steps in `incident-response.md`: stop the entry point, rotate
   credentials, preserve logs and timestamps.
2. Open a private incident note and record the time we became aware. Several
   deadlines run from that moment.
3. Don't delete evidence. Don't contact affected people until the scope is
   understood, unless they are in immediate danger (for example, credentials
   being used right now).

## Day 1–3: assess
- What data, how many people, which workspaces, and where those people live.
- Was the data encrypted, and is the key safe?
- Which vendor was involved, if any? Check their status page and contact their
  security team. See `docs/legal/SUBPROCESSORS.md`.
- Bring in a lawyer as soon as personal information was plausibly accessed.

## Notify (decide with the lawyer)
- **Affected clients (workspace owners):** tell them promptly. Their customers'
  data is theirs, and they may have their own notice duties.
- **Individuals:** North Carolina's Identity Theft Protection Act (N.C. Gen.
  Stat. § 75-65) requires notice without unreasonable delay when certain
  personal information is breached. Other states where affected people live
  have their own laws.
- **Regulators:** under the NC statute, the Consumer Protection Division of the
  NC Attorney General's office is also notified. If more than 1,000 people are
  notified at once, the nationwide consumer reporting agencies are notified too.
  If EU or UK residents are affected, the GDPR's 72-hour regulator notice may
  apply. Confirm all of these with the lawyer.
- **Card data:** we don't hold card numbers (Stripe does). If Stripe-related
  keys leaked, rotate them and contact Stripe.

## Afterwards
- Write a root-cause note, add a regression test, and update this runbook and
  `SECURITY.md`.
- Keep the incident record: what happened, who was notified, and when.
