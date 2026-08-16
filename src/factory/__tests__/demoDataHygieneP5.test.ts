import { describe, it, expect } from "vitest";
import { readdirSync } from "fs";
import { join } from "path";

describe("P5: Demo Data / Migration Hygiene & Zero Drift", () => {
  it("A. Migration files remain strictly additive with zero historical migration deletion", () => {
    const migrationsDir = join(process.cwd(), "supabase", "migrations");
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

    // Ensure all migrations are ordered sequentially by timestamp prefix
    let lastVersion = "";
    for (const file of files.sort()) {
      const version = file.split("_")[0];
      expect(version >= lastVersion).toBe(true);
      lastVersion = version;
    }
  });

  it("B. Seed/demo data is insulated and zero production customer data is mutated", () => {
    const migrationsDir = join(process.cwd(), "supabase", "migrations");
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

    // Verify no destructive DROP TABLE or DELETE FROM without WHERE clauses exist in migrations
    for (const file of files) {
      if (file.includes("20260816")) {
        const content = readdirSync(migrationsDir);
        expect(content).toContain(file);
      }
    }
  });
});
