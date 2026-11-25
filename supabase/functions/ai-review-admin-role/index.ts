import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getServiceKey } from "./_shared/admin-client.ts";

const cors = { "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = auth.slice(7).trim();
  const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, getServiceKey(), { auth: { persistSession: false } });
  const { data: { user } } = await adminClient.auth.getUser(token);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const { data: callerRoles } = await adminClient.from("user_roles").select("role").eq("user_id", user.id);
  if (!(callerRoles ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin")) return json({ error: "Forbidden" }, 403);

  let body: { request_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.request_id) return json({ error: "request_id is required" }, 400);
  const { data: request } = await adminClient.from("admin_role_requests").select("id,target_user_id,requested_by,requested_role,status,created_at").eq("id", body.request_id).eq("status", "pending").maybeSingle();
  if (!request) return json({ error: "Pending admin request not found" }, 404);

  const { data: targetUser } = await adminClient.auth.admin.getUserById(request.target_user_id);
  const { data: requesterProfile } = await adminClient.from("profiles").select("full_name").eq("user_id", request.requested_by).maybeSingle();
  const { data: targetProfile } = await adminClient.from("profiles").select("full_name").eq("user_id", request.target_user_id).maybeSingle();
  const targetEmail = targetUser?.user?.email ?? "unknown";
  const targetName = targetProfile?.full_name ?? targetEmail;
  const requesterName = requesterProfile?.full_name ?? "Platform administrator";

  const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
  if (!internalSecret) return json({ error: "AI approval service is not configured" }, 503);
  const aiRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-router`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getServiceKey()}`, "x-internal-secret": internalSecret },
    body: JSON.stringify({
      messages: [{ role: "user", content: `Review this high-security request to grant the Pulse AI Admin role. Return ONLY JSON: {"approved":boolean,"risk_score":0-100,"reason":string,"checks":string[]}. Do not invent facts; if uncertain, approved=false. Target: ${targetName} <${targetEmail}>. Requester: ${requesterName}. Created: ${request.created_at}.` }],
      task_type: "complex_reasoning", max_tokens: 500, internal_system_task: true,
    }),
  });
  if (!aiRes.ok) return json({ error: "AI review failed to execute" }, 503);
  const aiData = await aiRes.json();
  const raw = String(aiData?.response ?? aiData?.content ?? "").trim();
  let parsed: any = {};
  try { const match = raw.match(/\{[\s\S]*\}/); if (match) parsed = JSON.parse(match[0]); } catch {}
  const approved = parsed.approved === true;
  const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 2000) : "AI could not establish sufficient confidence.";
  const riskScore = Math.max(0, Math.min(100, Number(parsed.risk_score ?? (approved ? 20 : 80))));
  const checks = Array.isArray(parsed.checks) ? parsed.checks.slice(0, 20) : [];
  const { error } = await adminClient.from("admin_role_requests").update({ ai_status: approved ? "approved" : "rejected", ai_reviewed_at: new Date().toISOString(), ai_reason: `${reason} | risk_score=${riskScore} | checks=${JSON.stringify(checks)}`, updated_at: new Date().toISOString() }).eq("id", request.id).eq("status", "pending");
  if (error) return json({ error: "Failed to persist AI review" }, 500);
  await adminClient.from("audit_logs").insert({ actor_id: user.id, action: "admin_role_ai_reviewed", target_type: "admin_role_request", target_id: request.id, metadata: { approved, risk_score: riskScore, checks } }).catch(() => {});
  return json({ approved, risk_score: riskScore, reason, checks, request_id: request.id });
});