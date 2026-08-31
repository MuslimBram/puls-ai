import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");

export function readMigrationByName(name: string) {
  const normalizedName = name.endsWith(".sql") ? name : `${name}.sql`;
  const migrationNamePattern = new RegExp(`^\\d+_${normalizedName.replaceAll(".", "\\.")}$`);
  const matches = readdirSync(migrationsDir)
    .filter((file) => migrationNamePattern.test(file))
    .sort();

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one migration matching ${normalizedName}, found ${matches.length}: ${matches.join(", ")}`,
    );
  }

  return readFileSync(resolve(migrationsDir, matches[0]), "utf8");
}
