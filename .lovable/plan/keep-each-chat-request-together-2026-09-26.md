# Keep each chat request together

## Build
- Give every submitted chat request one stable identity from planning through applying.
- Filter live activity by that request so progress from earlier changes never appears inside the current message.
- Keep the request, AI reply, planned updates, final result, and restore action in one chat entry.
- Save the completed result with the request so reopening the builder preserves the same grouped conversation.

## Validate
- Add focused tests for request-scoped progress and saved request/result pairing.
- Check the mobile chat flow from the supplied recording at 390px.
- Run the relevant automated checks and review current errors.

## Security
- Restrict AI Command Center settings to the sole authorized administrator instead of every signed-in account.
