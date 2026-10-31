---
name: Multi-Agent Concurrent PR & Cross-Account Automation Engine
description: Multi-model computer orchestration coordinating Grok, Claude Code, ChatGPT, and Perplexity across isolated branches to submit verified PRs concurrently
type: strategy
---

# Multi-Agent Concurrent PR & Cross-Account Automation Engine

## Architectural Core
- **Unified Orchestration**: Grok acts as the executive voice coordinator and dispatch engine from iPhone and cloud computer, delegating domain-specific engineering and research tasks.
- **Cross-Account Concurrency**: Grok, Claude Code CLI, ChatGPT / OpenAI runners, Perplexity API, and Lovable AI collaborate simultaneously on platform operations without collision.
- **CLI/API Native Execution**: Replaces fragile browser GUI logins with official CLI (`gh`, `claude`) and token-authenticated API endpoints, preventing session expiration and 2FA lockouts.

## Concurrent Task-Branch Model
To eliminate merge collisions and file overwrites during simultaneous model operations:
1. **Per-Model Isolated Branches**: Each agent checks out a dedicated task branch (`agent/<model>/<feature-slug>`), e.g., `agent/claude-builder-ux`, `agent/gpt-seo-schemas`.
2. **Claude Code Specialization**: High-complexity TypeScript refactoring, backend functions, responsive component architecture, and Playwright verification.
3. **ChatGPT / OpenAI Specialization**: High-throughput conversion copywriting, industry playbook expansions, structured FAQ JSON-LD schemas, and documentation.
4. **Perplexity Specialization**: Real-time web reconnaissance, competitor pricing audits, directory research, and grounded citation verification.
5. **Lovable AI Specialization**: Visual builder execution, live preview state synchronization (`lovable-sync` branch), and design token styling.

## Mandatory Pre-PR Verification Pipeline
Before opening any Pull Request via `gh pr create`:
1. **Local Test Execution**: The operating model must run targeted Vitest suites and TypeScript checks (`npx tsc --noEmit`).
2. **Real Output Attachment**: The PR body must include the actual terminal test results and files modified. Fabricated test assertions are strictly forbidden.
3. **CI Pipeline Gate**: Automated GitHub Actions run full lint, test, and typecheck passes.
4. **Founder Sign-Off**: Production deployment and merges to protected branches remain gated behind human sign-off.

## Security & Invariant Guardrails
- **Credential Protection**: Account keys (`GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `REVORA_AGENT_API_KEY`) reside exclusively in local `.env` and secure project settings, never in repository code or chat.
- **Truth & Pricing Invariants**: The canonical offer ($350 setup, first month free, $100/mo, 3-day trial) and RLS tenant boundaries are immutable across all agent actions.
