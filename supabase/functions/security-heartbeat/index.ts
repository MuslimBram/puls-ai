import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req, { allowAnyOrigin: false }), "Content-Type": "application/json" },
  });

const getClientIp = (req: Request) => {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || null;
};

const scoreRisk = (signals: Record<string, unknown>) => {
  let score = 0;
  if (signals.ip_changed) score += 35;
  if (signals.user_agent_changed) score += 20;
  if (signals.multiple_ips_15m) score += 25;
  if (signals.high_event_rate) score += 30;
  if (signals.unknown_session) score += 15;
  return Math.min(100, score);
};

const severityFor = (score: number) =>
  score >= 80 ? "critical" : score >= 60 ? "high" : score >= 35 ? "medium" : "low";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: buildCorsHeaders(req, { allowAnyOrigin: false }) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = getServiceKey()!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json(req, { error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body?.session_id === "string" ? body.session_id.slice(0, 128) : "unknown";
    const ip = getClientIp(req);
    const userAgent = (req.headers.get("user-agent") || "unknown").slice(0, 512);

    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: recent } = await adminClient
      .from("security_access_events")
      .select("ip_address,user_agent,event_type,created_at")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);

    const ips = new Set((recent || []).map((r) => String(r.ip_address || "")).filter(Boolean));
    const userAgents = new Set((recent || []).map((r) => String(r.user_agent || "")).filter(Boolean));
    const recentFiveMinutes = (recent || []).filter((r) => Date.now() - new Date(r.created_at).getTime() < 5 * 60 * 1000).length;
    const previousIp = recent?.[0]?.ip_address ? String(recent[0].ip_address) : null;
    const previousUa = recent?.[0]?.user_agent ? String(recent[0].user_agent) : null;

    const signals = {
      ip_changed: !!(previousIp && ip && previousIp !== ip),
      user_agent_changed: !!(previousUa && previousUa !== userAgent),
      multiple_ips_15m: ips.size + (ip && !ips.has(ip) ? 1 : 0) > 1,
      high_event_rate: recentFiveMinutes >= 20,
      unknown_session: sessionId === "unknown",
    };
    const riskScore = scoreRisk(signals);
    const severity = severityFor(riskScore);

    const { data: memberships } = await adminClient
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);
    const { data: owned } = await adminClient
      .from("workspaces")
      .select("id")
      .eq("owner_id", user.id);
    const workspaceIds = new Set<string>([
      ...(memberships || []).map((m) => m.workspace_id),
      ...(owned || []).map((w) => w.id),
    ]);

    await adminClient.from("security_access_events").insert({
      user_id: user.id,
      event_type: "heartbeat",
      ip_address: ip,
      user_agent: userAgent,
      risk_score: riskScore,
      risk_signals: signals,
    });

    for (const workspaceId of workspaceIds) {
      await adminClient.from("security_presence").upsert({
        user_id: user.id,
        workspace_id: workspaceId,
        session_id: sessionId,
        ip_address: ip,
        user_agent: userAgent,
        last_seen_at: new Date().toISOString(),
        risk_score: riskScore,
      });
    }

    if (riskScore >= 35) {
      const alertType = signals.high_event_rate ? "high_event_rate" : signals.ip_changed ? "ip_change" : "authentication_anomaly";
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: existing } = await adminClient
        .from("security_alerts")
        .select("id")
        .eq("user_id", user.id)
        .eq("alert_type", alertType)
        .eq("status", "open")
        .gte("created_at", thirtyMinutesAgo)
        .limit(1);

      if (!existing?.length) {
        const base = {
          user_id: user.id,
          severity,
          alert_type: alertType,
          title: "Suspicious authentication activity detected",
          summary: "Automated security analysis found an unusual access pattern. This is a risk signal for human review, not a legal determination.",
          signals: { ...signals, ip, session_id: sessionId, detected_at: new Date().toISOString() },
        };
        await adminClient.from("security_alerts").insert({ ...base, workspace_id: null });
        for (const workspaceId of workspaceIds) {
          await adminClient.from("security_alerts").insert({ ...base, workspace_id: workspaceId });
        }
      }
    }

    return json(req, { ok: true, risk_score: riskScore, severity, monitored_workspaces: workspaceIds.size });
  } catch (error) {
    console.error("security-heartbeat error", error);
    return json(req, { error: "Security monitor unavailable" }, 500);
  }
});
