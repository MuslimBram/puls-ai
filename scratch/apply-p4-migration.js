import fs from "fs";

const token = "REDACTED_SBP_TOKEN";

async function run() {
  const sql = fs.readFileSync("supabase/migrations/20260816030000_lidhjet_rpc_hardening.sql", "utf-8") + `
  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260816030000', 'lidhjet_rpc_hardening')
  ON CONFLICT (version) DO NOTHING;
  `;

  const res = await fetch("https://api.supabase.com/v1/projects/wlvlgghqwwhhqaqqopml/database/query", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  const data = await res.json();
  console.log("P4 Migration apply result:", JSON.stringify(data));
}

run();
