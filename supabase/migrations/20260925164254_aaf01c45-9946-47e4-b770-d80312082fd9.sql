CREATE POLICY "Service role can manage public submission attempts"
ON public.public_submission_attempts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);