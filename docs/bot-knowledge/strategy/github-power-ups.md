---
name: GitHub Power-Up Catalog & Open-Source Tool Ecosystem
description: Curated high-impact GitHub tools, MCP servers, and frameworks to empower Revora's existing Lovable AI model pool without adding model churn
type: reference
---

# GitHub Power-Up Catalog & Tool Architecture

Strategic integration guide for Revora Growth Systems. The objective is not acquiring more AI models—the platform already uses Lovable's comprehensive model suite—but empowering those models with real context, browser interaction, repository intelligence, durable workflows, and independent verification.

## Core Integration Invariants
1. **Tool Ecosystem Over Model Churn**: Augment existing models with real documentation, repository inspection, browser automation, retrieval, and automated verification.
2. **Licensing & SaaS Safety**: Strictly audit licenses (e.g., AGPL-3.0 on Firecrawl core, Fair-Code on n8n) before incorporating into Revora's commercial multi-tenant SaaS.
3. **No Unrestricted In-Worker Execution**: Never run unvetted open-source code directly inside production Cloudflare workers. Isolate tools behind governed schemas, least-privilege tokens, and tenant-scoped security.
4. **Evidence Over Model Claims**: Use Playwright, Lighthouse, and axe-core to prove actual rendering, navigation, and compliance rather than accepting model self-assertions.
5. **Stack Alignment**: Prioritize packages and MCP servers compatible with TanStack Start, React 19, Tailwind CSS v4, shadcn/ui, and Lovable Cloud (Supabase Postgres + RLS).

---

## The 11 Strategic Capability Domains

### 1. Universal Connectors & Tool Discovery
- **GitHub MCP Server & Serena**: Semantic repository navigation, issue/PR management, and codebase context.
- **Context7**: Live, up-to-date documentation lookup for external programming libraries to prevent hallucinated APIs.
- **Chrome DevTools MCP & Playwright MCP**: Deep browser inspection, network log capture, DOM auditing, and interaction.
- **FastMCP & Official / Awesome MCP Servers**: Governed MCP registry patterns, standardized schema discovery, and client execution.
- **Composio & n8n MCP**: Multi-app auth gateways and workflow automation bridges.

### 2. Agent Orchestration & Durable Workflows
- **Temporal & LangGraph**: Stateful, checkpointed workflows, saga patterns, and process failure recovery for multi-stage site builds.
- **CrewAI, AutoGen & Agno**: Specialist agent role-play, structured handoffs, and multi-agent consensus.
- **DSPy & PydanticAI**: Systematic prompt/pipeline optimization and strictly typed, validated model outputs.
- **Vercel AI SDK & Mastra**: TypeScript-native model streaming and modular workflow orchestration.

### 3. Browser Automation, Web Research & Prospect Discovery
- **Playwright & Puppeteer**: Cross-browser automated verification, visual snapshots, and multi-viewport testing (320px to 2560px).
- **Browser Use & Stagehand**: Agent-directed DOM interaction, form submission, and visual navigation.
- **Crawl4AI, Scrapling & Firecrawl**: Structured web content extraction for business intake and competitor analysis.
- **SearXNG**: Privacy-preserving metasearch for verified market research without commercial lock-in.

### 4. Memory, Context Engineering & Knowledge Retrieval
- **Mem0 & Supermemory**: Persistent, personalized memory across long-lived user and workspace sessions.
- **claude-mem & OpenViking**: Context capture and retrieval tailored for engineering and coding operations.
- **Graphiti & Cognee**: Temporal knowledge graphs mapping evolving business facts, services, and relationships.
- **pgvector (in Supabase)**: Native Postgres vector similarity search without needing external cluster overhead (Milvus/Qdrant reserved for hyper-scale).
- **MarkItDown & Unstructured**: Clean Markdown/text extraction from uploaded business documents, PDFs, and spreadsheets.

### 5. Coding Agents & Repository Intelligence
- **OpenHands, Cline & Aider**: AI-assisted code editing, Git-aware diff generation, and autonomous bug-fix pipelines.
- **Repomix**: Efficient codebase packing for model consumption and context-budget optimization.
- **SWE-agent & Open SWE**: Issue-driven software engineering benchmarks and isolated reproduction environments.

### 6. Model Evaluation, Tracing & Quality Assurance
- **Langfuse & Opik**: Tracing model runs, latency, spend attribution, prompt versioning, and failure diagnosis.
- **Promptfoo**: Automated red-teaming, prompt regression testing, and objective model benchmarking across tasks.
- **DeepEval & Ragas**: Metric-driven evaluation of website copy, retrieval quality, and hallucination rates.
- **SigNoz & OpenTelemetry**: Distributed tracing across edge functions, workers, and background queues.

### 7. Security, Supply-Chain & Credential Safety
- **Trivy & Semgrep**: Dependency vulnerability scanning, static code analysis, and infrastructure-as-code audits.
- **Gitleaks**: Continuous secret scanning preventing API keys or private tokens from entering the codebase.
- **Open Policy Agent (OPA)**: Fine-grained policy enforcement for tool invocations and tenant boundary checks.

### 8. Testing, Quality & Accessibility Verification
- **Playwright & Vitest**: High-throughput unit, integration, and browser journey verification.
- **Google Lighthouse, axe-core & Pa11y**: Automated WCAG 2.2 AA accessibility, SEO, and Core Web Vitals grading.
- **Storybook & Testing Library**: Component-level regression testing ensuring UI primitive resilience.

### 9. Website Design, Visual Synthesis & Frontend Components
- **shadcn/ui & Radix UI**: High-craft, fully accessible, themeable UI primitives (Tailwind CSS v4 tokens).
- **Framer Motion & GSAP**: Fluid, conversion-enhancing animations respecting `prefers-reduced-motion`.
- **Three.js**: Lightweight 3D/depth accents for premium hero treatments without performance degradation.
- **Lucide & Recharts**: Clean vector iconography and data visualizations for customer dashboards.
- **FFmpeg & Remotion**: Programmatic media rendering, video storytelling, and asset transformation.

### 10. Business Analytics & Operational Intelligence
- **PostHog & Umami**: First-party product analytics, user funnel tracking, and privacy-first session diagnostics.
- **DuckDB**: Fast, in-process analytical queries on historical site generation and lead delivery logs.
- **Uptime Kuma**: Independent uptime and endpoint latency monitoring for customer live sites.

### 11. Reusable Skills & Plugin Architectures
- **Anthropic Skills & Claude Plugins**: Standardized prompt modules and reusable operational guidelines.
- **Prompt Engineering Guide**: Reference patterns for chain-of-thought, self-consistency, and structured outputs.
