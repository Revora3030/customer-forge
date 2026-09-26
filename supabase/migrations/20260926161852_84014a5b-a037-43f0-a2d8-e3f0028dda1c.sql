alter table public.ai_command_settings
  alter column qa_auto_revert set default false;

update public.ai_command_settings
set qa_auto_revert = false
where id = 1;