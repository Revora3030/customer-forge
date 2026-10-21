-- Owner-written quotes whose line items come from the workspace's services
-- catalog. Additive only: two new tenant tables, nothing existing changes.
--
-- * quotes             — one priced offer to one customer (optionally a lead).
-- * quote_line_items   — each line copies its name and price from a service at
--                        the time it is added, and stays editable afterwards.
--
-- Same-tenant composite foreign keys make it impossible to point a quote at a
-- lead, booking or service of another business. RLS follows the role ladder of
-- the sibling CRM content tables (services / quote_forms): read = any member,
-- add/edit = staff+, delete = manager+. No anonymous access.

CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NULL,
  appointment_id uuid NULL,
  customer_name text NOT NULL CHECK (char_length(btrim(customer_name)) BETWEEN 1 AND 160),
  customer_email text NULL CHECK (customer_email IS NULL OR char_length(customer_email) <= 254),
  customer_phone text NULL CHECK (customer_phone IS NULL OR char_length(customer_phone) <= 40),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined')),
  notes text NULL CHECK (notes IS NULL OR char_length(notes) <= 4000),
  accepted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quotes_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT quotes_lead_same_org_fkey FOREIGN KEY (lead_id, organization_id)
    REFERENCES public.leads (id, organization_id) ON DELETE SET NULL (lead_id),
  CONSTRAINT quotes_appointment_same_org_fkey FOREIGN KEY (appointment_id, organization_id)
    REFERENCES public.appointments (id, organization_id) ON DELETE SET NULL (appointment_id)
);

