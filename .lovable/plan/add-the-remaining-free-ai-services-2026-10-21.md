# Add the remaining free AI services

## Already connected (no work needed)
Hugging Face, OpenRouter (free models only), Cloudflare, Pollinations (key), GitHub Models, NVIDIA, Google Gemini, Groq, Cerebras, Mistral, Ollama Cloud, plus DeepSeek, Cohere, SambaNova, Together, SiliconFlow, ModelScope, Z.ai, LLM7, OVH, Kilo and your OmniRoute server.

## What gets added
1. **Pollinations pictures with no key** — free low-volume images for the AI team as a last-resort picture source, rate-limited, with a safety check before use.
2. **Your own self-hosted gateway (LiteLLM, vLLM or ComfyUI)** — same pattern as OmniRoute: off until you give a public https address, and only models you name as free are used.
3. **Web scan for more free services** — I search the web for providers with a genuine recurring free tier (no trial credits that expire, no card charges). Each candidate is checked against its own pricing page; only verified ones are added, each switched off until its key exists.
4. **Jarvis status panel** — each new service shows "ready / needs key / not set up", and I give you the sign-up link for each one that needs a key.

## What won't be added, and why
- Ollama/ComfyUI on your own computer (localhost): your live site cannot reach your computer. They work only if exposed through a public https address (step 2).
- Trial-credit services (they turn into paid) and community demo pages (unreliable, terms often forbid automated use).
- No service can promise unlimited free use; every one has limits.

## Safety kept
Spending cap, free-only mode while paid funds are out, approval before posting/sending/publishing, and the rule that a model is only used when its provider shows it as free.

## Technical details
- New adapters via `createOpenAiCompatibleAdapter`; register in `free.ts` with `FREE_ALLOWANCE`, `isFreeEligibleModel` gates, discovery filters; add keys to `provider-test-environment.ts`.
- Self-hosted gateway reuses `omniroute-url.ts` validation (public https only) and an explicit free-model allowlist secret.
- Keyless Pollinations image path added to image fallback chain behind per-day cap.
- Jarvis readiness entries in `jarvis-diagnostic-tools.server.ts`; tests per adapter for free-gating; typecheck, full test suite. One cheap models-list check per newly keyed provider, no builds or publishing.
