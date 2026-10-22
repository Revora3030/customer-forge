CREATE TABLE public.jarvis_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New conversation' CHECK (char_length(title) BETWEEN 1 AND 120),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.jarvis_conversations TO authenticated;
GRANT ALL ON public.jarvis_conversations TO service_role;
ALTER TABLE public.jarvis_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own jarvis conversations read" ON public.jarvis_conversations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own jarvis conversations insert" ON public.jarvis_conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own jarvis conversations update" ON public.jarvis_conversations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX jarvis_conversations_user_updated ON public.jarvis_conversations (user_id, archived, updated_at DESC);

ALTER TABLE public.jarvis_messages ADD COLUMN conversation_id uuid REFERENCES public.jarvis_conversations(id) ON DELETE SET NULL;
CREATE INDEX jarvis_messages_conversation_created ON public.jarvis_messages (conversation_id, created_at);

-- Backfill: each user's existing messages become one "Earlier conversation".
INSERT INTO public.jarvis_conversations (user_id, title, created_at, updated_at)
SELECT user_id, 'Earlier conversation', min(created_at), max(created_at) FROM public.jarvis_messages GROUP BY user_id;
UPDATE public.jarvis_messages m SET conversation_id = c.id
FROM public.jarvis_conversations c WHERE c.user_id = m.user_id AND m.conversation_id IS NULL;

-- Messages written without a conversation (routines, older clients) join the
-- user's most recent active conversation, or a new one. The conversation must
-- belong to the same user.
CREATE OR REPLACE FUNCTION public.jarvis_message_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare v_id uuid;
begin
  if new.conversation_id is not null then
    if not exists (select 1 from public.jarvis_conversations c where c.id = new.conversation_id and c.user_id = new.user_id) then
      raise exception 'CONVERSATION_NOT_OWNED';
    end if;
    v_id := new.conversation_id;
  else
    select c.id into v_id from public.jarvis_conversations c
    where c.user_id = new.user_id and not c.archived order by c.updated_at desc limit 1;
    if v_id is null then
      insert into public.jarvis_conversations (user_id) values (new.user_id) returning id into v_id;
    end if;
    new.conversation_id := v_id;
  end if;
  update public.jarvis_conversations set updated_at = now() where id = v_id;
  return new;
end $$;
REVOKE ALL ON FUNCTION public.jarvis_message_conversation() FROM public, anon, authenticated;
CREATE TRIGGER jarvis_messages_conversation BEFORE INSERT ON public.jarvis_messages
FOR EACH ROW EXECUTE FUNCTION public.jarvis_message_conversation();