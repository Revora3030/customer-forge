# Add more free tools for building customer websites

## What "free" honestly means here
- No picture tool is unlimited. Free options have daily limits and can be slow or rate-limited.
- Free pictures are illustrations only. They are never shown as a customer's real work, and they are not allowed to include made-up phone numbers, logos or text.
- Your existing rule stays: only free models while paid funds are off, with the $100 monthly cap and your approval for anything paid.

## 1. Free picture making (main focus)
- Reuse the existing Cloudflare picture connection as the first free picture source.
- Add two more free sources as backups: Hugging Face (free key) and Pollinations (no key).
- Each picture goes through the existing quality check: no fake text or numbers, right size, and a label saying it is an AI illustration.
- When every free source is busy, the build waits and shows the retry time, the same way it waits for writing models now.

## 2. Free tools for the rest of the build
- Free stock photos from Unsplash and Pexels (free keys), with the photographer credit shown on the site.
- Free icons and fonts already in the app stay the default.
- The page speed, live page check and docs tools you just added also run on each customer site before it is called ready.
- Free accessibility check (contrast, labels, headings) on every page after a build.

## 3. Jarvis and builder controls
- New "Free tools" status card listing each source: connected, missing key, or over its limit.
- Jarvis can explain which source made each picture and why.

## 4. Checks
- Tests for picture order, fallback when a source is busy, credit lines, and the fake-text rejection.
- One small free test picture per source, only after you confirm.

## Keys you would need (all free)
- Hugging Face: https://huggingface.co/settings/tokens
- Unsplash: https://unsplash.com/oauth/applications
- Pexels: https://www.pexels.com/api/new/
- Cloudflare is already connected; Pollinations needs no key.

## Not included
- Paid picture or video models, publishing, emails, or live customer builds without your OK.

## Technical details
- Extend `src/lib/media/image-capability.server.ts` and the provider list next to `src/lib/ai/providers/cloudflare-image.ts`; no second picture system.
- Stock sources fill the existing `assetSource: "stock"` and `license`/`attribution` fields in `first-build-images.types.ts`.
- Busy sources go through the existing worker capacity deferral only.
- Status card extends `src/components/app/jarvis/FreeToolsPanel.tsx`.
