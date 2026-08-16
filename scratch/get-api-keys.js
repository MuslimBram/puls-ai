const token = "REDACTED_SBP_TOKEN";

async function main() {
  const res = await fetch("https://api.supabase.com/v1/projects/wlvlgghqwwhhqaqqopml/api-keys", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  console.log("Project API Keys:", JSON.stringify(data, null, 2));
}

main();
