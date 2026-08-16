import fs from "fs";

const token = "REDACTED_SBP_TOKEN";

async function run() {
  const sql = fs.readFileSync("supabase/migrations/20260816040000_enterprise_leads_nullable_user_id.sql", "utf-8") + `
  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260816040000', 'enterprise_leads_nullable_user_id')
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
  console.log("Migration apply result:", JSON.stringify(data));
}

run();
