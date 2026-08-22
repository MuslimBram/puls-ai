import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoFile = (...parts: string[]) => join(process.cwd(), ...parts);
const pulseSrc = () => readFileSync(repoFile("supabase", "functions", "pulse-ai", "index.ts"), "utf-8");
const memorySrc = () => readFileSync(repoFile("supabase", "functions", "_shared", "pulse-memory-facade.ts"), "utf-8");

describe("AI-4 integration with canonical Pulse AI", () => {
  it("Pulse AI imports and calls the canonical AI-4 facade", () => {
    const src = pulseSrc();
    expect(src).toContain('from "../_shared/pulse-memory-facade.ts"');
    expect(src).toContain("resolveWorkspaceMemory(sb");
    expect(src).toContain("buildMemoryContextBlock(memory)");
  });

  it("memory resolution is gated to ai_router_direct capability", () => {
    const src = pulseSrc();
    expect(src).toContain('if (capability === "ai_router_direct")');
    const gate = src.slice(
      src.indexOf('if (capability === "ai_router_direct")'),
      src.indexOf("// ── Dispatch to canonical capability"),
    );
    expect(gate).toContain("resolveWorkspaceMemory");
  });

  it("public support function never invokes the memory facade", () => {
    const src = pulseSrc();
    const start = src.indexOf("async function dispatchPublicSupport");
    const end = src.indexOf("// ── Prompt builders", start);
    const publicFn = src.slice(start, end);
    expect(publicFn).not.toContain("resolveWorkspaceMemory");
    expect(publicFn).not.toContain("buildMemoryContextBlock");
    expect(publicFn).not.toContain("workspaceId: req.workspaceId");
    expect(publicFn).toContain("Never reveal CRM data");
    expect(publicFn).toContain("workspace-private information");
  });

  it("AI-4 does not add provider selection or direct provider calls", () => {
    const src = memorySrc();
    for (const endpoint of [
      "api.anthropic.com",
      "api.openai.com",
      "generativelanguage.googleapis.com",
      "api.groq.com",
      "api.deepseek.com",
      "api.mistral.ai",
    ]) {
      expect(src).not.toContain(endpoint);
    }
    expect(src).not.toContain("ANTHROPIC_API_KEY");
    expect(src).not.toContain("OPENAI_API_KEY");
  });

  it("AI-4 does not approve, queue, or execute AI-3 actions", () => {
    const src = memorySrc();
    expect(src).not.toContain("ai-action-approve");
    expect(src).not.toContain("ai_controlled_action");
    expect(src).not.toContain("appointment-booking");
    expect(src).not.toContain("launch-campaign-broadcast");
    expect(src).not.toContain('.from("job_queue")');
  });

  it("does not invent unified/vector/cross-workspace storage", () => {
    const src = memorySrc();
    expect(src).not.toContain('.from("unified_memory")');
    expect(src).not.toContain('.from("vector_memory")');
    expect(src).not.toContain('.from("cross_workspace_memory")');
    expect(src).not.toContain("Qdrant");
    expect(src).not.toContain("Pinecone");
  });

  it("all directly queried AI-4 private sources contain explicit workspace predicates", () => {
    const src = memorySrc();
    const expectedSources = [
      "enriched_contacts",
      "ai_conversation_memory",
      "conversation_threads",
      "business_profiles",
      "knowledge_chunks",
      "social_interest_memory",
    ];
    for (const source of expectedSources) {
      const positions: number[] = [];
      let from = 0;
      const token = `.from(\"${source}\")`;
      while (true) {
        const index = src.indexOf(token, from);
        if (index < 0) break;
        positions.push(index);
        from = index + token.length;
      }
      expect(positions.length, `${source} should be queried`).toBeGreaterThan(0);
      for (const index of positions) {
        const queryWindow = src.slice(index, index + 850);
        expect(queryWindow, `${source} query must remain workspace-scoped`).toContain('.eq("workspace_id", workspaceId)');
      }
    }
  });

  it("business_memory and customer_journey are deliberately excluded until mapping is proven", () => {
    const src = memorySrc();
    expect(src).not.toContain('.from("business_memory")');
    expect(src).not.toContain('.from("customer_journey")');
    expect(src).toContain("does not invent a workspace mapping");
  });
});
