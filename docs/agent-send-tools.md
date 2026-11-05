# Agent send-to-customer tools (PAI-12)

`src/lib/agent/tools/send.ts` exports `sendTools()`. All tools are risk `send_external`, scope `owner`.

| Tool | Does | Server path reused |
| --- | --- | --- |
| `reviews.request` `{appointmentId, channel}` | One review request to the booking's own email or phone | `requestReviewFor` |
| `quotes.send` `{leadId}` | Runs the workspace's active quote follow-up automations for a quoted lead | `queueAutomationEventFor("quote_requested")` |
| `bookings.reminder` `{appointmentId}` | Runs the active booking follow-up automations for a live booking | `queueAutomationEventFor("booking_created")` |

## Safety
- The registry runs these only when a PAI-4 approval exists for the exact arguments; with none, the result is `needs_approval` and nothing is queued. Any changed argument changes the hash, so it needs a new approval.
- The model never supplies the workspace, the recipient or the text. The workspace comes from the session; the recipient and wording come from the booking, lead and business profile.
- Delivery goes through the existing consent-gated sender, which skips unsubscribed, STOP and bounced recipients.
- Results hold counts only (queued, sent, skipped, failed), never an address or message body.

## Not built yet
- `leads.follow_up`: no separate server path beyond the two above.
- `campaigns.send`: no campaign sender exists yet.

## Registry
Registered (PAI-4 loop wiring): `() => sendTools()` is appended to `AGENT_TOOL_GROUPS` in `src/lib/agent/tools/index.ts`, so `agentTools()` wraps each send tool in the PAI-5 limits exactly once. Do not wrap them again anywhere else.

With no `approvals` dependency the registry still refuses them (`needs_approval`). To run approved sends, build the registry with `approvals: createAgentApprovalWiring(approvalDeps).registry` and give the loop `approvals: createAgentApprovalWiring(approvalDeps).loop` (`src/lib/agent/loop-approvals.server.ts`). The loop then files the owner's approval, pauses the run, and resumes it after the decision. An approved retry with the same arguments runs once; a changed, declined or expired one does not.
