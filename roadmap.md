# Roadmap — Five-phase blocker elimination

- [x] Phase 1 inventory (first pass): design-fingerprint and creative-authority are now read-only data contracts that hold AI-written values; no style pools remain. site-style, site-effects, and visual-composition still translate stored values into styles; their defaults still need a check for opinionated values.
- [x] Phase 4 core: visual evidence is tied to the exact site version (revision_hash stamped by the database); publish requires a passing latest check of the current version.
- [ ] Phase 2: audit site-style/site-effects defaults so each applies only when a field is missing; add round-trip survival tests.
- [ ] Phase 3: extend the composition vocabulary (grid areas, per-breakpoint overrides, declarative motion).
- [ ] Phase 4: automatic three-size capture in the builder, plus a Sol/Terra screenshot critique and repair loop.
- [ ] Phase 5: second-industry end-to-end build, security scan, final A–N report.
