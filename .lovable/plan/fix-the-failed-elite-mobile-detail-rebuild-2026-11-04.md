# Fix the failed "Elite mobile detail" rebuild

## What actually happened (from the live records)
- The build ran 02:48 to 03:04 UTC and got stuck at **pictures** (58%).
- It stopped at its **$6 per-build spending limit** after spending $6.17. Nothing was published and your previous site was restored.
- **$5.17 of the $6.17 went to pictures**: 43 picture requests, 32 of them on the most expensive picture model (Sunburst, about $0.15 each), and 10 failed but still cost money. The text AI only cost about $1.
- The picture plan allows up to 28 pictures, but retries and repair passes pushed the total to 43. The expensive model handles all hero/editorial pictures by design, even though our settings say the cheaper model (Flare) should go first.

So the cause is picture count and picture model choice, not a crash or the app being closed.

## Fix
1. **Hard picture budget per build.** Count every paid picture attempt (successes and failures) across the first pass, repair pass and retries. Stop starting new pictures once a picture allowance is used (for example 18 pictures or $3.00, whichever comes first), so pictures can never use up the whole build budget. Pages that miss a picture keep a reviewed fallback (owner photos or a typographic/color-led section) instead of failing the build.
2. **Cheaper model first.** Make Flare the default for every picture. Use Sunburst only for the one main home-page hero picture, and only fall back to it once per picture.
3. **No paid retries of failed shots.** A failed picture is retried once at most, on the cheaper model, then left for the existing repair step.
4. **Smaller picture plan.** Lower the planned maximum from 28 to about 16 (hero frames, one per service, about/story, one per other page), still at least the existing minimum.
5. **Warn before the limit.** At 80% of the build budget, stop optional extras (extra hero frames, alternate designs) so the build finishes instead of being stopped.
6. **Clearer message.** If a build still hits the limit, the message says pictures used it up and that pressing Rebuild reuses the pictures it already made.
7. **Restart this build.** After the fix, start the Elite mobile detail rebuild again, which reuses the 32 pictures already saved, and watch it to the finish.

## Checks
- Tests for: picture limit stops new paid pictures; failed pictures count toward the limit; Flare is picked first; the plan maximum is enforced; the 80% warning skips extras.
- Run the existing first-build and spend tests.
- Watch the restarted build live and report its real cost and result. Nothing gets published without your OK.

## Technical details
- `src/lib/builder/first-build-images.server.ts`: per-build paid picture counter/cost cap (reads `paidCostMicrocents`), Flare-first lane selection, single retry.
- `src/lib/builder/collective-first-build.server.ts` (~line 815): campaign max 28 → 16.
- `src/lib/builder/build-spend.ts`: add `pictureSpendCapMicrocents` (env `BUILD_PICTURE_CAP_USD`, default $3) and an 80% soft threshold; the $6 build cap stays.
- `src/lib/builder/build-failure.ts`: picture-specific limit wording.
- Uses the existing `luna_usage_events` ledger and shared reservation; no new spend path, no schema change.
