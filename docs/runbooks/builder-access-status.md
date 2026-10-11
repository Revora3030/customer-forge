# Builder access status: acceptance checks

The new status endpoint requires an authenticated session and a valid organization UUID. It checks membership or the caller's own verified super_admin row, then calls the existing orgEntitlement implementation. It only reads account metadata; it does not modify prices, trial duration, eligibility, data, roles or provider settings.

The notice distinguishes checking, unavailable, blocked, read-only and verified editing access. Network/database errors are not presented as a payment demand. PAST_DUE grace access, demo mode, platform-owner rules and verified admin rules remain delegated to the existing server entitlement code.

The shell hides its old chat-ready line while the notice is not ready. This is presentation only: editing/publishing endpoints remain the authorization boundary. The notice polls while mounted and is not an instantaneous revocation guarantee. Ready still does not prove provider availability.

Before merge: run typecheck, lint, full Vitest, build and existing security contracts. Exercise loading, expired/canceled/suspended, nonmember, viewer, manager, demo, platform owner, verified support admin, sign-out, workspace switching and background refetch failure in authenticated browser tests. Verify the source/iframe checks and publishing approval remain intact. Unit tests mock database dependencies and do not prove production RLS.

This batch does not repair restored failed-message metadata, the AA Pass wording, or desktop chrome rendering. No migrations, provider requests, payment actions or deployment are included. Revert through a new commit rather than rewriting Lovable history.
