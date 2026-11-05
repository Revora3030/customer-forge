-- LOV-13: hashed device + country for optional new-device sign-in emails.
-- Ships OFF (REVORA_NEW_DEVICE_EMAIL=1 to enable). No IP, UA, or raw device id.

BEGIN;

CREATE TABLE IF NOT EXISTS public.owner_sign_in_devices (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash TEXT NOT NULL CHECK (char_length(device_hash) = 64),
  country TEXT NOT NULL DEFAULT 'unknown' CHECK (char_length(country) BETWEEN 1 AND 8),
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_hash)
);

CREATE INDEX IF NOT EXISTS owner_sign_in_devices_user_seen_idx
  ON public.owner_sign_in_devices (user_id, last_seen DESC);

CREATE TABLE IF NOT EXISTS public.owner_sign_in_alert_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_alert_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.owner_sign_in_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_sign_in_alert_state ENABLE ROW LEVEL SECURITY;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'owner_sign_in_devices'
      AND policyname = 'owner reads own sign-in devices'
  ) THEN
    CREATE POLICY "owner reads own sign-in devices" ON public.owner_sign_in_devices
      FOR SELECT TO authenticated
      USING (user_id = (SELECT auth.uid()));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'owner_sign_in_alert_state'
      AND policyname = 'owner reads own sign-in alert state'
  ) THEN
    CREATE POLICY "owner reads own sign-in alert state" ON public.owner_sign_in_alert_state
      FOR SELECT TO authenticated
      USING (user_id = (SELECT auth.uid()));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'owner_sign_in_devices'
      AND policyname = 'service role full access devices'
  ) THEN
    CREATE POLICY "service role full access devices" ON public.owner_sign_in_devices
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'owner_sign_in_alert_state'
      AND policyname = 'service role full access alert state'
  ) THEN
    CREATE POLICY "service role full access alert state" ON public.owner_sign_in_alert_state
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$policy$;

-- Security: authenticated users may only READ their own rows. All writes
-- (register device, update last_seen, alert cooldown) happen server-side with
-- the service-role client, so a stolen session cannot pre-register its own
-- device or silence the alert.
DROP POLICY IF EXISTS "owner inserts own sign-in devices" ON public.owner_sign_in_devices;
DROP POLICY IF EXISTS "owner updates own sign-in devices" ON public.owner_sign_in_devices;
DROP POLICY IF EXISTS "owner upserts own sign-in alert state" ON public.owner_sign_in_alert_state;
DROP POLICY IF EXISTS "owner updates own sign-in alert state" ON public.owner_sign_in_alert_state;

REVOKE ALL ON TABLE public.owner_sign_in_devices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.owner_sign_in_alert_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.owner_sign_in_devices TO authenticated;
GRANT SELECT ON TABLE public.owner_sign_in_alert_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.owner_sign_in_devices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.owner_sign_in_alert_state TO service_role;

COMMENT ON TABLE public.owner_sign_in_devices IS
  'Hashed browser device id + country for optional new-device sign-in emails (LOV-13). No IP or UA.';
COMMENT ON TABLE public.owner_sign_in_alert_state IS
  'Last new-device alert timestamp per user; caps at one email per day.';

COMMIT;
