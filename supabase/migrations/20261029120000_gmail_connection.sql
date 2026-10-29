-- Lets the reply loop mark a prospect reply as answered by the deferred demo
-- preview ('auto_replied'). Gmail credentials are Lovable secrets only; nothing
-- here stores them.

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'public.prospect_inbound'::regclass
      AND con.contype = 'c'
      AND att.attname = 'status'
  LOOP
    EXECUTE format('ALTER TABLE public.prospect_inbound DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.prospect_inbound
  ADD CONSTRAINT prospect_inbound_status_check
  CHECK (status IN ('pending', 'processing', 'awaiting_operator', 'handled', 'dismissed', 'auto_replied'));
