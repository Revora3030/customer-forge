# Maximum Production Upgrade Matrix

This PR groups the requested hardening into measurable control families rather than adding disconnected features.

## Security
- tenant isolation contract
- authentication boundary
- privileged function boundary
- secret redaction
- telemetry minimization
- publication tenant safety
- share/preview threat-model evidence
- webhook/entitlement integrity

## Reliability
- release risk classification
- rollback evidence requirements
- backup/restore evidence requirements
- incident response
- generated-site publication blockers
- deterministic quality gates

## AI builder
- intent/plan quality remains deterministic
- whole-site changes remain bounded
- runtime capabilities remain evidence-gated
- visual/browser claims cannot be fabricated
- failed high-risk actions require recovery strategy
- generated content is checked before publication

## UX/accessibility/mobile
- accessibility gate
- keyboard/focus gate
- mobile layout gate
- touch-target gate
- reduced-motion gate
- simple next-step contract

## SEO/performance
- metadata gate
- route/internal-link gate
- resource integrity gate
- insecure-resource block
- performance evidence boundary
- no thin/placeholder output gate

## Analytics/conversion
- canonical activation stages
- stable event identity
- server-authoritative trial/payment stages
- no duplicate lifecycle transition
- error state is null/unavailable rather than fabricated zero

## Operations
- observable failure categories
- safe telemetry dimensions
- explicit live-environment evidence gaps
- Supabase Advisor rerun requirement
- production migration rollback documentation
