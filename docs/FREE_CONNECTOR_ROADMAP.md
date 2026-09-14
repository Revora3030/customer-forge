# Revora free-first connector roadmap

## Rule
Revora's database remains the source of truth. Connectors are adapters, not owners of tenant data. Never add a paid provider to the critical path when the same capability can be delivered by Revora + Supabase.

## Already connected / no action needed
- Supabase: database, auth, storage, edge functions, realtime.
- Stripe: existing Revora billing path.
- Revora native website audit: HTML-level audit without a third-party crawler.

## Connect next — only when the user is ready

### 1. n8n Community Edition — FIRST external connector
Use only the self-hosted Community Edition if zero software spend is required. It becomes the automation bridge for events that already exist in Supabase.

Revora sends:
- lead.created
- lead.status_changed
- appointment.created
- appointment.completed
- review.request_due
- website.audit.completed
- customer.inactive

n8n can then call free/native endpoints or services. It must not become the system of record.

### 2. Google Analytics
Connect when a customer wants external behavioral analytics. Import traffic/engagement into the Growth Center; keep Revora analytics_events authoritative for Revora-native events.

### 3. Google Search Console
Connect when a customer wants SEO performance. Import queries, clicks, impressions, CTR and average position.

### 4. Google Calendar
Connect when appointment synchronization is needed. Map events into the existing appointments table.

### 5. Calendly
Connect only for customers already using Calendly. Sync booking events into appointments.

### 6. WordPress
Connect only when an existing customer site is WordPress. Audit first; edits require explicit authorization.

### 7. Wix
Same policy as WordPress. Audit first, edit only with authorization.

### 8. Cloudflare
Connect when Revora needs domain/DNS/edge operations for a customer's domain. Prefer existing website_settings as the state model.

### 9. Resend
Connect only if the existing email path cannot meet the customer's lifecycle/transactional email needs. Email delivery itself can have provider costs even when the connector software is free.

## Optional / later
- Canva: creative asset workflows.
- Figma: design-system workflows.
- Firecrawl: deeper multi-page/rendered audits when native HTML auditing is insufficient. This is not a zero-cost dependency and must never be required for the builder.
- Twilio: SMS/voice. Treat as paid usage, not a free core dependency.

## Never make these required for the free builder
- paid AI APIs
- paid crawler APIs
- paid SMS/voice
- paid automation hosting
- premium SEO APIs

## Activation sequence
1. Finish native Revora audit + Growth Center data model.
2. Wire n8n webhook adapter.
3. User connects self-hosted n8n.
4. Add Google Analytics/Search Console only when a customer needs them.
5. Add CMS/calendar adapters on demand.
6. Add paid providers only as optional upgrades, never as a hidden dependency.
