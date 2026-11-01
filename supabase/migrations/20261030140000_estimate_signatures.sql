-- Estimate e-signatures (BUILD_QUEUE 2026-10-30, signature_pad row).
-- NEEDS LOVABLE: apply through the reviewed Supabase migration workflow. Until it
-- is applied the app still lets a customer sign on screen (the signature goes on
-- the printed/PDF copy) and tells the owner the audit record is not saved yet.
--
-- Audit trail per signature: PNG in private tenant storage, signer name, time,
-- a salted hash of the signing device's IP (never the raw IP), and the SHA-256
-- of the exact estimate JSON that was shown.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('estimate-signatures', 'estimate-signatures', false, 307200, array['image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.estimate_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  document_kind text not null default 'estimate' check (document_kind in ('estimate')),
  document_number text not null check (char_length(document_number) between 1 and 60),
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  document_json jsonb not null,
  total_cents bigint,
  signer_name text not null check (char_length(signer_name) between 1 and 120),
  signed_at timestamptz not null default now(),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  storage_path text not null unique
    check (storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists estimate_signatures_org_created_idx
  on public.estimate_signatures (organization_id, created_at desc);
create index if not exists estimate_signatures_lead_idx
  on public.estimate_signatures (lead_id) where lead_id is not null;

alter table public.estimate_signatures enable row level security;

-- Members can read their own workspace's signatures; only the service role writes.
drop policy if exists "estimate_signatures member read" on public.estimate_signatures;
create policy "estimate_signatures member read" on public.estimate_signatures
  for select to authenticated using (private.is_org_member(organization_id));

revoke all on public.estimate_signatures from anon;
revoke insert, update, delete on public.estimate_signatures from authenticated;
grant select on public.estimate_signatures to authenticated;
grant all on public.estimate_signatures to service_role;
