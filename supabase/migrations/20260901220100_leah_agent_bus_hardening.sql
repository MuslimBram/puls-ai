-- MR8C adversarial hardening.
-- A response cannot survive deletion of its request with reply_to_id nulled,
-- because `kind=response` structurally requires a parent. Cascade the response
-- chain instead of producing an invalid orphan.

alter table public.leah_agent_messages
  drop constraint leah_agent_message_reply_fk,
  add constraint leah_agent_message_reply_fk
    foreign key (reply_to_id, execution_id, workspace_id)
    references public.leah_agent_messages(id, execution_id, workspace_id)
    on delete cascade;

alter table public.leah_agent_messages
  add constraint leah_agent_message_error_code_ck
    check (error_code is null or length(error_code) between 1 and 120),
  add constraint leah_agent_message_available_expiry_ck
    check (expires_at is null or available_at < expires_at);
