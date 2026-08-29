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
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");
    const userId = userData.user.id;

    const { query, topic_filter, source_type, business_id, limit = 20 } = await req.json();
    if (typeof query !== "string" || !query.trim()) throw new Error("Query is required");
    if (typeof business_id !== "string" || !business_id) throw new Error("business_id is required");

    // service_role bypasses RLS, so caller-controlled business_id must be resolved
    // to a real workspace and the authenticated principal must belong to it first.
    const { data: business, error: businessError } = await supabase
      .from("business_profiles")
      .select("id, workspace_id")
      .eq("id", business_id)
      .maybeSingle();
    if (businessError || !business?.workspace_id) throw new Error("Business not found");

    const workspaceId = business.workspace_id as string;
    const now = new Date().toISOString();
    const [{ data: ownedWorkspace }, { data: membership }, { data: assignment }] = await Promise.all([
      supabase.from("workspaces").select("id").eq("id", workspaceId).eq("owner_id", userId).maybeSingle(),
      supabase.from("workspace_members").select("workspace_id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
      supabase.from("workspace_access_assignments")
        .select("workspace_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .limit(1)
        .maybeSingle(),
    ]);

    if (!ownedWorkspace && !membership && !assignment) throw new Error("Forbidden");

    // Keep PostgREST filter syntax out of the caller-controlled search expression.
    const searchTerms = query
      .toLowerCase()
      .split(/\s+/)
      .map((term: string) => term.replace(/[^\p{L}\p{N}_-]+/gu, ""))
      .filter((term: string) => term.length > 2)
      .slice(0, 8)
      .map((term: string) => term.slice(0, 64));

    const safeLimit = Number.isFinite(Number(limit))
      ? Math.min(Math.max(Math.trunc(Number(limit)), 1), 50)
      : 20;

    let dbQuery = supabase
      .from("knowledge_chunks")
      .select("*, knowledge_sources!inner(source_name, source_type, source_url, business_id, workspace_id)")
      .eq("workspace_id", workspaceId)
      .eq("business_id", business_id)
      .eq("knowledge_sources.workspace_id", workspaceId)
      .eq("knowledge_sources.business_id", business_id)
      .limit(safeLimit);

    if (typeof source_type === "string" && source_type) {
      dbQuery = dbQuery.eq("knowledge_sources.source_type", source_type.slice(0, 64));
    }

    if (typeof topic_filter === "string" && topic_filter) {
      dbQuery = dbQuery.contains("topic_tags", [topic_filter.slice(0, 128)]);
    }

    if (searchTerms.length > 0) {
      const orConditions = searchTerms.map((term: string) => `content.ilike.%${term}%`).join(",");
      dbQuery = dbQuery.or(orConditions);
    }

    const { data: chunks, error: searchError } = await dbQuery.order("created_at", { ascending: false });
    if (searchError) throw searchError;

    return new Response(JSON.stringify({
      success: true,
      results: chunks || [],
      count: chunks?.length || 0,
    }), { headers: { ...getCors(req), "Content-Type": "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Forbidden" ? 403 : message === "Not authenticated" || message === "No authorization header" ? 401 : 400;
    console.error("search-knowledge error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
