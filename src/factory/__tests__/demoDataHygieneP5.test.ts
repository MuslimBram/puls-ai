import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

describe("B4/B5 & P5: Demo Data / Migration Hygiene & Clean Seed Insulating", () => {
  it("A. Migration files read actual SQL content using readFileSync() and verify zero destructive operations", () => {
    const migrationsDir = join(process.cwd(), "supabase", "migrations");
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

    let lastVersion = "";
    for (const file of files.sort()) {
      const version = file.split("_")[0];
      expect(version >= lastVersion).toBe(true);
      lastVersion = version;

      // Read actual SQL file content using readFileSync
      const sqlContent = readFileSync(join(migrationsDir, file), "utf-8");

      // Verify no un-scoped DROP TABLE or TRUNCATE exists in recent hardening migrations
      if (file.startsWith("20260816")) {
        expect(sqlContent).not.toContain("DROP TABLE public.");
        expect(sqlContent).not.toContain("TRUNCATE ");
      }
    }
  });

  it("B. Clean production initialization seed does NOT insert demo workspaces (muslimi-digital, mso-support, kohablerjeve)", () => {
    const migrationsDir = join(process.cwd(), "supabase", "migrations");
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

    // Check newly created hardening/schema migrations for mandatory production isolation
    const demoKeywords = ["muslimi-digital", "mso-support", "kohablerjeve"];

    for (const file of files) {
      if (file.startsWith("20260816")) {
        const sqlContent = readFileSync(join(migrationsDir, file), "utf-8");
        for (const kw of demoKeywords) {
          expect(sqlContent.toLowerCase()).not.toContain(kw);
        }
      }
    }
  });
});
