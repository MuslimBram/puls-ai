import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260824224500_supabase_security_p0_execute.sql"),
  "utf8",
);

describe("Supabase P0 SECURITY DEFINER execute closure", () => {
  it("removes unauthenticated access while preserving authorized Vault RPC access", () => {
    for (const signature of [
      "vault_store_secret(uuid, text, text, text)",
      "vault_read_secret(text)",
      "vault_delete_secret(text)",
    ]) {
      expect(migration).toContain(
        `revoke execute on function public.${signature} from public, anon;`,
      );
      expect(migration).toContain(
        `grant execute on function public.${signature} to authenticated, service_role;`,
      );
    }
  });

  it("locks trigger and backend-only functions away from browser roles", () => {
    for (const signature of [
      "api_keys_block_privilege_escalation()",
      "auto_block_brute_force()",
      "auto_reopen_thread_on_inbound()",
      "create_partner_wallet()",
      "create_user_wallet()",
      "device_requests_block_self_approval()",
      "handle_new_user()",
      "payout_requests_enforce_initial_status()",
      "withdrawal_requests_enforce_initial_status()",
      "touch_support_ticket_on_message()",
      "update_sales_sequences_updated_at()",
      "archive_old_messages(uuid, integer)",
      "billing_consistency_report()",
      "cleanup_expired_locks()",
      "decay_memory_confidence(integer)",
      "process_escalations(uuid)",
      "sync_referral_statuses()",
    ]) {
      expect(migration).toContain(
        `revoke execute on function public.${signature} from public, anon, authenticated;`,
      );
    }
  });

  it("does not alter function bodies, RLS, triggers, or apply blanket schema revokes", () => {
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function/i);
    expect(migration).not.toMatch(/alter\s+table.*(enable|disable)\s+row\s+level\s+security/i);
    expect(migration).not.toMatch(/drop\s+trigger|create\s+trigger/i);
    expect(migration).not.toMatch(/revoke\s+execute\s+on\s+all\s+functions/i);
  });
});
