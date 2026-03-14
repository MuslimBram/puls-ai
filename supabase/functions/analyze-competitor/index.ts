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

    // This can be called by cron (no auth) or by user
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader && !authHeader.includes(Deno.env.get("SUPABASE_ANON_KEY") || "___")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabase.auth.getUser(token);
      userId = userData.user?.id || null;
    }

    const body = await req.json().catch(() => ({}));
    const { action, competitor_id, competitor_data } = body;

    // ===== SCHEDULED SCAN: scan all active competitors =====
    if (action === "scheduled_scan" || (!action && !competitor_id)) {
      console.log("Running scheduled competitor scan...");
      
      // Get all active competitors with website URLs
      const { data: competitors, error: compErr } = await supabase
        .from("competitors")
        .select("*")
        .eq("is_active", true)
        .not("website_url", "is", null);
      
      if (compErr) throw compErr;
      if (!competitors?.length) {
        return new Response(JSON.stringify({ message: "No active competitors to scan" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Filter by scan frequency
      const now = new Date();
      const toScan = competitors.filter((c: any) => {
        if (!c.last_scanned_at) return true;
        const lastScan = new Date(c.last_scanned_at);
        const hoursSince = (now.getTime() - lastScan.getTime()) / (1000 * 60 * 60);
        if (c.scan_frequency === "daily") return hoursSince >= 24;
        if (c.scan_frequency === "weekly") return hoursSince >= 168;
        return hoursSince >= 168; // default weekly
      });

      console.log(`Scanning ${toScan.length} of ${competitors.length} competitors`);

      let scanned = 0;
      let alertsCreated = 0;

      for (const comp of toScan.slice(0, 5)) { // Limit to 5 per run
        try {
          const result = await scanSingleCompetitor(
            supabase, comp, FIRECRAWL_API_KEY!, LOVABLE_API_KEY
          );
          scanned++;
          alertsCreated += result.alertsCreated;
        } catch (e) {
          console.error(`Failed to scan ${comp.name}:`, e);
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        scanned, 
        alerts_created: alertsCreated,
        total_active: competitors.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== MANUAL SCAN: single competitor =====
    if (action === "scan_competitor") {
      if (!competitor_id) throw new Error("competitor_id required");
      if (!FIRECRAWL_API_KEY) throw new Error("Firecrawl connector not configured");
      if (!userId) throw new Error("Not authenticated");

      const { data: competitor, error: compErr } = await supabase
        .from("competitors")
        .select("*")
        .eq("id", competitor_id)
        .eq("user_id", userId)
        .single();
      if (compErr || !competitor) throw new Error("Competitor not found");

      const result = await scanSingleCompetitor(
        supabase, competitor, FIRECRAWL_API_KEY, LOVABLE_API_KEY
      );

      return new Response(JSON.stringify({ 
        success: true, 
        analysis: result.analysis, 
        pages_scanned: result.pagesScanned,
        alerts_created: result.alertsCreated,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== AUTO-ANALYZE: generate insights from name/category without full scan =====
    if (action === "auto_analyze") {
      if (!competitor_id) throw new Error("competitor_id required");
      if (!userId) throw new Error("Not authenticated");

      const { data: competitor, error: compErr } = await supabase
        .from("competitors")
        .select("*")
        .eq("id", competitor_id)
        .eq("user_id", userId)
        .single();
      if (compErr || !competitor) throw new Error("Competitor not found");

      // Get user's business profile for context
      const { data: profile } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

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
              content: "You are a competitive intelligence analyst. Based on a competitor name, category, and optional website URL, generate preliminary strategic insights. Be specific and actionable.",
            },
            {
              role: "user",
              content: `Generate preliminary competitive insights for:
Competitor: ${competitor.name}
Category: ${competitor.category || "direct"}
Website: ${competitor.website_url || "unknown"}

My business context:
Industry: ${profile?.industry || "general"}
Services: ${profile?.main_services || "various"}
Target audience: ${profile?.target_audience || "general"}`,
            },
          ],
          tools: [{
            type: "function",
            function: {
              name: "competitor_insights",
              description: "Return preliminary competitor insights",
              parameters: {
                type: "object",
                properties: {
                  positioning_guess: { type: "string" },
                  target_audience_guess: { type: "string" },
                  content_focus_guess: { type: "string" },
                  pricing_signal_guess: { type: "string" },
                  marketing_strengths: { type: "array", items: { type: "string" } },
                  marketing_weaknesses: { type: "array", items: { type: "string" } },
                  opportunity_for_user: { type: "string" },
                  summary: { type: "string" },
                },
                required: ["positioning_guess", "target_audience_guess", "content_focus_guess", "pricing_signal_guess", "marketing_strengths", "marketing_weaknesses", "opportunity_for_user", "summary"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "competitor_insights" } },
        }),
      });

      if (!aiResponse.ok) throw new Error(`AI error: ${aiResponse.status}`);

      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No insights generated");

      const insights = JSON.parse(toolCall.function.arguments);

      // Update competitor with preliminary insights
      await supabase
        .from("competitors")
        .update({
          ai_summary: insights.summary,
          ai_positioning: insights.positioning_guess,
          ai_content_themes: [
            { theme: "Content Focus", description: insights.content_focus_guess },
            { theme: "Target Audience", description: insights.target_audience_guess },
          ],
          ai_engagement_style: insights.pricing_signal_guess,
          ai_opportunities: [
            { opportunity: insights.opportunity_for_user, rationale: "Based on preliminary AI analysis" },
            ...insights.marketing_weaknesses.slice(0, 2).map((w: string) => ({
              opportunity: `Exploit weakness: ${w}`,
              rationale: "Competitor vulnerability detected",
            })),
          ],
        })
        .eq("id", competitor.id);

      return new Response(JSON.stringify({ success: true, insights }), {
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

async function scanSingleCompetitor(
  supabase: any,
  competitor: any,
  firecrawlKey: string,
  lovableKey: string
) {
  const scrapedPages: any[] = [];

  // Scrape website
  if (competitor.website_url) {
    const urls = [competitor.website_url];
    const base = competitor.website_url.replace(/\/$/, "");
    for (const path of ["/about", "/services", "/pricing", "/blog", "/products"]) {
      urls.push(base + path);
    }

    for (const url of urls) {
      try {
        const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
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
    throw new Error("Could not scrape any pages. Check the URL.");
  }

  // Store scans
  const scanRows = scrapedPages.map((p) => ({
    competitor_id: competitor.id,
    user_id: competitor.user_id,
    workspace_id: competitor.workspace_id,
    scan_type: "website",
    source_url: p.url,
    content_summary: p.content.slice(0, 500),
    raw_data: { title: p.title, content_length: p.content.length },
  }));
  await supabase.from("competitor_scans").insert(scanRows);

  // AI analysis with enhanced prompts
  const combinedContent = scrapedPages.map((p) => `## ${p.title}\n${p.content}`).join("\n\n---\n\n");
  const previousData = competitor.previous_scan_data || {};

  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `You are a competitive intelligence analyst. Analyze competitor content and detect changes compared to previous scan data. Provide strategic insights including pricing changes, new promotions, posting frequency, and emerging trends. Return structured analysis via the provided tool.`,
        },
        {
          role: "user",
          content: `Analyze competitor "${competitor.name}" (${competitor.website_url}).

Previous analysis summary: ${previousData.summary || "No previous data"}
Previous pricing snapshot: ${JSON.stringify(previousData.pricing || {})}
Previous content themes: ${JSON.stringify(previousData.themes || [])}

Current website content:
${combinedContent.slice(0, 8000)}`,
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "competitor_analysis",
          description: "Return competitor analysis with change detection",
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
              pricing_info: {
                type: "object",
                properties: {
                  has_pricing: { type: "boolean" },
                  pricing_summary: { type: "string" },
                  price_points: { type: "array", items: { type: "string" } },
                },
                required: ["has_pricing", "pricing_summary"],
              },
              promotions_detected: {
                type: "array",
                items: { type: "object", properties: { promotion: { type: "string" }, urgency: { type: "string" } }, required: ["promotion"] },
              },
              changes_detected: {
                type: "array",
                items: { type: "object", properties: { change_type: { type: "string" }, description: { type: "string" }, severity: { type: "string", enum: ["low", "medium", "high"] } }, required: ["change_type", "description", "severity"] },
              },
              suggested_keywords: { type: "array", items: { type: "string" }, description: "Keywords you should target based on competitor gaps" },
              content_suggestions: { type: "array", items: { type: "string" }, description: "Content ideas to counter this competitor" },
            },
            required: ["summary", "positioning", "content_themes", "engagement_style", "opportunities", "trending_keywords", "pricing_info", "promotions_detected", "changes_detected", "suggested_keywords", "content_suggestions"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "competitor_analysis" } },
    }),
  });

  if (!aiResponse.ok) {
    const status = aiResponse.status;
    if (status === 429) throw new Error("Rate limit exceeded");
    if (status === 402) throw new Error("AI credits exhausted");
    throw new Error(`AI error: ${status}`);
  }

  const aiData = await aiResponse.json();
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("No analysis generated");

  const analysis = JSON.parse(toolCall.function.arguments);

  // Update competitor with AI analysis + store previous data for change detection
  await supabase
    .from("competitors")
    .update({
      ai_summary: analysis.summary,
      ai_positioning: analysis.positioning,
      ai_content_themes: analysis.content_themes,
      ai_engagement_style: analysis.engagement_style,
      ai_opportunities: analysis.opportunities,
      last_scanned_at: new Date().toISOString(),
      pricing_snapshot: analysis.pricing_info || {},
      previous_scan_data: {
        summary: analysis.summary,
        pricing: analysis.pricing_info,
        themes: analysis.content_themes?.map((t: any) => t.theme),
        scanned_at: new Date().toISOString(),
      },
    })
    .eq("id", competitor.id);

  // Create alerts for detected changes
  let alertsCreated = 0;
  
  if (analysis.changes_detected?.length) {
    for (const change of analysis.changes_detected) {
      await supabase.from("competitor_alerts").insert({
        user_id: competitor.user_id,
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
        alert_type: change.change_type,
        title: `${competitor.name}: ${change.change_type}`,
        description: change.description,
        severity: change.severity,
        metadata: { change },
      });
      alertsCreated++;
    }
  }

  // Create alerts for promotions
  if (analysis.promotions_detected?.length) {
    for (const promo of analysis.promotions_detected) {
      await supabase.from("competitor_alerts").insert({
        user_id: competitor.user_id,
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
        alert_type: "promotion",
        title: `${competitor.name}: New Promotion`,
        description: promo.promotion,
        severity: promo.urgency === "high" ? "high" : "medium",
        metadata: { promotion: promo },
      });
      alertsCreated++;
    }
  }

  // Store trending keywords as market trends
  if (analysis.trending_keywords?.length) {
    for (const kw of analysis.trending_keywords.slice(0, 10)) {
      const { data: existing } = await supabase
        .from("market_trends")
        .select("id, frequency")
        .eq("user_id", competitor.user_id)
        .eq("trend_value", kw)
        .maybeSingle();

      if (existing) {
        await supabase.from("market_trends").update({
          frequency: (existing.frequency || 0) + 1,
          last_seen_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("market_trends").insert({
          user_id: competitor.user_id,
          workspace_id: competitor.workspace_id,
          trend_type: "keyword",
          trend_value: kw,
        });
      }
    }
  }

  // Store suggested keywords as market trends with type "suggested"
  if (analysis.suggested_keywords?.length) {
    for (const kw of analysis.suggested_keywords.slice(0, 5)) {
      const { data: existing } = await supabase
        .from("market_trends")
        .select("id")
        .eq("user_id", competitor.user_id)
        .eq("trend_value", kw)
        .maybeSingle();

      if (!existing) {
        await supabase.from("market_trends").insert({
          user_id: competitor.user_id,
          workspace_id: competitor.workspace_id,
          trend_type: "suggested_keyword",
          trend_value: kw,
        });
      }
    }
  }

  return { analysis, pagesScanned: scrapedPages.length, alertsCreated };
}
