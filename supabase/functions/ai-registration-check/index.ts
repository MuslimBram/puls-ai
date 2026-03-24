import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { full_name, email, account_type, company_name, referral_code } = await req.json();

    if (!email || !account_type) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Rule-based fraud signals
    const signals: string[] = [];
    let ruleScore = 0;

    // Check disposable email domains
    const disposableDomains = [
      "tempmail.com", "throwaway.email", "guerrillamail.com", "mailinator.com",
      "yopmail.com", "10minutemail.com", "trashmail.com", "fakeinbox.com",
    ];
    const emailDomain = email.split("@")[1]?.toLowerCase() || "";
    if (disposableDomains.includes(emailDomain)) {
      signals.push("Disposable email provider detected");
      ruleScore += 40;
    }

    // Check if email already exists in profiles
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existingProfile) {
      signals.push("Email already registered in system");
      ruleScore += 30;
    }

    // Name analysis
    if (full_name && full_name.length < 3) {
      signals.push("Very short name provided");
      ruleScore += 10;
    }
    if (full_name && /^(.)\1+$/.test(full_name.replace(/\s/g, ""))) {
      signals.push("Name consists of repeated characters");
      ruleScore += 25;
    }

    // Business with no company name
    if (account_type === "business" && !company_name) {
      signals.push("Business account with no company name");
      ruleScore += 5;
    }

    // AI analysis via Lovable AI
    let aiScore = 0;
    let aiReasons: string[] = [];
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (LOVABLE_API_KEY) {
      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              {
                role: "system",
                content: `You are a fraud detection analyst. Evaluate this registration attempt and return a JSON object with:
- risk_score (0-100, where 100 is definitely fraud)
- reasons (array of strings explaining risk factors)
- recommendation ("allow", "review", "block")

Consider: email pattern, name legitimacy, account type consistency, potential spam/bot patterns.`,
              },
              {
                role: "user",
                content: JSON.stringify({
                  full_name,
                  email,
                  account_type,
                  company_name: company_name || "not provided",
                  referral_code: referral_code || "none",
                  email_domain: emailDomain,
                }),
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "fraud_assessment",
                  description: "Return fraud risk assessment for registration",
                  parameters: {
                    type: "object",
                    properties: {
                      risk_score: { type: "number", description: "0-100 risk score" },
                      reasons: { type: "array", items: { type: "string" } },
                      recommendation: { type: "string", enum: ["allow", "review", "block"] },
                    },
                    required: ["risk_score", "reasons", "recommendation"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "fraud_assessment" } },
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            const parsed = JSON.parse(toolCall.function.arguments);
            aiScore = parsed.risk_score || 0;
            aiReasons = parsed.reasons || [];
          }
        }
      } catch (aiErr) {
        console.error("AI fraud check failed:", aiErr);
      }
    }

    // Combine scores (weighted average)
    const finalScore = Math.round(ruleScore * 0.4 + aiScore * 0.6);
    const allReasons = [...signals, ...aiReasons];
    const blocked = finalScore >= 80;

    // Log to audit
    await supabase.from("audit_logs").insert({
      actor_id: "00000000-0000-0000-0000-000000000000",
      action: "registration_fraud_check",
      target_type: "registration",
      metadata: {
        email,
        full_name,
        account_type,
        company_name,
        rule_score: ruleScore,
        ai_score: aiScore,
        final_score: finalScore,
        reasons: allReasons,
        blocked,
      },
    });

    // Notify admins & owners if high risk
    if (finalScore >= 50) {
      const { data: adminOwners } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "owner"]);

      if (adminOwners?.length) {
        await supabase.from("business_notifications").insert(
          adminOwners.map((u) => ({
            user_id: u.user_id,
            notification_type: "fraud_alert",
            category: "security",
            title: blocked ? "🚫 Registration blocked (fraud)" : "⚠️ Suspicious registration",
            message: `${full_name} (${email}) - ${account_type} - Risk: ${finalScore}/100. ${allReasons.slice(0, 3).join("; ")}`,
            action_url: "/admin",
            metadata: { email, account_type, risk_score: finalScore, reasons: allReasons },
          })),
        );
      }
    }

    return new Response(
      JSON.stringify({
        risk_score: finalScore,
        reasons: allReasons,
        blocked,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("Registration check error:", error);
    return new Response(
      JSON.stringify({ risk_score: 0, reasons: [], blocked: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});
