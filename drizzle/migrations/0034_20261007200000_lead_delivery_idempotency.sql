-- Idempotency key on outbound lead delivery telemetry.
--
-- Additive and backwards-compatible: a nullable column plus an index. Existing
-- rows keep a null key; the application writes `lead.created:<lead_id>` for
-- every new attempt (the same key sent to the CRM in the body and the
-- `idempotency-key` header), so duplicate dispatches of one lead are
-- traceable. The server falls back to the old row shape while this migration
-- is not applied yet.

alter table public.lead_delivery_logs
  add column if not exists idempotency_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lead_delivery_logs_idempotency_key_length'
      and conrelid = 'public.lead_delivery_logs'::regclass
  ) then
    alter table public.lead_delivery_logs
      add constraint lead_delivery_logs_idempotency_key_length
      check (idempotency_key is null or char_length(idempotency_key) <= 200);
  end if;
end $$;

create index if not exists lead_delivery_logs_org_idempotency_idx
  on public.lead_delivery_logs(organization_id, idempotency_key)
  where idempotency_key is not null;

-- Grants and RLS are unchanged and restated explicitly (no client writes).
alter table public.lead_delivery_logs enable row level security;
grant select on public.lead_delivery_logs to authenticated;
grant all on public.lead_delivery_logs to service_role;
