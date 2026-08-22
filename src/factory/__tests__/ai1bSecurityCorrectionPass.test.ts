import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  analyzePublicLead,
  deterministicLeadFallback,
  type PublicLeadCaptureBody,
} from "../../../supabase/functions/public-lead-capture/lead-analysis";
import {
  runVerifiedDeepScan,
  type VerifiedWorkspaceAIContext,
} from "../../../supabase/functions/security-monitor/deep-scan";

const repoFile = (...parts: string[]) => join(process.cwd(), ...parts);

const sampleLead: PublicLeadCaptureBody = {
  name: "Forged Visitor",
  email: "visitor@example.com",
  message: "Need a demo tomorrow",
  target_workspace_id: "forged-workspace-id",
};

describe("AI-1B security correction pass", () => {
  it("forged public target_workspace_id never reaches AI Router without a trusted server mapping", async () => {
    const askAI = vi.fn().mockResolvedValue('{"score":0.9,"intent":"hot","notes":"unused"}');

    const result = await analyzePublicLead(sampleLead, {
      askAI,
      resolveTrustedWorkspaceId: () => null,
    });

    expect(askAI).not.toHaveBeenCalled();
    expect(result).toEqual(deterministicLeadFallback(sampleLead));
    expect(result.routedWorkspaceId).toBeNull();
  });

  it("trusted server-side mapping is the only workspace route if one exists", async () => {
    const askAI = vi.fn().mockResolvedValue('{"score":0.91,"intent":"hot","notes":"trusted"}');

    const result = await analyzePublicLead(sampleLead, {
      askAI,
      resolveTrustedWorkspaceId: () => "trusted-workspace-id",
    });

    expect(askAI).toHaveBeenCalledTimes(1);
    expect(askAI.mock.calls[0]?.[3]).toMatchObject({
      workspaceId: "trusted-workspace-id",
      taskType: "text_classification",
    });
    expect(askAI.mock.calls[0]?.[3]).not.toMatchObject({
      workspaceId: sampleLead.target_workspace_id,
    });
    expect(result.usedAI).toBe(true);
    expect(result.routedWorkspaceId).toBe("trusted-workspace-id");
  });

  it("security-monitor deep scan fails safe when no verified workspace auth context exists", async () => {
    const askAI = vi.fn();

    const result = await runVerifiedDeepScan(
      "suspicious content",
      "source: api, workspace: forged-workspace-id",
      null,
      askAI,
    );

    expect(result).toBeNull();
    expect(askAI).not.toHaveBeenCalled();
  });

  it("verified workspace callers preserve user auth when reaching AI Router", async () => {
    const askAI = vi.fn().mockResolvedValue('{"found":true,"category":"fraud","severity":"high","score":0.9,"reason":"verified","action":"block"}');
    const aiContext: VerifiedWorkspaceAIContext = {
      workspaceId: "trusted-workspace-id",
      authHeader: "******",
      userId: "user-123",
    };

    const result = await runVerifiedDeepScan(
      "wire transfer urgently",
      "source: payment, workspace: trusted-workspace-id",
      aiContext,
      askAI,
    );

    expect(askAI).toHaveBeenCalledTimes(1);
    expect(askAI.mock.calls[0]?.[3]).toMatchObject({
      workspaceId: "trusted-workspace-id",
      authHeader: "******",
      userId: "user-123",
      taskType: "text_classification",
    });
    expect(result?.category).toBe("fraud");
  });

  it("keeps authenticated AI-1B workspace callers on user-authenticated router paths", () => {
    const authenticatedCallerFiles = [
      repoFile("supabase", "functions", "agent-config-manager", "index.ts"),
      repoFile("supabase", "functions", "agent-orchestrator", "index.ts"),
      repoFile("supabase", "functions", "ai-setup-assistant", "index.ts"),
      repoFile("supabase", "functions", "check-device-trust", "index.ts"),
      repoFile("supabase", "functions", "email-campaign-engine", "index.ts"),
      repoFile("supabase", "functions", "learning-engine", "index.ts"),
      repoFile("supabase", "functions", "multi-agent-engine", "index.ts"),
      repoFile("supabase", "functions", "score-leads", "index.ts"),
      repoFile("supabase", "functions", "score-visitors", "index.ts"),
      repoFile("supabase", "functions", "vicidial-cdr-sync", "index.ts"),
    ];

    for (const file of authenticatedCallerFiles) {
      const source = readFileSync(file, "utf-8");
      expect(source, file).toContain("authHeader");
    }
  });

  it("audits internal no-auth callers to server-derived workspace contracts only", () => {
    const telegramWebhook = readFileSync(repoFile("supabase", "functions", "telegram-webhook", "index.ts"), "utf-8");
    const salesSequence = readFileSync(repoFile("supabase", "functions", "sales-sequence-engine", "index.ts"), "utf-8");
    const autonomousAgent = readFileSync(repoFile("supabase", "functions", "autonomous-ai-agent", "index.ts"), "utf-8");
    const publicLeadCapture = readFileSync(repoFile("supabase", "functions", "public-lead-capture", "index.ts"), "utf-8");
    const securityMonitor = readFileSync(repoFile("supabase", "functions", "security-monitor", "index.ts"), "utf-8");

    expect(telegramWebhook).toContain("TELEGRAM_WORKSPACE_MAPPING_BLOCKER");
    expect(telegramWebhook).toContain("if (candidates.size !== 1)");

    expect(salesSequence).toContain("enrollment.workspace_id");
    expect(salesSequence).not.toContain("req.json().workspace_id");

    expect(autonomousAgent).toContain("workspaceId: businessId");
    expect(autonomousAgent).not.toContain("req.json().workspace_id");

    expect(publicLeadCapture).toContain("resolveTrustedWorkspaceId: () => null");
    expect(publicLeadCapture).not.toContain("workspaceId: body.target_workspace_id");

    expect(securityMonitor).toContain("resolveAuthorizedWorkspaceAIContext");
    expect(securityMonitor).toContain("runVerifiedDeepScan");
  });

  it("keeps all 13 intended provider bypass removals consolidated", () => {
    const migratedFiles = [
      "_shared/ai-client.ts",
      "agent-config-manager/index.ts",
      "agent-orchestrator/index.ts",
      "multi-agent-engine/index.ts",
      "ai-setup-assistant/index.ts",
      "public-lead-capture/index.ts",
      "email-campaign-engine/index.ts",
      "autonomous-ai-agent/index.ts",
      "learning-engine/index.ts",
      "sales-sequence-engine/index.ts",
      "vicidial-cdr-sync/index.ts",
      "check-device-trust/index.ts",
      "security-monitor/index.ts",
    ].map((relativePath) => repoFile("supabase", "functions", ...relativePath.split("/")));

    expect(migratedFiles).toHaveLength(13);

    for (const file of migratedFiles) {
      const source = readFileSync(file, "utf-8");
      expect(source, file).not.toContain("ai.gateway.lovable.dev");
      expect(source, file).not.toContain("api.anthropic.com/v1/messages");
      expect(source, file).toMatch(/askAI\(|callAI\(|callAIRouter\(|analyzePublicLead\(|runVerifiedDeepScan\(/);
    }
  });
});