CREATE INDEX IF NOT EXISTS quotes_org_created_idx ON public.quotes (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quotes_lead_idx ON public.quotes (lead_id) WHERE lead_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.quote_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL,
  service_id uuid NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  unit_price numeric(10,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_line_items_quote_same_org_fkey FOREIGN KEY (quote_id, organization_id)
    REFERENCES public.quotes (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT quote_line_items_service_same_org_fkey FOREIGN KEY (service_id, organization_id)
    REFERENCES public.services (id, organization_id) ON DELETE SET NULL (service_id)
);

CREATE INDEX IF NOT EXISTS quote_line_items_quote_idx ON public.quote_line_items (quote_id, sort_order);
CREATE INDEX IF NOT EXISTS quote_line_items_service_idx ON public.quote_line_items (organization_id, service_id)
  WHERE service_id IS NOT NULL;

DROP TRIGGER IF EXISTS quotes_touch ON public.quotes;
CREATE TRIGGER quotes_touch BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS quotes_freeze_org ON public.quotes;
CREATE TRIGGER quotes_freeze_org BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION private.freeze_organization_id();
DROP TRIGGER IF EXISTS quote_line_items_freeze_org ON public.quote_line_items;
CREATE TRIGGER quote_line_items_freeze_org BEFORE UPDATE ON public.quote_line_items
  FOR EACH ROW EXECUTE FUNCTION private.freeze_organization_id();

REVOKE ALL ON public.quotes FROM anon;
REVOKE ALL ON public.quote_line_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_line_items TO authenticated;
GRANT ALL ON public.quotes TO service_role;
GRANT ALL ON public.quote_line_items TO service_role;

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotes_member_read ON public.quotes;
CREATE POLICY quotes_member_read ON public.quotes
  FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
DROP POLICY IF EXISTS quotes_staff_insert ON public.quotes;
CREATE POLICY quotes_staff_insert ON public.quotes
  FOR INSERT TO authenticated WITH CHECK (private.org_role_at_least(organization_id, 'staff'));
DROP POLICY IF EXISTS quotes_staff_update ON public.quotes;
CREATE POLICY quotes_staff_update ON public.quotes
  FOR UPDATE TO authenticated
  USING (private.org_role_at_least(organization_id, 'staff'))
  WITH CHECK (private.org_role_at_least(organization_id, 'staff'));
DROP POLICY IF EXISTS quotes_manager_delete ON public.quotes;
CREATE POLICY quotes_manager_delete ON public.quotes
  FOR DELETE TO authenticated USING (private.org_role_at_least(organization_id, 'manager'));

DROP POLICY IF EXISTS quote_line_items_member_read ON public.quote_line_items;
CREATE POLICY quote_line_items_member_read ON public.quote_line_items
  FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
DROP POLICY IF EXISTS quote_line_items_staff_insert ON public.quote_line_items;
CREATE POLICY quote_line_items_staff_insert ON public.quote_line_items
  FOR INSERT TO authenticated WITH CHECK (private.org_role_at_least(organization_id, 'staff'));
DROP POLICY IF EXISTS quote_line_items_staff_update ON public.quote_line_items;
CREATE POLICY quote_line_items_staff_update ON public.quote_line_items
  FOR UPDATE TO authenticated
  USING (private.org_role_at_least(organization_id, 'staff'))
  WITH CHECK (private.org_role_at_least(organization_id, 'staff'));
-- Staff edit a quote by replacing its lines, so line deletion follows the
-- quote's edit right; deleting the quote itself stays manager+.
DROP POLICY IF EXISTS quote_line_items_staff_delete ON public.quote_line_items;
CREATE POLICY quote_line_items_staff_delete ON public.quote_line_items
  FOR DELETE TO authenticated USING (private.org_role_at_least(organization_id, 'staff'));

-- accepted_at records WHEN a quote was accepted, so the database (not each
-- client save) owns it: set on the transition into 'accepted', kept while it
-- stays accepted, cleared when it leaves. Re-saving an accepted quote never
-- moves the date.
CREATE OR REPLACE FUNCTION private.quotes_track_accepted_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'accepted' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted' THEN
      NEW.accepted_at := now();
    ELSE
      NEW.accepted_at := OLD.accepted_at;
    END IF;
  ELSE
    NEW.accepted_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.quotes_track_accepted_at() FROM PUBLIC;

DROP TRIGGER IF EXISTS quotes_track_accepted_at ON public.quotes;
CREATE TRIGGER quotes_track_accepted_at BEFORE INSERT OR UPDATE OF status, accepted_at ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION private.quotes_track_accepted_at();

-- Save a quote and replace its lines in ONE transaction, so an edit can never
-- leave doubled or missing lines. SECURITY INVOKER: every statement runs under
-- the caller's RLS (staff+ to write), plus an explicit tenant check. Returns
-- the quote id (new or existing).
CREATE OR REPLACE FUNCTION public.save_owner_quote(
  p_organization_id uuid,
  p_quote_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_lead_id uuid,
  p_notes text,
  p_status text,
  p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_quote_id uuid;
BEGIN
  IF p_organization_id IS NULL OR NOT private.org_role_at_least(p_organization_id, 'staff') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 100 THEN
    RAISE EXCEPTION 'quote_needs_lines' USING ERRCODE = '22023';
  END IF;

  IF p_quote_id IS NULL THEN
    INSERT INTO public.quotes AS q
      (organization_id, customer_name, customer_email, customer_phone, lead_id, notes, status)
    VALUES
      (p_organization_id, p_customer_name, p_customer_email, p_customer_phone, p_lead_id, p_notes, p_status)
    RETURNING q.id INTO v_quote_id;
  ELSE
    UPDATE public.quotes AS q
       SET customer_name = p_customer_name,
           customer_email = p_customer_email,
           customer_phone = p_customer_phone,
           lead_id = p_lead_id,
           notes = p_notes,
           status = p_status
     WHERE q.id = p_quote_id
       AND q.organization_id = p_organization_id
    RETURNING q.id INTO v_quote_id;
    IF v_quote_id IS NULL THEN
      RAISE EXCEPTION 'quote_not_found' USING ERRCODE = 'P0002';
    END IF;
    DELETE FROM public.quote_line_items AS li
     WHERE li.quote_id = v_quote_id
       AND li.organization_id = p_organization_id;
  END IF;

  INSERT INTO public.quote_line_items
    (organization_id, quote_id, service_id, name, unit_price, quantity, sort_order)
  SELECT p_organization_id,
         v_quote_id,
         NULLIF(line ->> 'service_id', '')::uuid,
         btrim(line ->> 'name'),
         COALESCE(NULLIF(line ->> 'unit_price', '')::numeric, 0),
         COALESCE(NULLIF(line ->> 'quantity', '')::numeric, 1),
         (ord - 1)::integer
    FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(line, ord);

  RETURN v_quote_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_owner_quote(uuid, uuid, text, text, text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_owner_quote(uuid, uuid, text, text, text, uuid, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_owner_quote(uuid, uuid, text, text, text, uuid, text, text, jsonb) TO authenticated, service_role;
