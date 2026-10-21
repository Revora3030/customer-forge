# Put your connected services to work

Phase 2 of the redesign is done: new serif headlines on every public page, a gold-edged pricing panel, no page errors or sideways scrolling on phone or desktop. Next, use the services you already connected. Nothing below sends, posts, publishes or spends without your approval.

## 1. Search Console: improve the pages Google already shows
- One-off read of your last 28 days of search data for revoragrowthsystems.com.
- For the top pages with impressions but few clicks: rewrite title and description to match the real searches, strengthen the opening paragraph, and add links between related pages.
- Add a Search Console card to the admin SEO area that reads a daily saved snapshot (top queries, pages, clicks, position) rather than calling Google every time someone views it.

## 2. Google Business Profile: review your Revora listing
- One-off read of your listing (name, category, description, hours, website).
- Report the gaps in chat with suggested fixes. Changes are applied only after you confirm the exact text.

## 3. Logo.dev: real customer logos in builds
- When a customer gives their own website address, the builder pulls their real logo and shows it in the header for them to approve. If no logo is found, it falls back to the AI-made wordmark.
- Never shows logos of other companies the customer hasn't named.

## 4. Calendly: let visitors book a call with you
- Link your Calendly to the project.
- Add a "Book a call" option on the contact page that shows your Calendly booking options. Email and Jarvis stay as the other ways to reach you, and no phone number is added.
- Customer sites already accept Calendly links; that stays as it is.

## 5. "Everything even more"
- After 1–4, a short list in chat of other connected services worth using (e.g. PostHog for funnel accuracy, Semrush keyword gaps, Notion/Linear for task tracking). You pick which ones to build next.

## Checks
- Browser check of contact, admin SEO and a builder preview; full test suite; tests for logo selection rules (own domain only) and the Search Console snapshot.

## Technical details
- Search Console: reuse `src/lib/integrations/google.server.ts` (`resolveProperty`, `searchPerformance`); snapshot stored server-side and refreshed daily by the existing scheduled job system.
- Business Profile: gateway reads only; any PATCH is preceded by a `validateOnly` call and owner confirmation.
- Logo.dev: reuse `src/lib/brand-logos.ts` `logoDevUrl`; only for the customer's own verified website domain, stored as an approvable brand asset.
- Calendly: `standard_connectors--connect` (calendly), server function reading `/users/me` and `/event_types` with short caching; booking links open Calendly's own page.
- No billing, sign-in, tenant or publishing changes.
