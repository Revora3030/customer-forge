# Instagram posting through Jarvis

## Owner setup
1. Use an Instagram Business or Creator account. Personal accounts cannot use content publishing.
2. Create a Meta developer app with **Instagram API with Instagram Login**. Register the exact redirect URL:
   `https://revoragrowthsystems.com/api/public/instagram/callback`
3. Configure the app for `instagram_business_basic` and `instagram_business_content_publish`. Standard access needs an authorized app-role/test account; other accounts may require Meta review/advanced access.
4. Securely save `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` (Instagram product credentials, not Facebook app credentials). Never paste these in chat. `INSTAGRAM_CREDENTIAL_SECRET` encrypts stored access tokens.
5. Publish the app update only when requested. Open Jarvis → Operations → Instagram → Connect Instagram. Complete Instagram consent, return and Refresh. Login alone does not prove publishing permission; provider errors remain visible.

## Approval workflow
Jarvis can check connection/draft results using `instagram.status` and propose one caption plus public HTTPS image with `instagram.post`. Save for review creates a draft only. In Operations, inspect image, caption and account; confirm image rights; tap **Approve and publish now**. Drafts cannot be edited in place; discard and save a new draft to change the reviewed content. No scheduler/autopilot/model invokes the publish endpoint.

Single JPEG feed images only in this first integration; Meta validates format, dimensions and accessibility. Image URLs must remain stable between review and publication. Google Maps photos are not reusable outreach assets; use owned/licensed images or separately approved AI artwork. Reels, carousels, Stories and image generation are not included.

## Safety and recovery
All endpoints require signed-in super-admin role; rows and credentials are bound to the actual caller, not shared across admins. Storage tables grant only service_role, enable RLS and have no browser policies. Callback checks a hashed expiring single-use state, rechecks the initiating user's role, and stores only encrypted credentials. No callback code/token is logged or returned to Jarvis.

An atomic draft→publishing transition records the approving owner/time, while a partial unique index blocks duplicate exact content. Provider rejection is failed; ambiguous network/persist failures after publish submission are uncertain. Never blindly retry publishing/uncertain rows; check Instagram first. Disconnect removes local credentials and invalidates outstanding sign-ins; it does not delete Instagram posts or revoke the Meta app itself. Reconnect before token expiry (~60 days); automatic refresh and reconciliation are not implemented.

## Evidence limits
Offline tests must stub provider calls and database responses; never use ambient production credentials. Real connection requires owner-provided credentials and the deployed callback. Live posting requires separate approval of the exact post. No real post was sent during implementation.