import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const allowedOrigins = new Set(["https://pulse-bos.com", "https://www.pulse-bos.com"]);
const cors = (req: Request) => ({ "Access-Control-Allow-Origin": allowedOrigins.has(req.headers.get("origin") || "") ? req.headers.get("origin")! : "https://pulse-bos.com", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin", "Content-Type": "application/json" });
const serviceKey = () => { const keys = Deno.env.get("SUPABASE_SECRET_KEYS"); if (keys) { try { const parsed = JSON.parse(keys); if (parsed.default) return parsed.default; } catch {} } return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; };
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors(req) });
const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
const ruleScore = (s: Record<string, boolean>) => Math.min(100, (s.ip_changed ? 35 : 0) + (s.user_agent_changed ? 20 : 0) + (s.multiple_ips_15m ? 25 : 0) + (s.high_event_rate ? 30 : 0));
const severity = (n: number) => n >= 80 ? "critical" : n >= 60 ? "high" : n >= 35 ? "medium" : "low";
async function aiReview(signals: Record<string, boolean>, rule: number) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { score: rule, reason: "Rule-based security analysis; AI provider not configured." };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 180, system: "You are a security anomaly reviewer. Evaluate only the supplied boolean access signals. Do not infer identity, intent, criminality, or legality. Return strict JSON {score:0-100,reason:string}. The score is a review priority, not an authorization decision.", messages: [{ role: "user", content: JSON.stringify({ signals, rule_score: rule }) }] }) });
    if (!r.ok) return { score: rule, reason: "AI review unavailable; rule-based score retained." };
    const data = await r.json(); const text = data?.content?.[0]?.text || ""; const parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); const aiScore = Math.max(0, Math.min(100, Number(parsed.score) || 0));
    return { score: Math.max(rule, aiScore), reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : "AI anomaly review completed." };
  } catch { return { score: rule, reason: "AI review failed safely; rule-based score retained." }; }
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  try {
    const auth = req.headers.get("authorization"); if (!auth?.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!; const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } }); const admin = createClient(url, serviceKey());
    const { data: { user }, error } = await userClient.auth.getUser(); if (error || !user) return json(req, { error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({})); const sessionId = typeof body?.session_id === "string" ? body.session_id.slice(0, 128) : "unknown"; const ip = clientIp(req); const ua = (req.headers.get("user-agent") || "unknown").slice(0, 512);
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString(); const { data: recent } = await admin.from("security_access_events").select("ip_address,user_agent,created_at").eq("user_id", user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(200);
    const ips = new Set((recent || []).map(r => String(r.ip_address || "")).filter(Boolean)); const prevIp = recent?.[0]?.ip_address ? String(recent[0].ip_address) : null; const prevUa = recent?.[0]?.user_agent ? String(recent[0].user_agent) : null; const fiveMin = (recent || []).filter(r => Date.now() - new Date(r.created_at).getTime() < 300000).length;
    const signals = { ip_changed: !!(prevIp && ip && prevIp !== ip), user_agent_changed: !!(prevUa && prevUa !== ua), multiple_ips_15m: ips.size + (ip && !ips.has(ip) ? 1 : 0) > 1, high_event_rate: fiveMin >= 20 };
    const rule = ruleScore(signals); const ai = rule >= 35 ? await aiReview(signals, rule) : { score: rule, reason: "No anomaly threshold reached; AI review not invoked." }; const riskScore = ai.score; const sev = severity(riskScore);
    const { data: memberships } = await admin.from("workspace_members").select("workspace_id").eq("user_id", user.id); const { data: owned } = await admin.from("workspaces").select("id").eq("owner_id", user.id); const workspaceIds = new Set<string>([...(memberships || []).map(m => m.workspace_id), ...(owned || []).map(w => w.id)]);
    await admin.from("security_access_events").insert({ user_id: user.id, event_type: "authenticated_presence", ip_address: ip, user_agent: ua, risk_score: riskScore, risk_signals: { ...signals, ai_review: ai.reason } });
    for (const workspaceId of workspaceIds) await admin.from("security_presence").upsert({ user_id: user.id, workspace_id: workspaceId, session_id: sessionId, ip_address: ip, user_agent: ua, last_seen_at: new Date().toISOString(), risk_score: riskScore });
    if (riskScore >= 35) {
      const alertType = signals.high_event_rate ? "high_event_rate" : signals.ip_changed ? "ip_change" : "authentication_anomaly"; const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: existing } = await admin.from("security_alerts").select("id").eq("user_id", user.id).eq("alert_type", alertType).eq("status", "open").gte("created_at", cutoff).limit(1);
      if (!existing?.length) {
        const base = { user_id: user.id, severity: sev, alert_type: alertType, title: "Suspicious authentication activity detected", summary: "AI-assisted security analysis detected an unusual access pattern. This is a risk signal for human review, not a legal determination.", signals: { ...signals, rule_score: rule, ai_score: ai.score, ai_reason: ai.reason, ip, session_id: sessionId, detected_at: new Date().toISOString() } };
        await admin.from("security_alerts").insert({ ...base, workspace_id: null }); for (const workspaceId of workspaceIds) await admin.from("security_alerts").insert({ ...base, workspace_id: workspaceId });
      }
    }
    return json(req, { ok: true, risk_score: riskScore, severity: sev, monitored_workspaces: workspaceIds.size });
  } catch (e) { console.error("security-heartbeat error", e); return json(req, { error: "Security monitor unavailable" }, 500); }
});
