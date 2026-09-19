# Customer Forge — 246 Upgrade Matrix

This release adds exactly 246 named builder capabilities in one versioned operating matrix.

The matrix is intentionally evidence-aware. Deterministic capabilities are marked active; browser/production capabilities are explicit runtime or environment evidence gates until their real execution layer supplies proof.

The existing AgentAction executor, action caps, elite plan guard, auth, Supabase/RLS, Stripe, tenancy, publishing and Cloudflare boundaries remain authoritative.

Operating loop:

UNDERSTAND → INSPECT → PLAN → EXECUTE → VERIFY → REPAIR → RE-VERIFY → RECOVER → PUBLISH → MONITOR

No capability is allowed to manufacture business facts or claim runtime proof that was not actually collected.
