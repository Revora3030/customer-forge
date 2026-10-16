# Jarvis Customer Acquisition Autopilot — safe rollout

## Objective
Help Revora Growth Systems acquire more qualified leads and convert them into paying customers by measuring the funnel, finding conversion blockers, prioritizing leads, preparing personalized audits and approved follow-ups, and verifying the checkout path. No code can guarantee paying customers.

## Added deterministic foundations
- Lead scoring uses only supplied signals and records the reasons behind the score.
- Suppression wins: opt-outs, withdrawn consent, complaints, delivery bounces, and existing customers are not treated as prospects.
- Follow-up authorization fails closed unless explicit channel-appropriate consent, approved/versioned copy, a runtime-verified provider, verified tenant/sender scope, allowed send window, idempotency, and rolling send budget are all valid.
- Daily plans are blocked when the requested budget exceeds the owner-approved cap. A plan never itself authorizes spending.
- No bulk cold outreach, fake urgency, fabricated case studies, guaranteed results, or unverified claims.
- Payment checks are read-only. The planner does not create charges, appointments, publish websites, or send messages.

## Recommended daily loop
1. Verify analytics and lead-capture events. Label each result observed, configured, failed, or unknown.
2. Run bounded audits on Revora's own acquisition site and only those client sites for which access is authorized.
3. Prioritize inbound leads by expressed intent, service-area fit, verified budget fit, recency, and relevant website issues. Keep explanations with each score.
4. Prepare one useful, truthful, personalized audit and next-step recommendation for a qualified lead.
5. Queue a follow-up only when explicit consent and the approved template/channel requirements pass. If any signal is unknown, suppress automation and request review.
6. Recommend conversion experiments; create draft variants only. Human approval is required before publishing.
7. Verify the checkout/entitlement flow in test mode and measure the outcome. Never infer paid conversion from clicks or an unverified webhook.
8. Report daily: qualified leads, contact-consent coverage, appointments, verified paid conversions, funnel drop-offs, delivery failures, spend, and confidence/unknowns.

## Production gates still required
This policy module is not a live acquisition executor. Before unattended execution, implement and verify:
- Tenant-scoped lead source adapters and explicit consent evidence with timestamp, source, channel, policy version, and opt-out suppression.
- Provider-specific sending adapters with webhook signature verification, idempotency keys, rate limits, unsubscribe handling, quiet hours, bounce/complaint suppression, and a platform kill switch.
- Approved template versioning and preview/approval UI; no model-generated message may bypass it.
- Owner-approved daily spending cap, paid-provider budget controls, and a hard no-spend default.
- Durable campaign/run/action/audit records, retry backoff, dead-letter handling, concurrency leases, and independent postcondition checks.
- Sandbox checkout tests, attribution event contracts, privacy review, and end-to-end tests.
- Explicit tenant boundaries: platform prospecting and customer-tenant marketing are separate; never reuse one tenant's leads, data, or sender identity for another.

## Suggested default autonomy
- Autonomously: aggregate analytics, public-site QA, lead scoring, deduplication proposals, and draft preparation.
- Approval-required: publishing experiments, sending first-time templates, changing offers, enabling campaigns, changing audience or cadence, and any paid provider spend.
- Never unattended: cold bulk messaging, charges/refunds, destructive data changes, access-policy changes, or publication to customer production sites.

## Success criteria
Measure verified funnel stages, not vanity metrics: qualified inbound lead, consented contact, booked appointment, completed proposal, and confirmed paid conversion from trusted billing evidence. Report sample size and attribution limits. Do not claim revenue caused by Jarvis unless a defensible attribution method supports it.

## Demo site builder (businesses with no website)
Super-admins can ask Jarvis to build a private demo website for a real business that has no website yet (`src/lib/jarvis-demo-site*.ts`, panel `ProspectDemoBuilder`).
- Input is only operator-supplied public facts: name, category, city, optional state/phone/email/description, and real services. Validation requires real services or a real description; nothing is invented.
- Jarvis creates an `is_demo` workspace owned by the requesting super-admin (excluded from customer funnel numbers and never billed), queues the normal site-engine first build, and creates a 30-day private `/p/:token` preview link. The marker lives in `website_settings.generation.prospectDemo`.
- The build uses the same worker, free model pool, fact gates, creative authority and safety reviews as customer builds. The draft is never published and nothing is sent.
- Claiming: an unclaimed demo's `/p/:token` preview shows a floating claim bar with a phone-size view. `/get-started?claim=` pre-fills the business details; after sign-up, `claim_prospect_demo_server` (service role only, single use) makes the claimant the only owner, clears `is_demo`, starts the standard full-access trial, revokes old preview links and opens the builder. An account that already has a workspace cannot claim.
- Outreach: when a demo finishes, Jarvis writes the email (free AI pool, preview link required, sender name, physical address and opt-out line appended) and the operator sends it from their own mail app. Nothing is sent automatically: the app's only sender is Lovable's transactional email on the domain that also carries customers' lead alerts, so cold sales email must not go through it. Automatic sending needs a dedicated outreach provider and domain, plus unsubscribe handling, suppression, daily caps and a kill switch.
- Prospect finder: "Find businesses without a website" in the demo builder (and Jarvis's `prospects.find` chat action) runs one Google Places text search for a niche and city. It keeps open businesses whose listing has no website or only a social/directory page, and skips ones that already have a demo. Each result can become a demo with one tap, using only listing facts (name, category, city, state, phone). Searches use `GOOGLE_PLACES_API_KEY` when set (billed to the owner's Google Cloud project), else the Lovable Google Maps connector. They are capped at 40 a day and audit-logged as `jarvis.prospects.search`.
