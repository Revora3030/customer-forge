create table public.site_vitals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric text not null check (metric in ('lcp','cls','inp','ttfb','fcp')),
  value numeric not null check (value >= 0 and value <= 3600000),
  rating text not null check (rating in ('good','needs-improvement','poor')),
  path text,
  device text,
  session_id text,
  created_at timestamptz not null default now()
);

create index site_vitals_org_created_idx on public.site_vitals(organization_id, created_at desc);
create unique index site_vitals_session_metric_idx
  on public.site_vitals(organization_id, session_id, metric, coalesce(path, ''))
  where session_id is not null;

grant insert on public.site_vitals to anon;
grant select, insert on public.site_vitals to authenticated;
grant all on public.site_vitals to service_role;

alter table public.site_vitals enable row level security;

create policy site_vitals_public_insert on public.site_vitals
for insert to anon
with check (
  private.org_site_published(organization_id)
  and char_length(coalesce(path, '')) <= 200
  and char_length(coalesce(device, '')) <= 20
  and char_length(coalesce(session_id, '')) <= 60
);

create policy site_vitals_member_read on public.site_vitals
for select to authenticated
using (private.is_org_member(organization_id) or private.is_super_admin());

create policy site_vitals_member_insert on public.site_vitals
for insert to authenticated
with check (private.is_org_member(organization_id));

create policy site_vitals_no_update on public.site_vitals
as restrictive for update to anon, authenticated using (false) with check (false);

create policy site_vitals_no_delete on public.site_vitals
as restrictive for delete to anon, authenticated using (false);