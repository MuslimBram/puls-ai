// supabase/functions/check-device-trust/index.ts
// ============================================================
// Thirret: PAS çdo login (nga auth hook ose frontend)
// Logjika:
//   1. Kontrollon nëse pajisja/IP është e besuar
//   2. AI vlerëson rrezikun
//   3. Vendos: ALLOW / PENDING_APPROVAL / BLOCK
//   4. Njofton admin-ët aktivë nëse PENDING ose BLOCK
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { askAI } from "../_shared/ai-client.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s, headers: { ...CORS, "Content-Type": "application/json" },
  });

// ── Gjenero fingerprint nga user-agent ───────────────────────
function buildFingerprint(userAgent: string, platform?: string): string {
  const str = `${userAgent}|${platform ?? ""}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

// ── Nxjerr info pajisje nga user-agent ───────────────────────
function parseDeviceInfo(ua: string): { name: string; type: string; browser: string; os: string } {
  const isMobile = /mobile|android|iphone|ipad/i.test(ua);
  const isTablet = /ipad|tablet/i.test(ua);
  const browser = ua.includes("Chrome") ? "Chrome"
    : ua.includes("Firefox") ? "Firefox"
    : ua.includes("Safari") ? "Safari"
    : ua.includes("Edge") ? "Edge"
    : "Browser i panjohur";
  const os = ua.includes("Windows") ? "Windows"
    : ua.includes("Mac") ? "macOS"
    : ua.includes("Linux") ? "Linux"
    : ua.includes("Android") ? "Android"
    : ua.includes("iPhone") || ua.includes("iPad") ? "iOS"
    : "OS i panjohur";
  const type = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";
  return { name: `${browser} / ${os}`, type, browser, os };
}

// ── AI vlerëson rrezikun ──────────────────────────────────────
async function assessRisk(context: {
  isKnownDevice: boolean;
  isKnownIP: boolean;
  ipCountry: string;
  lastCountry: string;
  hourOfDay: number;
  recentFailedLogins: number;
  accountAgeDays: number;
  isAdmin: boolean;
  deviceType: string;
}): Promise<{
  score: number;
  level: "low" | "medium" | "high" | "critical";
  factors: string[];
  recommendation: "approve" | "review" | "reject";
  reasoning: string;
}> {
  const factors: string[] = [];

  // Rregulla deterministe (të shpejta, pa AI)
  let baseScore = 0.1;

  if (!context.isKnownDevice) {
    baseScore += 0.35;
    factors.push("Pajisje e re e panjohur");
  }
  if (!context.isKnownIP) {
    baseScore += 0.20;
    factors.push("IP e re");
  }
  if (context.ipCountry !== context.lastCountry && context.lastCountry) {
    baseScore += 0.25;
    factors.push(`Vend i ri: ${context.ipCountry} (zakonisht: ${context.lastCountry})`);
  }
  if (context.recentFailedLogins >= 3) {
    baseScore += 0.30;
    factors.push(`${context.recentFailedLogins} tentativa të dështuara`);
  }
  if (context.isAdmin) {
    baseScore += 0.15; // admin login = risk më i lartë
    factors.push("Llogari me privilegje të larta (admin)");
  }
  if (context.hourOfDay < 6 || context.hourOfDay > 23) {
    baseScore += 0.10;
    factors.push(`Hyrje në orë jostandarde: ${context.hourOfDay}:xx`);
  }
  if (context.accountAgeDays < 3) {
    baseScore += 0.15;
    factors.push("Llogari shumë e re (< 3 ditë)");
  }

  baseScore = Math.min(1.0, baseScore);

  // Nëse score është e qartë, mos thirr AI (kursejm API calls)
  if (baseScore <= 0.15 && context.isKnownDevice && context.isKnownIP) {
    return {
      score: baseScore,
      level: "low",
      factors: factors.length > 0 ? factors : ["Pajisje dhe IP të njohura"],
      recommendation: "approve",
      reasoning: "Hyrje normale nga pajisje dhe IP e besuar.",
    };
  }

  if (baseScore >= 0.85) {
    return {
      score: baseScore,
      level: "critical",
      factors,
      recommendation: "reject",
      reasoning: "Shumë faktorë rreziku të kombinuar. Bllokuar automatikisht.",
    };
  }

  // Score mesatare → pyes AI
  try {
    const aiResp = await askAI(
      `Ti je sistemi i sigurisë për Pulse AI. Analize tentativën e hyrjes dhe kthe VETËM JSON.`,
      `Konteksti:
- Pajisje e njohur: ${context.isKnownDevice}
- IP e njohur: ${context.isKnownIP}
- Vendi: ${context.ipCountry} (zakonisht: ${context.lastCountry || "i panjohur"})
- Ora: ${context.hourOfDay}:00
- Tentativa të dështuara: ${context.recentFailedLogins}
- Admin: ${context.isAdmin}
- Score bazë: ${baseScore.toFixed(2)}
- Faktorë: ${factors.join(", ")}

Kthe JSON: {"score":0.0-1.0,"level":"low|medium|high|critical","recommendation":"approve|review|reject","reasoning":"arsyeja"}`,
      200
    );

    const parsed = JSON.parse(aiResp.replace(/```json|```/g, "").trim());
    return {
      score: Math.min(1.0, Math.max(0.0, parsed.score ?? baseScore)),
      level: parsed.level ?? (baseScore > 0.6 ? "high" : "medium"),
      factors,
      recommendation: parsed.recommendation ?? "review",
      reasoning: parsed.reasoning ?? "Vlerësim AI.",
    };
  } catch {
    // Fallback nëse AI dështon
    const level = baseScore >= 0.7 ? "high" : baseScore >= 0.4 ? "medium" : "low";
    return {
      score: baseScore,
      level,
      factors,
      recommendation: level === "high" ? "review" : "approve",
      reasoning: "Vlerësim bazuar në rregulla. AI jo e disponueshme.",
    };
  }
}

// ── Njofto admin-ët aktivë ────────────────────────────────────
async function notifyActiveAdmins(
  supabase: ReturnType<typeof createClient>,
  approvalRequest: {
    id: string;
    user_email: string;
    device_name: string;
    ip_address: string;
    country: string;
    risk_level: string;
    risk_factors: string[];
    ai_reasoning: string;
    action_token: string;
  }
): Promise<uuid[]> {
  type uuid = string;

  // Gjej admin-ët me sesion aktiv
  const { data: activeSessions } = await supabase
    .from("active_admin_sessions")
    .select("user_id")
    .gt("last_ping_at", new Date(Date.now() - 30 * 60_000).toISOString());

  const activeAdminIds = (activeSessions ?? []).map((s: { user_id: string }) => s.user_id);

  // Nëse nuk ka admin aktiv, njofto të gjithë admin-ët
  let adminIds: uuid[] = activeAdminIds;
  if (adminIds.length === 0) {
    const { data: allAdmins } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "super_admin"]);
    adminIds = (allAdmins ?? []).map((a: { user_id: string }) => a.user_id);
  }

  const dashboardUrl = Deno.env.get("DASHBOARD_URL") ?? "https://kohablerjeve.top";
  const approveUrl = `${dashboardUrl}/security/approve?token=${approvalRequest.action_token}&action=approve`;
  const rejectUrl = `${dashboardUrl}/security/approve?token=${approvalRequest.action_token}&action=reject`;

  const riskEmoji = {
    low: "🟢", medium: "🟡", high: "🔴", critical: "🚨"
  }[approvalRequest.risk_level] ?? "⚠️";

  const html = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#1e40af;padding:20px;text-align:center">
    <span style="font-size:28px">${riskEmoji}</span>
    <h1 style="color:#fff;font-size:18px;margin:8px 0 0">Hyrje nga Pajisje e Re</h1>
  </div>
  <div style="padding:24px">
    <p style="color:#374151;margin-bottom:16px">
      Përdoruesi <strong>${approvalRequest.user_email}</strong> po tenton të hyjë nga:
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr style="background:#f9fafb">
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:500;width:40%">Pajisja</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb">${approvalRequest.device_name}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:500">IP / Vendi</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb">${approvalRequest.ip_address} / ${approvalRequest.country || "i panjohur"}</td>
      </tr>
      <tr style="background:#f9fafb">
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:500">Rreziku</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:${approvalRequest.risk_level === "critical" ? "#dc2626" : approvalRequest.risk_level === "high" ? "#ea580c" : "#d97706"};font-weight:600">${approvalRequest.risk_level.toUpperCase()}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:500">Faktorët</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb">${approvalRequest.risk_factors.join(", ")}</td>
      </tr>
    </table>
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px;margin-bottom:20px">
      <strong>🤖 AI:</strong> ${approvalRequest.ai_reasoning}
    </div>
    <p style="color:#374151;font-size:13px;margin-bottom:16px">
      ⏰ Kjo kërkesë skadon pas <strong>2 orësh</strong>.
      Nëse nuk veproni, hyrja do <strong>bllokohet automatikisht</strong>.
    </p>
    <div style="display:flex;gap:12px;justify-content:center">
      <a href="${approveUrl}" style="background:#16a34a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block">✅ APROVO</a>
      <a href="${rejectUrl}" style="background:#dc2626;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block">❌ REFUZO</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:12px;text-align:center;font-size:12px;color:#9ca3af">
    Pulse AI Security — Ky email u dërgua automatikisht. Mos e ndaj me askënd.
  </div>
</div>`;

  for (const adminId of adminIds) {
    const { data: adminUser } = await supabase.auth.admin.getUserById(adminId);
    const adminEmail = adminUser?.user?.email;
    if (!adminEmail) continue;

    await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getServiceKey()}`,
        },
        body: JSON.stringify({
          to: adminEmail,
          subject: `${riskEmoji} Hyrje nga pajisje e re — ${approvalRequest.risk_level.toUpperCase()}`,
          html,
        }),
      }
    ).catch(() => {});
  }

  return adminIds;
}

// ── Handler kryesor ──────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  let body: {
    user_agent: string;
    ip_address?: string;
    platform?: string;
    session_id?: string;
  };
  try { body = await req.json(); }
  catch { return json({ error: "Body i pavlefshëm" }, 400); }

  const ip = body.ip_address
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const fingerprint = buildFingerprint(body.user_agent, body.platform);
  const deviceInfo = parseDeviceInfo(body.user_agent);
  const hour = new Date().getHours();

  // Kontrollo nëse pajisja është e besuar
  const { data: trustedDevice } = await supabase
    .from("trusted_devices")
    .select("*")
    .eq("user_id", user.id)
    .eq("device_fingerprint", fingerprint)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  const isKnownDevice = !!trustedDevice;
  const isKnownIP = isKnownDevice && (trustedDevice.trusted_ips ?? []).includes(ip);

  // Shiko tentativa të dështuara (15 min e fundit)
  const { count: failedCount } = await supabase
    .from("login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("outcome", "blocked")
    .gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString());

  // Kontrollo nëse user është admin
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "super_admin"]);
  const isAdmin = (roles ?? []).length > 0;

  // Llogarit moshën e llogarisë
  const accountAgeDays = Math.floor(
    (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  // AI Risk Assessment
  const risk = await assessRisk({
    isKnownDevice,
    isKnownIP,
    ipCountry: "AL", // do integrojmë MaxMind/ip-api
    lastCountry: trustedDevice?.last_country ?? "",
    hourOfDay: hour,
    recentFailedLogins: failedCount ?? 0,
    accountAgeDays,
    isAdmin,
    deviceType: deviceInfo.type,
  });

  // Vendim: ALLOW / PENDING / BLOCK
  let outcome: "allowed" | "pending_approval" | "blocked";
  if (risk.level === "low" && isKnownDevice) {
    outcome = "allowed";
  } else if (risk.level === "critical" || (risk.level === "high" && (failedCount ?? 0) >= 3)) {
    outcome = "blocked";
  } else {
    outcome = isKnownDevice && risk.level === "medium" ? "allowed" : "pending_approval";
  }

  // Ruaj login attempt
  const { data: attempt } = await supabase
    .from("login_attempts")
    .insert({
      user_id: user.id,
      email: user.email,
      device_fingerprint: fingerprint,
      device_name: deviceInfo.name,
      ip_address: ip,
      risk_score: risk.score,
      risk_level: risk.level,
      risk_factors: risk.factors,
      outcome,
      user_agent: body.user_agent,
      session_id: body.session_id ?? null,
    })
    .select("id")
    .single();

  // Nëse ALLOW → përditëso/krijo trusted device
  if (outcome === "allowed") {
    if (isKnownDevice) {
      // Shto IP nëse nuk është e njohur
      const updatedIPs = [...new Set([...(trustedDevice.trusted_ips ?? []), ip])];
      await supabase
        .from("trusted_devices")
        .update({
          last_seen_at: new Date().toISOString(),
          last_ip: ip,
          trusted_ips: updatedIPs.slice(-10), // max 10 IP per pajisje
        })
        .eq("id", trustedDevice.id);
    } else {
      // Pajisje e re por risk i ulët → shto automatikisht
      await supabase.from("trusted_devices").insert({
        user_id: user.id,
        device_fingerprint: fingerprint,
        device_name: deviceInfo.name,
        device_type: deviceInfo.type,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        trusted_ips: [ip],
        last_ip: ip,
        trust_level: "limited",
        approved_by: null,
        approved_at: new Date().toISOString(),
        approval_method: "ai_auto",
      }).catch(() => {});
    }

    return json({ outcome: "allowed", risk_level: risk.level });
  }

  // Nëse PENDING_APPROVAL → krijo kërkesë dhe njofto admin-ët
  if (outcome === "pending_approval") {
    const { data: approvalReq } = await supabase
      .from("device_approval_requests")
      .insert({
        login_attempt_id: attempt?.id,
        user_id: user.id,
        device_name: deviceInfo.name,
        ip_address: ip,
        country: "AL",
        risk_level: risk.level,
        risk_factors: risk.factors,
        ai_recommendation: risk.recommendation,
        ai_reasoning: risk.reasoning,
      })
      .select("action_token")
      .single();

    if (approvalReq) {
      const notifiedIds = await notifyActiveAdmins(supabase, {
        id: approvalReq.action_token,
        user_email: user.email ?? "",
        device_name: deviceInfo.name,
        ip_address: ip,
        country: "AL",
        risk_level: risk.level,
        risk_factors: risk.factors,
        ai_reasoning: risk.reasoning,
        action_token: approvalReq.action_token,
      });

      await supabase.from("login_attempts")
        .update({ admin_notified_at: new Date().toISOString(), admin_notified_ids: notifiedIds })
        .eq("id", attempt?.id);
    }

    return json({
      outcome: "pending_approval",
      risk_level: risk.level,
      message: "Hyrja juaj kërkon miratimin e administratorit. Do të njoftoheni me email.",
    }, 202);
  }

  // BLOCKED
  return json({
    outcome: "blocked",
    risk_level: risk.level,
    risk_factors: risk.factors,
    message: "Hyrja u bllokua për shkak të rrezikut të lartë. Kontaktoni administratorin.",
  }, 403);
});
