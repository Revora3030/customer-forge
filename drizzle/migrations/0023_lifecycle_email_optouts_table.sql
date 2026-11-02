CREATE TABLE IF NOT EXISTS public.lifecycle_email_optouts (
  email text PRIMARY KEY CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 320),
  token text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{24,80}$'),
  opted_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.lifecycle_email_optouts TO service_role;
ALTER TABLE public.lifecycle_email_optouts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS lifecycle_email_log_recipient_idx ON public.lifecycle_email_log (lower(recipient), kind);
NOTIFY pgrst, 'reload schema';