const anonKey = "REDACTED_JWT_TOKEN";

async function main() {
  const res = await fetch("https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/public-lead-capture", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      name: "Real E2E Staging Lead",
      email: "test.lead.debug@pulseai.internal",
      business_name: "Staging Test Enterprise LLC",
      message: "We need automated sales AI and Cal.com integration.",
      interested_plan: "enterprise",
    }),
  });

  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Body:", JSON.stringify(data, null, 2));
}

main();
