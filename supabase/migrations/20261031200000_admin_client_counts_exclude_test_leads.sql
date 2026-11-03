-- L12 follow-up: the admin client list must not count a "Send a test lead"
-- sample (leads.source = 'test_lead') as a real lead.
--
-- ADDITIVE ONLY: a new version of the same function (CREATE OR REPLACE), same
-- name, same arguments, same columns. No table, column, policy or row is
-- created, changed or removed, and re-running is safe. If this migration has
-- not been published yet the admin page keeps working with the previous
-- version, or with its table-read fallback, which already skips test leads.
--
-- Security is unchanged: SECURITY INVOKER, empty search_path, EXECUTE for
-- service_role only, no arguments, counts only.

CREATE OR REPLACE FUNCTION public.admin_client_counts()
RETURNS TABLE (
  organization_id uuid,
  active_services bigint,
  bookable_services bigint,
  media bigint,
  active_quote_forms bigint,
  leads bigint,
  appointments bigint,
  analytics_events bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    t.organization_id,
    sum(t.active_services)::bigint,
    sum(t.bookable_services)::bigint,
    sum(t.media)::bigint,
    sum(t.active_quote_forms)::bigint,
    sum(t.leads)::bigint,
    sum(t.appointments)::bigint,
    sum(t.analytics_events)::bigint
  FROM (
    SELECT s.organization_id,
           count(*) FILTER (WHERE s.is_active) AS active_services,
           count(*) FILTER (WHERE s.is_active AND s.bookable) AS bookable_services,
           0::bigint AS media, 0::bigint AS active_quote_forms,
           0::bigint AS leads, 0::bigint AS appointments, 0::bigint AS analytics_events
      FROM public.services s GROUP BY s.organization_id
    UNION ALL
    SELECT m.organization_id, 0, 0, count(*), 0, 0, 0, 0
      FROM public.media m GROUP BY m.organization_id
    UNION ALL
    SELECT f.organization_id, 0, 0, 0, count(*) FILTER (WHERE f.is_active), 0, 0, 0
      FROM public.quote_forms f GROUP BY f.organization_id
    UNION ALL
    SELECT l.organization_id, 0, 0, 0, 0, count(*), 0, 0
      FROM public.leads l
     WHERE l.source IS DISTINCT FROM 'test_lead'
     GROUP BY l.organization_id
    UNION ALL
    SELECT a.organization_id, 0, 0, 0, 0, 0, count(*), 0
      FROM public.appointments a GROUP BY a.organization_id
    UNION ALL
    SELECT e.organization_id, 0, 0, 0, 0, 0, 0, count(*)
      FROM public.analytics_events e GROUP BY e.organization_id
  ) t
  WHERE t.organization_id IS NOT NULL
  GROUP BY t.organization_id
  ORDER BY t.organization_id;
$$;

REVOKE ALL ON FUNCTION public.admin_client_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_client_counts() TO service_role;

COMMENT ON FUNCTION public.admin_client_counts() IS
  'Admin client list counts per organization (test leads left out). Service role only; the app checks super admin before calling.';
