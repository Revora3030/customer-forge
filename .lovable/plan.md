# Make the AI builder and Jarvis actually use the Lovable models

## What the last hour of records shows
- Lovable models answered only 16 calls, all with one model (GPT-6.1 Sol). The other 14 models were never reached.
- About 250 calls went to free providers (Mistral, Cerebras, Cohere, NVIDIA, Groq, Kilo, OVH, Pollinations, Cloudflare).
- 26 calls failed on the old direct OpenAI key (GPT-5.6 Terra, out of quota), and 3 failed on the old direct Google key (out of quota).
- Today's paid spend is about $1.00 of the $20 daily cap, so the cap is not what is blocking the paid models.

## Why the free models still show up
1. The review panel sends conversion, SEO, accessibility, mobile and completeness checks to the free squad first. Your screenshots show these reviews ("asking ovh", "asking pollinations").
2. The pre-design advisory pass sends every check to the free squad first.
3. Some steps still call the old direct OpenAI and Google keys before trying Lovable. Those keys are out of money, so the work falls through to free models.
4. Each step tries its model list in a fixed order, so the first model nearly always answers and the rest of the list never runs.
5. Demo sites can be limited to free models by a setting. This may be why Elite Mobile Detail is affected; step 1 below confirms it.

## Changes
1. **Review panel and advisory pass:** run on Lovable models first and fall back to the free squad only when paid capacity is unavailable. To keep reviews independent, give each review area its own Lovable model. For example: Claude Sonnet 5 checks the facts, Gemini 4 Argon checks SEO, GPT-6 Sol checks conversion, Claude Haiku checks accessibility and Gemini 3.8 Flash checks mobile.
2. **Remove the old direct keys from the chain:** while Lovable is available, every paid step goes through it. The direct OpenAI and Google keys move to the back as a last resort and stay resting while they report being out of quota.
3. **Spread work across all 15 models:** each job gets the models that suit it. Design and writing go to GPT-6.1 Sol, Claude Opus 5.5 and Claude Fable. Coding and layouts go to GPT-6.1 Sol, Claude Opus 5.5 and Gemini 4 Argon. Small quick jobs go to Gemini Flash Lite, GPT-5.4 mini and Claude Haiku. Reviews use a different model from the one that wrote the work.
4. **Demo sites:** confirm whether Elite Mobile Detail is blocked by the free-only demo setting. If it is, allow Lovable models there within the same caps.
5. **"Load failed" during "checking the plan":** keep the step's progress when one reviewer drops. Show the real reason and a Retry button instead of failing the whole request.
6. **Proof:** a new owner-only "Models used" section in the Jarvis AI health panel. For each Lovable model it shows recorded calls, successes, failures and cost over the last 24 hours, so unused models are visible.

## What stays the same
- The $100/month cap, the daily paid cap, approvals, the 5-builds-per-day limit and the safety rules.
- Free models stay for small quick jobs (owner decision) and as backup when paid capacity is unavailable.
- Nothing is published and no emails or posts are sent.

## Verification
- Automated tests for: review-area routing (Lovable first, free only as fallback), the old direct keys being last, the model chosen for each job, and the demo-site setting.
- One small live request to the builder, then read back which models were recorded. This uses a small amount of workspace credit.

## Technical details
- `src/lib/builder/review-panel.server.ts`: change `freeFirstThinker` / `DIVERSE_AREAS` to paid-first with an area-to-model map passed through `callBestThinker`.
- `src/lib/ai/router.server.ts` and `config.ts`: order the `lovable` provider ahead of `openai` and `google` for all paid roles, and treat a direct-key `quota` result as a circuit rest. Add per-role rosters for every catalogue model.
- `src/lib/ai/spend-scope.server.ts`: check the `DEMO_BUILDS_ALLOW_PAID` secret and the `is_demo` value for the workspace.
- Aggregate model usage from `ai_usage_events`, admin-only.
- Update `AGENTS.md` with the review-panel routing rule.
