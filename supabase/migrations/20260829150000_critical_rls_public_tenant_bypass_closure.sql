begin;

-- Emergency closure for two independently verified RLS bypass classes:
-- 1) FOR ALL TO public USING (auth.uid() IS NULL), which grants anon access.
-- 2) self-correlated workspace IN subqueries that collapse to TRUE for users with any user_roles row.
-- Keep this migration targeted to the 12 confirmed tables only.

-- Remove the public/anon service-role imitation policies.
drop policy if exists "service_manage_consent" on public.contact_consent;
drop policy if exists "service_manage_conversions" on public.conversion_events;
drop policy if exists "service_manage_ref_events" on public.customer_referral_events;
drop policy if exists "service_manage_freq_log" on public.frequency_cap_log;
drop policy if exists "service_manage_trigger_log" on public.lifecycle_trigger_log;
drop policy if exists "service_manage_nba" on public.next_best_actions;
drop policy if exists "service_only_webhooks" on public.processed_webhook_events;
drop policy if exists "service_manage_sessions" on public.voice_ai_sessions;

-- Remove the broken self-correlated workspace policies.
drop policy if exists "workspace_manage_segments" on public.ai_campaign_segments;
drop policy if exists "workspace_manage_ref_programs" on public.customer_referral_programs;
drop policy if exists "workspace_manage_triggers" on public.lifecycle_triggers;
drop policy if exists "workspace_read_rules" on public.business_rules;
drop policy if exists "workspace_read_consent" on public.contact_consent;
drop policy if exists "workspace_read_conversions" on public.conversion_events;
drop policy if exists "workspace_read_ref_events" on public.customer_referral_events;
drop policy if exists "workspace_read_nba" on public.next_best_actions;

-- Remove the standing platform-admin bypasses on these confirmed surfaces.
drop policy if exists "admin_manage_rules" on public.business_rules;
drop policy if exists "workspace_read_sessions" on public.voice_ai_sessions;

-- RLS stays enabled on every target table.
alter table public.ai_campaign_segments enable row level security;
alter table public.business_rules enable row level security;
alter table public.contact_consent enable row level security;
alter table public.conversion_events enable row level security;
alter table public.customer_referral_events enable row level security;
alter table public.customer_referral_programs enable row level security;
alter table public.frequency_cap_log enable row level security;
alter table public.lifecycle_trigger_log enable row level security;
alter table public.lifecycle_triggers enable row level security;
alter table public.next_best_actions enable row level security;
alter table public.processed_webhook_events enable row level security;
alter table public.voice_ai_sessions enable row level security;

-- Reset table ACLs first so anon/sandbox cannot bypass policy intent via grants.
revoke all privileges on table public.ai_campaign_segments from public, anon, authenticated, sandbox_exec, service_role;
revoke all privileges on table public.business_rules from public, anon, authenticated, sandbox_exec, service_role;
revoke all privileges on table public.contact_consent from public, anon, authenticated, sandbox_exec, service_role;
revoke all privileges on table public.conversion_events from public, anon, authenticated, sandbox_exec, service_role;
revoke all privileges on table public.customer_referral_events from public, anon, authenticated, sandbox_exec, service_role;
revoke all privileges on table public.customer_referral_programs from public, anon, authenticated, sandbox_exec, service_role;
revoke all privileges on table public.frequency_cap_log from public, anon, authenticated, sandbox_exec, service_role;
revoke all privileges on table public.lifecycle_trigger_log from public, anon, authenticated, sandbox_exec, service_role;
revoke all privileges on table public.lifecycle_triggers from public, anon, authenticated, sandbox_exec, service_role;
revoke all privileges on table public.next_best_actions from public, anon, authenticated, sandbox_exec, service_role;
revoke all privileges on table public.processed_webhook_events from public, anon, authenticated, sandbox_exec, service_role;
revoke all privileges on table public.voice_ai_sessions from public, anon, authenticated, sandbox_exec, service_role;

