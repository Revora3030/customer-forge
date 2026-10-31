---
name: Real-Time Event Webhook Pipeline & Executive Reporting Engine
description: Direct webhook push architecture feeding real-time platform events, customer transactions, and builder status to Grok and founder phone with daily 8 AM rollups
type: strategy
---

# Real-Time Event Webhook Pipeline & Executive Reporting Engine

## Architectural Overview
Replaces timer-based polling with instant outbound event webhooks. When an operational event occurs in Revora (payment, prospect reply, build stall, approval need), the platform immediately dispatches an HMAC-signed JSON payload to Grok's webhook endpoint to alert the founder on iPhone in real time.

## Event Dispatch Catalog

### 1. Customers & Financial Life Cycle
- `customer.signup`: Name, business, trade, location, and attribution source.
- `trial.started` / `trial.ending_soon` (24h alert) / `trial.converted` / `trial.expired`.
- `payment.setup_paid`: Canonical $350 setup fee verified by Stripe webhook.
- `payment.subscription_active`: Canonical $100/mo subscription billed or renewed.
- `payment.failed` / `payment.disputed`: Failed renewals, chargebacks, or refunds requiring immediate review.
- `subscription.canceled`: Churn event with cancellation feedback.

### 2. Inbound Leads & Prospect Sales Funnel
- `scout.leads_ready`: New verified public-listing leads waiting for owner review.
- `outreach.prospect_replied`: Inbound email reply detected (highest priority; immediate push).
- `prospect.demo_viewed`: Prospect accessed their private preview at `/s/:slug`.
- `prospect.booked`: Appointment or instant quote submitted on marketing or customer site.
- `outreach.unsubscribed`: Prospect requested suppression.

### 3. Website Builder & AI Sentinel
- `builder.job_started`: Site creation or fresh rebuild kicked off.
- `builder.job_completed`: All pages, compositions, and media successfully generated and saved.
- `builder.job_stalled` / `builder.job_failed`: Step timeout or stage failure with exact diagnostic trace.
- `builder.spend_warning`: Luna token budget spend reaches 50%, 80%, or 100% of the $100 cap.
- `site.published`: Customer site successfully switched to live production.

### 4. Level 4 Founder Approvals Required
- Immediate iPhone push notification for actions requiring human authorization:
  - Batch outbound cold email sends.
  - Live site deployments and GitHub PR merges.
  - Production custom-domain assignments.
  - Stripe plan or price modifications.

### 5. Platform Health & Security Sentinels
- Dev server or production edge error spikes (500s, HTTP redirect anomalies).
- Stripe webhook processing failure or signature rejection.
- Unauthorized Agent Gateway attempts (invalid `REVORA_AGENT_API_KEY`).
- Any modification to `super_admin` roles.

## Reporting Cadence & Delivery Channels
1. **Immediate High-Priority Push**: Payments, prospect replies, build stalls, security breaches, and Level 4 approvals alert the founder's iPhone instantly.
2. **Daily 8 AM Spoken Executive Briefing**: Grok summarizes overnight traffic, new leads, trial progress, active MRR, open PRs, and system health in a concise spoken update.
3. **Weekly Growth Audit**: Comprehensive analysis of conversion leaks, SEO rank changes, client site traffic, and revenue churn.

## Security & Tenant Boundary Rules
- Webhook URLs and signing secrets are stored strictly in private environment settings (`GROK_ALERT_WEBHOOK_URL`, `GROK_WEBHOOK_SECRET`).
- Payloads exclude plaintext payment card details, unencrypted passwords, and private customer communications.
