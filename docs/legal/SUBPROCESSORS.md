# Vendors that process personal data (subprocessors)

> Review with a lawyer before relying on this. It lists the services the code
> calls. It does **not** mean a data processing agreement (DPA) is in place.
> The owner should accept or sign each vendor's DPA (most are click-through in
> the vendor's dashboard or terms) and record the date below.

| Vendor | What it does for Revora | Personal data involved | Where in code / config | DPA accepted (owner fills) |
|---|---|---|---|---|
| Supabase (via Lovable Cloud) | Database, auth, storage, edge functions, auth email | All account, workspace, lead and prospect data | `src/integrations/supabase`, `supabase/` | |
| Lovable (Cloud + AI gateway) | Hosting platform; AI gateway to OpenAI, Anthropic and Google models | Prompts containing business details and site content | `src/lib/ai/lovable-models.ts`, `LOVABLE_API_KEY` | |
| Cloudflare | DNS, CDN, security, location lookup for the cookie banner | IP addresses, request metadata | `/cdn-cgi/trace` in `src/lib/consent.ts` | |
| Stripe | Checkout, subscriptions, billing portal | Name, email, card data (held by Stripe) | `src/lib/stripe.functions.ts` | |
| Google Analytics 4 (G-WC1X5HWN7W) | Marketing-site analytics | Cookie IDs, IP, page views | `src/lib/ga4.ts` | |
| Google Ads (AW-18474339242) | Conversion measurement | Cookie IDs, click IDs | `src/lib/google-ads.ts` | |
| Microsoft Clarity | Heatmaps and session replay on marketing pages | Cookie IDs, interactions (masked) | `src/lib/clarity.ts` | |
| Google (Gmail API) | Sending outreach email | Prospect name and email, message content | `src/lib/prospect-outreach.server.ts`, `src/lib/integrations/google.server.ts` | |
| Google Maps / Places / Fonts | Embedded maps and fonts on client sites; business lookups | Visitor IP (maps/fonts); public business data | `ContactMap.tsx`, `SiteFontLinks.tsx`, `maps-photos.server.ts` | |
| Twilio (optional) | SMS | Phone numbers, message content | `TWILIO_*` secrets | |
| Sentry (optional) | Error monitoring | URLs, browser info, possibly user ID | `SENTRY_DSN`, `monitoring.server.ts` | |
| ImprovMX | Forwarding mail sent to @revoragrowthsystems.com | Emails sent to hello@ | DNS MX records | |
| Perplexity (optional) | Web research for the internal assistant | Search queries | `research.server.ts`, `perplexity-agent.server.ts` | |
| ElevenLabs (optional) | Voice output for the internal assistant | Text being spoken | `jarvis-voice.server.ts` | |
| Resend, Instagram, n8n, OTLP/Langfuse (optional) | Only if their secrets are set | Varies | `.env.example` | |
| Pexels / Unsplash / Pixabay | Stock media | Search terms only (no personal data) | `hero-stock-video.ts`, `trade-photo-picks.ts` | n/a |

Keep this file in step with the "Service providers" section of `/privacy` (`src/routes/privacy.tsx`).
