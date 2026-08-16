import { runLiveDbAudit } from "../scripts/production-audit.ts";

const token = "REDACTED_SBP_TOKEN";
const projectRef = "wlvlgghqwwhhqaqqopml";

async function main() {
  console.log("Running Live Staging DB Catalog Audit...");
  const audit = await runLiveDbAudit(token, projectRef);
  console.log(`Total public tables: ${audit.tables.length}`);
  console.log(`Unprotected tables (rowsecurity = false):`, audit.unprotectedTables);
}

main();
