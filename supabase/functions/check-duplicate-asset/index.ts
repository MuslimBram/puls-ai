import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { asset_type, asset_identifier, business_name, freelancer_user_id, business_workspace_id, relation_type } = body;

    const results: Record<string, unknown> = {};

    // 1. Check asset duplicate
    if (asset_type && asset_identifier) {
      const { data: assetCheck } = await supabase.rpc("check_asset_duplicate", {
        _asset_type: asset_type,
        _asset_identifier: asset_identifier.trim().toLowerCase(),
      });
      results.asset_check = assetCheck;
    }

    // 2. Check business name duplicate
    if (business_name) {
      const { data: nameCheck } = await supabase.rpc("check_asset_duplicate", {
        _asset_type: "business_name",
        _asset_identifier: business_name.trim().toLowerCase(),
      });
      results.business_name_check = nameCheck;
    }

    // 3. Check freelancer relation eligibility (referral vs management exclusivity)
    if (freelancer_user_id && business_workspace_id && relation_type) {
      const { data: relationCheck } = await supabase.rpc("check_freelancer_relation_eligibility", {
        _freelancer_id: freelancer_user_id,
        _business_workspace_id: business_workspace_id,
        _requested_type: relation_type,
      });
      results.relation_check = relationCheck;
    }

    // 4. AI analysis for suspicious patterns
    const suspiciousSignals: string[] = [];

    if (asset_identifier) {
      // Check for slight variations of existing assets (typosquatting)
      const { data: similarAssets } = await supabase
        .from("registered_assets")
        .select("asset_identifier, asset_type, workspace_id")
        .eq("is_active", true)
        .eq("asset_type", asset_type || "website")
        .limit(100);

      if (similarAssets && similarAssets.length > 0) {
        const normalizedInput = asset_identifier.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const existing of similarAssets) {
          const normalizedExisting = existing.asset_identifier.toLowerCase().replace(/[^a-z0-9]/g, "");
          // Simple Levenshtein-like similarity check
          if (normalizedInput !== normalizedExisting && isSimilar(normalizedInput, normalizedExisting)) {
            suspiciousSignals.push(
              `Identifikues i ngjashëm me "${existing.asset_identifier}" (tashmë i regjistruar)`
            );
          }
        }
      }
    }

    if (business_name) {
      const { data: similarNames } = await supabase
        .from("registered_assets")
        .select("asset_identifier")
        .eq("is_active", true)
        .eq("asset_type", "business_name")
        .limit(100);

      if (similarNames) {
        const normalizedInput = business_name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const existing of similarNames) {
          const normalizedExisting = existing.asset_identifier.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (normalizedInput !== normalizedExisting && isSimilar(normalizedInput, normalizedExisting)) {
            suspiciousSignals.push(
              `Emër biznesi i ngjashëm me "${existing.asset_identifier}" (tashmë i regjistruar)`
            );
          }
        }
      }
    }

    results.suspicious_signals = suspiciousSignals;
    results.is_suspicious = suspiciousSignals.length > 0;

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Simple string similarity check (Levenshtein distance <= 2)
function isSimilar(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 2) return false;
  let diff = 0;
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    if (a[i] !== b[i]) diff++;
    if (diff > 2) return false;
  }
  return diff > 0 && diff <= 2;
}
