-- Founder-saved Gmail OAuth for text-only autopilot. Service role only.
-- Environment variables still win when they are set. The column stores the
-- OAuth client, refresh token, sender and mailing address; authenticated
-- roles have no grant on this table.

ALTER TABLE public.prospect_autopilot_settings
  ADD COLUMN IF NOT EXISTS gmail jsonb;

COMMENT ON COLUMN public.prospect_autopilot_settings.gmail IS
  'Server-only Gmail OAuth and mailing address for text-only prospect autopilot. Never returned to the browser.';

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'public.prospect_inbound'::regclass
      AND con.contype = 'c'
      AND att.attname = 'status'
  LOOP
    EXECUTE format('ALTER TABLE public.prospect_inbound DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.prospect_inbound
  ADD CONSTRAINT prospect_inbound_status_check
  CHECK (status IN ('pending', 'processing', 'awaiting_operator', 'handled', 'dismissed', 'auto_replied'));
