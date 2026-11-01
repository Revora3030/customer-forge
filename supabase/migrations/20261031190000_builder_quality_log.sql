-- Builder quality log: video-bar scores and failures per trade (Site Factory builder quality gate, part 4d).
-- NEEDS LOVABLE: apply through the reviewed Supabase migration workflow. Until it is applied the app keeps building
-- and publishing normally: the log writer treats a missing table as "log not available" and carries on.
--
-- ADDITIVE ONLY: one new table, its indexes and its policy. Nothing existing is dropped, renamed or altered.
--
-- One row per quality event for a site: a gate attempt (score + failing criteria), a finished build score, or a
-- publish check (the server-side video-bar decision on a publish / go-live / live edit).
-- Holds no customer contact details and no free text: only trade, scores, criterion ids, section ids and mode.
--
-- Access: platform super admins can read. Only the service role writes. Workspace owners do not read this table;
-- they see their own score and fixes in the Publish panel.

create table if not exists public.builder_quality_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trade_slug text not null check (char_length(trade_slug) between 1 and 80),
  blueprint_source text check (blueprint_source is null or blueprint_source in ('trade', 'alias', 'archetype', 'generic')),
  event_kind text not null check (event_kind in ('gate_attempt', 'build_score', 'publish_check')),
  attempt integer not null default 0 check (attempt between 0 and 10),
  score integer check (score is null or score between 0 and 100),
  bar integer check (bar is null or bar between 0 and 100),
  passed boolean,
  capped text check (capped is null or capped in ('invented_facts', 'no_lead_capture')),
  gate_mode text check (gate_mode is null or gate_mode in ('enforce', 'warn', 'off')),
  failures jsonb not null default '[]'::jsonb,
  step_roles jsonb,
  created_at timestamptz not null default now()
);

create index if not exists builder_quality_log_trade_created_idx
  on public.builder_quality_log (trade_slug, created_at desc);
create index if not exists builder_quality_log_org_created_idx
  on public.builder_quality_log (organization_id, created_at desc);

alter table public.builder_quality_log enable row level security;

drop policy if exists "builder_quality_log super admin read" on public.builder_quality_log;
create policy "builder_quality_log super admin read" on public.builder_quality_log
  for select to authenticated
  using (private.is_super_admin());

revoke all on public.builder_quality_log from anon;
revoke insert, update, delete on public.builder_quality_log from authenticated;
grant select on public.builder_quality_log to authenticated;
grant all on public.builder_quality_log to service_role;
