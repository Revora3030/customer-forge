---
name: jarvis-inbound-reply-engine
description: Autonomous inbound email reply engine, message classification, thread matching, sequence cancellation, and staged rollout guardrails for Jarvis
type: feature
---

# Jarvis Inbound Email Reply Engine

## Core Architecture
An autonomous inbound reply pipeline that detects incoming prospect emails, reconciles them with existing threads/leads, halts active outreach cadences, classifies intent, drafts grounded responses using verified facts, and dispatches responses either through strict approval queues (Stage 1) or bounded auto-send rules (Stage 2).

```text
Incoming Email
  → Ingestion (5-min polling or Gmail Pub/Sub push watch)
  → Thread, Mailbox & Lead Reconciliation (matching References, In-Reply-To, threadId)
  → Immediate Follow-Up Freeze (cancels pending automated touchpoints)
  → Safety & Policy Filter (opt-out suppression, untrusted prompt injection defense)
  → Intent Classification & Fact Retrieval (canonical pricing, verified preview URLs)
  → Response Synthesis
  → Policy Gate: Auto-send (bounded facts) OR Approval Queue (negotiations/refunds/complex)
  → Audit Log & CRM State Update
```

## Inbound Message Classification & Action Matrix

| Inbound Intent | Automatic Platform Action | Response & Delivery Policy |
|---|---|---|
| **Opt-Out / "Stop emailing"** | Immediate suppression of address; cancel all future sequences | Zero marketing reply; polite 1-sentence confirmation if required. |
| **Information Request** | Retrieve verified capability/service facts | Eligible for bounded informational response. |
| **Pricing Inquiry** | Retrieve canonical offer ($350 setup, 1st month free, $100/mo) | Send verified terms only; never hallucinate rates. |
| **Preview Request** | Verify tenant ownership and preview generation status | Deliver authenticated `/s/:slug` preview link only. |
| **Warm Interest** | Mark lead as `Contacted`/`Interested`; halt cold cadence | Transition to onboarding or booking pathway. |
| **Meeting Request** | Provide approved calendar booking URL | Never invent live appointment confirmation without calendar lock. |
| **Discount / Negotiation** | Record note in lead CRM | Escalate to Owner Approval Queue; zero autonomous discounting. |
| **Refund / Financial** | Flag high-priority alert to founder | Zero autonomous financial operations. |
| **Complaints / Legal** | Freeze sequence; create priority escalation ticket | Owner manual intervention only. |
| **Out-of-Office / Bounce** | Mark bounce/temporary delay; pause sequence | Never trigger an automated loop or auto-reply. |
| **Ambiguous / Untrusted** | Treat text strictly as unparsed data (anti-injection) | Escalate to queue for human review. |

## Threading & Anti-Collision Safeguards
1. **Compliant RFC 2822 Headers**: Always preserve `threadId`, `References`, and `In-Reply-To` headers rather than loose subject matching.
2. **Single-Message Lock**: Acquire a concurrency lock per incoming message ID to prevent duplicate concurrent processing.
3. **Loop Suppression**: Hard cap of 2 consecutive automated messages per thread without human interaction.
4. **Follow-Up Cancellation**: An inbound reply automatically disarms pending scheduled follow-ups so prospects never receive "Just checking in" after responding.

## 3-Stage Phased Implementation

- **Stage 1 (Inbound Assistant & Follow-up Breaker)**: Reads, classifies, cancels queued emails, updates lead stage, generates drafts into `approval_queue`. Zero autonomous sending.
- **Stage 2 (Bounded Auto-Responses)**: Permits instant automatic sending strictly for verified informational requests, canonical pricing questions, and verified preview links.
- **Stage 3 (Full Dialog Automation)**: Multi-turn qualification with strict cost, loop dampening, and human takeover mechanisms.
