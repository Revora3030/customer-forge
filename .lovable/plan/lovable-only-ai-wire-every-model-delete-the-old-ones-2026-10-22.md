# Lovable-only AI: wire every model, delete the old ones

## Goal
Jarvis and the AI builder use only Lovable AI models. All old provider code, keys, settings, panels and saved model rows are removed.

## Phase 1 — Wire in every Lovable model (by job)
- Chat/design/writing/review/coding: all current chat models (Claude Opus 5.5/5, Fable 5.1, Sonnet 5, Haiku 4.5; GPT-6.1 Sol, 6 Astra/Sol/Luna, 5.6, 5.5, 5.4; Gemini 4 Argon, 3.8/3.1/3 Flash, 3.1 Pro). Roles keep their current lead model.
- Pictures: GPT Image 2.5 Sunburst/Flare, GPT Image 2, Gemini 3 Pro Image, Gemini 3.1 Flash Lite Image.
- Voice: Gemini text-to-speech for Jarvis's spoken replies (ElevenLabs stays as an option only if you keep that key).
- Transcription: GPT Transcribe.
- Video (builder hero clips, only on request): Gemini Omni 1.1 Flash.
- Every call stays inside the existing monthly spending cap.

## Phase 2 — Delete the old models from the code
- Remove 28 old provider adapters (Groq, NVIDIA, Cerebras, Cloudflare AI, Cohere, DeepSeek, Mistral, Hugging Face, Pollinations, OpenRouter, Together, SiliconFlow, OVH, Kilo, OpenCode, OmniRoute, self-hosted, Ollama, LLM7, SambaNova, GitHub, ModelScope, Z.ai, direct OpenAI/Google).
- Remove the free lane, Hall-of-Fame free squad, free-model discovery, free reputation and their ~25 tests.
- Simplify the router so it only knows the Lovable provider; builder thinker calls the router directly.
- Cloudflare hosting/deployment code is untouched (only Cloudflare AI is removed).

## Phase 3 — Delete everywhere else
- Delete the 597 retired model rows and old provider health/circuit rows.
- Delete leftover old settings/keys (FREE_AI_ENABLED, OVH_AI_FREE, KILO_FREE, OMNIROUTE_*, SELFHOSTED_*, etc.).
- Remove old-provider sections from the AI health page, Jarvis diagnostics and model status.
- Update project notes and memory to "Lovable AI only".

## Safety
- No publishing, emails, posts or builds. One tiny live check per model type (a few cents total) to prove each one answers — only with your OK.
- Full automated test run, typecheck and build before reporting done.

## Note
If Lovable is down or the cap is hit, jobs wait — there is no backup anymore.
