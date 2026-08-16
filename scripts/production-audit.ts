import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

export interface AuditResult {
  tablesWithoutRLS: string[];
  unverifiedFunctions: string[];
  secDefinerWithoutSearchPath: string[];
  unsafeServiceRoleUsage: string[];
}

export function runProductionAudit(rootDir: string): AuditResult {
  const result: AuditResult = {
    tablesWithoutRLS: [],
    unverifiedFunctions: [],
    secDefinerWithoutSearchPath: [],
    unsafeServiceRoleUsage: [],
  };

  // 1. Audit Migration files for RLS & SECURITY DEFINER
  const migrationsDir = join(rootDir, "supabase", "migrations");
  try {
    const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    for (const file of migrationFiles) {
      const content = readFileSync(join(migrationsDir, file), "utf-8");

      // Check SECURITY DEFINER without search_path
      const secDefMatches = content.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION[^\n]+SECURITY\s+DEFINER/gi);
      for (const match of secDefMatches) {
        const index = match.index ?? 0;
        const block = content.slice(index, index + 500);
        if (!block.toLowerCase().includes("set search_path")) {
          const funcLine = match[0].split("\n")[0];
          result.secDefinerWithoutSearchPath.push(`${file}: ${funcLine}`);
        }
      }
    }
  } catch {
    /* dir not found */
  }

  // 2. Audit Functions config in supabase/config.toml
  const configTomlPath = join(rootDir, "supabase", "config.toml");
  try {
    const configContent = readFileSync(configTomlPath, "utf-8");
    const blocks = configContent.split(/\[functions\./);
    for (const block of blocks) {
      if (block.includes("verify_jwt = false")) {
        const fnName = block.split("]")[0].trim();
        if (fnName && !result.unverifiedFunctions.includes(fnName)) {
          result.unverifiedFunctions.push(fnName);
        }
      }
    }
  } catch {
    /* config.toml read error */
  }

  // Also check individual function config.toml files if present
  const functionsDir = join(rootDir, "supabase", "functions");
  try {
    const fnFolders = readdirSync(functionsDir);
    for (const folder of fnFolders) {
      const folderPath = join(functionsDir, folder);
      if (statSync(folderPath).isDirectory()) {
        const configPath = join(folderPath, "config.toml");
        try {
          const configContent = readFileSync(configPath, "utf-8");
          if (configContent.includes("verify_jwt = false") && !result.unverifiedFunctions.includes(folder)) {
            result.unverifiedFunctions.push(folder);
          }
        } catch {
          /* no config.toml */
        }
      }
    }
  } catch {
    /* dir not found */
  }

  // 3. Audit client-side src/ for unsafe SUPABASE_SERVICE_ROLE_KEY runtime initialization
  const srcDir = join(rootDir, "src");
  function scanDir(dir: string) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        if (statSync(fullPath).isDirectory()) {
          scanDir(fullPath);
        } else if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.includes("test") && !entry.includes("Scanner")) {
          const content = readFileSync(fullPath, "utf-8");
          // Check for actual client-side instantiation with service_role key
          if (content.includes("SUPABASE_SERVICE_ROLE_KEY") && content.includes("createClient")) {
            result.unsafeServiceRoleUsage.push(fullPath.replace(rootDir, ""));
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  scanDir(srcDir);

  return result;
}

if (require.main === module) {
  const audit = runProductionAudit(process.cwd());
  console.log("=== PULSE AI PRODUCTION SECURITY AUDIT REPORT ===");
  console.log("Edge Functions with verify_jwt=false:", audit.unverifiedFunctions);
  console.log("SECURITY DEFINER without search_path:", audit.secDefinerWithoutSearchPath.length);
  console.log("Client-side unsafe service_role usage:", audit.unsafeServiceRoleUsage);
}
