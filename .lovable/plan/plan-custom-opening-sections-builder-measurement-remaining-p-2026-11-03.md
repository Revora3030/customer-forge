# Plan: Custom opening sections, builder measurement, remaining pull requests

Three tracks, in this order. Each one keeps existing customer sites, the safety and fact checks, billing and the single publish path unchanged.

## Track 1 — Measure real builder requests (first, because it guides Track 2)
- Record, for each builder chat request: total time, time spent in each stage (triage, planning, review, apply, QA), which model ran, cost, and outcome (applied / partly applied / rejected, plus the reason).
- Add an owner-only "Builder health" panel in admin: success rate, median and slowest times, and the top 5 rejection reasons over the last 7 days.
- Acceptance: one real request through the preview shows a complete timeline with every stage filled in; failed stages show a reason instead of an empty value.

## Track 2 — AI-written custom opening section (hero)
- Add one new section type, "custom hero". The AI writes its layout as a small, structured description (layers, shapes, type scale, motion cues, photo placement), not raw code. Our renderer turns that into the page.
- Strict limits: only the site's own real photos and facts, AA text contrast, no outside scripts or links, size caps, a reduced-motion fallback, and a check at 320 to 2560 px wide.
- If the custom hero fails any check, the site falls back automatically to the current hero, so a build never breaks.
- Off by default behind a setting. Turn it on first for Revora's own test sites, then for new builds.
- Acceptance: a test build produces a distinctive hero that passes the contrast, phone-width and fact checks; turning the setting off restores the old hero with no other changes.

## Track 3 — Remaining pull requests
- Retry #593, then refresh checks and conflicts for every open PR, including re-running the security scans that were cancelled.
- Fix the four code-scan warnings on their own branches: #650 (HTML comment filter must also handle `--!>`), #644 (test uses a weak hash), #653 (test uses an `http://` URL), #656 (test uses `localhost`).
- Group the green, conflict-free PRs into safe batches, with database-change PRs kept separate. Bring each batch to you for approval before merging. Nothing gets merged without that approval.

## Technical details
- Track 1: a new owner-scoped table `builder_request_metrics` (RLS: owner read; service write), written once per request from the existing chat-request-ID progress path; panel under `/admin`. Tests: stage timing aggregation and rejection-reason grouping.
- Track 2: a new primitive in the existing composition registry (`composition-tree.ts` plus the site renderer), validated by the existing renderer validation and QA (`browser-qa-intelligence.ts`), and authored by Sol via `PRIMITIVE_GUIDE`. No arbitrary TSX/HTML execution, so it is safe on the Worker. Feature flag stored in existing settings.
- Track 3: uses the God's GitHub API connection; squash merges onto `lovable-sync`; each fix is a separate commit on its PR branch, followed by fresh checks.
- Nothing is published without your request.
