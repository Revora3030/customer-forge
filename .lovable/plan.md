# Fix and connect: free AI team, Jarvis connections, customer site quality

Scope: the three areas you chose. Live checks use only small, free test calls. No paid models, publishing, emails, posts or rebuilds of existing customer sites.

## 1. Free AI team
- Send one small test question to each configured free service, including the new OpenCode key (only models marked "free").
- Record the result for each: working, out of quota today, key rejected, rate limited or unavailable.
- Rest services that fail with a key or quota problem so builds skip them. List keys that need replacing, such as Together.
- Save a short sample when a reply can't be read, so those failures show up on the AI health page.
- Make the AI health page show only checks that actually ran today.
- Confirm every team role (writing, design, review, details) has at least one working free service. Report any role that doesn't.

## 2. Jarvis connections
- Run Jarvis's read-only checks: Cloudflare, email domain, Calendar, Sheets, Pexels, Browserbase, PageSpeed, Context7, Unsplash, Perplexity readiness and the keyless page checks.
- Fix problems on our side, such as wrong addresses or wrong handling of responses.
- If an account is missing permissions (for example Cloudflare showing zero domains), say so and offer a reconnect. No workarounds.
- If the email domain still won't verify, list the exact domain records needed. Nothing changes on your domain until you approve each record.
- Pexels stays off until you add its key.

## 3. Customer site quality
- Finish the leftover work from the redesign:
  - Connect the new checks for large empty areas and a missing top image to real on-screen measurements of the page.
  - Make failed checks feed the AI repair loop.
- Show free-role coverage in Jarvis.
- Add a free image fallback (keyless Pollinations) for when no business photo or paid image is available. Every image still gets a safety and truth review.
- When a paid model runs out partway through a build stage, hand that stage to the free team so the build doesn't fail.
- Look at one existing demo site on phone and desktop width. Report what still looks generic. Rebuilding stays a separate step that needs your approval.

## Verification
- Run type checks, focused tests and the full test suite. Add tests for the new rules: provider rest, role coverage, image fallback and the stage handoff.
- Before and after screenshots on phone and desktop.
- The report will say what worked, what failed and what still needs a key or your approval.

## Technical notes
- Free test calls go through the existing router with ZERO_COST_ONLY on. OpenCode only uses model IDs ending in `-free`.
- Visual checks reuse the existing browser QA and repair loop. No second error channel.
- The paid-to-free handoff reuses the existing stage checkpoints and capacity deferral.
- No database migration is planned unless saving unreadable-reply samples needs a new column. If it does, I'll add it as a separate, reversible change.
