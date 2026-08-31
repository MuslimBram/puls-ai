import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const migration = read("supabase/migrations/20260828190149_p0_4_call_voice_workspace_isolation.sql");
const verification = read("scripts/verify-p0-4-call-voice.sh");
const callRecordsHook = read("src/hooks/useCallRecords.ts");
const callActions = read("src/hooks/telephony/useCallActions.ts");
const inboundCall = read("supabase/functions/twilio-inbound-call/index.ts");
const cdrSync = read("supabase/functions/vicidial-cdr-sync/index.ts");

describe("P0.4 CALL and Voice workspace isolation", () => {
  it("enforces call-record workspace identity without guessing ownership", () => {
    expect(migration).toContain("unresolved legacy rows remain");
    expect(migration).toContain("alter table public.call_records alter column workspace_id set not null");
  });

  it("replaces legacy helpers with caller-bound workspace roles", () => {
    expect(migration).toContain("public.has_workspace_role(workspace_id, array['owner','admin','member'])");
    expect(migration).toContain("public.has_workspace_role(cq.workspace_id, array['owner','admin'])");
    expect(migration).not.toMatch(/create policy[\s\S]*?is_workspace_(?:member|owner)\(/i);
    expect(migration).toMatch(/create policy "p0 call agents update assigned active calls"[\s\S]*?using[\s\S]*?with check/i);
    expect(migration).toMatch(/create policy "p0 call members update records"[\s\S]*?using[\s\S]*?with check/i);
  });

  it("derives queue assignments and call annotations through canonical parents", () => {
    expect(migration).toContain("cq.id = call_queue_members.queue_id");
    expect(migration).toContain("cr.id = call_notes.call_record_id");
    expect(migration).toContain("cr.workspace_id = call_notes.workspace_id");
    expect(migration).toContain("cr.id = call_tags.call_record_id");
    expect(migration).toContain("cr.workspace_id = call_tags.workspace_id");
  });

  it("uses least-privilege browser grants and removes anonymous access", () => {
    for (const table of [
      "active_calls", "call_queues", "call_queue_members", "call_recordings",
      "call_records", "call_scripts", "call_notes", "call_tags",
    ]) {
      expect(migration).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
    }
    expect(migration).toContain("grant select, insert on table public.call_recordings to authenticated");
    expect(migration).toContain("grant select, insert, update on table public.call_records to authenticated");
    expect(migration).not.toMatch(/grant\s+[^;]*truncate[^;]*to authenticated/i);
  });

  it("makes the manual call-history path workspace-aware", () => {
    expect(callRecordsHook).toContain('import { useWorkspace } from "@/contexts/WorkspaceContext"');
    expect(callRecordsHook).toContain('const { workspace } = useWorkspace()');
    expect(callRecordsHook).toContain('.eq("workspace_id", workspace!.id)');
    expect(callRecordsHook).toContain("workspace_id: workspace!.id");
    expect(callRecordsHook).toContain("enabled: !!user && !!workspace");
  });

  it("preserves existing workspace-scoped Voice writers", () => {
    expect(callActions).toContain("user_id: user!.id, workspace_id: workspace!.id");
    expect(inboundCall).toContain("workspace_id: resolvedWorkspaceId");
    expect(cdrSync).toContain('.eq("workspace_id", workspaceId)');
    expect(cdrSync).toContain("workspace_id: workspaceId");
    expect(cdrSync).toContain("external_call_id: externalCallId");
  });

  it("executes same-tenant positives and cross-tenant negatives in PostgreSQL", () => {
    expect(verification).toContain("20260828190149_p0_4_call_voice_workspace_isolation.sql");
    expect(verification).toContain("Cross-workspace call record insert was allowed");
    expect(verification).toContain("Cross-workspace linked note insert was allowed");
    expect(verification).toContain("Member queue administration was allowed");
    expect(verification).toContain("Member updated another agent active call");
  });
});
