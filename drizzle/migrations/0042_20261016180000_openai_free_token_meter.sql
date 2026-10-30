-- Token meter for OpenAI's shared-traffic free allowance.
--
-- OpenAI counts that allowance in TOKENS per day (250,000 for the flagship
-- models, 2,500,000 for mini/nano) and bills anything beyond it at standard
-- rates without refusing the call. ai_note_free_use only counts requests, so
-- every worker now also adds the tokens a free OpenAI answer used to a shared
-- per-pool counter in ai_provider_runtime (keys "openai:tokens:<pool>"), and
-- the router stops offering a pool once its counter nears the allowance.

CREATE OR REPLACE FUNCTION public.ai_note_free_tokens(_provider text, _amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_amount integer := greatest(0, least(coalesce(_amount, 0), 2000000));
  v_used integer;
BEGIN
  IF _provider IS NULL OR btrim(_provider) = '' THEN
    RAISE EXCEPTION 'PROVIDER_REQUIRED';
  END IF;

  INSERT INTO public.ai_provider_runtime AS r (provider, day, used)
  VALUES (left(btrim(_provider), 40), v_today, v_amount)
  ON CONFLICT (provider) DO UPDATE
    SET day = v_today,
        used = CASE WHEN r.day = v_today THEN r.used + v_amount ELSE v_amount END,
        updated_at = now()
  RETURNING r.used INTO v_used;

  RETURN v_used;
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_note_free_tokens(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_note_free_tokens(text, integer) TO service_role;
