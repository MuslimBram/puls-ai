import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260901220000_leah_agent_to_agent_bus.sql"),
  "utf8",
);
const hardening = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260901220100_leah_agent_bus_hardening.sql"),
  "utf8",
);
const runtime = readFileSync(
  resolve(process.cwd(), "supabase/functions/leah-agent-bus/index.ts"),
  "utf8",
);
const workerAuth = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/leah-worker-auth.ts"),
  "utf8",
);
const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");
const verifier = readFileSync(resolve(process.cwd(), "scripts/verify-leah-agent-bus.sql"), "utf8");

describe("MR8C Agent-to-Agent Bus source contract", () => {
  it("uses a durable service-only execution-bound message ledger", () => {
    expect(migration).toContain("create table public.leah_agent_messages");
    expect(migration).toContain("foreign key (sender_task_id, execution_id, workspace_id)");
    expect(migration).toContain("foreign key (recipient_task_id, execution_id, workspace_id)");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("revoke all on public.leah_agent_messages from public,anon,authenticated");
  });

  it("binds send/receive/ack to active task leases instead of caller workspace ids", () => {
    expect(migration).toContain("leah_agent_bus_require_task");
    expect(migration).toContain("t.lease_token=_lease_token");
    expect(migration).toContain("t.lease_expires_at > clock_timestamp()");
    expect(runtime).toContain("workspace and sender identity are server-derived");
    expect(runtime).not.toContain("_workspace_id:");
  });

  it("has idempotent send, request/response correlation and same-execution reply integrity", () => {
    expect(migration).toContain("unique (workspace_id, sender_task_id, idempotency_key)");
    expect(migration).toContain("Agent-bus idempotency conflict");
    expect(migration).toContain("_correlation := _parent.correlation_id");
    expect(migration).toContain("Agent-bus response recipient must match request sender task");
    expect(hardening).toContain("on delete cascade");
  });

  it("implements at-least-once delivery with rotating delivery tokens and dead-lettering", () => {
    expect(migration).toContain("delivery_token uuid null");
    expect(migration).toContain("delivery_attempts=m.delivery_attempts+1");
    expect(migration).toContain("delivery_token=gen_random_uuid()");
    expect(migration).toContain("delivery_attempts >= max_delivery_attempts");
    expect(migration).toContain("delivery_attempts_exhausted");
    expect(migration).toContain("Agent-bus delivery token invalid or expired");
  });

  it("supports task and role routing without cross-execution task addressing", () => {
    expect(migration).toContain("Exactly one agent-bus recipient target is required");
    expect(migration).toContain("recipient_task_id=_task.id");
    expect(migration).toContain("recipient_agent_role=_task.agent_role");
    expect(migration).toContain("Agent-bus recipient task unavailable or cross-execution");
  });

  it("cancels undelivered bus work when the recipient or execution becomes terminal", () => {
    expect(migration).toContain("leah_agent_bus_execution_terminal_trigger");
    expect(migration).toContain("error_code='execution_terminal'");
    expect(migration).toContain("leah_agent_bus_task_terminal_trigger");
    expect(migration).toContain("error_code='recipient_task_terminal'");
  });

  it("exposes only a worker-secret authenticated Edge boundary", () => {
    expect(config).toMatch(/\[functions\.leah-agent-bus\]\s+verify_jwt = false/);
    expect(runtime).toContain("requireLeahWorker(req)");
    expect(workerAuth).toContain('Deno.env.get("LEAH_WORKER_SECRET")');
    expect(workerAuth).toContain("constantTimeEqual");
    expect(runtime).toContain('action === "send"');
    expect(runtime).toContain('action === "receive"');
    expect(runtime).toContain('action === "ack"');
    expect(runtime).toContain('action === "fail"');
  });

  it("ships adversarial coverage for spoofing, replay, delivery and lifecycle failures", () => {
    expect(verifier).toContain("authenticated can forge agent messages");
    expect(verifier).toContain("agent bus idempotency conflict was accepted");
    expect(verifier).toContain("cross-workspace agent target succeeded");
    expect(verifier).toContain("wrong delivery token acknowledged message");
    expect(verifier).toContain("stale delivery token acknowledged redelivery");
    expect(verifier).toContain("stale sender lease created agent message");
    expect(verifier).toContain("MR8C AGENT-TO-AGENT BUS CONTRACT: PASS");
  });
});
