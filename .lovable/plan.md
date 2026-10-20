# Fix both AI chat pages (Jarvis and the customer builder), free models only

Your paid AI budget is used up, so every build runs on the free AI models only. When the free models are busy, builds pause and resume on their own instead of failing, and the page says when they'll resume. No spending is added.

## What I found (today)
- 9 builds today: 6 failed, 2 running, 1 waiting. The two new demo sites are building now: Ultimate Tree Service is at 46%, World of Service at 18%.
- All 6 failures were the Shined Up Auto Detailing site:
  - 3 stopped with "The build was interrupted and could not finish."
  - 3 stopped at 58% because the AI couldn't finish the page plan (one returned no usable plan, one plan couldn't be filled with real content, and the reviewer rejected one).
- The draft preview already keeps showing your site while a rebuild runs. I'll recheck this on the live site.

## Step 1: Free models only
- Turn on free-only mode, and remove the $20 paid limit I set earlier, so nothing spends money.
- Keep the switch-back rule: once you add money and turn paid AI back on, the paid models are used again automatically.

## Step 2: Builds pause instead of failing
- When the page plan fails because the free models are busy, overloaded or return unusable answers, pause the build for AI capacity and retry it. Today these just fail.
- An "interrupted" build should pick up from its last saved step automatically, not stop and ask the owner to press Build.
- The 3-attempt limit stays, so a plan the reviewer rejects on its merits still stops instead of retrying forever. Never use a template in place of AI design.

## Step 3: Show the customer everything the AI team built
- On the builder and Jarvis cards, show each finished page and section as soon as it's ready, plus the current step and the "resumes at" time. No blank screen or frozen percentage.
- A failed build keeps showing the last good version of the site, plus a clear Retry button.

## Step 4: Check every button on both pages
- Jarvis page: chat send, voice, approve/decline, build demo, open preview, email draft, retry, cancel, the autopilot switch, the approval log.
- Customer builder chat: send, stop, retry, undo/restore version, preview on phone and desktop, open each page, publish (checks only, no real publish), image upload.
- Click every button on phone and desktop, fix each one that errors or does nothing, and re-test.

## Step 5: Watch the two demos and the test build finish
- Follow World of Service, Ultimate Tree Service and Harbor Line to a finished site using free models only. Then check each page and give you the preview links and both email drafts. Nothing is sent without your approval.

## What I will not do
- Spend paid AI, send emails, charge cards, or change pricing.
- Promise that free models never get busy. When they do, builds wait and resume, and the page tells you when.

## Technical details
- Set the `AI_PAID_DAILY_CAP_USD` secret to 0 (or force free-only through the existing setting); router tests stay isolated.
- In `collective-first-build.server.ts` and the architecture stage, classify capacity, timeout and malformed-output failures as capacity, and route them through the worker's existing `capacityDeferral` (up to `MAX_CAPACITY_DEFERRALS`). Reviewer rejections still count toward the attempt limit.
- Interrupted or lease-expired jobs: requeue them through the existing lease recovery and stage/section checkpoints, without marking them failed while deferrals remain.
- UI: `CapacityWaitNotice`, `DraftUpdatingBanner`, Jarvis demo cards; add partial-section rendering from `section_checkpoints`.
- Click-through tests with Playwright, signed in as admin and as a test customer, at 390px and 1280px. Run the full Vitest suite, TypeScript and lint.
