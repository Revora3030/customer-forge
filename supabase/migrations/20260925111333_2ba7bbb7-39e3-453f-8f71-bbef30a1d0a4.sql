create or replace function public.current_site_revision(_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public, private
as $$
  select case
    when private.is_org_member(_organization_id) or private.is_super_admin()
      then private.site_revision_hash(_organization_id)
    else null
  end
$$;
revoke all on function public.current_site_revision(uuid) from public, anon;
grant execute on function public.current_site_revision(uuid) to authenticated, service_role;