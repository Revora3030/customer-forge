# Cognitive architecture: six pillars

Foundations for turning the sequential Sol/Terra/Luna pipeline into a workforce that plans, remembers, acts safely, sees, reacts and deliberates. Every module lives in `src/lib/cognition/`, is pure (model calls, tools and stores are injected), and is covered by tests. **Nothing here spends AI budget or changes data by itself.**

| Pillar | Module | State |
| --- | --- | --- |
| 1 Brain | `plan-graph.ts` (validated task DAG, parallel levels, backtrack set), `react-loop.ts` (bounded reason/act/observe with reflexion) | Built and tested; not yet driving a live build |
| 2 Memory | `memory-recall.ts` (relevance + recency ranking, optional embeddings, bounded scratchpad) | **Live**: `memoryPromptBlock` now picks relevant memories from all 200 for the owner's latest message. Vector storage still needs an owner-approved pgvector migration and a verified embeddings call |
| 3 Hands | `approval-token.ts` (single-use, 24h, payload-bound approvals with an atomic consume) | Built and tested with an in-memory store. A database-backed store (table + RLS migration) and the mutation tools themselves are a separate approval. Existing `authorizeJarvisAction` policy stays the gate |
| 4 Senses | `vision-review.ts` (strict critique parser; measured P0s and unmeasured viewports always beat a vision opinion) | Built and tested; no vision model call is wired |
| 5 Autopilot | `event-rules.ts` (events to proposal-only routine work, cooldowns, per-pass cap) | Built and tested; no event source emits into it yet |
| 6 Multi-agent | `deliberation.ts` (proposer, critics, quorum, round cap, always `needsOwner`) | Built and tested with fake agents; no live agents |

## What is deliberately not done
- No pgvector migration, embeddings call, mutation tool, vision-model call, event emitter or live agent: each spends budget, writes data or needs a schema change the owner approves.
- Headless-browser agent control and a universal MCP bridge are not built. Browser QA already measures rendered sites in CI; an agent-driven browser is a separate security review.
- Approval remains a safety gate only. Creative work stays AI-authored and is not routed through owner approval.

## Wiring order when approved
1. Apply the approvals table migration, back `ApprovalStore` with it, and require `consumeApproval` in each mutation executor.
2. Verify the Lovable embeddings request shape and price, add the pgvector migration, and pass `embeddings` to `recallMemories`.
3. Emit `build.failed`, `ci.failed` and `lead.unanswered` events and feed `planEventResponses` into the existing routines pass.
4. Run `deliberate` for high-stakes proposals with real critics under the shared Luna budget.
