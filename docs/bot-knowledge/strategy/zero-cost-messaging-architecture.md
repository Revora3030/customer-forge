---
name: zero-cost-messaging-architecture
description: Realistic multi-channel messaging architecture, deliverability limits, zero-cost delivery vs permission, and 3-lane dispatch engine for Revora
type: strategy
---

# Zero-Cost Messaging Architecture & Multi-Channel Delivery

## Core Principle
Free delivery, free AI drafting, and legal/platform permission to contact someone are three separate constraints. AI models can prepare drafts at zero marginal messaging cost, but delivery channels enforce hard technical, volume, and anti-abuse limits.

## Channel Reality Matrix

| Channel | Free sending? | What AI team can do | Main limits & compliance |
|---|---|---|---|
| **Gmail** | Yes, within account limits | Prepare and send individually reviewed emails via authorized integration | Google personal limit ~500 emails/day; Google Workspace varies. Not a cold-blast engine; subject to spam score & reputation. |
| **Brevo email API** | Yes, up to 300 emails/day on free plan | Send requested audit reports, welcome sequences, opt-in notifications | Explicitly prohibits scraped/third-party lists. Requires opt-in consent and unsubscription headers. |
| **WhatsApp Business** | Limited free allowances (service/utility tiers) | Inbound customer support response via authorized WhatsApp integration | Subject to 24h conversation windows and Meta message-type charges; not free for outbound prospecting blasts. |
| **Revora In-App Inbox** | Yes (zero external delivery fee) | Real-time notifications, thread history, Jarvis conversations | Internal to Revora database/web app; zero external carrier/provider tolls. |
| **SMS / MMS** | No (not a zero-cost channel) | Draft messages only; send only via configured paid provider (e.g., Twilio) with user consent | Carrier pass-through fees, A2P 10DLC compliance, explicit TCPA opt-in requirements. |
| **Social DMs** | Platform-dependent, not guaranteed free | Prepare drafts for connected accounts | Platform API restrictions, anti-automation rules, rate-limits. |

## Brevo vs Scraping Prohibition
- Brevo free tier (300/day) is strictly reserved for:
  1. Requested free audits and reports
  2. Opt-in newsletter or trial subscribers
  3. System transactional notifications & welcome emails
- Brevo terms strictly ban purchased, borrowed, or scraped contact lists. Scraped prospect outreach must never be routed through Brevo.

## Commercial Outreach Compliance (CAN-SPAM & Global)
- US CAN-SPAM Act requires truthful headers, accurate subject lines, valid physical postal address, and clear opt-out mechanism for all commercial messages (B2B is not exempt).
- Publicly accessible contact details do not waive provider anti-spam terms or deliverability filtering.

## The 3-Lane Architecture for REVORA

1. **Lane 1: Requested Reports & Opt-in Campaigns**
   - Channel: Free Brevo / transactional email API allowance (up to 300/day).
   - Trigger: Website visitor requests free speed audit, SEO report, or starts 3-day trial.
   - Handling: Automated suppression list, 1-click unsubscribe, strict SPF/DKIM/DMARC alignment.

2. **Lane 2: Small, Individually Reviewed Business Correspondence**
   - Channel: Authorized Google/Gmail OAuth connection.
   - Volume: Low-volume, hyper-targeted correspondence.
   - Guardrail: Mandatory owner review card showing resolved recipient, exact body, and evidence before dispatch.

3. **Lane 3: In-App Revora Portal Inbox**
   - Channel: Internal database notifications and chat threads.
   - Scope: Ongoing client communication, build reviews, growth milestone alerts, Jarvis advice.
   - Cost: Zero external carrier or delivery API fees.

## Standard Message Dispatch Lifecycle
```text
Eligible Recipient
  → AI prepares tailored draft & subject line
  → Recipient eligibility, duplicate & suppression check
  → Required Owner Approval Card
  → Dispatch via authorized provider (Lane 1, 2, or 3)
  → Audit record logged in database
  → Process inbound replies, delivery bounces, and opt-outs
```
