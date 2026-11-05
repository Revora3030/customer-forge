-- LOV-4: visitor-side error feed for published client sites.
--
-- A tiny script on each published site reports JavaScript errors, failed form
-- submits and broken images. The endpoint stores ONE row per site per day per
-- kind per message (a count, not a log): no IP, no cookies, no form values, no
-- visitor id. Kept 30 days. Owners read their own site's rows (RLS); writes go
-- through record_visitor_error, which only the service role can call.
-- Additive and idempotent; no DROP.

BEGIN;

CREATE TABLE IF NOT EXISTS public.visitor_error_events (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('js', 'form', 'image')),
  message_hash TEXT NOT NULL CHECK (char_length(message_hash) BETWEEN 4 AND 40),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 300),
  page_path TEXT NOT NULL DEFAULT '/' CHECK (char_length(page_path) <= 200),
  occurrences INTEGER NOT NULL DEFAULT 1 CHECK (occurrences >= 1),
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, day, kind, message_hash)
);

CREATE INDEX IF NOT EXISTS visitor_error_events_org_day_idx
  ON public.visitor_error_events (organization_id, day DESC);

ALTER TABLE public.visitor_error_events ENABLE ROW LEVEL SECURITY;

DO $policy$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'visitor_error_events' AND policyname = 'members read visitor errors') THEN
    CREATE POLICY "members read visitor errors" ON public.visitor_error_events
      FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'visitor_error_events' AND policyname = 'service role full access') THEN
    CREATE POLICY "service role full access" ON public.visitor_error_events
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$policy$;

REVOKE ALL ON TABLE public.visitor_error_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.visitor_error_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.visitor_error_events TO service_role;

COMMENT ON TABLE public.visitor_error_events IS
  'Per-site, per-day counts of visitor-side problems (js/form/image). No IP, cookies or form values. Pruned after 30 days.';

-- Caps distinct messages per site per day so a noisy page cannot grow the table.
CREATE OR REPLACE FUNCTION public.record_visitor_error(
  p_organization_id UUID, p_kind TEXT, p_hash TEXT, p_message TEXT, p_path TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  distinct_today INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.visitor_error_events
    WHERE organization_id = p_organization_id AND day = current_date AND kind = p_kind AND message_hash = p_hash
  ) THEN
    UPDATE public.visitor_error_events
       SET occurrences = occurrences + 1, last_seen = now()
     WHERE organization_id = p_organization_id AND day = current_date AND kind = p_kind AND message_hash = p_hash;
    RETURN TRUE;
  END IF;
  SELECT count(*) INTO distinct_today FROM public.visitor_error_events
   WHERE organization_id = p_organization_id AND day = current_date;
  IF distinct_today >= 200 THEN
    RETURN FALSE;
  END IF;
  INSERT INTO public.visitor_error_events (organization_id, day, kind, message_hash, message, page_path)
  VALUES (p_organization_id, current_date, p_kind, p_hash, left(p_message, 300), left(p_path, 200))
  ON CONFLICT (organization_id, day, kind, message_hash)
  DO UPDATE SET occurrences = public.visitor_error_events.occurrences + 1, last_seen = now();
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_visitor_error(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_visitor_error(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; visitor error prune not scheduled.';
    RETURN;
  END IF;
  PERFORM cron.schedule(
    'revora-visitor-error-events-prune',
    '47 3 * * *',
    $cmd$delete from public.visitor_error_events where day < current_date - 30$cmd$
  );
END $$;

COMMIT;
