DROP POLICY IF EXISTS "Signed-in users can read the AI command settings" ON public.ai_command_settings;
REVOKE SELECT ON public.ai_command_settings FROM authenticated;