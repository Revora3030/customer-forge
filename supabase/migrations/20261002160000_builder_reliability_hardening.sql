-- Builder runtime reliability hardening.
-- Generation jobs expose the lease heartbeat and originating request for
-- recovery/observability. Lead delivery logs retain durable retry metadata.
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

alter table public.lead_delivery_logs
  drop constraint if exists lead_delivery_logs_attempt_number_valid;

alter table public.lead_delivery_logs
  add constraint lead_delivery_logs_attempt_number_valid
  check (attempt_number between 1 and 10);

create index if not exists lead_delivery_logs_retry_idx
  on public.lead_delivery_logs (next_attempt_at)
  where delivery_status = 'failed' and retryable = true and next_attempt_at is not null;

create unique index if not exists lead_delivery_logs_idempotency_idx
  on public.lead_delivery_logs (organization_id, idempotency_key)
  where idempotency_key is not null;