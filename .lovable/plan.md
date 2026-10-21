# Stop the free AI team from failing

## What the records show (last 24 hours)
- **Most failures came from one burst:** 844 calls in a single hour last night, and 564 of them failed. One build's review panel ("Hall of Fame") fired every specialist at every free service at once. The free services hit their per-minute limits, which caused the 1,695 "rate limited" errors.
- **Each review member gets only 12 seconds.** Free models often need longer, so 1,272 calls were cut off at exactly 12 s and counted as "timeout".
- **Paid OpenAI is out of money but still tried first on every request.** Today every Jarvis, suggestion and social-post call started with an OpenAI "quota" failure before moving on.
- **Google free often answers "unavailable"**, and once a call hung for 90 seconds.
- **"Bad response" (1,296):** Cloudflare, NVIDIA and Mistral answered, but the answer couldn't be read. Today the builder suggestions failed this way on Cloudflare after Google and OpenAI had already failed, and the request gave up instead of trying the next free service.
- **Accounts that are dead:** Together rejects the key every time (29 of 29). Hugging Face, LLM7 and DeepSeek are out of daily allowance, yet they keep being called.

## Fixes
1. **Remember when a provider is out of money or rejecting the key.** When OpenAI says "quota" or Together says "unauthorized", rest that provider until its reset time or until the key changes, instead of trying it on every call. Free-only mode then goes straight to the free team.
2. **Pace the review panel.** Limit how many calls run on each free service at the same time (about 2), spread specialists across services, and wait between calls when a service says "slow down", instead of firing all at once.
3. **Give members enough time.** Raise the per-member limit from 12 s to about 45 s, still within the build's overall deadline, and cap Google's single-call wait so one hang can't eat 90 s.
4. **Read more answers correctly.** Capture the raw text of failed "bad response" answers (trimmed, no customer secrets) so the exact format problem is visible. Then fix the reader for the formats found, for example gpt-oss answers that arrive in the "reasoning" field with empty content, or unclosed code blocks.
5. **Don't give up after three tries.** Builder suggestions and Jarvis keep moving down the free list (Groq, Mistral, Cerebras, Cohere, NVIDIA, OpenRouter, Kilo, OVH and the rest) until one succeeds or every service has been tried.
6. **Show the truth on the AI health page.** Mark Together as "key rejected" and out-of-allowance services as "resting until …", so the dashboard no longer shows "Free · Ready" for services that can't answer.

## What stays the same
Spending cap, free-only mode, approvals, and the rule that only models proven free are used. No paid calls are added.

## Needs you
- **Together:** the saved key is rejected. Send a fresh key, or I'll leave it switched off.

## Verification
Unit tests for each fix (resting on quota or unauthorized, the per-service concurrency limit, the longer timeout, the new answer formats, the full fallback walk). Then one small live check: a single Jarvis question and one builder-suggestion request, under the free-only setting, confirming a free model answers. No builds, publishing or emails.

## Technical details
- Durable resting: `durable-health.server.ts` and `provider-backoff.ts`. Treat `quota`/`unauthorized` as long cooldowns (until UTC midnight, or until the key's fingerprint changes), checked in `freeProviderChain` and in the paid lane before the call.
- Concurrency: a per-provider semaphore in `router.server.ts` applied to `hall-of-fame.server.ts` member fan-out. Honour `Retry-After`.
- `HALL_OF_FAME_MEMBER_MS` default 12000 changes to 45000, bounded by `remainingMs`. Google adapter gets a bounded wait.
- `openai-compatible.ts` and `cloudflare.ts`: fall back to `reasoning_content`/`reasoning` when `content` is empty; `extractJsonObject` handles unclosed fences. Log a 500-character redacted sample on `bad_response` to the existing usage-event path (new nullable `error_detail` column via a safe additive migration).
- Suggestion/Jarvis callers: remove the early attempt cap so the free chain is walked fully, within the existing deadline.
