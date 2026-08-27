-- Platform admins retain operational visibility, but private message/customer-support content
-- requires an explicit, scoped, expiring support session.
drop policy if exists "Admins can view all inbox messages" on public.inbox_messages;
create policy "Support sessions can view inbox messages" on public.inbox_messages for select to authenticated
using (public.has_active_support_scope(workspace_id,'messages'));

drop policy if exists "Admins can view all profiles" on public.profiles;
-- Profiles remain owner-readable; platform-wide profile visibility is intentionally not granted.
drop policy if exists "Admins can update all profiles" on public.profiles;

-- Support ticket message content is private support data too.
drop policy if exists "Admins view all ticket messages" on public.support_ticket_messages;
create policy "Support sessions view ticket messages" on public.support_ticket_messages for select to authenticated
using (exists (select 1 from public.support_tickets t where t.id=support_ticket_messages.ticket_id and public.has_active_support_scope(t.workspace_id,'messages')));

drop policy if exists "Admins send any messages" on public.support_ticket_messages;
create policy "Support sessions send ticket messages" on public.support_ticket_messages for insert to authenticated
with check (
  sender_user_id=(select auth.uid())
  and exists (select 1 from public.support_tickets t where t.id=support_ticket_messages.ticket_id and public.has_active_support_scope(t.workspace_id,'messages'))
);

-- Telegram messages currently lack a workspace_id mapping. Do not leave a global admin-read bypass.
drop policy if exists "Admins can read telegram_messages" on public.telegram_messages;