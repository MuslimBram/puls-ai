import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });
const RELATION_TYPES = new Set(["referral", "management"]);

function duplicateSummary(value: unknown): { is_duplicate: boolean; message?: string } {
  const duplicate = Boolean(
    value && typeof value === "object" &&
      (value as Record<string, unknown>).is_duplicate === true,
  );
  return duplicate
    ? {
      is_duplicate: true,
      message: "This value is already registered. Contact support if you believe this is incorrect.",
    }
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

    const token = authHeader.slice("Bearer ".length);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const assetType = typeof body.asset_type === "string" ? body.asset_type.trim() : "";
    const assetIdentifier = typeof body.asset_identifier === "string" ? body.asset_identifier.trim() : "";
    const businessName = typeof body.business_name === "string" ? body.business_name.trim() : "";
    const businessWorkspaceId = typeof body.business_workspace_id === "string"
      ? body.business_workspace_id.trim()
      : "";
    const relationType = typeof body.relation_type === "string" ? body.relation_type.trim() : "";

    const results: Record<string, unknown> = {};

    // Global duplicate checks are intentionally performed server-side because RLS
    // must not reveal which tenant owns a matching asset. Only a generic boolean is returned.
    if (assetType && assetIdentifier) {
      const { data: assetCheck, error } = await supabase.rpc("check_asset_duplicate", {
        _asset_type: assetType,
        _asset_identifier: assetIdentifier.toLowerCase(),
      });
      if (error) throw error;
      results.asset_check = duplicateSummary(assetCheck);
    }

    if (businessName) {
      const { data: nameCheck, error } = await supabase.rpc("check_asset_duplicate", {
        _asset_type: "business_name",
        _asset_identifier: businessName.toLowerCase(),
      });
      if (error) throw error;
      results.business_name_check = duplicateSummary(nameCheck);
    }

    // The freelancer subject is always derived from the authenticated JWT. A caller
    // cannot probe another user's referral/management relationship by supplying an ID.
    if (businessWorkspaceId && relationType) {
      if (!RELATION_TYPES.has(relationType)) {
        return new Response(JSON.stringify({ error: "Invalid relation_type" }), {
          status: 400,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }
      const { data: relationCheck, error } = await supabase.rpc("check_freelancer_relation_eligibility", {
        _freelancer_id: user.id,
        _business_workspace_id: businessWorkspaceId,
        _requested_type: relationType,
      });
      if (error) throw error;
      results.relation_check = relationCheck;
    }

    const suspiciousSignals: string[] = [];

    if (assetIdentifier) {
      const { data: similarAssets, error } = await supabase
        .from("registered_assets")
        .select("asset_identifier")
        .eq("is_active", true)
        .eq("asset_type", assetType || "website")
        .limit(100);
      if (error) throw error;

      if (similarAssets?.length) {
        const normalizedInput = assetIdentifier.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const existing of similarAssets) {
          const normalizedExisting = existing.asset_identifier.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (normalizedInput !== normalizedExisting && isSimilar(normalizedInput, normalizedExisting)) {
            suspiciousSignals.push("A similar asset is already registered.");
            break;
          }
        }
      }
    }

    if (businessName) {
      const { data: similarNames, error } = await supabase
        .from("registered_assets")
        .select("asset_identifier")
        .eq("is_active", true)
        .eq("asset_type", "business_name")
        .limit(100);
      if (error) throw error;

      if (similarNames?.length) {
        const normalizedInput = businessName.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const existing of similarNames) {
          const normalizedExisting = existing.asset_identifier.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (normalizedInput !== normalizedExisting && isSimilar(normalizedInput, normalizedExisting)) {
            suspiciousSignals.push("A similar business name is already registered.");
            break;
          }
        }
      }
    }

    results.suspicious_signals = suspiciousSignals;
    results.is_suspicious = suspiciousSignals.length > 0;

    return new Response(JSON.stringify(results), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal duplicate check error" }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});

// Simple string similarity check (Levenshtein-like distance <= 2)
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
