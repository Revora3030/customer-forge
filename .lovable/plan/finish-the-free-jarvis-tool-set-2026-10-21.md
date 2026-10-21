# Finish the free Jarvis tool set

## What gets added
1. **Speed check (already built)**: check that it now builds cleanly, then turn it on once the Google key is saved.
2. **Live page check**: Jarvis loads any public Revora page or customer page in a real browser, then reports script errors, broken links, failed requests and layout overflow on phone and desktop sizes. It only reads pages and changes nothing.
3. **Docs lookup**: Jarvis can look up current library and framework docs while it plans fixes, and it shows the source for each answer.
4. **Speed check for any page**: the Lighthouse check grows from the homepage only to any Revora page or published customer page. It covers phone and desktop.
5. **Settings card**: each tool appears as "ready", "needs key" or "quota reached". Nothing is reported as passed unless it actually ran.

Every tool stays read-only and free-tier only. Free-only mode, spending caps and approval taps stay as they are.

## Keys you need (all free)
- Google PageSpeed: https://developers.google.com/speed/docs/insights/v5/get-started (click "Get a Key"). Secret name: `GOOGLE_PAGESPEED_API_KEY`
- Browserless (live page check): https://account.browserless.io/signup (free plan). Secret name: `BROWSERLESS_API_KEY`
- Context7 (docs lookup): https://context7.com/dashboard. Secret name: `CONTEXT7_API_KEY`

Once the plan is approved, I'll open a secure form so you can paste the keys. You never paste them into chat.

## Technical details
- New modules: `src/lib/jarvis-browser-check.ts` (Browserless /function endpoint, bounded timeout, SSRF-guarded to Revora and verified tenant domains), `src/lib/jarvis-docs-lookup.ts` (Context7 REST).
- Register them in `jarvis-tool-registry.ts` and `jarvis-diagnostic-tools.server.ts`. PageSpeed accepts allow-listed URLs and both strategies.
- A missing key returns `unavailable`, never a passing result. Quota limits (429) are reported as such.
- Add unit tests for URL allow-listing, the missing-key state and result parsing. HTTP calls are stubbed.
- After the keys are saved, run one smoke run per tool. Changes need publishing to reach live Jarvis.
