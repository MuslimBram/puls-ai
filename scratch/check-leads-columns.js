const token = "REDACTED_SBP_TOKEN";

async function main() {
  const res = await fetch("https://api.supabase.com/v1/projects/wlvlgghqwwhhqaqqopml/database/query", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'leads';",
    }),
  });

  const data = await res.json();
  console.log("leads table columns:", JSON.stringify(data, null, 2));
}

main();
