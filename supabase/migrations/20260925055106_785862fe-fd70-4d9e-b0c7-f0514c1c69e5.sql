DROP POLICY IF EXISTS plans_public_read ON public.plans;
CREATE POLICY plans_public_read ON public.plans FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS plan_entitlements_read ON public.plan_entitlements;
CREATE POLICY plan_entitlements_read ON public.plan_entitlements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plans p WHERE p.id = plan_entitlements.plan_id AND p.is_active = true));