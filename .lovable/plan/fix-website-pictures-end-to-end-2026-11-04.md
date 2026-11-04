# Fix website pictures end to end

## Confirmed today
- Picture requests send only the model and the prompt, with no size or shape. Every picture comes back square and gets cropped into wide or tall slots.
- The last rebuild of "Elite mobile detail" stopped at the pictures step after about $5 of picture attempts. Many of those attempts failed or were redone.
- Picture limits ($3 / 24 attempts, premium model for the main hero only, one retry) are already in the code but not published yet.

## What changes
1. **Right shape for every picture.** Each slot sends a matching size: wide for heroes and banners, tall for phone-first scenes, square for cards. The size comes from the slot's layout.
2. **Positive scene prompts.** Prompts describe what should be in the shot (the real business, its service, the light, the setting) instead of long lists of things to avoid. Rules against invented logos and text stay as one short line.
3. **Fewer pictures, used well.** Plan 3–4 key pictures for the first build (main hero plus the top sections). Other sections reuse them or use owner photos and Google listing photos. More pictures can be added later in chat.
4. **Gentler first review.** The picture reviewer only rejects real problems: fake text, wrong business, broken anatomy, bad contrast. Small style notes are saved as advice and do not cause a reshoot. At most one reshoot per picture.
5. **Build keeps going when pictures run out.** When the picture allowance or a picture failure is reached, the build finishes using owner photos, already saved pictures, or a designed text-only opening. It doesn't fail. The owner sees "N pictures can be added later" and nothing about money.
6. **Clear progress.** The pictures step shows "picture 2 of 4" so it never looks frozen.

## Not changing
- The one AI provider, Luna's spending caps, the daily paid limit, the truth and fact checks, and the single publish path.
- Customer sites that are already live.

## Technical details
- `src/lib/ai/providers/lovable.ts` `image()`: accept an optional `size` and pass it in the generations body. Thread it through the router's image call.
- `src/lib/builder/first-build-images.server.ts`: map each slot's role and aspect to a supported size. Cap the planned pictures at 4. On `pictureAllowanceUsed` or a provider failure, return the slot as a fallback (owner photo, reused picture, or none) instead of throwing.
- Prompt builder and shot list (`shot-list`, `first-build-image-qa.ts`): rewrite into positive scene prompts and split review results into blocking vs advisory.
- `collective-first-build.server.ts` / `build-failure.ts`: the pictures stage stops being fatal for allowance or picture-only failures. The whole-build spend cap stays a hard stop.
- Tests: size mapping per slot, a 4-picture cap, an advisory issue doesn't trigger a reshoot, allowance used ends in a completed build with fallbacks, and the build cap still stops.
- Then run the targeted tests and lint, publish only with your approval, and watch one real rebuild in your admin account.
