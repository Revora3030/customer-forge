---
name: Platform owner setup-fee waiver
description: Revora's own workspace (org e0c08aa2-a95f-4049-8ce0-ffbb869dae10) publishes without the $750 setup payment — owner decision 2026-09-25
type: feature
---
Owner asked that only his own account (revorabusiness0@gmail.com) use the live platform free. Implemented as a fixed org-id check in src/lib/platform-owner.ts (not an editable column), used by access-state, entitlement.server and production.functions. It is not counted as a paid customer. Never extend to other orgs.
