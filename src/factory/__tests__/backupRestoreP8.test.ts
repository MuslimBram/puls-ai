import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

describe("P8: Backup & Disaster Recovery Restore Drill Validation", () => {
  it("A. docs/BACKUP-RESTORE.md exists and documents Supabase backup tier and shadow restore drill protocol", () => {
    const docPath = join(process.cwd(), "docs", "BACKUP-RESTORE.md");
    expect(existsSync(docPath)).toBe(true);

    const content = readFileSync(docPath, "utf-8");
    expect(content).toContain("Automated Physical Daily Snapshots");
    expect(content).toContain("Shadow Staging Container");
    expect(content).toContain("Restore Execution Time");
  });
});
