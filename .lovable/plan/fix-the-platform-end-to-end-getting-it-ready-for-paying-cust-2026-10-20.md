# Fix the platform end to end: getting it ready for paying customers

The goal: a contractor finds Revora, sees a demo of their own site, claims it, pays the $350 setup fee, and their site goes live. Every step should work without errors. Work runs in this order, with each step checked before the next starts.

## Step 1: Make sure the site builder finishes a site (most important)
- The Harbor Line Plumbing test build is stuck at 74% (laying out each section) because the free AI models are overloaded. Once you publish, I expect the live site to start using the $20/day paid limit (not yet confirmed), so the paid models can finish the build.
- Watch that build through to a finished site and open every page on phone and desktop.
- If it fails again, fix the actual cause. Possible fixes: lay out fewer sections at a time, or switch to the paid models sooner when the free ones are busy. Never fall back to a template.
- Only after one full success: keep the daily cap at 5, then you decide whether to raise it to 20.

## Step 2: Build the two demo sites
- World of Service (Dothan, AL) and Ultimate Tree Service (Greenville, NC). Use only facts from their public listings (name, trade, town, phone) plus their Google Maps photos. No invented reviews or services.
- Check both demo sites page by page, and share the preview links with you.

## Step 3: Show you both outreach emails. Nothing is sent without your approval.
- Each email mentions only the problems found on their current site and includes the demo link and the opt-out footer.
- Check whether the email check rejects "info@" addresses. If it does, say so and suggest a different contact instead of sending.

## Step 4: Test the claim and pay flow end to end
- A test owner opens the demo link, claims the site, signs up, starts the 3-day trial and reaches the setup-fee checkout ($350, then $100/month after the free first month). Test mode only, no real charge.
- Confirm the claimed site stays connected to the new account, and that an unpaid trial hides the site when it ends.
- Fix anything that breaks in that path.

## Step 5: Sweep the rest of the platform for errors
- Go through each signed-in page on mobile: dashboard, builder, CRM, bookings, billing, settings, and the admin pages. Look for errors, wrong numbers and broken buttons.
- Check the error monitor for real errors (not cancelled requests) and fix the top causes.
- Re-check that the Jarvis approval log, the 48-hour follow-up and the Maps photos actually work with real records.
- Make sure one database change made directly on the live database is also saved in the project's change history, without deleting or changing any data.

## Step 6: Publish and confirm
- After each step that changes the live site, ask you to publish, then check the real site.

## What I will not do
- Send any email or charge any card without your approval.
- Raise spending limits beyond what you approved ($20/day paid AI).
- Change pricing or the trial length.
- Promise "zero errors forever". Free AI capacity and outside services can still fail. When they do, the builder waits and retries and tells you clearly.

## Technical details
- Build: generation job f747370f…; check `generation_jobs.status/wait_reason/resumes_at`; worker reads `AI_PAID_DAILY_CAP_USD` at runtime after publish.
- Demos: `provisionProspectDemo` with `siteGaps` and the public email; the email is drafted through `composeEmail` (draft only).
- Claim flow: `prospect-claim.functions.ts` → signup → Stripe test checkout.
- Migration reconciliation: add the repo migration matching the live `prospect_follow_up_kind` change (idempotent `IF NOT EXISTS`).
- Run TypeScript, lint and the full Vitest suite after each step.
