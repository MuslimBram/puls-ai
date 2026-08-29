import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

function generateCode(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1000000).padStart(6, "0");
}

async function sendEmailDirect(to: string, subject: string, htmlBody: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = getServiceKey()!;

  const callbackUrl = Deno.env.get("LOVABLE_EMAIL_CALLBACK_URL");
  if (callbackUrl) {
    try {
      const resp = await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({ to, subject, html: htmlBody }),
      });
      if (resp.ok) return true;
    } catch (e) {
      console.error("Lovable email callback failed:", e);
    }
  }

  try {
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { error } = await adminClient.functions.invoke("send-email", {
      body: { to, subject, body: htmlBody },
    });
    if (!error) return true;
    console.error("send-email function failed:", error);
  } catch (e) {
    console.error("send-email invocation failed:", e);
  }

  console.error("All email methods failed for:", to);
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: authUser }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const userId = authUser.id;
    const userEmail = authUser.email || "";
    const body = await req.json().catch(() => ({}));
    const { action, token, factor_id } = body as { action?: string; token?: string; factor_id?: string };
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getServiceKey()!
    );

    if (action === "enroll") {
      const { data: factorsData } = await supabaseClient.auth.mfa.listFactors();
      const existingTotp = factorsData?.totp?.[0];
      if (existingTotp && existingTotp.status === "verified") {
        return new Response(JSON.stringify({ error: "TOTP tashmë i konfiguruar" }), {
          status: 400,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      if (existingTotp && existingTotp.status === "unverified") {
        await supabaseClient.auth.mfa.unenroll({ factorId: existingTotp.id });
      }

      const { data: enrollData, error: enrollError } = await supabaseClient.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Pulse AI Authenticator",
      });

      if (enrollError) {
        return new Response(JSON.stringify({ error: enrollError.message }), {
          status: 500,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        factorId: enrollData.id,
        qrCode: enrollData.totp.qr_code,
        secret: enrollData.totp.secret,
        otpauthUrl: enrollData.totp.uri,
      }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (action === "verify_enroll") {
      if (!token || token.length !== 6) {
        return new Response(JSON.stringify({ error: "Kodi duhet të jetë 6 shifra" }), {
          status: 400,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      const { data: factorsData } = await supabaseClient.auth.mfa.listFactors();
      const totpFactor = factorsData?.totp?.[0];
      if (!totpFactor) {
        return new Response(JSON.stringify({ error: "Nuk ka faktor TOTP. Filloni regjistrimin." }), {
          status: 400,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      const { data: challengeData, error: challengeError } = await supabaseClient.auth.mfa.challenge({
        factorId: totpFactor.id,
      });
      if (challengeError) {
        return new Response(JSON.stringify({ error: "Gabim në krijimin e sfidës" }), {
          status: 500,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      const { error: verifyError } = await supabaseClient.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code: token,
      });
      if (verifyError) {
        return new Response(JSON.stringify({ error: "Kodi i gabuar. Provoni përsëri." }), {
          status: 400,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ verified: true, enrolled: true }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (action === "send_code") {
      const code = generateCode();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      await supabaseAdmin.from("login_otp_codes").delete().eq("user_id", userId);
      const { error: insertError } = await supabaseAdmin.from("login_otp_codes").insert({
        user_id: userId,
        code,
        expires_at: expiresAt,
      });
      if (insertError) throw insertError;

      const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:30px;">
          <h2 style="color:#333;margin-bottom:20px;">Kodi i Sigurisë</h2>
          <p style="color:#555;font-size:14px;">Kodi juaj 6-shifror për të hyrë në llogari:</p>
          <div style="background:#f0f4ff;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
            <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1a1a2e;font-family:monospace;">${code}</span>
          </div>
          <p style="color:#888;font-size:12px;">Ky kod skadon pas 5 minutash.</p>
        </div>
      `;

      const sent = await sendEmailDirect(userEmail, "Kodi juaj i sigurisë - Pulse AI", emailHtml);
      return new Response(JSON.stringify({
        sent,
        email: userEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
        ...(sent ? {} : { warning: "Email nuk u dërgua. Kontrolloni konfigurimin." }),
      }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (action === "verify_code" || action === "login_verify") {
      if (!token || token.length !== 6) {
        return new Response(JSON.stringify({ error: "Kodi duhet të jetë 6 shifra" }), {
          status: 400,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      const { data: otpRow } = await supabaseAdmin
        .from("login_otp_codes")
        .select("id")
        .eq("user_id", userId)
        .eq("code", token)
        .eq("used", false)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!otpRow) {
        return new Response(JSON.stringify({ error: "Kodi i gabuar ose ka skaduar. Provo përsëri." }), {
          status: 400,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("login_otp_codes").update({ used: true }).eq("id", otpRow.id);
      return new Response(JSON.stringify({ verified: true }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (action === "verify_totp" || action === "verify") {
      if (!token || token.length !== 6) {
        return new Response(JSON.stringify({ error: "Kodi duhet të jetë 6 shifra" }), {
          status: 400,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      const { data: factorsData } = await supabaseClient.auth.mfa.listFactors();
      const totpFactor = factorsData?.totp?.find((f) => f.status === "verified");
      if (!totpFactor) {
        return new Response(JSON.stringify({ error: "TOTP nuk është konfiguruar. Përfundo aktivizimin fillimisht.", not_enrolled: true }), {
          status: 400,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      const { data: challengeData, error: challengeError } = await supabaseClient.auth.mfa.challenge({
        factorId: totpFactor.id,
      });
      if (challengeError) {
        return new Response(JSON.stringify({ error: "Gabim në krijimin e sfidës TOTP" }), {
          status: 500,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      const { error: verifyError } = await supabaseClient.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code: token,
      });
      if (verifyError) {
        return new Response(JSON.stringify({ error: "Kodi i gabuar. Provoni përsëri." }), {
          status: 400,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ verified: true }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (action === "check_totp_status") {
      const { data: factorsData } = await supabaseClient.auth.mfa.listFactors();
      const totpFactor = factorsData?.totp?.find((f) => f.status === "verified");
      return new Response(JSON.stringify({ enrolled: !!totpFactor, verified: !!totpFactor }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (action === "disable" || action === "unenroll") {
      const factorId = factor_id || (await supabaseClient.auth.mfa.listFactors()).data?.totp?.find((f) => f.status === "verified")?.id;
      if (!factorId) {
        return new Response(JSON.stringify({ error: "TOTP nuk është konfiguruar" }), {
          status: 400,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      const { error: unenrollError } = await supabaseClient.auth.mfa.unenroll({ factorId });
      if (unenrollError) {
        return new Response(JSON.stringify({ error: unenrollError.message }), {
          status: 400,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("user_mfa_settings").update({ totp_enabled: false }).eq("user_id", userId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (action === "check") {
      return new Response(JSON.stringify({ requires_2fa: true }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (action === "status") {
      const { data: factorsData } = await supabaseClient.auth.mfa.listFactors();
      const totpFactor = factorsData?.totp?.find((f) => f.status === "verified");
      return new Response(JSON.stringify({
        enrolled: !!totpFactor,
        verified: !!totpFactor,
        enrolledAt: totpFactor ? authUser.created_at : null,
        totp_enrolled: !!totpFactor,
      }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("totp-manage error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
