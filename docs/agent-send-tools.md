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
Not registered by this PR. Registration is a one-line add (`...sendTools()`) in the default registry after PAI-8b (#739) lands, plus a `createApprovalsConsumer` as the registry's `approvals` dependency.
