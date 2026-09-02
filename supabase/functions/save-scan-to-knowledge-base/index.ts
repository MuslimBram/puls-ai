import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      getServiceKey() ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");

    const actorId = userData.user.id;
    const { business_id, scan_history_id } = await req.json();
    if (!business_id || !scan_history_id) {
      throw new Error("business_id and scan_history_id are required");
    }

    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", actorId)
      .in("role", ["admin", "super_admin"])
      .limit(1);
    if (roleError) throw roleError;
    if (!roleRows?.length) throw new Error("Forbidden");

    const { data: business, error: businessError } = await supabase
      .from("business_profiles")
      .select("id,workspace_id,business_name")
      .eq("id", business_id)
      .single();
    if (businessError) throw businessError;
    if (!business) throw new Error("Business not found");

    const { data: scan, error: scanError } = await supabase
      .from("business_scan_history")
      .select("id,status")
      .eq("id", scan_history_id)
      .eq("business_id", business_id)
      .eq("workspace_id", business.workspace_id)
      .single();
    if (scanError) throw scanError;
    if (scan.status !== "completed") {
      throw new Error("Only completed scans expose canonical business knowledge");
    }

    const { data: source, error: sourceError } = await supabase
      .from("business_knowledge_sources")
      .select("id")
      .eq("workspace_id", business.workspace_id)
      .eq("business_id", business_id)
      .eq("source_type", "website")
      .eq("provider", "business-scan")
      .limit(1)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) throw new Error("Canonical business knowledge source is not available for this scan");

    const { data: items, error: itemsError } = await supabase
      .from("business_knowledge_items")
      .select("id")
      .eq("workspace_id", business.workspace_id)
      .eq("business_id", business_id)
      .eq("scan_history_id", scan_history_id)
      .eq("is_current", true)
      .limit(500);
    if (itemsError) throw itemsError;

    const canonicalItems = items?.length ?? 0;
    if (canonicalItems === 0) {
      throw new Error("No canonical security-approved knowledge exists for this scan");
    }

    // Legacy knowledge_sources/knowledge_chunks writes are intentionally gone.
    // Canonical business_knowledge_* is synchronized during scan completion.
    return new Response(JSON.stringify({
      success: true,
      canonical: true,
      source_id: source.id,
      source_name: `${business.business_name} — Canonical Website Knowledge`,
      canonical_items: canonicalItems,
      chunks_created: 0,
    }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("save-scan-to-knowledge-base error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
