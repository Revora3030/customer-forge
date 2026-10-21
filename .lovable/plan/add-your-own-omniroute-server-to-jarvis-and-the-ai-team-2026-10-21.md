# Add your own OmniRoute server to Jarvis and the AI team

OmniRoute is a self-hosted AI router: one address that forwards requests to many AI services and switches to the next one when one is down or out of quota. You will run it yourself and give Jarvis its address and key.

## What you will get
- OmniRoute becomes one more free AI service your AI team (Jarvis chat and the website builder) can use, behind the existing free services, when paid models are out of money.
- A "OmniRoute" row in the Jarvis status panel showing: not set up / set up / last check worked or failed (never shows your key).
- A read-only Jarvis check "OmniRoute models" that lists which models your server offers, so you can confirm it is working.
- It stays switched off until both the address and key are saved.

## What you need to provide (after approval)
1. Your OmniRoute server address, e.g. `https://omniroute.yourdomain.com/v1` (must be https, a public address, not localhost).
2. The access key you set in OmniRoute's dashboard.
I will ask for both through the secure form; they are never shown in chat or code.

## Safety
- Only models you mark as free on your server are used in the free lane; the existing spending cap, free-only mode, and approvals stay unchanged.
- Note: OmniRoute can forward to providers that log prompts; only configure providers on it you are comfortable with.
- No builds, publishing, emails or paid calls are run during setup.

## Technical details
- New adapter `src/lib/ai/providers/omniroute.ts` via `createOpenAiCompatibleAdapter`, base URL from `OMNIROUTE_BASE_URL` (validated https, no private hosts), key `OMNIROUTE_API_KEY`.
- Register `"omniroute"` in `FreeProviderName`, `FREE_PROVIDERS` (placed last), allowance label, and per-role model map in `src/lib/ai/free.ts`; models configurable via `OMNIROUTE_MODELS` (default `auto`, OmniRoute's own routing combo). Wire into `config.ts`/router provider lists following the kilo/ovh pattern.
- Readiness presence-only boolean in the Jarvis panel; new diagnostic `ai.omniroute.models` (GET `/models`, bounded output, timeout) in `jarvis-tool-registry`.
- Tests: adapter rejects non-https/private base URL; provider absent from chain when either secret missing; registry entry is read-only. Use the shared provider environment isolation helper.
- Request secrets `OMNIROUTE_BASE_URL`, `OMNIROUTE_API_KEY` with `add_secret`, then run the models check once.
