# Builder recovery and safe Autopilot launch

## What the records show right now
- Last 7 days: 15 builds, **0 finished**, 14 failed, 1 cancelled. The "14 of 15" figure in your notes is correct.
- Autopilot is **on**, with email sending on (Durham, mobile detailing, 5 builds per day). No emails went out in the last 7 days and nothing is waiting to send, because no demo has ever finished.
- The failures fall into three groups:
  1. **AI team ran out of capacity or gave an unusable answer** (8 builds). The page plan came back empty or got rejected, or the section layouts couldn't be finished.
  2. **Build cut off mid-run** (4 builds, "interrupted and could not finish").
  3. **Resume blocked by a safety check** (3 builds, the two newest included). On restart, the builder couldn't confirm when the earlier attempt stopped. So it kept the half-built pages and stopped instead of continuing.

## Step 1: Safe mode first
- Turn Autopilot off and keep all its settings: targets, the cap of 5 and the email switch. Nothing is deleted.
- Make it impossible for Autopilot to email anyone about a demo that hasn't fully finished and passed its checks. This is enforced on the server, not just hidden in the screen.

## Step 2: Fix the actual causes
- **Resume block (group 3):** every attempt will now leave a clear "stopped at" mark, including one that gets cut off. That lets a restart safely pick up from the last saved step. Pages you edited by hand stay protected, same as today.
- **Cut-off builds (group 2):** these go into the existing "wait and resume" path instead of ending as "interrupted".
- **Page plan and layouts (group 1):** when the AI returns an empty or rejected plan, it gets one guided retry that includes the reviewer's reason. Layouts are done in smaller batches so one capacity limit doesn't sink the whole build. Quality checks are not loosened, and the builder never falls back to built-in designs.
- Old failure details are kept as they are. Nothing gets deleted to make the dashboard look better.

## Step 3: Tests
- One test for each failure above: empty plan, rejected plan, layout capacity limit, cut-off attempt, resume after cut-off, hand-edited pages kept, no duplicate site on retry.
- An outreach test: a failed build never gets emailed, and a finished build gets at most one email plus one follow-up.
- Then run the full test suite, type checks and lint, and report the results exactly.

## Step 4: Prove it on real demo builds
- Build 2 or 3 demo sites from the existing demo workspaces, using free AI models only.
- Each demo has to open, load its pictures, work at phone and desktop sizes, have working page links and a working contact form. A build marked "done" isn't enough on its own.

## Step 5: Launch readiness report
- Check: targets, caps, the email check, the 8am-6pm local sending window, unsubscribe and do-not-contact handling, one follow-up only, trial access and test-mode checkout.
- I'll recommend turning Autopilot back on only when all of these hold:
  - the causes above are fixed
  - the tests pass
  - several demos pass the phone and desktop checks
  - no critical security problems are open
- **You switch it back on.** I won't.

## Not doing
- No emails, no publishing, no paid AI, no real charges, no pricing changes, no deleted data.

## Technical details
- Failure source: `clearOwnPartialBuild` in `src/lib/site-engine.worker.server.ts` throws `PartialBuildKeptError` when no `build_attempt_ended` or `build_attempt_lost` marker exists after `started_at`. Fix: write a `build_attempt_lost` marker in `closeAbandonedJobs` (holding the previous lease expiry) before resuming, and send lease-lost jobs through the existing capacity deferral, capped by `MAX_CAPACITY_DEFERRALS`.
- Outreach gate: the send-queue enqueue and drain both require that the linked job is `completed` and its served-HTML verification passed.
- Safe mode: update the `prospect_autopilot_settings` row (`enabled=false`). This is a data change only, with no schema change.
- Code changes sync to GitHub automatically. I can't open a pull request on a specific branch from here.
