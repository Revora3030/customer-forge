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
