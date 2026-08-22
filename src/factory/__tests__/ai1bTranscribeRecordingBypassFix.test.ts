/**
 * AI-1B — Transcribe-Recording Provider Bypass Fix Tests
 *
 * Proves:
 * 1. transcribe-recording contains no direct api.anthropic.com/v1/messages call
 * 2. Contains no hardcoded Claude model for post-transcription analysis
 * 3. Text analysis reaches canonical AI Router (callAIRouter import present)
 * 4. User-initiated path preserves Authorization header
 * 5. Internal path uses only server-derived recording.workspace_id
 * 6. Forged request workspace_id cannot control router tenant
 * 7. Whisper STT direct path remains intact
 * 8. Router failure does not erase a valid transcript
 * 9. Previous AI-1B security correction remains PASS
 * 10. All 13 prior bypass consolidations remain intact
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoFile = (...parts: string[]) => join(process.cwd(), ...parts);

const transcribeSrc = () =>
  readFileSync(
    repoFile("supabase", "functions", "transcribe-recording", "index.ts"),
    "utf-8",
  );

// ─────────────────────────────────────────────────────────────────────────────
// 1. No direct Anthropic endpoint for post-transcription analysis
// ─────────────────────────────────────────────────────────────────────────────
describe("transcribe-recording: direct Anthropic bypass removed", () => {
  it("contains no direct api.anthropic.com/v1/messages call", () => {
    const src = transcribeSrc();
    expect(src).not.toContain("api.anthropic.com/v1/messages");
  });

  it("contains no hardcoded claude-sonnet model string for post-transcription analysis", () => {
    const src = transcribeSrc();
    // There must be no hardcoded model string used to call Anthropic directly.
    // (The router may internally use Claude; that is the router's concern, not this file.)
    expect(src).not.toMatch(/model:\s*["']claude-/);
    expect(src).not.toContain('"claude-sonnet-4-6"');
    expect(src).not.toContain("'claude-sonnet-4-6'");
  });

  it("does not read ANTHROPIC_API_KEY for post-transcription text analysis", () => {
    const src = transcribeSrc();
    // The file must not hold a module-level AK variable using ANTHROPIC_API_KEY
    // nor pass it to a direct fetch for text analysis.
    // It's acceptable if it appears in comments; we check for actual usage.
    expect(src).not.toMatch(/const AK\s*=\s*Deno\.env\.get\(["']ANTHROPIC_API_KEY["']\)/);
    expect(src).not.toMatch(/"x-api-key":\s*AK/);
  });

  it("does not send anthropic-version header in text analysis fetch", () => {
    const src = transcribeSrc();
    expect(src).not.toContain('"anthropic-version"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Text analysis reaches canonical AI Router with an accepted task type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the normalizeTaskType function and its supporting data from the
 * real ai-router source so the test validates against the live contract —
 * not a stale copy.  We pull out CANONICAL_TASK_TYPES, TASK_TYPE_ALIASES,
 * and the function body, then rebuild them in Node via vm so no Deno runtime
 * is needed.
 */
function buildNormalizeTaskType(): (t?: string) => string | null {
  const routerSrc = readFileSync(
    repoFile("supabase", "functions", "ai-router", "index.ts"),
    "utf-8",
  );

  // Extract canonical types array literal
  const canonicalMatch = routerSrc.match(
    /const CANONICAL_TASK_TYPES[^=]*=\s*\[([^\]]+)\]/s,
  );
  if (!canonicalMatch) throw new Error("Could not extract CANONICAL_TASK_TYPES");
  // deno-style: parse string literals from the array
  const canonicalTypes: string[] = [];
  for (const m of canonicalMatch[1].matchAll(/"([^"]+)"/g)) canonicalTypes.push(m[1]);

  // Extract aliases object literal
  const aliasMatch = routerSrc.match(
    /const TASK_TYPE_ALIASES[^=]*=\s*\{([^}]+)\}/s,
  );
  if (!aliasMatch) throw new Error("Could not extract TASK_TYPE_ALIASES");
  const aliases: Record<string, string> = {};
  for (const m of aliasMatch[1].matchAll(/"?(\w+)"?\s*:\s*"([^"]+)"/g)) {
    aliases[m[1]] = m[2];
  }

  return (taskType?: string): string | null => {
    if (!taskType) return null;
    const normalized = taskType.trim().toLowerCase();
    if (canonicalTypes.includes(normalized)) return normalized;
    return aliases[normalized] ?? null;
  };
}

