# Free AI setup (no Enterprise plan required)

Revora's website builder is AI-authored. This document describes the optional
free-provider lane and its budgets; it is not a creative fallback or website
generation engine.

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
| `NVIDIA_NIM_API_KEY` | NVIDIA NIM free developer allowance | Chat models only; embedders, guards, parsers and translators are never selected |
| `LLM7_API_KEY` | LLM7.io free tier | Only its non usage-based models are ever selected |
| `GOOGLE_AI_FREE_API_KEY` | Gemini API free tier | Use a key from a project with **no billing** attached |
| `MISTRAL_API_KEY` | Mistral AI Experiment plan | Free Experiment plan: mistral-small, ministral-3b, codestral (non-commercial) |
| `HUGGINGFACE_API_KEY` | Hugging Face Serverless Inference | Also accepts `HF_TOKEN`; small monthly credit for signed-in users |
| `DEEPSEEK_API_KEY` | DeepSeek API free developer tier | Rate-limited access to deepseek-chat and deepseek-coder |
| `CEREBRAS_API_KEY` | Cerebras free inference | Ultra-fast inference on Llama and Qwen models |
| `COHERE_API_KEY` | Cohere trial API | Free until rate limits reached for Command A+, North, Embed |

Half a provider's credentials simply marks that provider unavailable — it never
throws and never blocks the builder.

## Published free allowances handled

- Cloudflare Workers Free: 10,000 Neurons per day, shared across models.
- OpenRouter Free plan: free-tier models only, 50 requests per day.
- Groq free developer tier: per-minute and per-day request limits per model.
- Gemini API free tier: per-minute and per-day limits per model.
- Mistral AI Experiment plan: limited tokens/month for Mistral Small, Ministral 3B, NeMo, and Codestral.
- Hugging Face Serverless Inference: small monthly credit for signed-in users.
- DeepSeek API free developer tier: rate-limited access to deepseek-chat and deepseek-coder.
- Cerebras free inference: ultra-fast inference with rate limits.
- Cohere trial API: free until rate limits reached for Command A+, North, and Embed models.

Each provider has a per-day request budget (`FREE_AI_<PROVIDER>_DAILY_CAP`), a
3-strike circuit breaker with cooldown, and a 10-minute analysis cache with
in-flight de-duplication so identical requests are never spent twice.

## Guarantees

- Free-provider eligibility is enforced per provider/model, and `FREE_AI_ONLY`
  is an explicit cost-control lane rather than the builder's creative authority.
- The quality-first router can use configured paid specialists and free providers
  according to capability, health, routing and request policy.
- When no eligible model can answer, the creative path fails clearly or retries
  through the AI routing chain; no built-in design is substituted.

## Where to watch it

`/admin/ai` (super admin only) shows each provider's configured state, the free
models chosen per role, remaining daily budget, circuit/cooldown state, and who
served the most recent request and how it ended. No key material is shown.
