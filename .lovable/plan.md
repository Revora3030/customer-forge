# Give Jarvis and the AI builder access to Lovable's AI models

## What exists today

- Jarvis and the site builder call AI only through `src/lib/ai/router.server.ts`, which routes to the free-provider pool plus two paid providers (OpenAI, Google) keyed by Revora-owned API keys.
- Lovable's AI Gateway is explicitly excluded (`config.ts`: "Lovable's AI Gateway is not in this list and can never be reached from here"). Only the builder's quick chat replies (`gateway-chat.server.ts`) use it, outside the router, with no budget tracking.

## What we will build

1. **New Lovable provider adapter** (`src/lib/ai/providers/lovable.ts`): OpenAI-compatible chat adapter calling `https://ai.gateway.lovable.dev`, following the existing adapter pattern (shared request helpers, timeout, error classification).
2. **Register it in the paid lane** (`config.ts`): active only when `LOVABLE_API_KEY` is present in the server environment; model per role from the Lovable catalog (e.g. Gemini/Claude/GPT picks for primary, structured, vision, fast roles).
3. **Same guardrails as every paid provider**: every call goes through `reservePaidSpend`/`settlePaidSpend`, so the $100 monthly Luna cap applies; completely excluded when free-only mode (`ZERO_COST_ONLY`) is on; free providers are still tried first, Lovable only when they are unavailable.
4. **Jarvis gets it automatically**: Jarvis already goes through the same router, so no separate Jarvis wiring is needed once the router knows the provider.
5. **Telemetry**: every Lovable attempt recorded in AI telemetry like all other providers, so the AI health dashboard shows real success/failure, never assumed.

## What stays unchanged

- Free providers remain the first lane; the Lovable lane is a fallback, not a replacement.
- The $100 monthly AI spend cap, approval gates for external actions, tenant isolation, and the free-only switch all keep working.
- Image generation stays on the existing free image providers in this phase.

## Tests and verification

- Provider is registered only when the key is present (ambient-credential isolation helper, per existing AI router test rules; stub HTTP, no real calls).
- Excluded from the chain in free-only mode; included in paid mode.
- Budget reservation is taken and settled on success/failure like other paid lanes.
- Failures are classified and recorded as telemetry; a dead gateway never blocks the free lane.
- Run the focused AI router/Jarvis test files and typecheck. No live paid API call without your approval.

## Technical notes

- Server-only: key read inside handlers (`process.env.LOVABLE_API_KEY`), never shipped to the browser.
- Pricing for Lovable models is billed to your Lovable workspace credits; spend estimates in the budget ledger will be marked as estimates until real pricing is observed.
