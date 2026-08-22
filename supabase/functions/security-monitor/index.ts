// supabase/functions/security-monitor/index.ts
// ============================================================
// Security Monitor Enterprise — zbulimi i kërcënimeve në kohë reale
// Skanon: Mesazhe, Komente, Pagesa, Login-et, API, Webhooks
// Zbulon: 18 kategori kërcënimesh
// Vepron: Block automatik + Njoftim Admin + Audit Log
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { askAI } from "../_shared/ai-client.ts";
import {
  runVerifiedDeepScan,
  type Severity,
  type ThreatCategory,
  type ThreatResult,
  type VerifiedWorkspaceAIContext,
} from "./deep-scan.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

type ScanSource = "message" | "comment" | "payment" | "login" | "api" | "webhook" | "email" | "document" | "file_upload";

// ── PATTERNS STATIKE (pa DB call) ────────────────────────────
const STATIC_PATTERNS: Array<{
  name: string; category: ThreatCategory; regex: RegExp;
  severity: Severity; action: "flag"|"block"|"quarantine";
}> = [
  // SQL Injection
  { name:"SQL Union",      category:"sql_injection",    regex:/union\s+(?:all\s+)?select/i,             severity:"critical", action:"block" },
  { name:"SQL Drop",       category:"sql_injection",    regex:/(?:drop|truncate|delete)\s+(?:table|from)/i, severity:"critical", action:"block" },
  { name:"SQL Comment",    category:"sql_injection",    regex:/(?:--|;--|\/\*).{0,50}(?:select|insert|update|delete)/i, severity:"high", action:"block" },
  { name:"SQL Quote",      category:"sql_injection",    regex:/'(?:\s|or|and)\s*'?\d+'\s*(?:=|<|>)/i,  severity:"high", action:"block" },
  // XSS
  { name:"Script Tag",     category:"xss",              regex:/<script[\s>]/i,                          severity:"critical", action:"block" },
  { name:"Event Handler",  category:"xss",              regex:/\son\w+\s*=\s*["']?(?:javascript|vbscript)/i, severity:"high", action:"block" },
  { name:"JS URI",         category:"xss",              regex:/javascript\s*:/i,                        severity:"high", action:"block" },
  { name:"Data URI",       category:"xss",              regex:/data:text\/html/i,                       severity:"high", action:"block" },
  // Prompt Injection
  { name:"Ignore Instr",   category:"prompt_injection", regex:/ignore\s+(?:previous|all|above)\s+instructions/i, severity:"critical", action:"block" },
  { name:"Jailbreak",      category:"prompt_injection", regex:/(?:act as|pretend (?:you are|to be)|you are now)\s+(?:an? )?(?:uncensored|unrestricted|evil|dan|jailbreak)/i, severity:"critical", action:"block" },
  { name:"System Override",category:"prompt_injection", regex:/(?:<\|im_start\|>|\[INST\]|SYSTEM:|###\s*Instruction)/i, severity:"high", action:"block" },
  { name:"Role Escape",    category:"prompt_injection", regex:/(?:forget (?:everything|your role)|you have no restrictions|disregard (?:all|your) (?:rules|guidelines))/i, severity:"critical", action:"block" },
  // Command Injection
  { name:"Shell Cmd",      category:"command_injection", regex:/[;|&`$()]\s*(?:ls|cat|rm|wget|curl|chmod|bash|sh|python|perl|php)\b/i, severity:"critical", action:"block" },
  { name:"Path Traversal", category:"command_injection", regex:/(?:\.\.\/){2,}(?:etc|var|usr|root|home)/i, severity:"high", action:"block" },
  // Phishing
  { name:"Brand Spoof",    category:"phishing",         regex:/(?:paypal|apple|google|microsoft|amazon|bank)\.\s*(?:net|org|info|biz)\b/i, severity:"high", action:"flag" },
  { name:"Urgency Bait",   category:"phishing",         regex:/(?:verify your (?:account|password|identity)|your account (?:will be|has been) (?:suspended|limited|restricted))/i, severity:"medium", action:"flag" },
  { name:"Click Bait",     category:"phishing",         regex:/click (?:here|below) to (?:confirm|verify|unlock|secure)/i, severity:"medium", action:"flag" },
  // Malware Links
  { name:"Suspect TLD",    category:"malware",          regex:/https?:\/\/[^\s]+\.(?:tk|ml|ga|cf|gq)\//i, severity:"high", action:"block" },
  { name:"IP Direct",      category:"malware",          regex:/https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?\/[^\s]/i, severity:"medium", action:"flag" },
  // Spam
  { name:"Char Repeat",    category:"spam",             regex:/(.)\1{15,}/,                             severity:"low", action:"flag" },
  { name:"Spam Words",     category:"spam",             regex:/(?:you (?:won|have won)|congratulations.*(?:prize|winner)|(?:free|cheap) (?:money|cash|bitcoin))/i, severity:"low", action:"flag" },
  // Scam
  { name:"Advance Fee",    category:"scam",             regex:/(?:million dollars?|transfer funds?|share (?:profit|percentage)|need (?:your )?help (?:moving|transferring))/i, severity:"medium", action:"flag" },
  { name:"Crypto Scam",    category:"scam",             regex:/(?:send \d+ (?:btc|eth|usdt) (?:to|at)|double your (?:bitcoin|crypto)|guaranteed (?:profit|return))/i, severity:"high", action:"block" },
];

// ── KRIJO HASH PER DEDUP ──────────────────────────────────────
async function hashContent(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text.slice(0, 500));
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// ── SKANIM STATIK (i shpejtë, pa AI) ─────────────────────────
function staticScan(content: string): ThreatResult[] {
  const threats: ThreatResult[] = [];
  for (const p of STATIC_PATTERNS) {
    if (p.regex.test(content)) {
      const match = content.match(p.regex)?.[0] ?? "";
      threats.push({
        found: true,
        category: p.category,
        severity: p.severity,
        score: p.severity === "critical" ? 1.0 : p.severity === "high" ? 0.8 : p.severity === "medium" ? 0.6 : 0.3,
        matched: match.slice(0, 50),
        action: p.action,
        reason: `Pattern "${p.name}" u detektua`,
      });
    }
  }
  return threats;
}

// ── SKANIM I THELLË ME AI (vetëm me auth + workspace të verifikuar) ─────
async function resolveAuthorizedWorkspaceAIContext(
  supabase: ReturnType<typeof createClient>,
  authHeader: string | null,
  workspaceId: string | undefined,
): Promise<VerifiedWorkspaceAIContext | null> {
  if (!workspaceId) {
    return null;
  }
  if (!authHeader) {
    throw new Error("SECURITY_MONITOR_AI_UNAUTHORIZED");
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new Error("SECURITY_MONITOR_AI_UNAUTHORIZED");
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user?.id) {
    throw new Error("SECURITY_MONITOR_AI_UNAUTHORIZED");
  }

  const userId = userData.user.id;
  const [memberResult, ownerResult, adminResult] = await Promise.all([
    supabase.rpc("is_workspace_member", { _user_id: userId, _workspace_id: workspaceId }),
    supabase.rpc("is_workspace_owner", { _user_id: userId, _workspace_id: workspaceId }),
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);

  if (memberResult.error) throw memberResult.error;
  if (ownerResult.error) throw ownerResult.error;
  if (adminResult.error) throw adminResult.error;

  if (!memberResult.data && !ownerResult.data && !adminResult.data) {
    throw new Error("SECURITY_MONITOR_AI_FORBIDDEN_WORKSPACE");
  }

  return { workspaceId, authHeader, userId };
}

// ── DËRGIMI I NJOFTIMIT ───────────────────────────────────────
async function notifyAdmins(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string | null,
  incident: Record<string, unknown>
): Promise<void> {
  // Email te adminët
  const RESEND = Deno.env.get("RESEND_API_KEY");
  const ownerEmails = ["muslim.brami@gmail.com", "info@mso.re"];

  if (RESEND && incident.severity === "critical" || incident.severity === "high") {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "security@kohablerjeve.top",
        to: ownerEmails,
        subject: `🚨 ${incident.severity === "critical" ? "KRITIK" : "HIGH"}: ${incident.incident_type}`,
        html: `<div style="font-family:sans-serif">
          <h2 style="color:${incident.severity === "critical" ? "#dc2626" : "#d97706"}">
            🚨 Incident Sigurie ${incident.severity?.toString().toUpperCase()}
          </h2>
          <table>
            <tr><td><b>Kategoria:</b></td><td>${incident.category}</td></tr>
            <tr><td><b>Burimi:</b></td><td>${incident.source}</td></tr>
            <tr><td><b>Action taken:</b></td><td>${incident.action_taken}</td></tr>
            <tr><td><b>Arsyeja:</b></td><td>${incident.blocked_reason}</td></tr>
            <tr><td><b>IP:</b></td><td>${incident.ip_address ?? "N/A"}</td></tr>
          </table>
          <p><a href="https://kohablerjeve.top/security">Open Security Dashboard →</a></p>
        </div>`,
      }),
    }).catch(() => {});
  }

  // In-app notification
  await supabase.from("audit_logs").insert({
    action: "security_incident",
    target_type: "security",
    target_id: workspaceId,
    metadata: { ...incident, severity: incident.severity },
  }).catch(() => {});
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } }
  );

  let body: {
    content: string;
    source: ScanSource;
    source_id?: string;
    workspace_id?: string;
    user_id?: string;
    ip_address?: string;
    user_agent?: string;
    context?: string;
    // Pagesa
    payment_amount?: number;
    payment_method?: string;
    // Specifike per login
    failed_attempts?: number;
  };

  try { body = await req.json(); }
  catch { return json({ error: "Body i pavlefshëm" }, 400); }

  const { content, source, source_id, workspace_id, user_id, ip_address, user_agent } = body;
  const authHeader = req.headers.get("Authorization");
  if (!content || !source) return json({ error: "content dhe source janë të detyrueshme" }, 400);

  const startTime = Date.now();

  // ── 1. DEDUP CHECK ────────────────────────────────────────
  const contentHash = await hashContent(content);
  const { data: existing } = await supabase.from("content_scan_log")
    .select("id, threat_found, threats")
    .eq("content_hash", contentHash)
    .eq("source", source)
    .gte("created_at", new Date(Date.now() - 300_000).toISOString()) // 5 min cache
    .maybeSingle();

  if (existing) {
    return json({ cached: true, threat_found: existing.threat_found, threats: existing.threats });
  }

  // ── 2. SKANIM STATIK ─────────────────────────────────────
  const staticThreats = staticScan(content);

  // ── 3. SKANIM PER SOURCE SPECIFIK ────────────────────────

  // Brute Force Detection
  if (source === "login" && (body.failed_attempts ?? 0) >= 5) {
    staticThreats.push({
      found: true, category: "brute_force",
      severity: body.failed_attempts! >= 10 ? "critical" : "high",
      score: Math.min((body.failed_attempts! / 20), 1),
      matched: `${body.failed_attempts} tentativa dështuese`,
      action: body.failed_attempts! >= 10 ? "block" : "flag",
      reason: `${body.failed_attempts} tentativa login dështuese — Brute Force i mundshëm`,
    });
  }

  // Payment Fraud Detection
  if (source === "payment") {
    const amount = body.payment_amount ?? 0;
    if (amount > 0 && amount < 1.5) {
      staticThreats.push({
        found: true, category: "fraud",
        severity: "high", score: 0.8,
        matched: `Shumë: $${amount}`,
        action: "flag",
        reason: "Card testing i mundshëm — shumë shumë e vogël ($< 1.50)",
      });
    }
    if (amount > 9999) {
      staticThreats.push({
        found: true, category: "fraud",
        severity: "high", score: 0.75,
        matched: `Shumë: $${amount}`,
        action: "flag",
        reason: "Too large — requires manual review",
      });
    }
  }

  // API Abuse Detection
  if (source === "api" && ip_address) {
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_key: `api_${ip_address}`,
      p_limit: 100,
      p_window_seconds: 60,
    });
    if (!allowed) {
      staticThreats.push({
        found: true, category: "api_abuse",
        severity: "high", score: 0.85,
        matched: `IP: ${ip_address}`,
        action: "block",
        reason: "Rate limit tejkaluar: > 100 kërkesa/minutë nga i njëjti IP",
      });
    }
  }

  // ── 4. AI DEEP SCAN (vetëm nëse ka static threats ose content i dyshimtë) ────
  let aiThreat: ThreatResult | null = null;
  const needsDeepScan = staticThreats.length > 0 ||
    content.length > 500 ||
    /(?:help|urgent|transfer|account|verify|confirm|link)/i.test(content);

  if (needsDeepScan && workspace_id) {
    try {
      const aiContext = await resolveAuthorizedWorkspaceAIContext(supabase, authHeader, workspace_id);
      aiThreat = await runVerifiedDeepScan(
        content,
        `source: ${source}, workspace: ${workspace_id}`,
        aiContext,
        askAI,
      );
    } catch (err) {
      const code = err instanceof Error ? err.message : "SECURITY_MONITOR_AI_UNAUTHORIZED";
      if (code === "SECURITY_MONITOR_AI_UNAUTHORIZED") {
        return json({ error: "Unauthorized" }, 401);
      }
      if (code === "SECURITY_MONITOR_AI_FORBIDDEN_WORKSPACE") {
        return json({ error: "Forbidden" }, 403);
      }
      throw err;
    }
  }

  // ── 5. KOMBINO REZULTATET ─────────────────────────────────
  const allThreats = aiThreat ? [...staticThreats, aiThreat] : staticThreats;
  const threatFound = allThreats.length > 0;
  const highestSeverity: Severity = allThreats.reduce<Severity>((max, t) => {
    const order = { low: 0, medium: 1, high: 2, critical: 3 };
    return order[t.severity] > order[max] ? t.severity : max;
  }, "low");
  const highestScore = Math.max(...allThreats.map(t => t.score), 0);
  const topThreat = allThreats.find(t => t.score === highestScore);

  // ── 6. VENDOS VEPRIMIN ────────────────────────────────────
  const autoBlock = highestSeverity === "critical" ||
    (highestSeverity === "high" && highestScore >= 0.8);
  const actionTaken = autoBlock ? "blocked" : threatFound ? "flagged" : "allowed";

  // ── 7. LOG SCAN ───────────────────────────────────────────
  await supabase.from("content_scan_log").insert({
    workspace_id: workspace_id ?? null,
    source,
    source_id: source_id ?? null,
    content_hash: contentHash,
    threat_found: threatFound,
    threats: allThreats,
    highest_severity: threatFound ? highestSeverity : "clean",
    scan_duration_ms: Date.now() - startTime,
  }).catch(() => {});

  // ── 8. REGJISTRO INCIDENT (nëse ka kërcënim) ─────────────
  if (threatFound && topThreat) {
    const incident = {
      workspace_id: workspace_id ?? null,
      incident_type: topThreat.category,
      severity: highestSeverity,
      category: topThreat.category,
      source,
      source_id: source_id ?? null,
      detected_text: content.slice(0, 200),
      matched_pattern: topThreat.matched,
      threat_score: highestScore,
      action_taken: actionTaken,
      auto_blocked: autoBlock,
      blocked_reason: topThreat.reason,
      ip_address: ip_address ?? null,
      user_agent: user_agent ?? null,
      user_id: user_id ?? null,
    };

    await supabase.from("security_incidents").insert(incident).catch(() => {});

    // ── 9. NJOFTIME ADMIN ─────────────────────────────────
    if (highestSeverity === "critical" || highestSeverity === "high") {
      await notifyAdmins(supabase, workspace_id ?? null, incident);
    }

    // ── 10. BLLOKO CONTENENTIN ────────────────────────────
    if (autoBlock) {
      await supabase.from("blocked_content").insert({
        workspace_id: workspace_id ?? null,
        source,
        source_id: source_id ?? null,
        content: content.slice(0, 500),
        reason: topThreat.reason,
        blocked_by: "ai_security",
      }).catch(() => {});
    }
  }

  // ── RESPONSE ──────────────────────────────────────────────
  return json({
    allowed: !autoBlock,
    threat_found: threatFound,
    action: actionTaken,
    highest_severity: threatFound ? highestSeverity : "clean",
    threat_score: highestScore,
    threats: allThreats.map(t => ({
      category: t.category,
      severity: t.severity,
      reason: t.reason,
      action: t.action,
    })),
    scan_duration_ms: Date.now() - startTime,
    // Shpjegim njerëzor pse u bllokua
    block_explanation: autoBlock ? topThreat?.reason : null,
    requires_review: threatFound && !autoBlock,
  });
});
