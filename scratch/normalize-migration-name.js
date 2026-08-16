const token = "REDACTED_SBP_TOKEN";

async function run() {
  const sql = `
  UPDATE supabase_migrations.schema_migrations
  SET name = 'calcom_channel_registry'
  WHERE version = '20260816020000';
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
  console.log("Migration metadata update result:", JSON.stringify(data));

  // Verify
  const verifyRes = await fetch("https://api.supabase.com/v1/projects/wlvlgghqwwhhqaqqopml/database/query", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '20260816020000';",
    }),
  });

  const verifyData = await verifyRes.json();
  console.log("Migration metadata verification result:", JSON.stringify(verifyData));
}

run();
