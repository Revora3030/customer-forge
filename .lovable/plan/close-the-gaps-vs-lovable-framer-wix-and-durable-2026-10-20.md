# Close the gaps vs Lovable, Framer, Wix and Durable

The work is split into phases. Each phase gets built, tested and checked on a phone before the next one starts. Your existing rules stay the same: no made-up facts, the AI team does all the design, prices and trial stay as they are, nothing is published or sent without your approval, and spending caps stay where they are.

## Where the site stands now

Already in place: AI-designed builds, builds that resume where they stopped, "waiting for AI capacity" notices, the visual check and "Fix with AI", shareable preview links, claiming a demo at signup, Jarvis prospecting with real Google Maps photos, and admin numbers matched to your records.

Still open:
- No build has run start to finish on the latest code.
- Edits have no before/after compare, and you can't undo to an earlier version.
- There's no point-and-edit (tap a section and tell the AI what to change).
- Risky Jarvis actions have no lasting approval record.
- A business can't go from a claimed demo straight to paying.
- There's no daily brief and no one-time follow-up email.
- Signed-in pages have not all been checked end to end.

## Phase A: Prove a real build (first)
- Run one full build of a test business with your approval, since it spends AI credits.
- Fix whatever breaks it, then repeat until it reaches a finished preview.
- After it succeeds, raise the daily site limit from 5 to 20, as you asked.

## Phase B: Editing as good as Lovable or Framer
- Point-and-edit: tap a section in the preview, describe the change, and only that section is rebuilt.
- Before/after compare for every AI edit, shown side by side at phone and desktop sizes.
- Version history with one-tap restore to any earlier version.
- Every change is tied to the chat message that asked for it.

## Phase C: Every claim and photo backed by a source
- Each fact on a site records where it came from: owner, Google Maps, or the business's own website. Facts without a source stay hidden.
- Photos get honest labels (owner, Google Maps with credit, licensed stock or AI illustration). AI pictures are never shown as real work.
- A launch checklist before publishing: page titles and descriptions, contact form test, booking test, domain status and the visual check.

## Phase D: Claimed demo to paying customer
- After signup, the claimed site opens directly in the builder, with a clear "Activate" step that leads to the existing setup-fee checkout.
- Owner-friendly states for an expired preview, an already-claimed demo, or a failed payment.
- Tests for the claim → signup → checkout path, using fake test data so no real charge is made.

## Phase E: Jarvis as your operator
- Lasting approval records: a risky action only runs once you approve it, and the approval is saved and shown in an approval log.
- Daily brief: funnel numbers, builds, replies and what needs your attention, in text and spoken.
- One follow-up email 48 hours after the first, only if there's no reply and no opt-out; it respects the existing daily caps.
- When a build or send fails, Jarvis explains why in plain words.

## Phase F: Platform polish and proof
- Signed-in journey checks: onboarding, CRM leads, quotes and bookings, settings and billing pages, at 320 to 1280 widths.
- Accessibility pass: keyboard use, focus, contrast and screen-reader labels.
- Speed pass: smaller page code, lazy-loaded pictures and faster first view on marketing pages.
- Admin numbers checked against your records on the remaining pages.

## What I need from you
- Approval to spend AI credits on the Phase A test build.
- One real second business (name, city, services) for a second-industry test build, or "use a test business".
- Your setup price: the code says $350, the project brief says $750. I won't change either without your word.

## Technical details
- Additive migrations only: approval-proof table, site version snapshots and fact provenance columns, each with grant, RLS and policies scoped to the workspace.
- Reuse the worker capacity deferral, stage and section checkpoints, preview tokens, launch review and the Jarvis action classes. No second mechanisms.
- Point-and-edit reuses the existing section-scoped edit path with composition-tree node IDs.
- Tests per rule (approval required, 48h single follow-up, claim → checkout, provenance hiding). The full Vitest suite, tsc and eslint stay green.
- No publishing, outreach sends or billing changes without explicit approval.
