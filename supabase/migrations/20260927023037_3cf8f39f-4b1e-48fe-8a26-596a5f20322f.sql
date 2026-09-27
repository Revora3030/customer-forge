create extension if not exists pg_cron;
create extension if not exists pg_net;
create table if not exists public.internal_job_config (key text primary key, value text not null);
grant all on public.internal_job_config to service_role;
revoke all on public.internal_job_config from anon, authenticated;
alter table public.internal_job_config enable row level security;