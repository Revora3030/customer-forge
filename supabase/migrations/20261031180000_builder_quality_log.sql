-- Builder quality log (Site Factory quality pipeline, QP-6 learning loop).
-- NEEDS LOVABLE: apply through the reviewed Supabase migration workflow. Until it is applied the app keeps
-- building sites normally: the log writer treats a missing table as "log not available" and carries on.
--
-- One row per quality event for a generated site: a gate attempt (score + failures), a finished build score,
-- or an owner change request. Read per trade to see which blueprints and steps fail most.
-- Holds no customer contact details: only trade, scores, failure codes and a short change-request excerpt.

create table if not exists public.builder_quality_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trade_slug text not null check (char_length(trade_slug) between 1 and 80),
  blueprint_source text check (blueprint_source is null or blueprint_source in ('trade', 'alias', 'archetype', 'generic')),
  event_kind text not null check (event_kind in ('gate_attempt', 'build_score', 'change_request')),
  attempt integer not null default 0 check (attempt between 0 and 10),
  score integer check (score is null or score between 0 and 100),
  passed boolean,
  failures jsonb not null default '[]'::jsonb,
  step_roles jsonb,
  change_request text check (change_request is null or char_length(change_request) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists builder_quality_log_trade_created_idx
  on public.builder_quality_log (trade_slug, created_at desc);
create index if not exists builder_quality_log_org_created_idx
  on public.builder_quality_log (organization_id, created_at desc);

alter table public.builder_quality_log enable row level security;

-- Workspace owners and admins read their own workspace's rows; super admins read all. Only the service role writes.
drop policy if exists "builder_quality_log owner or admin read" on public.builder_quality_log;
create policy "builder_quality_log owner or admin read" on public.builder_quality_log
  for select to authenticated
  using (public.can_manage_org(organization_id) or public.is_super_admin());

revoke all on public.builder_quality_log from anon;
revoke insert, update, delete on public.builder_quality_log from authenticated;
grant select on public.builder_quality_log to authenticated;
grant all on public.builder_quality_log to service_role;
