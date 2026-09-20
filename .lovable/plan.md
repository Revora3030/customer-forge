# Follow-ups from the AI model inventory

The inventory itself is complete and reported in chat — nothing was changed. These are the fixes it justifies, smallest risk first. Approve all, or tell me which ones to keep.

## 1. Close the picture, image and voice gaps (highest value)

Today no free provider is offered for making images or turning a recording into text, so both features end in "not available" even though the Gemini free key actually serves them (`gemini-3.1-flash-image`, `gemini-3.5-transcribe`, live-verified in the catalogue).

- Add an `image` and `transcription` free model for Google only, both re-checked by the existing free-eligibility gate.
- Remove those two roles from the "no free provider serves this" list once they resolve.
- Keep the honest unsupported answer for video — nothing free serves it.

## 2. Stop safety and non-chat models being selectable

Live discovery currently accepts models that are classifiers, not writers: `@cf/meta/llama-guard-3-8b`, `nvidia/nemotron-3.5-content-safety:free`, and Cloudflare's `-lora` adapter variants. Any of them can be picked for a real request and will produce a useless answer.

- Extend the non-chat filter (already present for Groq and NVIDIA) to Cloudflare and OpenRouter: guard/safety/safeguard/prompt-guard/lora/embed/rerank.

## 3. Turn on Google model discovery

Google is the only configured provider with no live discovery, so its two models are static and will silently rot when Google retires them — exactly what happened once already.

- Add a Gemini catalogue read, filtered to free-tier-eligible flash/lite/gemma classes, cached like the others.

## 4. Widen Groq's verified pool and harden its request headers

Groq serves six chat models to this key; Revora only ever picks three. Its catalogue also refused a plain server request in this environment and answered the moment a normal client header was present, so the adapter should always send one.

- Add `allam-2-7b`, `groq/compound`, `groq/compound-mini` as discovery-eligible.
- Send an explicit `user-agent` from the shared OpenAI-compatible adapter.

## 5. Remove stale and duplicated model configuration

- NVIDIA's `coding` model duplicates its `primary`; point it at a code model from the live catalogue or drop the entry so the router moves on.
- The paid-path defaults (`gemini-2.5-pro`, `gpt-4.1`, `gpt-image-1`, `whisper-1`) cannot be verified: the OpenAI key stored on the server is rejected as invalid. Either remove the OpenAI entry or leave it and record in the admin page that it is unusable.

## Technical notes

- All work stays inside `src/lib/ai/free.ts`, `free-models.server.ts`, `providers/openai-compatible.ts` and `config.ts`. No builder path changes.
- Free-only and zero-cost defaults stay untouched; every new model id still passes `isFreeEligibleModel` before use.
- Tests to add: Google image/transcription roles resolve only from a free-eligible id; safety/lora ids rejected for Cloudflare and OpenRouter; Google discovery rejects `pro` classes; Groq pool accepts the three added chat models and still rejects whisper/orpheus/prompt-guard.
- Verification: live probe of each newly selected model through the router, plus full suite, typecheck and build.
