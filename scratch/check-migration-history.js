const token = "REDACTED_SBP_TOKEN";

async function run() {
  const res = await fetch("https://api.supabase.com/v1/projects/wlvlgghqwwhhqaqqopml/database/query", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 20;",
    }),
  });

  const data = await res.json();
  console.log("Remote migration history (latest 20):", JSON.stringify(data, null, 2));
}

run();
