-- Jarvis attachments (Phase A): private storage, metadata, and an atomic monthly upload quota.
-- Every table and function below is service-role only; browser roles have no direct access.
-- Apply through the reviewed Supabase migration workflow. Video and PDF are intentionally unsupported here.
-- storage.buckets statement omitted: existing jarvis-attachments bucket verified identical.

create table if not exists public.jarvis_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid references public.jarvis_messages(id) on delete set null,
  storage_path text not null unique
    check (storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|txt|csv|json)$'),
  original_name text not null default '' check (char_length(original_name) <= 120),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','text/plain','text/csv','application/json')),
  file_size_bytes integer not null check (file_size_bytes > 0 and file_size_bytes <= 4194304),
  kind text not null check (kind in ('image','document')),
  analysis_status text not null check (analysis_status in ('analyzed','unavailable','excerpt')),
  extracted_summary text not null default '' check (char_length(extracted_summary) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists jarvis_attachments_user_created_idx on public.jarvis_attachments (user_id, created_at desc);
create index if not exists jarvis_attachments_message_idx on public.jarvis_attachments (message_id);

create table if not exists public.jarvis_upload_quotas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  period_start date not null,
  uploads_used integer not null default 0 check (uploads_used >= 0),
  monthly_limit integer not null default 30 check (monthly_limit between 0 and 1000),
  updated_at timestamptz not null default now()
);

alter table public.jarvis_attachments enable row level security;
alter table public.jarvis_upload_quotas enable row level security;
revoke all on public.jarvis_attachments from anon, authenticated;
revoke all on public.jarvis_upload_quotas from anon, authenticated;
grant select, insert, update, delete on public.jarvis_attachments to service_role;
grant select, insert, update on public.jarvis_upload_quotas to service_role;

-- Atomically consumes one upload for the current UTC month. Raises when the limit is reached.
create or replace function public.jarvis_consume_upload(p_user uuid)
returns table (used_count integer, limit_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', now())::date;
  v_used integer;
  v_limit integer;
begin
  insert into public.jarvis_upload_quotas (user_id, period_start)
  values (p_user, v_period)
  on conflict (user_id) do nothing;

  update public.jarvis_upload_quotas q
     set uploads_used = case when q.period_start < v_period then 1 else q.uploads_used + 1 end,
         period_start = v_period,
         updated_at = now()
   where q.user_id = p_user
     and (q.period_start < v_period or q.uploads_used < q.monthly_limit)
  returning q.uploads_used, q.monthly_limit into v_used, v_limit;

  if not found then
    raise exception 'jarvis_upload_quota_exhausted' using errcode = 'P0001';
  end if;
  return query select v_used, v_limit;
end;
$$;
revoke all on function public.jarvis_consume_upload(uuid) from public, anon, authenticated;
grant execute on function public.jarvis_consume_upload(uuid) to service_role;
