-- Builder reliability continuation:
-- keep long-running generation leases alive and bind worker lifecycle records
-- to the originating request. Durable lead retry state lives alongside delivery
-- telemetry so a provider outage is observable and resumable.
alter table public.generation_jobs
  add column if not exists locked_at timestamptz,
  add column if not exists request_id text;

create index if not exists generation_jobs_processing_lease_idx
  on public.generation_jobs (organization_id, lease_expires_at)
  where status = 'processing';

alter table public.lead_delivery_logs
  add column if not exists attempt_number integer not null default 1,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists idempotency_key text;

create unique index if not exists lead_delivery_logs_idempotency_attempt_idx
  on public.lead_delivery_logs (organization_id, idempotency_key, attempt_number)
  where idempotency_key is not null;