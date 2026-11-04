-- Cap the past_due grace window: record when a workspace first entered
-- past_due so access can lock after a fixed grace period.
-- Additive only (nullable column + trigger); no DROP of data or tables.

alter table public.organizations
  add column if not exists past_due_since timestamptz;

-- The trigger owns this column: it is stamped on the transition INTO
-- past_due, kept while still past_due, and cleared on any other status.
-- Client-supplied values are always overridden, so nobody can extend grace.
create or replace function private.organizations_track_past_due_since()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subscription_status::text = 'past_due' then
    if tg_op = 'UPDATE' and old.subscription_status::text = 'past_due' then
      new.past_due_since := coalesce(old.past_due_since, now());
    else
      new.past_due_since := now();
    end if;
  else
    new.past_due_since := null;
  end if;
  return new;
end;
$$;

revoke all on function private.organizations_track_past_due_since() from public, anon, authenticated;
grant execute on function private.organizations_track_past_due_since() to service_role;

create or replace trigger organizations_track_past_due_since
  before insert or update on public.organizations
  for each row execute function private.organizations_track_past_due_since();

-- Workspaces already past_due get a fresh grace window starting now.
update public.organizations
  set past_due_since = now()
  where subscription_status::text = 'past_due' and past_due_since is null;

-- Column is readable by members through existing org-scoped policies;
-- writes stay with service_role (the trigger overrides any value anyway).
grant select (past_due_since) on public.organizations to authenticated;
grant all on public.organizations to service_role;
