# Lovable models build every site end to end, pictures included

## What is still blocking complete sites
- **Pictures:** paid pictures still go through your old direct OpenAI key, which is out of money. When it fails, the builder falls back to the free picture services, which are rate-limited. That is why sites end up with missing pictures.
- **Model choice:** each step tries its model list from the top, so one or two models do nearly all the work. Reviewers can end up being the same model that wrote the section.
- **"Load failed":** when one reviewer drops out during "checking the plan", the whole request fails.
- **No proof:** there is no screen showing which models actually did each job.

## Changes
1. **Pictures through Lovable:** new pictures and picture edits go through Lovable's image models first:
   - Website pictures: GPT Image 2.5 Sunburst (best quality).
   - Quick drafts and small images: GPT Image 2.5 Flare.
   - Backup: Gemini 3 Pro Image.
   
   Every picture is still checked for invented text, fake logos and phone numbers, and still has alt text. Real Google Maps photos of the business are used first wherever they exist, as before. Free picture services stay as the last backup.
2. **Best model per job:**
   - Brand identity, design and layouts: Claude Opus 5.5, then GPT-6.1 Sol, then Claude Fable 5.1.
   - Page wording: Claude Sonnet 5, then GPT-6.1 Sol.
   - Plan checking and code-like layout repair: GPT-6.1 Sol, then Gemini 4 Argon.
   - Fact checking and safety: Claude Sonnet 5. It is never the model that wrote that section.
   - SEO, accessibility and mobile reviews: Gemini 4 Argon, Gemini 3.8 Flash and GPT-6 Sol, one per area so each opinion is independent.
   - Picture review: Gemini 3.8 Flash, which reads images.
   - Small quick jobs: free pool first, then Claude Haiku and Gemini Flash Lite.
   
   If a model is busy, the next one in that job's list takes over automatically.
3. **No more "Load failed" from one reviewer:** the other reviewers' results are kept. A missing reviewer is retried once on its backup model. If it still fails, the step continues with a visible note instead of failing the whole build.
4. **Complete-site check before finishing:** a build only counts as done when every page has its sections, every picture slot has a real picture, forms work and the final quality checks ran. Otherwise it shows what is missing and retries only those parts.
5. **"Models used" panel (owner only):** shows, for each model over the last 24 hours, the jobs it did, successes, failures and cost.

## Stays the same
- The $100/month cap, the daily cap, 5 builds per day, approvals and the rule against invented facts.
- No publishing, emails or posts.

## Verification
- Tests: each job uses its chosen models; picture requests go to Lovable first; a failed reviewer doesn't fail the build; the completion check catches missing pictures.
- With your OK: one private test rebuild of the internal test site, then a report of which models did each step, how many pictures were placed, page checks on phone and desktop, and the actual cost. Estimated at a few dollars, within your caps.

## Technical details
- `src/lib/ai/paid-image.server.ts`: tier models resolve to `lovable` image ids (`openai/gpt-image-2.5-sunburst`, `-flare`, `google/gemini-3-pro-image`) through the existing capped reservation; the direct OpenAI key moves last.
- `src/lib/ai/config.ts`: per-role rosters as above. Add an optional `preferModels` hint on thinker requests (`hall-of-fame.server.ts` → router `buildChain` reorders the paid candidates) so review areas and the author/reviewer split pick different models.
- `src/lib/builder/review-panel.server.ts`: area→model map; `Promise.allSettled` results keep partial notes; one backup retry.
- `src/lib/builder/ai-agent-plan.server.ts`: degrade a reviewer failure to a note instead of a request failure.
- Admin aggregate over `ai_usage_events` for the models panel.
- Update `AGENTS.md` with the per-job model rule.