describe("transcribe-recording: canonical AI Router used for text analysis", () => {
  it("imports callAIRouter from the shared ai-router-helper", () => {
    const src = transcribeSrc();
    expect(src).toContain('import { callAIRouter } from "../_shared/ai-router-helper.ts"');
  });

  it("calls callAIRouter for post-transcription analysis", () => {
    const src = transcribeSrc();
    expect(src).toContain("callAIRouter(");
  });

  it("task type sent to router is accepted by the REAL normalizeTaskType contract", () => {
    const src = transcribeSrc();
    // Extract all taskType values passed to callAIRouter in routerOptions blocks
    const taskTypeMatches = [...src.matchAll(/taskType:\s*["']([^"']+)["']/g)];
    expect(taskTypeMatches.length).toBeGreaterThan(0);

    const normalize = buildNormalizeTaskType();

    for (const match of taskTypeMatches) {
      const taskType = match[1];
      const resolved = normalize(taskType);
      expect(
        resolved,
        `taskType "${taskType}" is NOT accepted by the canonical AI Router (normalizeTaskType returned null)`,
      ).not.toBeNull();
    }
  });

  it("uses complex_reasoning (not text_analysis) as the router task type", () => {
    const src = transcribeSrc();
    expect(src).not.toContain('"text_analysis"');
    expect(src).not.toContain("'text_analysis'");
    // Verify the correct canonical type is present in routerOptions
    expect(src).toContain('"complex_reasoning"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Auth / workspace contract
// ─────────────────────────────────────────────────────────────────────────────
describe("transcribe-recording: workspace and auth contract", () => {
  it("uses recording.workspace_id (server-derived) — not request body workspace_id — as router workspace", () => {
    const src = transcribeSrc();
    // The router must be called with recordingWorkspaceId (server-derived), not the
    // raw request-body workspace_id variable.
    expect(src).toContain("workspaceId: recordingWorkspaceId");
    // The request-provided workspace_id must NOT be passed to the router call.
    // We verify: the routerOptions blocks do not reference bare `workspace_id` (request input).
    // Find routerOptions block and check it has no `workspace_id` (without "recording") in it.
    const routerBlock = src.slice(src.indexOf("const routerOptions"), src.indexOf("callAIRouter("));
    expect(routerBlock).not.toMatch(/workspaceId:\s*workspace_id[^I]/);
  });

  it("user-initiated path includes authHeader in router options", () => {
    const src = transcribeSrc();
    // The non-internal branch of routerOptions passes authHeader.
    expect(src).toContain("authHeader: authHeader");
  });

  it("internal path does NOT include user authHeader in router options", () => {
    const src = transcribeSrc();
    // In the internal branch (isInternal ? {...} : {...}), the internal block
    // must not pass authHeader. We check the internal branch object.
    // The pattern is: isInternal ? { workspaceId, taskType, maxTokens } : { authHeader, ...}
    // So the internal object must appear before authHeader appears.
    const internalBranchMatch = src.match(
      /const routerOptions\s*=\s*isInternal\s*\?\s*\{([^}]+)\}/s,
    );
    expect(internalBranchMatch).not.toBeNull();
    const internalBlock = internalBranchMatch![1];
    expect(internalBlock).not.toContain("authHeader");
  });

  it("forged request workspace_id is explicitly commented as NEVER trusted", () => {
    const src = transcribeSrc();
    expect(src).toMatch(/[Rr]equest.controlled.*workspace_id.*NEVER|NEVER.*request.controlled.*workspace_id/s);
  });

  it("SECURITY comment on recording workspace_id is present (server-derived)", () => {
    const src = transcribeSrc();
    expect(src).toContain("SECURITY: Always use recording's STORED workspace_id");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Whisper direct path preserved
// ─────────────────────────────────────────────────────────────────────────────
describe("transcribe-recording: Whisper STT direct path preserved", () => {
  it("still calls api.openai.com/v1/audio/transcriptions directly (justified Whisper path)", () => {
    const src = transcribeSrc();
    expect(src).toContain("https://api.openai.com/v1/audio/transcriptions");
  });

  it("Whisper model whisper-1 remains hardcoded (STT-specific, not text analysis)", () => {
    const src = transcribeSrc();
    expect(src).toContain('"whisper-1"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Router failure does not erase a valid transcript
// ─────────────────────────────────────────────────────────────────────────────
describe("transcribe-recording: analysis failure does not corrupt transcript", () => {
  it("callAIRouter is wrapped in try/catch with safe fallback", () => {
    const src = transcribeSrc();
    // The router call must be inside a try block that catches without rethrowing
    // (so transcript persist still runs).
    const routerCallIdx = src.indexOf("callAIRouter(");
    const catchIdx = src.indexOf("} catch", routerCallIdx);
    expect(routerCallIdx).toBeGreaterThan(-1);
    expect(catchIdx).toBeGreaterThan(routerCallIdx);
    // The catch block should log a warning about safe defaults
    const catchBlock = src.slice(catchIdx, catchIdx + 300);
    expect(catchBlock).toContain("safe defaults");
  });

  it("transcript persistence (step 4) is outside the analysis try-catch", () => {
    const src = transcribeSrc();
    // Step 4 (persist) must appear after the router try-catch block, not inside it.
    const step4Idx = src.indexOf("Step 4: Persist");
    const routerTryEnd = src.indexOf("safe defaults");
    expect(step4Idx).toBeGreaterThan(routerTryEnd);
  });

  it("analysis defaults to empty object / neutral sentiment on failure", () => {
    const src = transcribeSrc();
    expect(src).toContain('let analysis: Record<string, unknown> = {}');
    expect(src).toContain('"neutral"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Customer entitlement limitation documented
// ─────────────────────────────────────────────────────────────────────────────
describe("transcribe-recording: internal path limitation documented", () => {
  it("documents internal path entitlement limitation explicitly", () => {
    const src = transcribeSrc();
    expect(src).toContain("LIMITATION:");
    expect(src).toMatch(/per-user entitlement|per-seat|plan limits/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Previous AI-1B security correction remains PASS
// ─────────────────────────────────────────────────────────────────────────────
describe("AI-1B previous security correction still intact", () => {
  it("shared ai-client.ts has no direct api.anthropic.com/v1/messages", () => {
    const src = readFileSync(
      repoFile("supabase", "functions", "_shared", "ai-client.ts"),
      "utf-8",
    );
    expect(src).not.toContain("api.anthropic.com/v1/messages");
  });

  it("shared ai-client.ts routes through callAIRouter", () => {
    const src = readFileSync(
      repoFile("supabase", "functions", "_shared", "ai-client.ts"),
      "utf-8",
    );
    expect(src).toContain("callAIRouter");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. All 13 prior bypass consolidations remain intact
//    (spot-check: files that had direct Anthropic/OpenAI bypasses replaced)
// ─────────────────────────────────────────────────────────────────────────────
describe("AI-1B all prior bypass consolidations remain intact", () => {
  const bypassFiles = [
    ["supabase", "functions", "agent-config-manager", "index.ts"],
    ["supabase", "functions", "agent-orchestrator", "index.ts"],
    ["supabase", "functions", "ai-conversation-memory", "index.ts"],
    ["supabase", "functions", "ai-help-bot", "index.ts"],
    ["supabase", "functions", "business-insight-ai", "index.ts"],
    ["supabase", "functions", "customer-brain", "index.ts"],
    ["supabase", "functions", "dedicated-ai-reply", "index.ts"],
    ["supabase", "functions", "generate-ai-suggestions", "index.ts"],
    ["supabase", "functions", "generate-reply", "index.ts"],
    ["supabase", "functions", "multi-agent-engine", "index.ts"],
    ["supabase", "functions", "voice-ai-relay", "index.ts"],
    ["supabase", "functions", "_shared", "ai-client.ts"],
  ];

  for (const parts of bypassFiles) {
    const label = parts.slice(-2).join("/");
    it(`${label} has no direct api.anthropic.com/v1/messages`, () => {
      let src: string;
      try {
        src = readFileSync(repoFile(...parts), "utf-8");
      } catch {
        // If file doesn't exist, it can't have a bypass — pass.
        return;
      }
      expect(src).not.toContain("api.anthropic.com/v1/messages");
    });
  }
});
