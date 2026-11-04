-- Post-job review sequence with private feedback routing (round 10, item 8).
-- NEEDS LOVABLE: apply through the reviewed Supabase migration workflow. Until
-- it is applied the sequence toggle saves nothing new and no review emails are
-- queued (startReviewSequence only runs when review_sequence_enabled is true).
--
-- One row per completed job the owner asked about. The customer opens
-- /feedback/<token> from the email; the service role records the star rating
-- and, for 1–3 stars, the private note (also copied into public.reviews as an
-- unpublished review so it shows up on the Reviews page).

alter table public.business_profiles
  add column if not exists review_sequence_enabled boolean not null default false;

create table if not exists public.review_feedback_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 1 and 200),
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{32,64}$'),
  rating smallint check (rating is null or rating between 1 and 5),
  routed_to text check (routed_to is null or routed_to in ('google', 'private')),
  feedback text check (feedback is null or char_length(feedback) <= 2000),
  review_id uuid references public.reviews(id) on delete set null,
  rated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint review_feedback_requests_org_appointment_key unique (organization_id, appointment_id)
);

create index if not exists review_feedback_requests_org_created_idx
  on public.review_feedback_requests (organization_id, created_at desc);

alter table public.review_feedback_requests enable row level security;

-- Members read their own workspace's ratings; only the service role writes.
create policy "review_feedback_requests member read" on public.review_feedback_requests
  for select to authenticated using (private.is_org_member(organization_id));

revoke all on public.review_feedback_requests from anon;
revoke all on public.review_feedback_requests from authenticated;
-- The token is the customer's bearer link: members never read it back.
grant select (id, organization_id, appointment_id, lead_id, customer_name, rating, routed_to,
  feedback, review_id, rated_at, created_at) on public.review_feedback_requests to authenticated;
grant all on public.review_feedback_requests to service_role;

-- Owners switch the sequence on from the Reviews page (business_profiles upsert).
grant select (review_sequence_enabled), insert (review_sequence_enabled), update (review_sequence_enabled)
  on public.business_profiles to authenticated;
grant all on public.business_profiles to service_role;
