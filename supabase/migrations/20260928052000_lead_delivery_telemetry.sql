-- Durable outbound lead webhook telemetry.
-- The lead row remains the source of truth; this table only records delivery
-- attempts so provider outages never erase or invalidate a customer lead.
create table if not exists public.lead_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  delivery_status text not null check (delivery_status in ('delivered', 'failed', 'skipped')),
  http_status integer,
  reason text,
  retryable boolean not null default false,
  attempted_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint lead_delivery_logs_http_status_valid
    check (http_status is null or http_status between 100 and 599),
  constraint lead_delivery_logs_reason_length
    check (reason is null or char_length(reason) <= 500)
);

create index if not exists lead_delivery_logs_org_attempted_idx
  on public.lead_delivery_logs(organization_id, attempted_at desc);

create index if not exists lead_delivery_logs_lead_attempted_idx
  on public.lead_delivery_logs(lead_id, attempted_at desc);

alter table public.lead_delivery_logs enable row level security;

-- Workspace members can inspect delivery history for their own tenant.
create policy lead_delivery_logs_member_select
  on public.lead_delivery_logs
  for select to authenticated
  using (public.is_org_member(organization_id));

-- There is intentionally no public/anon insert policy. Server-side delivery
-- code records outcomes; browser clients cannot forge delivery telemetry.
