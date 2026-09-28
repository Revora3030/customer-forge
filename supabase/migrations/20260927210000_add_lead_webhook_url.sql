-- Per-workspace outbound lead webhook.
-- Server-side code reads this value with the privileged client; it is never
-- included in the public website projection.
ALTER TABLE public.website_settings
  ADD COLUMN IF NOT EXISTS lead_webhook_url text;

ALTER TABLE public.website_settings
  DROP CONSTRAINT IF EXISTS website_settings_lead_webhook_https;

ALTER TABLE public.website_settings
  ADD CONSTRAINT website_settings_lead_webhook_https
  CHECK (
    lead_webhook_url IS NULL
    OR lead_webhook_url ~* '^https://[^[:space:]]+$'
  );
