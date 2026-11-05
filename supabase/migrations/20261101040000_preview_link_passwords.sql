-- LOV-6: optional password on a shared preview link.
--
-- Additive. Existing links keep working unchanged (no row in the secrets table
-- means no password).
--
-- * The password HASH lives in its own table that no browser role can read:
--   website_preview_links is readable by every workspace member, so a hash
--   there would be visible to them. The secrets table has RLS on with no
--   policies and no grants except service_role.
-- * website_preview_links.password_protected is a display-only flag so the
--   links list can show a lock. The server decides from the secrets table.
-- * Wrong-password attempts are counted in a service-role-only table through an
--   atomic function, keyed by HMACs (never raw IPs).

ALTER TABLE public.website_preview_links
  ADD COLUMN IF NOT EXISTS password_protected boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.website_preview_link_secrets (
  link_id uuid PRIMARY KEY REFERENCES public.website_preview_links(id) ON DELETE CASCADE,
  password_hash text NOT NULL CHECK (char_length(password_hash) BETWEEN 20 AND 400),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.website_preview_link_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.website_preview_link_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.website_preview_link_secrets TO service_role;

COMMENT ON TABLE public.website_preview_link_secrets IS
  'Salted PBKDF2 password hash for a shared preview link. Service-role only (RLS on, no policies).';

CREATE TABLE IF NOT EXISTS public.website_preview_unlock_attempts (
  key text PRIMARY KEY CHECK (char_length(key) BETWEEN 8 AND 200),
  window_start timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS website_preview_unlock_attempts_window_idx
  ON public.website_preview_unlock_attempts (window_start);

ALTER TABLE public.website_preview_unlock_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.website_preview_unlock_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.website_preview_unlock_attempts TO service_role;

-- Counts one attempt for p_key and says whether it is allowed. The count
-- restarts once the window has passed. Atomic: one upsert, no read-then-write.
CREATE OR REPLACE FUNCTION public.preview_unlock_attempt(p_key text, p_max integer, p_window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempts integer;
BEGIN
  IF p_key IS NULL OR p_max IS NULL OR p_max < 1 OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RETURN false;
  END IF;

  -- Housekeeping: drop anything older than a day.
  DELETE FROM public.website_preview_unlock_attempts WHERE window_start < now() - interval '1 day';

  INSERT INTO public.website_preview_unlock_attempts AS a (key, window_start, attempts)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE
    SET attempts = CASE
          WHEN a.window_start < now() - make_interval(secs => p_window_seconds) THEN 1
          ELSE a.attempts + 1
        END,
        window_start = CASE
          WHEN a.window_start < now() - make_interval(secs => p_window_seconds) THEN now()
          ELSE a.window_start
        END
  RETURNING attempts INTO v_attempts;

  RETURN v_attempts <= p_max;
END;
$$;

-- A correct password clears that visitor's own counter.
CREATE OR REPLACE FUNCTION public.preview_unlock_clear(p_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.website_preview_unlock_attempts WHERE key = p_key;
$$;

REVOKE ALL ON FUNCTION public.preview_unlock_attempt(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_unlock_clear(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_unlock_attempt(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_unlock_clear(text) TO service_role;
