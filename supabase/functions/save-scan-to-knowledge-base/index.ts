import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type JsonRecord = Record<string, unknown>;

type ScanRow = {
  id: string;
  scanned_url: string;
  status: string;
  pages_scanned: number | null;
  summary_json: JsonRecord | null;
  products_found: Array<{ title?: string; description?: string; pricing_signal?: string }> | null;
  services_found: Array<{ title?: string; description?: string }> | null;
  contact_methods: Array<{ type?: string; value?: string }> | null;
  social_links: Record<string, string[]> | null;
  pricing_signals: Array<{ signal?: string } | string> | null;
  tone_of_voice: string | null;
  suggested_keywords: string[] | null;
  cta_signals: Array<{ cta?: string } | string> | null;
  competitor_hints: Array<{ name?: string; url?: string }> | null;
  completed_at: string | null;
  created_at: string;
};

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function stringifySummary(summary: JsonRecord | null | undefined) {
  if (!summary || typeof summary !== "object") return "";
  return Object.entries(summary)
    .filter(([key, value]) => key !== "automation" && value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n");
}

function buildKnowledgeChunks(business: any, scan: ScanRow) {
  const chunks: Array<{ title: string; content: string; topicTags: string[] }> = [];
  const summaryText = stringifySummary(scan.summary_json);

  const baseTags = unique([
    "business-scan",
    business.business_name,
    business.industry,
    scan.tone_of_voice,
    ...(scan.suggested_keywords || []),
  ]);

  const addChunk = (title: string, lines: Array<string | null | undefined>, extraTags: string[] = []) => {
    const content = lines.filter(Boolean).join("\n").trim();
    if (!content) return;
    chunks.push({
      title,
      content,
      topicTags: unique([...baseTags, ...extraTags]),
    });
  };

  addChunk(
    "Business scan overview",
    [
      `Business: ${business.business_name}`,
      business.industry ? `Industry: ${business.industry}` : null,
      business.target_audience ? `Target audience: ${business.target_audience}` : null,
      business.main_services ? `Main services: ${business.main_services}` : null,
      business.short_description ? `Description: ${business.short_description}` : null,
      `Scanned URL: ${scan.scanned_url}`,
      scan.tone_of_voice ? `Detected tone of voice: ${scan.tone_of_voice}` : null,
      summaryText ? `Summary:\n${summaryText}` : null,
    ],
    ["overview", "summary"]
  );

  addChunk(
    "Products and services",
    [
      ...(scan.products_found || []).map((product, index) =>
        `Product ${index + 1}: ${product.title || "Untitled"}${product.description ? ` — ${product.description}` : ""}${product.pricing_signal ? ` (pricing: ${product.pricing_signal})` : ""}`
      ),
      ...(scan.services_found || []).map((service, index) =>
        `Service ${index + 1}: ${service.title || "Untitled"}${service.description ? ` — ${service.description}` : ""}`
      ),
    ],
    ["products", "services"]
  );

  addChunk(
    "Contact and conversion signals",
    [
      ...(scan.contact_methods || []).map((contact, index) =>
        `Contact ${index + 1}: ${contact.type || "method"} — ${contact.value || ""}`
      ),
      ...(scan.pricing_signals || []).map((signal, index) =>
        `Pricing signal ${index + 1}: ${typeof signal === "string" ? signal : signal.signal || ""}`
      ),
      ...(scan.cta_signals || []).map((cta, index) =>
        `CTA ${index + 1}: ${typeof cta === "string" ? cta : cta.cta || ""}`
      ),
    ],
    ["contact", "pricing", "cta"]
  );

  addChunk(
    "Audience and market intelligence",
    [
      scan.suggested_keywords?.length ? `Suggested keywords: ${scan.suggested_keywords.join(", ")}` : null,
      ...(scan.competitor_hints || []).map((competitor, index) =>
        `Competitor ${index + 1}: ${competitor.name || "Unknown"}${competitor.url ? ` — ${competitor.url}` : ""}`
      ),
      ...(Object.entries(scan.social_links || {}) || []).map(
        ([platform, urls]) => `${platform}: ${urls.join(", ")}`
      ),
    ],
    ["keywords", "competitors", "social"]
  );

  return chunks;
}

async function updateScanAutomationSummary(supabase: ReturnType<typeof createClient>, scanHistoryId: string, patch: JsonRecord) {
  const { data: currentScan, error: readError } = await supabase
    .from("business_scan_history")
    .select("summary_json")
    .eq("id", scanHistoryId)
    .maybeSingle();

  if (readError) throw readError;

  const currentSummary = currentScan?.summary_json && typeof currentScan.summary_json === "object"
    ? { ...(currentScan.summary_json as JsonRecord) }
    : {};
  const currentAutomation = currentSummary.automation && typeof currentSummary.automation === "object"
    ? { ...(currentSummary.automation as JsonRecord) }
    : {};

  const nextSummary = {
    ...currentSummary,
    automation: {
      ...currentAutomation,
      ...patch,
    },
  };

  const { error: updateError } = await supabase
    .from("business_scan_history")
    .update({ summary_json: nextSummary } as any)
    .eq("id", scanHistoryId);

  if (updateError) throw updateError;
}

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
    if (!roleRows || roleRows.length === 0) throw new Error("Forbidden");

    const { data: business, error: businessError } = await supabase
      .from("business_profiles")
      .select("id, user_id, workspace_id, business_name, industry, ai_tone, short_description, target_audience, main_services")
      .eq("id", business_id)
      .single();

    if (businessError) throw businessError;
    if (!business?.user_id) throw new Error("Business owner not found");

    const { data: scan, error: scanError } = await supabase
      .from("business_scan_history")
      .select("id, scanned_url, status, pages_scanned, summary_json, products_found, services_found, contact_methods, social_links, pricing_signals, tone_of_voice, suggested_keywords, cta_signals, competitor_hints, completed_at, created_at")
      .eq("id", scan_history_id)
      .eq("business_id", business_id)
      .single();

    if (scanError) throw scanError;
    if (scan.status !== "completed") throw new Error("Only completed scans can be saved to the Knowledge Base");

    const chunks = buildKnowledgeChunks(business, scan as ScanRow);
    if (chunks.length === 0) throw new Error("No structured scan content was available to save");

    const sourceName = `${business.business_name} — Website Scan Insights`;
    const metadata = {
      origin: "business_scan",
      business_id,
      scan_history_id,
      scanned_url: scan.scanned_url,
      saved_by_admin_id: actorId,
      saved_at: new Date().toISOString(),
      pages_crawled: scan.pages_scanned || 0,
      total_chunks: chunks.length,
      topics: unique(chunks.flatMap((chunk) => chunk.topicTags)).slice(0, 20),
    };

    const { data: existingSource, error: existingSourceError } = await supabase
      .from("knowledge_sources")
      .select("id")
      .eq("user_id", business.user_id)
      .eq("business_id", business_id)
      .eq("source_name", sourceName)
      .eq("source_url", scan.scanned_url)
      .maybeSingle();

    if (existingSourceError) throw existingSourceError;

    let sourceId = existingSource?.id as string | undefined;

    if (sourceId) {
      const { error: updateSourceError } = await supabase
        .from("knowledge_sources")
        .update({
          workspace_id: business.workspace_id,
          business_id,
          source_type: "website",
          status: "active",
          is_enabled: true,
          last_scanned_at: new Date().toISOString(),
          metadata,
        })
        .eq("id", sourceId);
      if (updateSourceError) throw updateSourceError;

      const { error: deleteChunksError } = await supabase
        .from("knowledge_chunks")
        .delete()
        .eq("source_id", sourceId);
      if (deleteChunksError) throw deleteChunksError;
    } else {
      const { data: createdSource, error: createSourceError } = await supabase
        .from("knowledge_sources")
        .insert({
          user_id: business.user_id,
          workspace_id: business.workspace_id,
          business_id,
          source_type: "website",
          source_name: sourceName,
          source_url: scan.scanned_url,
          status: "active",
          is_enabled: true,
          last_scanned_at: new Date().toISOString(),
          metadata,
        })
        .select("id")
        .single();

      if (createSourceError) throw createSourceError;
      sourceId = createdSource.id;
    }

    const chunkRows = chunks.map((chunk, index) => ({
      user_id: business.user_id,
      workspace_id: business.workspace_id,
      business_id,
      source_id: sourceId!,
      content: chunk.content,
      summary: chunk.content.slice(0, 200),
      topic_tags: chunk.topicTags,
      content_type: "business_scan",
      page_url: scan.scanned_url,
      page_title: chunk.title,
      chunk_index: index,
      word_count: chunk.content.split(/\s+/).filter(Boolean).length,
    }));

    const { error: chunksInsertError } = await supabase.from("knowledge_chunks").insert(chunkRows);
    if (chunksInsertError) throw chunksInsertError;

    await updateScanAutomationSummary(supabase, scan_history_id, {
      status: "completed",
      knowledge_sync: "completed",
      completed_at: new Date().toISOString(),
      knowledge_source_id: sourceId,
      knowledge_source_name: sourceName,
      knowledge_chunks_created: chunkRows.length,
      error: null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        source_id: sourceId,
        source_name: sourceName,
        chunks_created: chunkRows.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("save-scan-to-knowledge-base error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
