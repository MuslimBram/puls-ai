import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");

export function readMigrationByName(name: string) {
  const matches = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(`_${name}`))
    .sort();

  if (matches.length !== 1) {
    throw new Error(`Expected exactly one migration matching ${name}, found ${matches.length}`);
  }

  return readFileSync(resolve(migrationsDir, matches[0]), "utf8");
}
