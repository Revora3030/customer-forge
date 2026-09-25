REVOKE EXECUTE ON FUNCTION public.submit_public_conversion(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.provision_workspace(text, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_conversion(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.provision_workspace(text, text, jsonb, integer) TO service_role;