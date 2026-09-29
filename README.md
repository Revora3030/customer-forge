# Customer Forge

**Revora Growth Systems** — AI-powered website builder platform with 12-provider free AI orchestration, multi-tenant architecture, and production-grade quality gates.

## Stack

- **Framework**: TanStack Start v1, React 19
- **Styling**: Tailwind CSS v4, shadcn/ui component library
- **Backend**: Supabase (auth, PostgreSQL, RLS, real-time)
- **AI**: 12-provider free model chain with live discovery, ensemble builds, and quality-first routing
- **Payments**: Stripe (sandbox + live)
- **CI/CD**: 6 GitHub workflows (quality gate, security gate, CodeQL, browser QA, AI authority validation, Codacy)

## Quick Start

```bash
npm install
npm run dev
```

## Quality Pipeline

```bash
npm run quality          # typecheck + lint + security audit + repo audit + tests + build
npm run production:readiness
npm run production:controls
npm run builder:ultimate-audit
```

## AI Provider Chain

12 free-tier AI providers are wired with live model discovery, free-eligibility enforcement, and circuit breakers:

| Provider | Endpoint | Role |
|---|---|---|
| OpenAI | api.openai.com | Shared-traffic daily allowance |
| Cloudflare | api.cloudflare.com | Workers AI (text + image) |
| Groq | api.groq.com | Ultra-fast inference |
| NVIDIA | integrate.api.nvidia.com | NIM models |
| LLM7 | api.llm7.io | Free chat models |
| OpenRouter | openrouter.ai | Free model pool |
| Google | generativelanguage.googleapis.com | Gemini free tier |
| Mistral | api.mistral.ai | Experiment plan |
| Hugging Face | router.huggingface.co | Serverless inference |
| DeepSeek | api.deepseek.com | Free developer tier |
| Cerebras | api.cerebras.ai | Ultra-fast Llama/Qwen |
| Cohere | api.cohere.com | Trial API (Command, North, Aya) |

Each provider supports both `PROVIDER_API_KEY` and proper-case (`Provider`) secret name variants.

## Project Structure

```
src/
  routes/          95 routes (admin, app, public, API)
  components/      180 components (9 categories)
  lib/             388 modules (AI, security, media, builder, quality, ops)
  lib/ai/          AI orchestration (router, ensemble, 12 providers, free chain)
  lib/security/    Authorization, browser policy, AI prompt security
  lib/builder/     Site builder subsystem (tree, memory, history, preview)
supabase/          147 database migrations
scripts/           Audit and verification scripts
.github/workflows/ 6 CI workflows
```

## Deployment

This project is connected to [Lovable](https://lovable.dev). PRs should target the `lovable-sync` branch. Do not rewrite published git history.

## License

Private. Revora Growth Systems.
