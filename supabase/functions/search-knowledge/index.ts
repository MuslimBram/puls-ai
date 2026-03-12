import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");
    const userId = userData.user.id;

    const { query, topic_filter, source_type, limit = 20 } = await req.json();
    if (!query) throw new Error("Query is required");

    // Text search using ilike on content and topic_tags
    const searchTerms = query.toLowerCase().split(/\s+/).filter((t: string) => t.length > 2);
    
    let dbQuery = supabase
      .from("knowledge_chunks")
      .select("*, knowledge_sources!inner(source_name, source_type, source_url)")
      .eq("user_id", userId)
      .limit(Math.min(limit, 50));

    if (source_type) {
      dbQuery = dbQuery.eq("knowledge_sources.source_type", source_type);
    }

    if (topic_filter) {
      dbQuery = dbQuery.contains("topic_tags", [topic_filter]);
    }

    // Search by content using OR of ilike patterns
    if (searchTerms.length > 0) {
      const orConditions = searchTerms.map((term: string) => `content.ilike.%${term}%`).join(",");
      dbQuery = dbQuery.or(orConditions);
    }

    const { data: chunks, error: searchError } = await dbQuery
      .order("created_at", { ascending: false });

    if (searchError) throw searchError;

    return new Response(JSON.stringify({
      success: true,
      results: chunks || [],
      count: chunks?.length || 0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("search-knowledge error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
