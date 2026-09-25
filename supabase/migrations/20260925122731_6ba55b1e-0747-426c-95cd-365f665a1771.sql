create table public.ai_model_registry (
  provider text not null,
  model text not null,
  display_name text,
  capabilities jsonb not null default '{}'::jsonb,
  input_modalities text[] not null default '{}',
  output_modalities text[] not null default '{}',
  context_tokens integer,
  quality integer not null default 0,
  reliability integer not null default 0,
  latency_ms integer,
  paid boolean not null default false,
  specialist boolean not null default false,
  evidence text not null default 'declared',
  healthy boolean not null default false,
  blocked_reason text,
  verified_at timestamptz,
  last_seen_at timestamptz not null default now(),
  retired boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (provider, model)
);
grant select on public.ai_model_registry to authenticated;
grant all on public.ai_model_registry to service_role;
alter table public.ai_model_registry enable row level security;
create policy "Platform admins read the model registry" on public.ai_model_registry
  for select to authenticated using (exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role::text = 'super_admin'));

create table public.ai_team_trace (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  organization_id uuid references public.organizations(id) on delete cascade,
  stage text not null,
  purpose text not null,
  lane text not null,
  provider text,
  model text,
  ok boolean not null,
  latency_ms integer,
  reason text,
  contribution text,
  cost_microcents bigint not null default 0
);
create index ai_team_trace_org_created on public.ai_team_trace (organization_id, created_at desc);
create index ai_team_trace_created on public.ai_team_trace (created_at desc);
grant select on public.ai_team_trace to authenticated;
grant all on public.ai_team_trace to service_role;
alter table public.ai_team_trace enable row level security;
create policy "Platform admins read the team trace" on public.ai_team_trace
  for select to authenticated using (exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role::text = 'super_admin'));