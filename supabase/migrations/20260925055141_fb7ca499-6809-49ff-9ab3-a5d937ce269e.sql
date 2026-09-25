GRANT SELECT ON public.platform_accounts, public.platform_trials, public.ai_provider_runtime TO authenticated;
CREATE POLICY platform_accounts_admin_read ON public.platform_accounts FOR SELECT TO authenticated USING (private.is_super_admin());
CREATE POLICY platform_trials_admin_read ON public.platform_trials FOR SELECT TO authenticated USING (private.is_super_admin());
CREATE POLICY ai_provider_runtime_admin_read ON public.ai_provider_runtime FOR SELECT TO authenticated USING (private.is_super_admin());