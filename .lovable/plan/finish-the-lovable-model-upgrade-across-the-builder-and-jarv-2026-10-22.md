# Finish the Lovable-model upgrade across the builder and Jarvis

## Changes
1. **Each review area gets its own model.** Fact checks: Claude Sonnet 5. SEO: Gemini 4 Argon. Conversion: GPT-6 Sol. Accessibility: Claude Haiku 4.5. Mobile: Gemini 3.8 Flash. Completeness: GPT-6.1 Sol. A reviewer never uses the model that wrote the section. If a reviewer's model is busy, the next model on its list takes over.
2. **One dropped reviewer no longer stops the build.** The other reviewers' notes are kept, and the missing reviewer is retried once on its backup model. If it still fails, the step goes on and the chat shows a short note saying which check was skipped.
3. **No more "Load failed" when your phone loses the connection.** The chat keeps checking the build's saved progress. If the connection drops, it reconnects and carries on, instead of showing a failure while the build is still running.
4. **Finishing check.** A build only counts as done when:
   - every page has its sections,
   - every picture spot has a real picture,
   - the contact form saves a test message,
   - and the final quality checks have run.
   
   If anything is missing, only those parts are redone, then the check runs again.
5. **"Models used" panel** on the owner-only AI health page. For each model over the last 24 hours it shows the jobs it did, how many worked, how many failed, and the cost. Models that didn't do any work are clearly marked.
6. **Jarvis upgrades:**
   - Hard research and planning questions go to the strongest models, and quick replies go to fast ones.
   - Jarvis can make pictures with GPT Image 2.5. Each picture needs your approval before it goes on any site or post.
   - Every reply shows which model wrote it.
7. **Private test rebuild.** One private rebuild of the internal test site. Afterwards I'll report which model did each step, how many pictures were placed, how the pages look on phone and desktop, and the actual cost. Estimated at a few dollars, within your caps. Nothing is published.

## Stays the same
- The $100/month cap and the daily cap.
- 5 builds per day.
- Approval before any email, post or publish.
- No invented facts.
- The $350 setup price.
- Free models stay for small quick jobs and as backup.

## Technical details
- `hall-of-fame.server.ts` / `router.server.ts`: optional `preferModels` and `avoidModels` on thinker requests, used to reorder or skip paid candidates in `buildChain`.
- `review-panel.server.ts`: area-to-model map; read partial `allSettled` results; one retry with `avoidModels` set to the failed model.
- `ai-agent-plan.server.ts`: a reviewer failure becomes a note instead of a request failure.
- Builder chat client: on a fetch network error ("Load failed"), poll the request's progress by chat request ID before showing a failure.
- `site-engine.worker.server.ts`: completion gate checking media slots and a form round-trip, plus the existing coverage readback.
- Admin server function aggregating `ai_usage_events` (super-admin), plus a panel in the AI health page.
- Jarvis: purpose-based role selection, and an approval-gated `image.generate` proposal through `callPinnedPaidImage`.
- Tests for each rule; update `AGENTS.md`.
