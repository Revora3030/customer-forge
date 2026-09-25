create or replace function public.prune_old_operational_records()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r jsonb := '{}'::jsonb; n int;
begin
  delete from public.builder_progress where created_at < now() - interval '30 days'; get diagnostics n = row_count; r := r || jsonb_build_object('builder_progress', n);
  delete from public.error_events where created_at < now() - interval '90 days'; get diagnostics n = row_count; r := r || jsonb_build_object('error_events', n);
  -- Spend history kept 400 days so monthly caps and yearly comparisons stay correct.
  delete from public.ai_usage_events where created_at < now() - interval '400 days'; get diagnostics n = row_count; r := r || jsonb_build_object('ai_usage_events', n);
  delete from public.luna_usage_events where created_at < now() - interval '400 days'; get diagnostics n = row_count; r := r || jsonb_build_object('luna_usage_events', n);
  return r;
end $$;
revoke all on function public.prune_old_operational_records() from public, anon, authenticated;
grant execute on function public.prune_old_operational_records() to service_role;