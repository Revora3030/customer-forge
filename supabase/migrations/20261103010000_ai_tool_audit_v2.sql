-- PAI-1 tool registry v2: richer audit row for every AI tool call.
-- Additive only. All new columns are nullable, so the existing writer
-- (src/lib/ai/tools.server.ts) keeps working unchanged, and the v2 writer
-- falls back to the original columns if this migration is not applied yet.
alter table public.ai_tool_audit
  add column if not exists run_id uuid,
  add column if not exists step_id uuid,
  add column if not exists risk text,
  add column if not exists args_hash text,
  add column if not exists result_status text,
  add column if not exists idempotency_key text;

alter table public.ai_tool_audit
  drop constraint if exists ai_tool_audit_risk_check;
alter table public.ai_tool_audit
  add constraint ai_tool_audit_risk_check
  check (risk is null or risk in ('read', 'write_internal', 'send_external'));

create index if not exists ai_tool_audit_run_idx
  on public.ai_tool_audit (run_id, created_at)
  where run_id is not null;
create index if not exists ai_tool_audit_idempotency_idx
  on public.ai_tool_audit (organization_id, idempotency_key)
  where idempotency_key is not null;

-- No policy change: the table stays service-role only (RLS is already enabled
-- and the only policy is "ai tool audit service role only").
