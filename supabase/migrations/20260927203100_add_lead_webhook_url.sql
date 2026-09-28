-- Per-workspace outbound lead routing. This column is intentionally not exposed
-- through public_website_settings, so visitor-facing site reads can never reveal
-- a customer's automation endpoint or embedded token.
ALTER TABLE public.website_settings
  ADD COLUMN IF NOT EXISTS lead_webhook_url text;

ALTER TABLE public.website_settings
  ADD CONSTRAINT website_settings_lead_webhook_url_length
  CHECK (lead_webhook_url IS NULL OR char_length(lead_webhook_url) <= 2048);

-- Keep the authenticated workspace shell live when public submissions create
-- leads/notifications or an owner changes review state. RLS remains the data
-- boundary for Realtime subscribers.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
