-- Owner confirmed 2026-10-29: bigdawg09091@gmail.com and danaysiaingram42@gmail.com are
-- Revora test accounts, not customers. Drop every event in their browser sessions from
-- marketing analytics, the same rule already applied to Revora staff sessions (0019).
with test_emails(email) as (
  values ('bigdawg09091@gmail.com'), ('danaysiaingram42@gmail.com')
), test_sessions as (
  select distinct m.session_id
  from public.marketing_conversions m
  where m.session_id is not null
    and lower(m.email) in (select email from test_emails)
)
delete from public.marketing_conversions m
where lower(coalesce(m.email,'')) in (select email from test_emails)
   or m.session_id in (select session_id from test_sessions);