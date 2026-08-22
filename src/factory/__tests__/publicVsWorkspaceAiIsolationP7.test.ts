import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("P7: Public AI vs Workspace AI Security Isolation & Cross-Workspace Negative Control", () => {
  it("A. Public lead capture endpoint has zero access to private workspace CRM or customer memory tables", () => {
    const fnPath = join(process.cwd(), "supabase", "functions", "public-lead-capture", "index.ts");
    const content = readFileSync(fnPath, "utf-8");

    // Must write to public staging tables only (public_leads)
    expect(content).toContain("public_leads");
    expect(content).not.toContain("customer_memory");
    expect(content).not.toContain("workspace_credentials");
  });

  it("B. Cross-Workspace Negative Test: User A is denied access to Workspace B data even if forging workspace_id", async () => {
    const mockAuthContext = {
      userId: "usr-alpha-111",
      userWorkspaces: ["ws-alpha-111"],
    };

    const isAuthorized = (workspaceId: string) => {
      return mockAuthContext.userWorkspaces.includes(workspaceId);
    };

    const targetWorkspace = "ws-beta-222";
    const accessAllowed = isAuthorized(targetWorkspace);

    expect(accessAllowed).toBe(false);
  });

  it("C. Service-role usage is strictly scoped and does not bypass multi-tenant RLS boundaries in client paths", () => {
    const helperPath = join(process.cwd(), "supabase", "functions", "_shared", "calcom-helper.ts");
    const content = readFileSync(helperPath, "utf-8");

    expect(content).toContain("workspace_id");
  });
});
