# Wire four real provider families into the builder

Four separate jobs, all built the same way: Revora's own capability registry stays in charge, each provider becomes a real server-side adapter that is only reported as working after a live call succeeds, and nothing is ever claimed as delivered/reachable on the strength of configuration alone.

## 1. Pictures that actually generate

Today picture-making is switched off on purpose: every free Google image model answered "quota exceeded", so the builder honestly reports it as unavailable.

- Add Cloudflare's image models (already paid-for-free on the account key that is configured) as the first image provider, with the existing free router doing failover.
- Add a discovery pass that asks each configured provider which image models it will actually run, keeps the ones that answer, and drops retired ones — the same approach already used for writing models.
- Re-enable the image role only for providers that pass a live generation probe. If nothing passes, the builder keeps saying "not available" rather than showing a spinner that never finishes.
- Live preview: generate, show the picture immediately with its brief, and only then offer to save it into the workspace's own media library.

## 2. Email with proof of delivery — Resend and Brevo

- One normalized sending interface with three options in order: the managed sender already in place, then Resend, then Brevo.
- A send is only reported as sent when the provider returns its own message ID; anything else is reported as failed with the provider's own reason.
- Every send is logged with provider, message ID, and outcome, and repeat attempts are de-duplicated.
- Needs from you: a Resend key and a Brevo key. Both have free tiers. I'll request them securely once you approve.

## 3. Leads and contacts — HubSpot and Salesforce

- Revora's own lead table stays the source of truth. The CRM is a mirror, never an owner.
- One normalized contact shape (name, email, phone, source, notes, consent) maps to HubSpot contacts and Salesforce leads.
- Writes are queued and retried, so a CRM outage can never lose a lead or break a generated site's form.
- Per-workspace connection, so one customer's CRM is never reachable from another workspace.
- Needs from you: HubSpot access and Salesforce access. I'll confirm which way you want to connect each before requesting anything.

## 4. Real Google data for SEO and local listings

- Search Console and Maps are already connected, so those go live first: real queries, clicks, impressions and position, and real place/local data.
- Analytics needs its connection linked; I'll open that for you.
- Every SEO recommendation shown gets labelled with where its numbers came from and when they were fetched. Recommendations with no real data behind them are removed rather than guessed.
- Local listings read from Maps, with cached results so the same lookup is never paid for twice.

## Technical notes

- New server-only adapters under `src/lib/integrations/providers/`, resolved through the existing `callCapability` path in `registry.server.ts` (timeout, circuit breaker, failover, honest `unavailable`).
- `capabilities.ts` provider entries flip `implemented: false` -> `true` only as each adapter lands, so the admin capability page stays truthful.
- Google Search Console, Maps and Analytics go through the connector gateway; keys stay server-side and are never exposed to the browser.
- CRM mirroring runs through a retry-backed outbound queue table with RLS scoped to the owning workspace; migrations are additive only.
- Tests per adapter: success, provider error, timeout/failover, and the "never claim success without provider confirmation" rule.

## Order of work

1. Image generation + discovery + live preview (no new credentials needed).
2. Google Search Console, Maps, Analytics (mostly connected already).
3. Resend + Brevo email.
4. HubSpot + Salesforce CRM.

Nothing in the existing builder, publishing, billing, auth or tenant isolation changes. I'll typecheck, run the test suite and build after each step.
