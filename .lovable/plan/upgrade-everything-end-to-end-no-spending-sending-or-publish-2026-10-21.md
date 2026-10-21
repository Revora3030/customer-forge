# Upgrade everything end to end (no spending, sending or publishing)

## 1. Search traffic
- Rewrite the Alabama HVAC pages (Montgomery, Huntsville, Birmingham) so people who see them on Google click: a clear headline, a specific answer for HVAC owners in that city, real pricing ($350 setup, first month free, then $100/month, 3-day trial) and a start-trial button. True facts only.
- Push /states and /about onto page 1 of Google: add links to them from the homepage and more useful detail on each.
- Check that every local page has its own title, description and a link back to the main pages.

## 2. Sign-up and payment path
- Walk through homepage, sign-up, workspace setup, first website brief and upgrade on phone and desktop. Fix every broken step. Use test mode only, with no real charge.

## 3. Builder and Jarvis
- Click every safe button again after the latest fixes, and fix anything that fails.
- Make sure builds waiting for AI capacity show a clear reason and retry time everywhere they appear.

## 4. Re-check
- Full automated checks, security scan, and a phone and desktop pass on every page I change.

## Needs your OK (not included)
- Live AI builds, publishing, sending emails, Instagram (needs Meta credentials).

## Technical details
- Pages: `src/lib/local-pages.ts` and the `local.*` / `states` / `about` routes; reuse the existing page data, no new page system.
- Tests: local-page title/description uniqueness, and the pricing values shown on the HVAC pages.
