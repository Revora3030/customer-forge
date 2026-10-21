CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  lead_id uuid,
  appointment_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','declined')),
  notes text,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotes_org_idx ON public.quotes (organization_id);

CREATE TABLE public.quote_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  name text NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quote_line_items_org_idx ON public.quote_line_items (organization_id);
CREATE INDEX quote_line_items_quote_idx ON public.quote_line_items (quote_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_line_items TO authenticated;
GRANT ALL ON public.quote_line_items TO service_role;

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY quotes_member_read ON public.quotes FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY quotes_staff_insert ON public.quotes FOR INSERT TO authenticated WITH CHECK (private.org_role_at_least(organization_id, 'staff'));
CREATE POLICY quotes_staff_update ON public.quotes FOR UPDATE TO authenticated USING (private.org_role_at_least(organization_id, 'staff')) WITH CHECK (private.org_role_at_least(organization_id, 'staff'));
CREATE POLICY quotes_manager_delete ON public.quotes FOR DELETE TO authenticated USING (private.org_role_at_least(organization_id, 'manager'));

CREATE POLICY quote_line_items_member_read ON public.quote_line_items FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY quote_line_items_staff_insert ON public.quote_line_items FOR INSERT TO authenticated WITH CHECK (private.org_role_at_least(organization_id, 'staff'));
CREATE POLICY quote_line_items_staff_update ON public.quote_line_items FOR UPDATE TO authenticated USING (private.org_role_at_least(organization_id, 'staff')) WITH CHECK (private.org_role_at_least(organization_id, 'staff'));
CREATE POLICY quote_line_items_manager_delete ON public.quote_line_items FOR DELETE TO authenticated USING (private.org_role_at_least(organization_id, 'manager'));

CREATE TRIGGER quotes_touch_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();