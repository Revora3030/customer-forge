-- Owner request 2026-10-29: remove Revora staff (super admin) test activity from marketing analytics.
-- Deletes every event in a browser session where a super-admin email was recorded.
with staff_emails as (
  select lower(u.email) as email
  from public.user_roles r join auth.users u on u.id = r.user_id
  where r.role = 'super_admin' and u.email is not null
), staff_sessions as (
  select distinct m.session_id
  from public.marketing_conversions m
  where m.session_id is not null and lower(m.email) in (select email from staff_emails)
)
delete from public.marketing_conversions m
where lower(coalesce(m.email,'')) in (select email from staff_emails)
   or m.session_id in (select session_id from staff_sessions);