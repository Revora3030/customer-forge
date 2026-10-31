-- Draft (not-yet-published) workspaces accept public form submissions.
--
-- Before: submit_public_conversion refused every submission with ORG_NOT_PUBLIC
-- unless the workspace was a demo, published, or publish_state was 'published'
-- or 'preview'. A brand-new workspace defaults to publish_state = 'draft', so
-- every form on its site failed with "couldn't save".
--
-- After: 'draft' is accepted too. 'unpublished' (a site the owner took offline)
-- and suspended workspaces are still refused. The body below is otherwise
-- identical to 20260905024849: the same contact/email validation, ownership
-- checks and rate limits (RATE_LIMITED) still apply to draft sites.
--
-- Applies to the live database when the project is published (Lovable runs
-- repo migrations on publish). Nothing is applied from this PR.

create or replace function public.submit_public_conversion(
  _organization_id uuid,
  _lead jsonb,
  _quote jsonb default null::jsonb,
  _booking jsonb default null::jsonb,
  _activity jsonb default null::jsonb,
  _notification jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_service_id uuid := nullif(_lead->>'service_id','')::uuid;
  v_form_id uuid := nullif(_quote->>'form_id','')::uuid;
  v_lead_id uuid;
  v_appointment_id uuid := null;
  v_starts timestamptz;
  v_ends timestamptz;
  v_duration int;
  v_email text := lower(nullif(left(btrim(coalesce(_lead->>'email','')), 160),''));
  v_phone text := left(regexp_replace(coalesce(_lead->>'phone',''), '[^0-9]', '', 'g'), 20);
  v_name text := left(btrim(coalesce(_lead->>'name','')), 120);
  v_message text := nullif(left(btrim(coalesce(_lead->>'message','')), 2000), '');
  v_identity text;
  v_recent int;
  v_org_recent int;
  v_activity_kind text;
  v_notification_kind text;
  v_notification_link text;
begin
  if _organization_id is null then
    raise exception 'ORG_REQUIRED';
  end if;

  -- Only businesses whose site is actually reachable by the public (or a demo)
  -- may receive public submissions, and never a suspended workspace.
  if not exists (
    select 1
    from public.organizations o
    left join public.website_settings w on w.organization_id = o.id
    where o.id = _organization_id
      and coalesce(o.is_suspended, false) = false
      and (
        coalesce(o.is_demo, false)
        or coalesce(w.published, false)
        or w.publish_state in ('published', 'preview', 'draft')
      )
  ) then
    raise exception 'ORG_NOT_PUBLIC';
  end if;

  if v_email is null and v_phone = '' then
    raise exception 'CONTACT_REQUIRED';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL';
  end if;

  -- Never trust client supplied ids: they must belong to this business.
  if v_service_id is not null then
    if not exists (
      select 1 from public.services
      where id = v_service_id and organization_id = _organization_id
    ) then
      raise exception 'INVALID_SERVICE';
    end if;
  end if;

  if v_form_id is not null then
    if not exists (
      select 1 from public.quote_forms
      where id = v_form_id and organization_id = _organization_id
    ) then
      raise exception 'INVALID_QUOTE_FORM';
    end if;
  end if;

  -- One submitter at a time per business+contact, so a double-clicked form or
  -- two parallel requests can never race past the duplicate check below.
  v_identity := _organization_id::text || '|' || coalesce(nullif(v_email,''), nullif(v_phone,''), lower(v_name));
  perform pg_advisory_xact_lock(hashtextextended(v_identity, 42));

  -- Idempotency: the exact same request from the same contact within three
  -- minutes is treated as the same submission, not a second lead.
  select l.id into v_lead_id
  from public.leads l
  where l.organization_id = _organization_id
    and l.created_at > now() - interval '3 minutes'
    and coalesce(lower(l.email),'') = coalesce(v_email,'')
    and regexp_replace(coalesce(l.phone,''), '[^0-9]', '', 'g') = v_phone
    and lower(coalesce(l.name,'')) = lower(v_name)
    and coalesce(l.message,'') = coalesce(v_message,'')
    and coalesce(l.service_id::text,'') = coalesce(v_service_id::text,'')
  order by l.created_at desc
  limit 1;

  if v_lead_id is not null then
    return jsonb_build_object(
      'lead_id', v_lead_id,
      'appointment_id', (
        select a.id from public.appointments a
        where a.lead_id = v_lead_id order by a.created_at desc limit 1
      ),
      'duration_minutes', null,
      'duplicate', true
    );
  end if;

  -- Abuse guard: a single contact may not flood a business with submissions.
  select count(*) into v_recent
  from public.leads l
  where l.organization_id = _organization_id
    and l.created_at > now() - interval '10 minutes'
    and (
      (v_email is not null and lower(coalesce(l.email,'')) = v_email)
      or (v_phone <> '' and regexp_replace(coalesce(l.phone,''), '[^0-9]', '', 'g') = v_phone)
    );
  if v_recent >= 6 then
    raise exception 'RATE_LIMITED';
  end if;

  -- Abuse guard: a business site cannot be flooded from rotating contacts.
  select count(*) into v_org_recent
  from public.leads l
  where l.organization_id = _organization_id
    and l.created_at > now() - interval '1 hour';
  if v_org_recent >= 60 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.leads (
    organization_id, name, email, phone, service_id, service_interest,
    message, city, source, campaign, status, estimated_value
  ) values (
    _organization_id,
    nullif(v_name, ''),
    v_email,
    nullif(left(btrim(coalesce(_lead->>'phone','')), 40), ''),
    v_service_id,
    nullif(left(btrim(coalesce(_lead->>'service_interest','')), 160), ''),
    v_message,
    nullif(left(btrim(coalesce(_lead->>'city','')), 120), ''),
    coalesce(nullif(left(btrim(coalesce(_lead->>'source','')), 40), ''), 'website'),
    nullif(left(btrim(coalesce(_lead->>'campaign','')), 120), ''),
    -- Public visitors may never choose an internal pipeline status.
    'new'::lead_status,
    least(greatest(coalesce((_lead->>'estimated_value')::numeric, 0), 0), 10000000)
  )
  returning id into v_lead_id;

  if _quote is not null then
    if jsonb_typeof(coalesce(_quote->'answers', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(_quote->'answers', '[]'::jsonb)) > 60 then
      raise exception 'INVALID_ANSWERS';
    end if;

    insert into public.quote_requests (
      organization_id, form_id, lead_id, answers, estimate_min, estimate_max
    ) values (
      _organization_id,
      v_form_id,
      v_lead_id,
      coalesce(_quote->'answers', '[]'::jsonb),
      least(greatest(coalesce((_quote->>'estimate_min')::numeric, 0), 0), 10000000),
      least(greatest(coalesce((_quote->>'estimate_max')::numeric, 0), 0), 10000000)
    );
  end if;

  if _booking is not null then
    v_starts := (_booking->>'starts_at')::timestamptz;
    v_duration := greatest(5, least(1440, coalesce((_booking->>'duration_minutes')::int, 60)));

    -- Server side duration wins when the service defines one.
    if v_service_id is not null then
      select greatest(5, least(1440, coalesce(s.duration_minutes, v_duration)))
        into v_duration
      from public.services s
      where s.id = v_service_id;
    end if;

    v_ends := v_starts + make_interval(mins => v_duration);

    if v_starts is null then
      raise exception 'INVALID_TIME';
    end if;
    if v_starts < now() - interval '5 minutes' then
      raise exception 'TIME_IN_PAST';
    end if;
    if v_starts > now() + interval '2 years' then
      raise exception 'INVALID_TIME';
    end if;

    -- Serialise concurrent booking attempts for this business, then check.
    perform pg_advisory_xact_lock(hashtextextended(_organization_id::text, 0));
    if exists (
      select 1 from public.appointments a
      where a.organization_id = _organization_id
        and a.status in ('pending','confirmed')
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(v_starts, v_ends)
    ) then
      raise exception 'BOOKING_CONFLICT';
    end if;

    insert into public.appointments (
      organization_id, lead_id, service_id, name, email, phone,
      starts_at, ends_at, status, notes
    ) values (
      _organization_id,
      v_lead_id,
      v_service_id,
      nullif(v_name, ''),
      v_email,
      nullif(left(btrim(coalesce(_lead->>'phone','')), 40), ''),
      v_starts,
      v_ends,
      'pending',
      v_message
    )
    returning id into v_appointment_id;
  end if;

  if _activity is not null then
    -- A public visitor may only ever create these visitor-generated entries.
    v_activity_kind := coalesce(nullif(_activity->>'kind',''), 'form_submission');
    if v_activity_kind not in ('form_submission','quote_request','booking_request') then
      v_activity_kind := 'form_submission';
    end if;

    insert into public.lead_activities (
      organization_id, lead_id, appointment_id, kind, body, metadata
    ) values (
      _organization_id,
      v_lead_id,
      v_appointment_id,
      v_activity_kind,
      nullif(left(btrim(coalesce(_activity->>'body','')), 2000), ''),
      case
        when jsonb_typeof(coalesce(_activity->'metadata', '{}'::jsonb)) = 'object'
         and length(coalesce(_activity->'metadata', '{}'::jsonb)::text) <= 4000
        then coalesce(_activity->'metadata', '{}'::jsonb)
        else '{}'::jsonb
      end
    );
  end if;

  if _notification is not null then
    v_notification_kind := coalesce(nullif(_notification->>'kind',''), 'lead');
    if v_notification_kind not in ('lead','quote','booking') then
      v_notification_kind := 'lead';
    end if;
    v_notification_link := nullif(left(btrim(coalesce(_notification->>'link','')), 200), '');
    if v_notification_link is not null and v_notification_link !~ '^/[A-Za-z0-9/_\-\?=&\.]*$' then
      v_notification_link := null;
    end if;

    insert into public.notifications (organization_id, title, body, kind, link)
    values (
      _organization_id,
      coalesce(nullif(left(btrim(coalesce(_notification->>'title','')), 160), ''), 'New lead'),
      nullif(left(btrim(coalesce(_notification->>'body','')), 1000), ''),
      v_notification_kind,
      v_notification_link
    );
  end if;

  return jsonb_build_object(
    'lead_id', v_lead_id,
    'appointment_id', v_appointment_id,
    'duration_minutes', v_duration,
    'duplicate', false
  );
end;


revoke execute on function public.submit_public_conversion(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.submit_public_conversion(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
