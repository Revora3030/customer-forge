-- Audit item 14, database side: per-client counts for the admin client list in
-- one grouped query instead of reading six whole tables into the server.
--
-- ADDITIVE ONLY: one new function. No table, column, policy or row is created,
-- changed or removed, so re-running is safe (CREATE OR REPLACE).
--
-- Security: SECURITY INVOKER (runs with the caller's own rights, never the
-- owner's), fixed empty search_path, and EXECUTE is granted to service_role
-- only. That is the same access the admin list already uses: the server checks
-- the caller is a super admin first, then reads with the service role. Anonymous
-- and signed-in users cannot call it. The function takes no arguments and
-- returns only counts, never row contents.
--
-- Output matches what listClients computed in JS: services and quote forms
-- count only active rows, bookable only active + bookable services, media /
-- leads / appointments / analytics events count every row. Organizations with
-- nothing in any table simply have no row (the caller treats that as zero).

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
      FROM public.leads l GROUP BY l.organization_id
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
  'Admin client list counts per organization. Service role only; the app checks super admin before calling.';
