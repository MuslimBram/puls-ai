import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "supabase", "functions", "search-knowledge", "index.ts"),
  "utf8",
);

describe("search-knowledge workspace boundary", () => {
  it("resolves business to workspace before searching", () => {
    expect(source).toContain('.from("business_profiles")');
    expect(source).toContain('.select("id, workspace_id")');
    expect(source).toContain('if (!ownedWorkspace && !membership && !assignment) throw new Error("Forbidden")');
  });

  it("workspace scopes both chunks and their source parent", () => {
    expect(source).toContain('.eq("workspace_id", workspaceId)');
    expect(source).toContain('.eq("knowledge_sources.workspace_id", workspaceId)');
    expect(source).toContain('.eq("knowledge_sources.business_id", business_id)');
  });

  it("sanitizes search filter terms and bounds result size", () => {
    expect(source).toContain('term.replace(/[^\\p{L}\\p{N}_-]+/gu, "")');
    expect(source).toContain('.slice(0, 8)');
    expect(source).toContain('Math.min(Math.max(Math.trunc(Number(limit)), 1), 50)');
  });
});
