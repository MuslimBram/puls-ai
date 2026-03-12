import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");
    const userId = userData.user.id;

    const { action, competitor_id, competitor_data } = await req.json();

    if (action === "scan_competitor") {
      if (!competitor_id) throw new Error("competitor_id required");
      if (!FIRECRAWL_API_KEY) throw new Error("Firecrawl connector not configured");

      // Get competitor
      const { data: competitor, error: compErr } = await supabase
        .from("competitors")
        .select("*")
        .eq("id", competitor_id)
        .eq("user_id", userId)
        .single();
      if (compErr || !competitor) throw new Error("Competitor not found");

      const scrapedPages: any[] = [];

      // Scrape website
      if (competitor.website_url) {
        const urls = [competitor.website_url];
        // Try common pages
        const base = competitor.website_url.replace(/\/$/, "");
        for (const path of ["/about", "/services", "/pricing", "/blog"]) {
          urls.push(base + path);
        }

        for (const url of urls) {
          try {
            const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
            });
            if (scrapeRes.ok) {
              const data = await scrapeRes.json();
              const md = data?.data?.markdown || data?.markdown || "";
              if (md.length > 50) {
                scrapedPages.push({
                  url,
                  content: md.slice(0, 3000),
                  title: data?.data?.metadata?.title || url,
                });
              }
            }
          } catch { /* skip failed pages */ }
        }
      }

      if (scrapedPages.length === 0) {
        return new Response(JSON.stringify({ error: "Could not scrape any pages. Check the URL." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Store scans
      const scanRows = scrapedPages.map((p) => ({
        competitor_id,
        user_id: userId,
        workspace_id: competitor.workspace_id,
        scan_type: "website",
        source_url: p.url,
        content_summary: p.content.slice(0, 500),
        raw_data: { title: p.title, content_length: p.content.length },
      }));
      await supabase.from("competitor_scans").insert(scanRows);

      // AI analysis
      const combinedContent = scrapedPages.map((p) => `## ${p.title}\n${p.content}`).join("\n\n---\n\n");

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `You are a competitive intelligence analyst. Analyze competitor content and provide strategic insights. Return structured analysis via the provided tool.`,
            },
            {
              role: "user",
              content: `Analyze this competitor "${competitor.name}" based on their website content:\n\n${combinedContent.slice(0, 8000)}`,
            },
          ],
          tools: [{
            type: "function",
            function: {
              name: "competitor_analysis",
              description: "Return competitor analysis",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "2-3 sentence overview" },
                  positioning: { type: "string", description: "How they position themselves" },
                  content_themes: {
                    type: "array",
                    items: { type: "object", properties: { theme: { type: "string" }, description: { type: "string" } }, required: ["theme", "description"] },
                  },
                  engagement_style: { type: "string" },
                  opportunities: {
                    type: "array",
                    items: { type: "object", properties: { opportunity: { type: "string" }, rationale: { type: "string" } }, required: ["opportunity", "rationale"] },
                  },
                  trending_keywords: { type: "array", items: { type: "string" } },
                },
                required: ["summary", "positioning", "content_themes", "engagement_style", "opportunities", "trending_keywords"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "competitor_analysis" } },
        }),
      });

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`AI error: ${status}`);
      }

      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No analysis generated");

      const analysis = JSON.parse(toolCall.function.arguments);

      // Update competitor with AI analysis
      await supabase
        .from("competitors")
        .update({
          ai_summary: analysis.summary,
          ai_positioning: analysis.positioning,
          ai_content_themes: analysis.content_themes,
          ai_engagement_style: analysis.engagement_style,
          ai_opportunities: analysis.opportunities,
          last_scanned_at: new Date().toISOString(),
        })
        .eq("id", competitor_id);

      // Store trending keywords as market trends
      if (analysis.trending_keywords?.length) {
        for (const kw of analysis.trending_keywords.slice(0, 10)) {
          const { data: existing } = await supabase
            .from("market_trends")
            .select("id, frequency")
            .eq("user_id", userId)
            .eq("trend_value", kw)
            .maybeSingle();

          if (existing) {
            await supabase.from("market_trends").update({
              frequency: (existing.frequency || 0) + 1,
              last_seen_at: new Date().toISOString(),
            }).eq("id", existing.id);
          } else {
            await supabase.from("market_trends").insert({
              user_id: userId,
              workspace_id: competitor.workspace_id,
              trend_type: "keyword",
              trend_value: kw,
            });
          }
        }
      }

      return new Response(JSON.stringify({ success: true, analysis, pages_scanned: scrapedPages.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-competitor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
