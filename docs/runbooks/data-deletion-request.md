# Data export and deletion requests

> Review with a lawyer before relying on this. It is an operating procedure,
> not a legal opinion. Response times below are internal targets the owner
> chose. They are not legal deadlines.

Requests come in by email to hello@revoragrowthsystems.com. Most arrive as the
prefilled email from **Settings → Your data**, which includes the account email,
business name and workspace ID. They can also come from a prospect who was
contacted by outreach.

The app has no self-serve delete button. A person handles every request.

## 1. Verify
- Reply only to the email address on the account (or the prospect address that
  was contacted). Don't act on a request sent from a different address until
  that address confirms it.
- For workspace deletion, the requester must be a workspace **owner or admin**.
- Log the request: date received, requester, workspace ID, and type
  (export, delete or stop contact).

## 2. Stop contact (prospects)
- Add the address or phone number to the outreach do-not-contact list. The
  unsubscribe route does the same thing, so every later send skips it.
- Confirm by email.

## 3. Export
- Leads: the account holder can download them as CSV from the Leads page.
- Anything else they ask for (business profile, site content, bookings,
  reviews): export it read-only from the workspace and send it to the verified
  address.

## 4. Delete
1. Cancel the Stripe subscription, if there is one (Stripe dashboard). Stripe
   keeps its own billing records, and we keep invoices as tax and accounting
   law requires.
2. Unpublish the site and remove any custom domain.
3. Delete the workspace's data and the auth user through the approved admin
   path, after checking which rows the foreign keys cascade to. Take a backup
   snapshot first. Don't run ad-hoc SQL against production without a reviewed
   plan.
4. Ask third parties that hold copies to delete them where that applies (for
   example, Twilio message logs and Sentry events).
5. Keep the do-not-contact entry, if there is one. It is how we honour the opt-out.

## 5. Confirm
Email the requester once the work is done, and record the completion date.
The owner should set the target response time (for example, 30 days) and the
retention periods. Until they do, the privacy policy says only that we act on
requests and confirm when done.
