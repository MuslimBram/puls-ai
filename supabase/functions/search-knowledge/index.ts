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
    if (!query) throw new Error("Query is required");
    if (!business_id) throw new Error("business_id is required");

    const searchTerms = query.toLowerCase().split(/\s+/).filter((t: string) => t.length > 2);

    let dbQuery = supabase
      .from("knowledge_chunks")
      .select("*, knowledge_sources!inner(source_name, source_type, source_url, business_id)")
      .eq("user_id", userId)
      .eq("business_id", business_id)
      .eq("knowledge_sources.business_id", business_id)
      .limit(Math.min(limit, 50));

    if (source_type) {
      dbQuery = dbQuery.eq("knowledge_sources.source_type", source_type);
    }

    if (topic_filter) {
      dbQuery = dbQuery.contains("topic_tags", [topic_filter]);
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
    console.error("search-knowledge error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
