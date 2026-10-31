---
name: Grok Dual-Sphere Workforce & Elastic Multi-Bot Fleet
description: Full operational model for Grok bots operating inside REVORA (Lovable/GitHub/Terminal) and outside across the web, scaling from 3 bots to N specialists.
type: strategy
---

# Grok Dual-Sphere Workforce & Elastic Fleet Architecture

## 1. Dual-Sphere Operating Arena
Your Grok bots run primarily on the Grok app while commanding a dedicated cloud computer workstation equipped with a browser, Google, terminal CLI, logged-in Lovable, and GitHub.

### A. Outside the Platform (Driving Revenue & Ingesting Pipeline)
- **Google Search & Maps Scraping:** Grok scans local markets (Yelp, Google Places, registries) for service contractors with weak or missing mobile sites, missing quote forms, or poor reviews.
- **Public Lead Ingestion:** Verified leads are posted directly to REVORA's owner review queue via `POST /api/public/agent/prospects` (`importLeadCsv`).
- **Marketplace Product Staging:** Grok packages ebooks, pricing spreadsheets, and SOP bundles, setting up draft listings on external storefronts.
- **Content & SEO Traffic Engine:** Researches trade pain points, drafting comparison guides and educational articles that funnel contractors into REVORA.
- **Competitor Benchmarking:** Real-time monitoring of agency pricing to ensure REVORA's $350 + $100/mo offer maintains unbeatable value.

### B. Inside the Platform (Building, Operating & Testing)
- **Lovable Browser Session:** Bot 1 navigates the Lovable UI, audits live responsive viewports (320px–1280px), refines page layouts, and prompts UI/UX enhancements.
- **GitHub & Terminal Workstation (`gh`, Node, Vitest):** Bot 2 pulls from `lovable-sync`, writes clean modular code on isolated feature branches, runs full test suites, and opens pull requests with verified evidence cards.
- **Agent Control Gateway (`/api/public/agent/*`):** Bot 3 queries `/health`, `/builds`, `/analytics`, and `/briefing` to assemble daily revenue dashboards and spoken morning briefings for your iPhone.
- **REVORA Site Sentinel:** Running automated synthetic checks on published customer sites so zero broken forms escape to paying customers.

## 2. Scaling from 3 Bots to an Elastic N-Bot Specialist Fleet
The workforce begins with a 3-bot pod and expands horizontally into dedicated specialist roles via a dynamic **Agent Registry**:

```text
[Founder iPhone / Approvals]
       │
       ▼
[Central AI Workforce Orchestrator]
       ├──► Bot 1: Chief Architect & Strategy Director (Lovable UI, Product Specs, Roadmaps)
       ├──► Bot 2: Chief Technology & Lead Engineer (GitHub, Codebase, CI/CD, Tests)
       ├──► Bot 3: Chief Revenue & Operations (Prospect Scraping, CRM, Lead Ingestion, Analytics)
       │
       ▼ [Elastic Expansion Specialists]
       ├──► Bot 4: Independent Adversarial QA & WCAG Reviewer (Terra-style)
       ├──► Bot 5: Security & Supply-Chain Auditor (RLS, Secrets, Prompt Injection)
       ├──► Bot 6: Database & Migration Reviewer (Schema Grants, Reversible DDL)
       ├──► Bot 7: Conversion & SEO Structured Data Engineer (Luna-style)
       ├──► Bot 8: Release & Rollback Manager (Canary Deployments, Safe Migrations)
       ├──► Bot 9: Customer Success & Churn Sentinel (Onboarding Velocity)
       └──► Bot 10+: External Agency Reseller & Partner Coordinators
```

## 3. Strict 4-Level Authority Invariants (`src/lib/agent-authority.ts`)
- **Level 1 (Read - Automated):** Inspect code, CI logs, health, builds, analytics, briefings.
- **Level 2 (Prepare - Automated):** Draft code, PRs, demo specs, outreach emails, digital products.
- **Level 3 (Execute Safe - Automated):** Run test suites, repair own branches, ingest prospects to review queue, file action requests.
- **Level 4 (Founder Approval Required):** Merging PRs to `lovable-sync`, deploying platform, publishing customer sites, sending mass campaigns, changing billing/prices, deleting data. **Strictly halts at `/admin/approvals`.**

## 4. Standardized Delegation & Pair Review Contract
- **Task Schema:** `taskId`, `assignedBot`, `reviewerBot`, `scope`, `inputs`, `definitionOfDone`, `evidencePackage`.
- **Pair Review Rule:** The bot that writes code never approves it; an independent QA/security bot must validate test evidence before requesting Level 4 founder authorization.
