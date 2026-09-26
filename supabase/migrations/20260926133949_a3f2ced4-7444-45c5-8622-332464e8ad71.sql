GRANT SELECT ON public.ai_command_settings TO authenticated;
CREATE POLICY "Only the platform administrator can read AI command settings"
  ON public.ai_command_settings
  FOR SELECT
  TO authenticated
  USING (private.is_super_admin());