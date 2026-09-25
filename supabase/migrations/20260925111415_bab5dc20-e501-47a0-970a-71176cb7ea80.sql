create or replace function public.current_site_revision(_organization_id uuid)
returns text language sql stable security definer set search_path = public, private
as $$ select private.site_revision_hash(_organization_id) $$;
revoke all on function public.current_site_revision(uuid) from public, anon, authenticated;
grant execute on function public.current_site_revision(uuid) to service_role;