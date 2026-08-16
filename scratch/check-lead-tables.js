const token = "REDACTED_SBP_TOKEN";

async function main() {
  const res = await fetch("https://api.supabase.com/v1/projects/wlvlgghqwwhhqaqqopml/database/query", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%lead%';",
    }),
  });

  const data = await res.json();
  console.log("Lead tables in remote DB:", JSON.stringify(data, null, 2));
}

main();
