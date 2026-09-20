# Free AI setup (no Enterprise plan required)

Revora's builder never needs a paid AI plan. The deterministic native engine
answers everything it safely can; free external providers are an optional
enhancement on top.

## Where credentials live

Provider credentials are stored as **server-side project secrets**, which are
injected into the server runtime as environment variables and read only inside
`src/lib/ai/*` at call time.

They are never:

- committed to the repository or written to `.env` files in Git,
- exposed through a `VITE_` variable or any client bundle,
- stored in the database, browser storage, prompts, or logs.

Two ways to set them, both available on the Business plan:

1. **Paste the value in chat and ask Revora's assistant to store it.** The
   assistant writes the secret directly through the platform secret API; no
   Project Settings access and no Enterprise plan is needed. This is the
   recommended path if Project Settings → Secrets is gated for your plan.
2. **Project Settings → Secrets**, when that screen is available to you.

Tests enforce the boundary (`src/lib/ai/free-runtime.test.ts`).

## Secret names

| Secret | Provider | Notes |
| --- | --- | --- |
| `CLOUDFLARE_AI_API_TOKEN` | Cloudflare Workers AI | Needs an account-scoped Workers AI token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Workers AI | Required alongside the token |
| `OPENROUTER_API_KEY` | OpenRouter free models | Only `:free` model ids are ever selected |
| `GROQ_API_KEY` | Groq free developer tier | Chat models only; speech and safety models are never selected |
| `GOOGLE_AI_FREE_API_KEY` | Gemini API free tier | Use a key from a project with **no billing** attached |

Half a provider's credentials simply marks that provider unavailable — it never
throws and never blocks the builder.

## Published free allowances handled

- Cloudflare Workers Free: 10,000 Neurons per day, shared across models.
- OpenRouter Free plan: free-tier models only, 50 requests per day.
- Groq free developer tier: per-minute and per-day request limits per model.
- Gemini API free tier: per-minute and per-day limits per model.

Each provider has a per-day request budget (`FREE_AI_<PROVIDER>_DAILY_CAP`), a
3-strike circuit breaker with cooldown, and a 10-minute analysis cache with
in-flight de-duplication so identical requests are never spent twice.

## Guarantees

- Free-only mode is the default: a paid model id is rejected by pattern, and a
  paid provider account is only reachable when an operator explicitly turns off
  **both** `FREE_AI_ONLY` and `ZERO_AI_COST_MODE`.
- Failover order is free provider → next free provider → deterministic engine,
  triggered by missing credentials, rate limits, quota exhaustion, timeouts,
  provider 5xx, malformed structured output, an open circuit, or a spent budget.
- When nothing free can answer, the call fails with a clear, non-retryable
  explanation and the deterministic builder takes over — nothing is blocked.

## Where to watch it

`/admin/ai` (super admin only) shows each provider's configured state, the free
models chosen per role, remaining daily budget, circuit/cooldown state, and who
served the most recent request and how it ended. No key material is shown.
