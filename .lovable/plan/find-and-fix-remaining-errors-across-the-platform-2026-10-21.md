# Find and fix remaining errors across the platform

Current state: the preview shows no build errors, no page errors and no console errors right now. The last full run had 3,157 automated checks passing and a clean security scan. So this pass hunts for errors that only show up when pages are actually used.

## Steps
1. **Recorded errors:** read the last 7 days of saved error reports (customer pages, server, builder) and fix every real error that keeps happening. Skip "request cancelled" noise.
2. **Every page, phone and desktop:** open every public and signed-in page (about 96) at 390px and 1280px. Look for page errors, failed requests, broken links, text running off the screen, and buttons that do nothing. Fix each one.
3. **Builder and Jarvis buttons:** click every button that doesn't spend or send (tabs, viewports, compare, fullscreen, history, approvals log, settings). Fix the ones that fail. Finish the two open items: keyboard focus staying inside fullscreen preview, and recovery when the preview fails to load.
4. **Backend health:** run the database checks and security scan, look at slow queries and failed server function calls, and fix safe issues with additive changes only.
5. **Re-check:** run the full test suite, lint and type check, plus the browser pass again on every page that was fixed.

## Not included (needs your OK)
- Live AI builds (Harbor Line, World of Service, Ultimate Tree) — they cost credits / count toward the 5-a-day limit.
- Sending emails, Instagram posts, publishing, billing changes.

## Technical details
- Sources: `client_errors`/monitoring tables, `supabase--analytics_query`, `supabase--linter`, `security--run_security_scan`, Playwright sweep with the minted session; AI/mutation network calls blocked during the sweep.
- Each fix gets a focused test next to existing tests; tenant isolation, RLS, pricing ($350 setup, $100/month, 3-day trial) unchanged.
