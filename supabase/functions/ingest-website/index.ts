import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function chunkText(text: string, maxChunkSize = 1500): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const p of paragraphs) {
    if ((current + "\n\n" + p).length > maxChunkSize && current) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = current ? current + "\n\n" + p : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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

    const { url, source_id, crawl_depth = 5, force_rescan = false, business_id } = await req.json();
    if (!url) throw new Error("URL is required");

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;

    if (!business_id) throw new Error("business_id is required");
    if (source_id && !force_rescan) {
      const { data: existingSource } = await supabase
        .from("knowledge_sources")
        .select("last_scanned_at, status")
        .eq("id", source_id)
        .single();

      if (existingSource?.last_scanned_at && existingSource.status === "active") {
        const lastScan = new Date(existingSource.last_scanned_at).getTime();
        const hoursSinceLastScan = (Date.now() - lastScan) / (1000 * 60 * 60);
        
        if (hoursSinceLastScan < 24) {
          // Return cached data
          const { data: cachedChunks } = await supabase
            .from("knowledge_chunks")
            .select("id")
            .eq("source_id", source_id);

          const { data: sourceData } = await supabase
            .from("knowledge_sources")
            .select("metadata")
            .eq("id", source_id)
            .single();

          const meta = sourceData?.metadata as any;
          return new Response(JSON.stringify({
            success: true,
            cached: true,
            source_id: source_id,
            pages_crawled: meta?.pages_crawled || 0,
            chunks_created: cachedChunks?.length || 0,
            topics: meta?.topics || [],
            message: `Using cached scan from ${Math.round(hoursSinceLastScan)}h ago. Use force_rescan=true to refresh.`,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    // Create or update source
    let sourceId = source_id;
    if (!sourceId) {
      // Check if URL already exists for this user
      const { data: existingSrc } = await supabase
        .from("knowledge_sources")
        .select("id, last_scanned_at, status")
        .eq("user_id", userId)
        .eq("source_url", formattedUrl)
        .maybeSingle();

      if (existingSrc && !force_rescan) {
        const lastScan = existingSrc.last_scanned_at ? new Date(existingSrc.last_scanned_at).getTime() : 0;
        const hoursSinceLastScan = (Date.now() - lastScan) / (1000 * 60 * 60);

        if (hoursSinceLastScan < 24 && existingSrc.status === "active") {
          const { data: cachedChunks } = await supabase
            .from("knowledge_chunks")
            .select("id")
            .eq("source_id", existingSrc.id);

          const { data: sourceData } = await supabase
            .from("knowledge_sources")
            .select("metadata")
            .eq("id", existingSrc.id)
            .single();

          const meta = sourceData?.metadata as any;
          return new Response(JSON.stringify({
            success: true,
            cached: true,
            source_id: existingSrc.id,
            pages_crawled: meta?.pages_crawled || 0,
            chunks_created: cachedChunks?.length || 0,
            topics: meta?.topics || [],
            message: `This URL was already scanned ${Math.round(hoursSinceLastScan)}h ago. Reusing cached data.`,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        sourceId = existingSrc.id;
      }

      if (!sourceId) {
        const { data: src, error: srcErr } = await supabase.from("knowledge_sources").insert({
          user_id: userId,
          source_type: "website",
          source_name: new URL(formattedUrl).hostname,
          source_url: formattedUrl,
          status: "scanning",
        }).select().single();
        if (srcErr) throw srcErr;
        sourceId = src.id;
      }
    }

    await supabase.from("knowledge_sources")
      .update({ status: "scanning", last_scanned_at: new Date().toISOString(), business_id, workspace_id: business.workspace_id })
      .eq("id", sourceId);

    // Crawl website with Firecrawl
    console.log("Crawling:", formattedUrl, "depth:", crawl_depth);
    const crawlRes = await fetch("https://api.firecrawl.dev/v1/crawl", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        limit: Math.min(crawl_depth, 20),
        scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
      }),
    });

    const crawlData = await crawlRes.json();
    if (!crawlRes.ok) {
      await supabase.from("knowledge_sources").update({ status: "error", metadata: { error: crawlData.error } }).eq("id", sourceId);
      throw new Error(crawlData.error || "Crawl failed");
    }

    // Firecrawl crawl is async - poll for results
    const crawlId = crawlData.id;
    let pages: any[] = [];
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`https://api.firecrawl.dev/v1/crawl/${crawlId}`, {
        headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}` },
      });
      const statusData = await statusRes.json();
      
      if (statusData.status === "completed") {
        pages = statusData.data || [];
        break;
      } else if (statusData.status === "failed") {
        throw new Error("Crawl failed");
      }
      attempts++;
    }

    if (pages.length === 0) {
      // Fallback to single scrape
      const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: formattedUrl, formats: ["markdown"], onlyMainContent: true }),
      });
      const scrapeData = await scrapeRes.json();
      if (scrapeRes.ok) {
        pages = [scrapeData.data || scrapeData];
      }
    }

    // Delete old chunks for this source (incremental update)
    await supabase.from("knowledge_chunks").delete().eq("source_id", sourceId);

    // Process each page into chunks
    let totalChunks = 0;
    const allTopics: string[] = [];

    for (const page of pages) {
      const markdown = page.markdown || "";
      const pageTitle = page.metadata?.title || "";
      const pageUrl = page.metadata?.sourceURL || formattedUrl;

      if (!markdown || markdown.length < 50) continue;

      const chunks = chunkText(markdown);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const wordCount = chunk.split(/\s+/).length;

        // Use AI to extract topic tags for meaningful chunks
        let topicTags: string[] = [];
        if (wordCount > 20 && i < 5) {
          try {
            const tagRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-lite",
                messages: [
                  { role: "system", content: "Extract 2-5 topic tags from this content. Return only a JSON array of lowercase strings." },
                  { role: "user", content: chunk.slice(0, 2000) },
                ],
                tools: [{
                  type: "function",
                  function: {
                    name: "extract_tags",
                    description: "Extract topic tags",
                    parameters: {
                      type: "object",
                      properties: { tags: { type: "array", items: { type: "string" } } },
                      required: ["tags"],
                      additionalProperties: false,
                    },
                  },
                }],
                tool_choice: { type: "function", function: { name: "extract_tags" } },
              }),
            });

            if (tagRes.ok) {
              const tagData = await tagRes.json();
              const tc = tagData.choices?.[0]?.message?.tool_calls?.[0];
              if (tc?.function?.arguments) {
                const parsed = JSON.parse(tc.function.arguments);
                topicTags = parsed.tags || [];
                allTopics.push(...topicTags);
              }
            }
          } catch (e) {
            console.error("Tag extraction failed:", e);
          }
        }

        await supabase.from("knowledge_chunks").insert({
          user_id: userId,
          workspace_id: business.workspace_id,
          business_id,
          source_id: sourceId,
          content: chunk,
          summary: chunk.slice(0, 200),
          topic_tags: topicTags,
          content_type: detectContentType(pageUrl, pageTitle),
          page_url: pageUrl,
          page_title: pageTitle,
          chunk_index: i,
          word_count: wordCount,
        });
        totalChunks++;
      }
    }

    // Update source status
    const uniqueTopics = [...new Set(allTopics)];
    await supabase.from("knowledge_sources").update({
      status: "active",
      last_scanned_at: new Date().toISOString(),
      metadata: {
        pages_crawled: pages.length,
        total_chunks: totalChunks,
        topics: uniqueTopics.slice(0, 20),
      },
    }).eq("id", sourceId);

    return new Response(JSON.stringify({
      success: true,
      source_id: sourceId,
      pages_crawled: pages.length,
      chunks_created: totalChunks,
      topics: uniqueTopics.slice(0, 20),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("ingest-website error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function detectContentType(url: string, title: string): string {
  const lower = (url + " " + title).toLowerCase();
  if (lower.includes("faq") || lower.includes("frequently")) return "faq";
  if (lower.includes("blog") || lower.includes("article") || lower.includes("post")) return "blog";
  if (lower.includes("about") || lower.includes("team") || lower.includes("story")) return "about";
  if (lower.includes("service") || lower.includes("solution")) return "services";
  if (lower.includes("product") || lower.includes("pricing") || lower.includes("plan")) return "products";
  if (lower.includes("contact") || lower.includes("support")) return "contact";
  return "general";
}