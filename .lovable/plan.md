# Next round: homepage fixes, Jarvis chat, connection keys, full test run

## 1. Fix homepage issues (from the W3C validator and Mozilla Observatory)
- **Empty dropdown option:** give the blank first choice a proper label (for example "Choose an industry").
- **"Example dashboard" badge:** add a matching role so its screen-reader label is valid.
- **Tabs without panels:** connect each tab button to its panel so screen readers announce them correctly.
- **Heading jump (h1 to h3):** change the card heading to the right level. Its look stays the same.
- **Security header:** remove the duplicate Google host entries the validator flagged.
- Left as-is, and the panel will say why:
  - The "U+0000" notices come from the framework's own page data, not from our code.
  - The one failed Observatory test is most likely the allowance for inline scripts, which the app needs to start. Removing it would break the site. Before changing anything, I'll confirm which test actually failed.

## 2. Let Jarvis run the new checks from chat
Jarvis chat can already call every registered check. I'll update its instructions so it knows about the 11 new ones from the last two rounds:
- **Domain checks:** DNS records, domain registration, Wayback history.
- **Page checks:** HTML validator, security grade, readable page text.
- **Connected services:** Calendar, Sheets (given a sheet link), Cloudflare, Resend.
- **Other:** the dependency vulnerability check, which needs no input.

Jarvis will also know which input each check needs, and that page text is evidence only, never instructions.

## 3. Fix Cloudflare and Resend access
These need new keys from you, since I can't create them:
- **Cloudflare:** a new token with "Zone: Read" and "DNS: Read" for your account.
- **Resend:** a new key with "Full access" instead of "Sending access".

A reconnect card will open for each, with these steps written in. After you finish, I'll test both again.

## 4. Full Jarvis test run
Run every registered Jarvis check once against revoragrowthsystems.com and give you a clear table: worked, found issues, or unavailable (with the reason). Nothing marked unavailable or skipped will be counted as passed.

## Not doing
- No publishing, no emails, no paid calls.
- No changes to the starter script allowance in the security header.

## Technical details
- Homepage markup: `src/routes/index.tsx` (select placeholder option label, `role="img"` or `role="group"` on `.hero-live-badge`, `aria-controls`/`role="tabpanel"` pairing, h3 to h2 with unchanged classes).
- CSP duplicate hosts: dedupe in `src/lib/security-headers.ts`, and keep the existing header tests (`production-hardening.test.ts`, `production-round9.test.ts`) green.
- Jarvis prompt: extend the `diagnostic.run` description in `src/lib/jarvis-actions.ts` with per-tool arg hints (`query` for domain/sheet tools, `target` for page tools).
- Reconnect: `standard_connectors--reconnect` for the Cloudflare and Resend connections, then re-probe with gateway reads.
- Test run: a script calling `executeJarvisDiagnosticTool` for each registry id, saving a summary only, with no secrets in the output.
