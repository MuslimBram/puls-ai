// supabase/functions/approve-device-access/index.ts
// ============================================================
// Admin miraton ose refuzon hyrjen nga pajisje e re
// GET /approve-device-access?token=XXX&action=approve|reject
// (thirret nga butoni në email të admin-it)
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const DASHBOARD = Deno.env.get("DASHBOARD_URL") ?? "https://kohablerjeve.top";

serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action"); // 'approve' | 'reject'

  const redirect = (path: string) =>
    Response.redirect(`${DASHBOARD}${path}`, 302);

  if (!token || !["approve", "reject"].includes(action ?? "")) {
    return redirect("/security?error=invalid_request");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // Gjej kërkesën
  const { data: approvalReq, error } = await supabase
    .from("device_approval_requests")
    .select("*, login_attempts(*)")
    .eq("action_token", token)
    .single();

  if (error || !approvalReq) {
    return redirect("/security?error=request_not_found");
  }
  if (approvalReq.status !== "pending") {
    return redirect(`/security?info=already_${approvalReq.status}`);
  }
  if (new Date(approvalReq.expires_at) < new Date()) {
    await supabase.from("device_approval_requests")
      .update({ status: "expired" }).eq("id", approvalReq.id);
    await supabase.from("login_attempts")
      .update({ outcome: "expired" }).eq("id", approvalReq.login_attempt_id);
    return redirect("/security?error=request_expired");
  }

  // Verifiko që URL-a po thirret nga një admin i autentifikuar
  // (shto token autentifikimi te URL nëse dëshiron siguri shtesë)

  const isApprove = action === "approve";
  const now = new Date().toISOString();

  // Përditëso statusin e kërkesës
  await supabase.from("device_approval_requests").update({
    status: isApprove ? "approved" : "rejected",
    actioned_at: now,
  }).eq("id", approvalReq.id);

  // Përditëso login attempt
  await supabase.from("login_attempts").update({
    outcome: isApprove ? "approved" : "rejected",
    resolved_at: now,
  }).eq("id", approvalReq.login_attempt_id);

  if (isApprove) {
    // Shto pajisjen te trusted_devices
    const loginAttempt = approvalReq.login_attempts as Record<string, unknown>;
    await supabase.from("trusted_devices").upsert({
      user_id: approvalReq.user_id,
      device_fingerprint: loginAttempt?.device_fingerprint ?? "",
      device_name: approvalReq.device_name,
      trusted_ips: [approvalReq.ip_address],
      last_ip: approvalReq.ip_address,
      trust_level: "full",
      approved_at: now,
      approval_method: "admin_manual",
    }, { onConflict: "user_id,device_fingerprint" });
  }

  // Njofto user-in me email
  const { data: userData } = await supabase.auth.admin.getUserById(approvalReq.user_id);
  const userEmail = userData?.user?.email;

  if (userEmail) {
    const statusText = isApprove ? "APROVUAR ✅" : "REFUZUAR ❌";
    const msgColor = isApprove ? "#16a34a" : "#dc2626";
    const msgBody = isApprove
      ? `Hyrja juaj nga <strong>${approvalReq.device_name}</strong> (IP: ${approvalReq.ip_address}) u <strong style="color:#16a34a">APROVUA</strong> nga administratori. Tani mund të kyçeni.`
      : `Hyrja juaj nga <strong>${approvalReq.device_name}</strong> (IP: ${approvalReq.ip_address}) u <strong style="color:#dc2626">REFUZUA</strong> nga administratori. Nëse ju jeni, kontaktoni mbështetjen.`;

    await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          to: userEmail,
          subject: `Hyrja juaj: ${statusText} — Pulse AI`,
          html: `
<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
  <h2 style="color:${msgColor}">${statusText}</h2>
  <p style="color:#374151;margin:12px 0">${msgBody}</p>
  <a href="${DASHBOARD}" style="display:inline-block;margin-top:16px;background:#2563eb;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none">Hyr te Pulse AI</a>
  <p style="font-size:12px;color:#9ca3af;margin-top:16px">Nëse nuk jeni ju, ndryshoni fjalëkalimin menjëherë.</p>
</div>`,
        }),
      }
    ).catch(() => {});
  }

  return redirect(
    isApprove
      ? "/security?success=device_approved"
      : "/security?success=device_rejected"
  );
});
