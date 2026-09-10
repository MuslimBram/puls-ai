import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createAdminClient } from "../_shared/admin-client.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";

const admin = createAdminClient();
const cors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: true });
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const text = (v: unknown, max: number) => typeof v === "string" ? v.slice(0, max) : "";

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = req.headers.get("x-real-ip")?.trim();
  const candidate = forwarded || real;
  return candidate && /^[0-9a-fA-F:.]+$/.test(candidate) ? candidate : null;
}

function assessRisk(input: { eventType: string; action: string; pageUrl: string; metadata: Record<string, unknown> }) {
  let score = 0;
  const reasons: string[] = [];
  const haystack = `${input.eventType} ${input.action} ${input.pageUrl}`.toLowerCase();
  if (/(sql|union\s+select|<script|javascript:|onerror=|drop\s+table|../)/i.test(haystack)) { score += .85; reasons.push("malicious-input-pattern"); }
  if (/(admin|login|auth|token|secret|password)/i.test(haystack)) { score += .15; reasons.push("sensitive-route"); }
  if (input.action === "violation") { score += .55; reasons.push("reported-violation"); }
  const burst = Number(input.metadata.event_count_60s ?? 0);
  if (Number.isFinite(burst) && burst > 60) { score += .35; reasons.push("event-burst"); }
  score = Math.min(1, score);
  const level = score >= .9 ? "critical" : score >= .7 ? "high" : score >= .4 ? "medium" : "low";
  return { score, level, reasons };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceId = text(body.workspace_id, 80);
    const visitorIdentifier = text(body.visitor_identifier, 160);
    const eventType = text(body.event_type, 80) || "page_view";
    const pageUrl = text(body.page_url, 2000);
    const action = text(body.action, 120);
    const source = text(body.source, 200);
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata as Record<string, unknown> : {};
    if (!workspaceId || !visitorIdentifier) return json(req, { error: "workspace_id and visitor_identifier are required" }, 400);

    const ip = getClientIp(req);
    if (!ip) return json(req, { error: "Client IP unavailable" }, 400);

    const { data: existingBlock } = await admin.rpc("visitor_security_check_ip", { _workspace_id: workspaceId, _ip: ip });
    if (Array.isArray(existingBlock) && existingBlock.length) {
      return json(req, { blocked: true, block_level: existingBlock[0].block_level, message: "Aktiviteti po verifikohet nga Pulse AI Security." }, 403);
    }

    const country = text(req.headers.get("cf-ipcountry"), 8).toUpperCase() || null;
    const region = text(req.headers.get("x-vercel-ip-country-region"), 32) || null;
    const userAgent = text(req.headers.get("user-agent"), 1000);
    const deviceType = /mobile|android|iphone|ipad/i.test(userAgent) ? "mobile" : "desktop";
    const browser = /edg/i.test(userAgent) ? "Edge" : /chrome/i.test(userAgent) ? "Chrome" : /firefox/i.test(userAgent) ? "Firefox" : /safari/i.test(userAgent) ? "Safari" : "Other";
    const risk = assessRisk({ eventType, action, pageUrl, metadata });
    const violation = risk.score >= .7 || action === "violation";

    let sessionId: string;
    const { data: existingSession } = await admin.from("visitor_security_sessions")
      .select("id").eq("workspace_id", workspaceId).eq("visitor_identifier", visitorIdentifier).eq("ip_address", ip)
      .order("last_seen_at", { ascending: false }).limit(1).maybeSingle();
    if (existingSession?.id) {
      sessionId = existingSession.id;
      await admin.from("visitor_security_sessions").update({ ip_address: ip, country_code: country, region, device_type: deviceType, browser, user_agent: userAgent, source, referrer: text(body.referrer, 2000), last_seen_at: new Date().toISOString(), risk_score: risk.score, risk_level: risk.level, status: violation ? "verification" : "active", updated_at: new Date().toISOString() }).eq("id", sessionId);
    } else {
      const { data: created, error } = await admin.from("visitor_security_sessions").insert({ workspace_id: workspaceId, visitor_identifier: visitorIdentifier, ip_address: ip, country_code: country, region, device_type: deviceType, browser, user_agent: userAgent, source, referrer: text(body.referrer, 2000), risk_score: risk.score, risk_level: risk.level, status: violation ? "verification" : "active" }).select("id").single();
      if (error) throw error;
      sessionId = created.id;
    }

    const { data: event, error: eventError } = await admin.from("visitor_security_events").insert({
      workspace_id: workspaceId, session_id: sessionId, event_type: eventType, page_url: pageUrl || null, action: action || null, source: source || null,
      risk_score: risk.score, risk_level: risk.level, violation, violation_reason: risk.reasons.join(",") || null,
      moderation_state: violation ? "verification" : "approved", metadata,
    }).select("id").single();
    if (eventError) throw eventError;

    if (violation) {
      const { data: enforcement, error: enforcementError } = await admin.rpc("visitor_security_register_violation", {
        _workspace_id: workspaceId, _session_id: sessionId, _ip: ip, _visitor_identifier: visitorIdentifier,
        _reason: risk.reasons.join(",") || "high-risk activity", _risk_score: risk.score,
      });
      if (enforcementError) throw enforcementError;
      return json(req, { blocked: true, verification: true, message: "Aktiviteti po verifikohet nga Pulse AI Security.", risk_score: risk.score, risk_level: risk.level, enforcement, event_id: event.id }, 403);
    }

    return json(req, { blocked: false, risk_score: risk.score, risk_level: risk.level, session_id: sessionId, event_id: event.id });
  } catch (error) {
    console.error("[visitor-security-ingest]", error instanceof Error ? error.message : "unknown");
    return json(req, { error: "Security event could not be processed" }, 500);
  }
});
