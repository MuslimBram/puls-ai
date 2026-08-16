import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!FIRECRAWL_API_KEY) throw new Error("Firecrawl connector not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      getServiceKey() ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    const userId = userData.user?.id;
    if (!userId) throw new Error("Not authenticated");

    const { url, business_id } = await req.json();
    if (!url) throw new Error("URL is required");

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;

    console.log("SEO Audit for:", formattedUrl);

    // Scrape with Firecrawl - get HTML + markdown + links
    const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ["markdown", "html", "links"],
        onlyMainContent: false,
      }),
    });

    if (!scrapeRes.ok) {
      const errText = await scrapeRes.text();
      throw new Error(`Scrape failed: ${scrapeRes.status} - ${errText}`);
    }

    const scrapeData = await scrapeRes.json();
    const html = scrapeData?.data?.html || scrapeData?.html || "";
    const markdown = scrapeData?.data?.markdown || scrapeData?.markdown || "";
    const links = scrapeData?.data?.links || scrapeData?.links || [];
    const metadata = scrapeData?.data?.metadata || scrapeData?.metadata || {};

    // Extract basic SEO signals from HTML
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i);
    const h1Matches = html.match(/<h1[^>]*>(.*?)<\/h1>/gi) || [];
    const h2Matches = html.match(/<h2[^>]*>(.*?)<\/h2>/gi) || [];
    const imgWithoutAlt = (html.match(/<img(?![^>]*alt=["'][^"']+["'])[^>]*>/gi) || []).length;
    const totalImages = (html.match(/<img[^>]*>/gi) || []).length;
    const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["'](.*?)["']/i);
    const robotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["'](.*?)["']/i);
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["'](.*?)["']/i);
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["'](.*?)["']/i);
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i);
    const viewportMatch = html.match(/<meta[^>]*name=["']viewport["'][^>]*content=["'](.*?)["']/i);
    const schemaMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/is);

    const seoSignals = {
      title: titleMatch?.[1] || null,
      title_length: titleMatch?.[1]?.length || 0,
      meta_description: metaDescMatch?.[1] || null,
      meta_description_length: metaDescMatch?.[1]?.length || 0,
      h1_count: h1Matches.length,
      h1_tags: h1Matches.map((h: string) => h.replace(/<[^>]*>/g, "").trim()).slice(0, 5),
      h2_count: h2Matches.length,
      total_images: totalImages,
      images_without_alt: imgWithoutAlt,
      canonical_url: canonicalMatch?.[1] || null,
      robots_meta: robotsMatch?.[1] || null,
      has_og_tags: !!(ogTitleMatch || ogDescMatch || ogImageMatch),
      og_title: ogTitleMatch?.[1] || null,
      og_description: ogDescMatch?.[1] || null,
      og_image: ogImageMatch?.[1] || null,
      has_viewport: !!viewportMatch,
      has_schema_markup: !!schemaMatch,
      internal_links: links.filter((l: string) => l.startsWith(formattedUrl) || l.startsWith("/")).length,
      external_links: links.filter((l: string) => l.startsWith("http") && !l.startsWith(formattedUrl)).length,
      total_links: links.length,
      word_count: markdown.split(/\s+/).length,
      page_url: formattedUrl,
    };

    // AI Analysis
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
            content: "You are an expert SEO auditor. Analyze the provided webpage data and give actionable SEO recommendations. Be specific with numbers and benchmarks.",
          },
          {
            role: "user",
            content: `Perform an SEO audit for ${formattedUrl}.

SEO Signals:
${JSON.stringify(seoSignals, null, 2)}

Page content (first 3000 chars):
${markdown.slice(0, 3000)}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "seo_audit_result",
            description: "Return structured SEO audit results",
            parameters: {
              type: "object",
              properties: {
                overall_score: { type: "number", description: "Score 0-100" },
                grade: { type: "string", enum: ["A+", "A", "B+", "B", "C+", "C", "D", "F"] },
                title_analysis: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    status: { type: "string", enum: ["good", "warning", "error"] },
                    message: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: ["score", "status", "message"],
                },
                meta_description_analysis: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    status: { type: "string", enum: ["good", "warning", "error"] },
                    message: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: ["score", "status", "message"],
                },
                headings_analysis: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    status: { type: "string", enum: ["good", "warning", "error"] },
                    message: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: ["score", "status", "message"],
                },
                images_analysis: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    status: { type: "string", enum: ["good", "warning", "error"] },
                    message: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: ["score", "status", "message"],
                },
                links_analysis: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    status: { type: "string", enum: ["good", "warning", "error"] },
                    message: { type: "string" },
                  },
                  required: ["score", "status", "message"],
                },
                social_analysis: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    status: { type: "string", enum: ["good", "warning", "error"] },
                    message: { type: "string" },
                  },
                  required: ["score", "status", "message"],
                },
                technical_analysis: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    status: { type: "string", enum: ["good", "warning", "error"] },
                    message: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: ["score", "status", "message"],
                },
                keyword_opportunities: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      keyword: { type: "string" },
                      relevance: { type: "string", enum: ["high", "medium", "low"] },
                      suggestion: { type: "string" },
                    },
                    required: ["keyword", "relevance", "suggestion"],
                  },
                },
                top_recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      priority: { type: "string", enum: ["high", "medium", "low"] },
                      category: { type: "string" },
                      recommendation: { type: "string" },
                      impact: { type: "string" },
                    },
                    required: ["priority", "category", "recommendation", "impact"],
                  },
                },
                content_quality: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    readability: { type: "string" },
                    tone: { type: "string" },
                    suggestions: { type: "array", items: { type: "string" } },
                  },
                  required: ["score", "readability"],
                },
              },
              required: ["overall_score", "grade", "title_analysis", "meta_description_analysis", "headings_analysis", "images_analysis", "links_analysis", "social_analysis", "technical_analysis", "keyword_opportunities", "top_recommendations", "content_quality"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "seo_audit_result" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) throw new Error("Rate limit exceeded, please try again later");
      if (status === 402) throw new Error("AI credits exhausted, please add funds");
      throw new Error(`AI error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No analysis generated");

    const audit = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({
      success: true,
      audit,
      signals: seoSignals,
      metadata,
    }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("seo-audit error:", e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
