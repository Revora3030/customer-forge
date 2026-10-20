# Jarvis tool and permission inventory (source-verified 2026-10-20)

Status words: **verified** = source + tests; **partial** = gate exists but weaker than the
documented contract; **gap** = consequential effect with no server-side approval proof.

## Access boundary (verified)
Every Jarvis server endpoint uses `requireSupabaseAuth` then a super-admin check
(`src/lib/admin.server.ts`, `guardedAdmin` in `jarvis.functions.ts` and siblings).

## Chat loop (verified)
`parseActions` (`jarvis-actions.ts`) splits model requests into reads, proposals and
rejected. Only reads auto-run (`runReadActions`); writes become proposal cards.
Note: `prospects.find` / `prospect.lookup` are "reads" that write audit rows and use
paid search capacity.

## Diagnostics (verified)
11 tools in `JARVIS_DIAGNOSTIC_TOOLS`, all read-only, low risk, platform scope.

## Consequential actions — approval is an authenticated super-admin tap (partial)
`validateJarvisWriteApproval` (input-hash-bound, single-use proof) exists in
`jarvis-autopilot-policy.ts` but is **not wired** into these executors:

| Action | Endpoint | Effect |
|---|---|---|
| demo.send / approveReplyDraftFn | `jarvis-demo-site.functions.ts`, `prospect-replies.functions.ts` | real email/SMS |
| autopilot.configure / autopilot.run | `prospect-autopilot.functions.ts` | enables automatic builds and outreach |
| demo.build | `jarvis-demo-site.functions.ts` | new org + owner membership + build job |
| code.pr, claude.code, claude.fix | `jarvis.functions.ts` | GitHub branches/PRs |
| builds.recover | `jarvis.functions.ts` | cross-workspace job recovery |
| clearJarvisHistory, deleteJarvisAttachment | `jarvis.functions.ts`, `jarvis-attachments.functions.ts` | deletion (own user only) |

No Jarvis action publishes sites, changes billing, edits roles of existing users, or runs SQL.

## Automatic sends
- Queue drain now re-reads the owner's autopilot switches at send time; autopilot off
  (or channel off, or unreadable settings) holds queued automatic sends
  (`prospect-send-queue.server.ts`, test `prospect-send-queue.autopilot-switch.test.ts`).
- Auto-replies (`prospect-replies.server.ts`) are AI-reviewed, not owner-approved (gap).

## Next step
Persist approval proofs server-side (approval id, tool, input hash, approver, expiry,
consumed_at) and require `validateJarvisWriteApproval` + atomic consume in each endpoint
above. Needs a new table and UI wiring; not yet implemented.
