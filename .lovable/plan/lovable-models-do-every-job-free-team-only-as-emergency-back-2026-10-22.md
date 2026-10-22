# Lovable models do every job; free team only as emergency backup

## What changes
1. **Lovable models lead every job** — site building, design, wording, reviews, coding, pictures, Jarvis, and also the small quick tasks that currently go to free models first.
2. **Free AI team becomes backup only.** It is used only when Lovable models are unavailable or your $100 monthly cap is reached (your answer: "use free AI team"). It never leads a job.
3. **Delete your own paid AI keys:** OpenAI, OpenRouter, DeepSeek, Google AI (paid), Claude Code token, Together, SiliconFlow. Lovable's built-in key stays.
4. **Turn off the "free models only" switch.** Right now it can block Lovable models; switching it off lets them run under your existing spending cap.
5. **The AI health page shows the truth.** Lovable shows as the main team, and free providers are labelled "backup".
6. **The builder chat badge** (added last turn) keeps showing which model actually answered, so you can see when a backup was used.

## Safety kept
- Same daily paid budget and $100 monthly cap.
- No publishing, emails, posts or rebuilds.
- Pictures go through Lovable only, because the direct OpenAI picture route goes away with the OpenAI key.

## Technical details
- `router.server.ts`: empty `SMALL_TASK_ROLES` so `groupForRole` puts paid (Lovable) first for every role; free stays appended as failover.
- Delete secrets: OPENAI_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY, GOOGLE_AI_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, TOGETHER_API_KEY, SILICONFLOW_API_KEY. Before deleting, check every place these are read so nothing crashes when they're missing. The OpenAI-direct image/transcription lane needs a Lovable equivalent (transcription → Lovable speech-to-text).
- Set ZERO_COST_ONLY / ZERO_AI_COST_MODE to false. Keep FREE_AI_ENABLED so the backup works.
- Update the routing tests, `AGENTS.md` lane rule, and memory (owner decision 2026-10-22: Lovable leads all roles).
- Run the AI tests and typecheck, then make one tiny live check that a small task goes to Lovable.
