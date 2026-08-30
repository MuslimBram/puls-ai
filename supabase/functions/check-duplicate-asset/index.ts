import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

function sanitizedDuplicateResult(value: unknown): Record<string, unknown> {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const isDuplicate = row.is_duplicate === true;
  return isDuplicate
    ? { is_duplicate: true, message: "This asset is already registered." }
    : { is_duplicate: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCors(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = getServiceKey()!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { asset_type, asset_identifier, business_name, freelancer_user_id, business_workspace_id, relation_type } = body;
    const results: Record<string, unknown> = {};

    // 1. Duplicate checks run under the service boundary, but the API response
    // deliberately does not disclose the owning workspace or internal asset id.
    if (asset_type && asset_identifier) {
      const { data: assetCheck, error: assetError } = await supabase.rpc("check_asset_duplicate", {
        _asset_type: String(asset_type).slice(0, 80),
        _asset_identifier: String(asset_identifier).trim().toLowerCase().slice(0, 500),
      });
      if (assetError) throw assetError;
      results.asset_check = sanitizedDuplicateResult(assetCheck);
    }

    if (business_name) {
      const { data: nameCheck, error: nameError } = await supabase.rpc("check_asset_duplicate", {
        _asset_type: "business_name",
        _asset_identifier: String(business_name).trim().toLowerCase().slice(0, 500),
      });
      if (nameError) throw nameError;
      results.business_name_check = sanitizedDuplicateResult(nameCheck);
    }

    // 2. A normal caller may only ask about their own freelancer identity.
    // Platform admins may perform operational checks for another registered user.
    if (freelancer_user_id && business_workspace_id && relation_type) {
      const { data: callerRoles, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "super_admin"]);
      if (roleError) throw roleError;
      const isPlatformAdmin = (callerRoles ?? []).length > 0;
      if (String(freelancer_user_id) !== user.id && !isPlatformAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      const { data: relationCheck, error: relationError } = await supabase.rpc("check_freelancer_relation_eligibility", {
        _freelancer_id: freelancer_user_id,
        _business_workspace_id: business_workspace_id,
        _requested_type: relation_type,
      });
      if (relationError) throw relationError;
      results.relation_check = relationCheck;
    }

    // 3. Similarity detection remains server-side. Return only generic signals;
    // never disclose another tenant's registered identifier or workspace.
    const suspiciousSignals: string[] = [];

    if (asset_identifier) {
      const { data: similarAssets, error: similarAssetError } = await supabase
        .from("registered_assets")
        .select("asset_identifier")
        .eq("is_active", true)
        .eq("asset_type", asset_type || "website")
        .limit(100);
      if (similarAssetError) throw similarAssetError;

      const normalizedInput = String(asset_identifier).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      if ((similarAssets ?? []).some((existing) => {
        const normalizedExisting = String(existing.asset_identifier ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
        return normalizedInput !== normalizedExisting && isSimilar(normalizedInput, normalizedExisting);
      })) {
        suspiciousSignals.push("A similar registered asset already exists.");
      }
    }

    if (business_name) {
      const { data: similarNames, error: similarNameError } = await supabase
        .from("registered_assets")
        .select("asset_identifier")
        .eq("is_active", true)
        .eq("asset_type", "business_name")
        .limit(100);
      if (similarNameError) throw similarNameError;

      const normalizedInput = String(business_name).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      if ((similarNames ?? []).some((existing) => {
        const normalizedExisting = String(existing.asset_identifier ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
        return normalizedInput !== normalizedExisting && isSimilar(normalizedInput, normalizedExisting);
      })) {
        suspiciousSignals.push("A similar registered business name already exists.");
      }
    }

    results.suspicious_signals = suspiciousSignals;
    results.is_suspicious = suspiciousSignals.length > 0;

    return new Response(JSON.stringify(results), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[CHECK-DUPLICATE-ASSET] request failed", err instanceof Error ? err.message : "Unknown error");
    return new Response(JSON.stringify({ error: "Duplicate check failed" }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});

function isSimilar(a: string, b: string): boolean {
  if (!a || !b || Math.abs(a.length - b.length) > 2) return false;
  let diff = 0;
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    if (a[i] !== b[i]) diff++;
    if (diff > 2) return false;
  }
  return diff > 0 && diff <= 2;
}
