import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260824231500_supabase_security_p1_anon.sql"),
  "utf8",
);

describe("Supabase P1 anonymous SECURITY DEFINER closure", () => {
  it("removes PUBLIC and anon execution from workspace/user RPCs", () => {
    for (const signature of [
      "assign_thread_round_robin(uuid, uuid)",
      "boost_memory_confidence(uuid, text, numeric)",
      "check_business_creation_limit(uuid)",
      "compute_agent_performance(uuid, timestamptz, timestamptz)",
      "compute_ai_metrics(uuid, timestamptz, timestamptz)",
      "compute_channel_performance(uuid, timestamptz, timestamptz)",
      "compute_executive_summary(uuid, date)",
      "compute_funnel_analytics(uuid, timestamptz, timestamptz)",
      "ensure_current_user_bootstrap()",
      "evaluate_contact_policy(uuid, uuid, text, text)",
      "generate_daily_kpi(uuid)",
      "upsert_conversation_thread(uuid, text, text, text, text, text)",
      "validate_nba_against_rules(uuid, text, numeric, text, uuid)",
    ]) {
      expect(migration).toContain(
        `revoke execute on function public.${signature} from public, anon;`,
      );
    }
  });

  it("restricts backend and trigger-only helpers to service_role", () => {
    for (const signature of [
      "bootstrap_user_account_for(uuid)",
      "detect_suspicious_login(uuid, text, text)",
      "notify_admin_on_payment_submission()",
    ]) {
      expect(migration).toContain(
        `revoke execute on function public.${signature} from public, anon, authenticated;`,
      );
      expect(migration).toContain(
        `grant execute on function public.${signature} to service_role;`,
      );
    }
  });

  it("records the contracts deferred by this historical batch", () => {
    for (const signature of [
      "get_legal_training_response(text, text)",
      "get_prohibited_rules(text)",
      "verify_white_label_license(text)",
      "has_role(uuid, app_role)",
      "is_workspace_member(uuid, uuid)",
      "is_workspace_owner(uuid, uuid)",
    ]) {
      expect(migration).toContain(signature);
      expect(migration).not.toContain(
        `revoke execute on function public.${signature}`,
      );
    }
  });

  it("does not rewrite function bodies or RLS policies", () => {
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function/i);
    expect(migration).not.toMatch(/create\s+policy|drop\s+policy/i);
    expect(migration).not.toMatch(/revoke\s+execute\s+on\s+all\s+functions/i);
  });
});
