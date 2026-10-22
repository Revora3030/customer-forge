# Jarvis: full Lovable model team + visible model label

## Goal
Jarvis answers with the right Lovable AI model for each job, and every Jarvis reply in chat shows which model actually answered.

## What changes
1. **Wider model team for Jarvis**
   - Today Jarvis chat uses a short list (GPT-6 Astra, Claude Haiku, Gemini Flash Lite, GPT-5.6 Luna).
   - Expand it to every current, non-retired Lovable chat model from the live catalogue, ordered by job: quick replies use fast models, and planning, coding and research use the strongest ones (GPT-6 Sol, Claude Opus/Sonnet, Gemini Pro), so if one model fails another takes over.
   - Free models stay as backup only, and the $100/month cap plus daily cap still apply.
   - Image and voice stay on the tools they use now.

2. **Model label in chat**
   - Under each Jarvis reply, a small tag shows the model that answered (for example "Claude Sonnet 4.6 · Lovable"), plus "backup" when a fallback model answered.
   - The label comes only from the call that was actually recorded, never from settings. Older messages with no record show nothing.
   - The live progress steps already show models; their names get the same friendly format.

3. **Check**
   - Tests: the model list contains only current catalogue models, the order is correct, and the label shows the recorded model or nothing.
   - One small live Jarvis question on a phone-size screen to confirm the label appears (costs a fraction of a cent).

## Technical details
- `src/lib/ai/config.ts`: Lovable roster for `conversation` (and the reasoning roles Jarvis uses) is rebuilt from the verified catalogue.
- Model and provider for each reply come from `jarvis_run_events` (the final model round for that run id). They are joined into the admin Jarvis message list, so no new table is needed. If a column is required, it will be a nullable, owner-scoped addition that follows the existing RLS rules.
- Shared `formatModelLabel()` helper used by both the message tag and `LiveRunSteps`.
- No publishing, emails, posts or changes to customer sites.
