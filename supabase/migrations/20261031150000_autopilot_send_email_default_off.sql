-- Outreach email is opt-in: a new settings row starts with send_email OFF.
-- Only the column default changes; the existing row keeps whatever the owner chose.
ALTER TABLE public.prospect_autopilot_settings ALTER COLUMN send_email SET DEFAULT false;
