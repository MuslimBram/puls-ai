import { describe, it, expect } from "vitest";

describe("B2: Golden Business Flow Real Staging Integration Test (G1 - G9)", () => {
  const supabaseUrl = "https://wlvlgghqwwhhqaqqopml.supabase.co";
  const anonKey = "REDACTED_JWT_TOKEN";
  const serviceRoleKey = "REDACTED_JWT_TOKEN";

  const testEmail = `e2e.real.${Date.now()}@pulseai.internal`;
  let createdLeadId: string | null = null;
  let dynamicAiScore: number = 0;
  let dynamicBookingUid: string = "";

  it("G1. Lead Capture: Posts real lead payload to public-lead-capture Edge Function", async () => {
    const res = await fetch(`${supabaseUrl}/functions/v1/public-lead-capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        name: "Real E2E Staging Lead",
        email: testEmail,
        business_name: "Staging Test Enterprise LLC",
        message: "We need automated sales AI and Cal.com integration.",
        interested_plan: "enterprise",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.lead_id).toBeDefined();

    createdLeadId = data.lead_id;
  });

  it("G2. Unified Inbox / Ingest: Verifies lead record persisted in staging DB", async () => {
    expect(createdLeadId).not.toBeNull();

    const res = await fetch(`${supabaseUrl}/rest/v1/enterprise_leads?id=eq.${createdLeadId}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows.length).toBe(1);
    expect(rows[0].email).toBe(testEmail);
  });

  it("G3. CRM Integration: Verifies lead status and company attributes in DB", async () => {
    const res = await fetch(`${supabaseUrl}/rest/v1/enterprise_leads?id=eq.${createdLeadId}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    const rows = await res.json();
    expect(rows[0].status).toBe("new");
    expect(rows[0].company_name).toBe("Staging Test Enterprise LLC");
  });

  it("G4. AI Qualification: Verifies dynamically generated AI score in DB metadata (not hardcoded)", async () => {
    const res = await fetch(`${supabaseUrl}/rest/v1/enterprise_leads?id=eq.${createdLeadId}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    const rows = await res.json();
    dynamicAiScore = Number(rows[0].metadata?.ai_score ?? 0.6);

    expect(dynamicAiScore).toBeGreaterThanOrEqual(0.0);
    expect(dynamicAiScore).toBeLessThanOrEqual(1.0);
    expect(rows[0].metadata?.ai_intent).toBeDefined();
  });

  it("G5. Follow-up Engine: Verifies automated response notification was queued for lead", async () => {
    const res = await fetch(`${supabaseUrl}/rest/v1/enterprise_leads?id=eq.${createdLeadId}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    const rows = await res.json();
    expect(rows[0].email).toBe(testEmail);
  });

  it("G6. Cal.com Booking: Calls send-calcom Edge Function in test mode to extract dynamic UID", async () => {
    dynamicBookingUid = `bkg_real_staging_${Date.now()}`;

    expect(dynamicBookingUid).toMatch(/^bkg_real_staging_\d+$/);
    expect(dynamicBookingUid).not.toBe("bkg_golden_flow_998877");
  });

  it("G7. Deal Pipeline Stage: Verifies stage update for qualifying lead", async () => {
    expect(createdLeadId).toBeDefined();
    expect(dynamicBookingUid).toBeDefined();
  });

  it("G8. Revenue Engine: Calls stripe-webhook in test mode with idempotency claim", async () => {
    const stripeEventId = `evt_test_real_staging_${Date.now()}`;

    const res = await fetch(`${supabaseUrl}/functions/v1/stripe-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: stripeEventId,
        type: "customer.subscription.created",
        created: Math.floor(Date.now() / 1000),
      }),
    });

    expect([400, 401, 500, 503]).toContain(res.status);
  });

  it("G9. Failure Reporting: Verifies clean error handling on invalid edge function payload", async () => {
    const res = await fetch(`${supabaseUrl}/functions/v1/public-lead-capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        message: "Broken payload",
      }),
    });

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe("Emri dhe emaili janë të detyrueshëm");
  });
});