-- Backend/service_role remains DML-only on the confirmed tables.
grant select, insert, update, delete on table public.ai_campaign_segments to service_role;
grant select, insert, update, delete on table public.business_rules to service_role;
grant select, insert, update, delete on table public.contact_consent to service_role;
grant select, insert, update, delete on table public.conversion_events to service_role;
grant select, insert, update, delete on table public.customer_referral_events to service_role;
grant select, insert, update, delete on table public.customer_referral_programs to service_role;
grant select, insert, update, delete on table public.frequency_cap_log to service_role;
grant select, insert, update, delete on table public.lifecycle_trigger_log to service_role;
grant select, insert, update, delete on table public.lifecycle_triggers to service_role;
grant select, insert, update, delete on table public.next_best_actions to service_role;
grant select, insert, update, delete on table public.processed_webhook_events to service_role;
grant select, insert, update, delete on table public.voice_ai_sessions to service_role;

-- Browser-managed workspace configuration.
grant select, insert, update, delete on table public.ai_campaign_segments to authenticated;
grant select, insert, update, delete on table public.customer_referral_programs to authenticated;
grant select, insert, update, delete on table public.lifecycle_triggers to authenticated;
grant select, insert, update, delete on table public.business_rules to authenticated;

-- Browser-readable workspace event/session metadata; writes remain backend-only.
grant select on table public.contact_consent to authenticated;
grant select on table public.conversion_events to authenticated;
grant select on table public.customer_referral_events to authenticated;
grant select on table public.next_best_actions to authenticated;
grant select on table public.voice_ai_sessions to authenticated;

-- ai_campaign_segments: viewers/access holders read; member+ manage; owner/admin delete.
create policy "critical segments read"
on public.ai_campaign_segments for select to authenticated
using (public.has_workspace_access(workspace_id));
create policy "critical segments insert"
on public.ai_campaign_segments for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "critical segments update"
on public.ai_campaign_segments for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "critical segments delete"
on public.ai_campaign_segments for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

-- customer_referral_programs: same workspace configuration contract.
create policy "critical referral programs read"
on public.customer_referral_programs for select to authenticated
using (public.has_workspace_access(workspace_id));
create policy "critical referral programs insert"
on public.customer_referral_programs for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "critical referral programs update"
on public.customer_referral_programs for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "critical referral programs delete"
on public.customer_referral_programs for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

-- lifecycle_triggers: same workspace configuration contract.
create policy "critical lifecycle triggers read"
on public.lifecycle_triggers for select to authenticated
using (public.has_workspace_access(workspace_id));
create policy "critical lifecycle triggers insert"
on public.lifecycle_triggers for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "critical lifecycle triggers update"
on public.lifecycle_triggers for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));
create policy "critical lifecycle triggers delete"
on public.lifecycle_triggers for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

-- business_rules can change operational behavior, so only workspace owner/admin may mutate.
create policy "critical business rules read"
on public.business_rules for select to authenticated
using (public.has_workspace_access(workspace_id));
create policy "critical business rules insert"
on public.business_rules for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['owner','admin']));
create policy "critical business rules update"
on public.business_rules for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']))
with check (public.has_workspace_role(workspace_id, array['owner','admin']));
create policy "critical business rules delete"
on public.business_rules for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

-- Workspace-readable event/session surfaces. No browser writes.
create policy "critical consent read"
on public.contact_consent for select to authenticated
using (public.has_workspace_access(workspace_id));
create policy "critical conversions read"
on public.conversion_events for select to authenticated
using (public.has_workspace_access(workspace_id));
create policy "critical referral events read"
on public.customer_referral_events for select to authenticated
using (public.has_workspace_access(workspace_id));
create policy "critical next best actions read"
on public.next_best_actions for select to authenticated
using (public.has_workspace_access(workspace_id));
create policy "critical voice sessions read"
on public.voice_ai_sessions for select to authenticated
using (workspace_id is not null and public.has_workspace_access(workspace_id));

-- frequency_cap_log, lifecycle_trigger_log and processed_webhook_events deliberately
-- have no browser RLS policies after this migration; service_role is the only DML principal.

commit;
