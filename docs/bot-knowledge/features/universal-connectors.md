---
name: Universal Connector & Plugin System
description: Full backend-driven connector registry, dynamic tool discovery, and execution gateway inside Jarvis admin chat
type: feature
---

# Universal Connector & Plugin System

Owner requirement for the Level 5 Jarvis Command Center:

## 1. Complete Backend Integration (No Stubs or UI-Only Buttons)
- Real end-to-end integrations with external services: GitHub, Lovable, OpenAI, Google, Cloudflare, Supabase, n8n, and compatible MCP (Model Context Protocol) / REST servers.
- Must not be a shallow UI-only button or mocked action: credentials securely stored server-side with encryption and RLS; zero client storage of secret tokens.

## 2. Dynamic Tool Discovery & Registration
- Once the owner authorizes a connector (via OAuth or server credentials), Jarvis automatically discovers and registers all supported tools and capabilities.
- Discovered tools are dynamically mapped into Jarvis's execution toolset across eligible specialized agents (Engineering, Growth, Operations) without requiring manual per-tool wiring.

## 3. Autonomous Execution Gateway
- Grants Jarvis maximum read/write authority explicitly authorized by the founder.
- Autonomous execution of routine operations: building private demo sites, diagnosing/fixing code, running automated tests, preparing PRs, and managing business/CRM workflows.
- Persistent background jobs with keep-alives and checkpointing to survive edge timeouts.
- Comprehensive audit logs (`jarvis_run_events`) recording execution history, parameters, cost, and verified outcomes.

## 4. Non-Negotiable Invariants
- Live custom-domain publishing, production releases, and financial/billing alterations stay under founder authority.
- Strict multi-tenant isolation and Supabase Row Level Security enforced.
- Absolute preservation of the canonical offer ($350 setup, 1st month free, $100/mo, 3-day trial; waiver strictly revorabusiness0@gmail.com).
- Proof requirement: do not claim completion without testing real end-to-end connector operations initiated directly from Jarvis chat.
