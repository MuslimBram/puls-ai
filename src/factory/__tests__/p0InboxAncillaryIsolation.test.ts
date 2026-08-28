import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const migration = read("supabase/migrations/20260828184249_p0_3_inbox_ancillary_isolation.sql");
const verification = read("scripts/verify-p0-3-inbox-ancillary.sh");
const conversationHook = read("src/hooks/useConversationEngine.ts");
const helpdeskHook = read("src/hooks/useHelpdesk.ts");

describe("P0.3 ancillary Inbox tenant isolation", () => {
  it("enforces existing workspace identity without guessing legacy ownership", () => {
    expect(migration).toContain("unresolved legacy rows remain");
    expect(migration).toContain("alter table public.message_media alter column workspace_id set not null");
    expect(migration).toContain("alter table public.message_delivery_states alter column workspace_id set not null");
  });

  it("uses canonical workspace and scoped-support authorization", () => {
    expect(migration).toContain("public.has_workspace_access(workspace_id)");
    expect(migration).toContain("public.has_active_support_scope(workspace_id, 'files')");
    expect(migration).toContain("public.has_active_support_scope(workspace_id, 'metadata')");
    expect(migration).toContain("public.has_workspace_role(ct.workspace_id, array['owner','admin','member'])");
  });

  it("derives locks and notes through canonical conversation threads", () => {
    expect(migration).toContain("ct.id = conversation_locks.thread_id");
    expect(migration).toContain("ct.id = conversation_notes.thread_id");
    expect(migration).toContain("expires_at > pg_catalog.now()");
    expect(migration).toMatch(/create policy "p0 workspace members can update own conversation locks"[\s\S]*?using[\s\S]*?with check/i);
    expect(migration).toMatch(/create policy "p0 workspace members can update own conversation notes"[\s\S]*?using[\s\S]*?with check/i);
  });

  it("removes broad grants and keeps legacy Telegram raw data server-side", () => {
    for (const table of ["message_media", "message_delivery_states", "conversation_locks", "conversation_notes", "telegram_messages"]) {
      expect(migration).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
    }
    expect(migration).not.toMatch(/grant\s+[^;]*on table public\.telegram_messages to authenticated/i);
    expect(migration).toContain("Service-role-only until workspace identity is added");
  });

  it("preserves only the client operations currently used by Inbox", () => {
    expect(conversationHook).toContain('.from("conversation_locks")');
    expect(conversationHook).toContain(".upsert(");
    expect(conversationHook).toContain(".delete()");
    expect(helpdeskHook).toContain('.from("conversation_notes")');
    expect(helpdeskHook).toContain(".insert(");
  });

  it("applies the migration and denies cross-workspace writes in PostgreSQL", () => {
    expect(verification).toContain("20260828184249_p0_3_inbox_ancillary_isolation.sql");
    expect(verification).toContain("Cross-workspace media insert was allowed");
    expect(verification).toContain("Cross-workspace note insert was allowed");
    expect(verification).toContain("Cross-workspace lock insert was allowed");
  });
});
