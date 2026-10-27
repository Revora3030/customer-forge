# Roadmap continuation: reliability batches

## Completed

1. First-build composition persistence now requires exactly one returned row with the requested section ID after both section and organization filters. Zero rows, null results, substituted identities, duplicate results and database errors block the save. Original section role and settings remain intact.
2. The materializer carries its inserted page and section inventory to completion. Tenant-scoped paginated readback compares exact page ID/slug pairs and section ID/page ID/original role triples, including multiplicity. A renderable replacement section or an equal-count wrong page cannot satisfy this gate. Missing insert identities are rejected.

No new schema, job scheduler, provider, publishing path or approval bypass was introduced.

## Evidence

- Batch 1: 8 tests passed for persistence and the existing composed-section pipeline.
- Broader affected batch: `bunx vitest run src/lib/builder src/lib/site-materialize.test.ts src/lib/site-engine.fresh-rebuild.test.ts` — 144 files, 1,079 tests passed.
- Changed-code ESLint: clean.
- Automatic preview build: latest observed entry at 17:03:09 UTC, build OK.
- Fake-database completion-readback tests cover exact tenant filters, equal-count substitution, and page/section lookup failure.
- Existing checkpoint fixture updated to return the persisted identity required by the new save contract; checkpoint resumption regressions pass.

## Limits and next work

This is offline persistence and inventory evidence, not a real customer generation, remote cancellation, visual quality, form delivery, hosted authorization or published-site check. No paid AI, production database mutations, outbound communication or publishing was performed.

Next builder investigation: unmarked partial-site skip classification, and independent comparison with the architect's intended service coverage. Current inventory proves what the materializer inserted survives through completion; it does not prove the upstream plan itself is complete.

Next approval investigation: server-backed expiring immutable approvals, atomic consumption and a unified review list across consequential endpoints. Existing localStorage approval memory remains a UI convenience only. Existing queued/running generation cancel and reload recovery must be reused; dismissing a client request must not be described as stopping remote execution.

Live generation, lead delivery and paid-provider verification await explicit authorization. Publishing remains separately gated.