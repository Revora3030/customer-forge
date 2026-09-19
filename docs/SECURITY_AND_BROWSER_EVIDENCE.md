# Security and browser evidence

The production hardening layer follows two principles.

1. Tenant authorization must be tested as a machine-readable matrix, including negative cross-tenant cases.
2. Browser automation must have an explicit action policy. Read-only inspection can be automated; customer-data, payment, destructive, and publication actions require a separate approval boundary.

OWASP's current multi-tenant guidance recommends deriving tenant context from server-verified identity and testing expected same-tenant success against cross-tenant denial. OWASP also recommends continuous authorization regression testing as releases evolve. citeturn3search0turn3search1

The repository therefore models authorization cases explicitly and keeps browser actions classified by risk.

No static matrix is treated as proof of live tenant isolation. The matrix is the fixture that a live integration harness should execute against the actual request role, database policies, storage paths, caches, queues, and deployed authorization middleware.
