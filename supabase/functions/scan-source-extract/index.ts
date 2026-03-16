import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseAdmin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

async function updateScanPhase(
  sb: ReturnType<typeof createClient>,
  scanId: string,
  phase: string,
  extra: Record<string, unknown> = {}
) {
  await sb.from("source_scans").update({ scan_phase: phase, ...extra } as any).eq("id", scanId);
}

// Lightweight regex-based extraction (no AI cost)
function lightweightExtract(markdown: string, url: string) {
  const insights: Array<{
    insight_type: string;
    title: string;
    description: string;
    raw_value_json: Record<string, unknown>;
    confidence_score: number;
  }> = [];

  // Emails
  const emails = [...new Set(markdown.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])];
  if (emails.length) {
    insights.push({
      insight_type: "contact",
      title: "Email Addresses",
      description: `Found ${emails.length} email address(es)`,
      raw_value_json: { emails },
      confidence_score: 0.95,
    });
  }

  // Phone numbers
  const phones = [...new Set(markdown.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g) || [])].filter(p => p.replace(/\D/g, "").length >= 7);
  if (phones.length) {
    insights.push({
      insight_type: "contact",
      title: "Phone Numbers",
      description: `Found ${phones.length} phone number(s)`,
      raw_value_json: { phones },
      confidence_score: 0.85,
    });
  }

  // Social links
  const socialPatterns: Record<string, RegExp> = {
    instagram: /https?:\/\/(?:www\.)?instagram\.com\/[^\s)"\]]+/gi,
    facebook: /https?:\/\/(?:www\.)?facebook\.com\/[^\s)"\]]+/gi,
    linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/[^\s)"\]]+/gi,
    telegram: /https?:\/\/(?:t\.me|telegram\.me)\/[^\s)"\]]+/gi,
    youtube: /https?:\/\/(?:www\.)?youtube\.com\/[^\s)"\]]+/gi,
    twitter: /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[^\s)"\]]+/gi,
    whatsapp: /https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^\s)"\]]+/gi,
    tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/[^\s)"\]]+/gi,
  };

  const socialLinks: Record<string, string[]> = {};
  for (const [platform, regex] of Object.entries(socialPatterns)) {
    const matches = [...new Set(markdown.match(regex) || [])];
    if (matches.length) socialLinks[platform] = matches;
  }
  if (Object.keys(socialLinks).length) {
    insights.push({
      insight_type: "social",
      title: "Social Media Links",
      description: `Found profiles on ${Object.keys(socialLinks).join(", ")}`,
      raw_value_json: socialLinks,
      confidence_score: 0.95,
    });
  }

  // Navigation items (markdown headings)
  const headings = [...new Set((markdown.match(/^#{1,3}\s+(.+)$/gm) || []).map(h => h.replace(/^#+\s+/, "").trim()))].slice(0, 20);
  if (headings.length > 2) {
    insights.push({
      insight_type: "structure",
      title: "Website Structure",
      description: `Detected ${headings.length} key sections`,
      raw_value_json: { headings },
      confidence_score: 0.7,
    });
  }

  // Ecommerce signals
  const ecommerceKeywords = ["cart", "checkout", "add to cart", "buy now", "shop", "price", "order", "payment"];
  const lowerMd = markdown.toLowerCase();
  const ecomSignals = ecommerceKeywords.filter(k => lowerMd.includes(k));
  if (ecomSignals.length >= 2) {
    insights.push({
      insight_type: "structure",
      title: "E-commerce Signals",
      description: `Detected e-commerce indicators: ${ecomSignals.join(", ")}`,
      raw_value_json: { signals: ecomSignals },
      confidence_score: 0.8,
    });
  }

  // Blog/News presence
  const blogSignals = ["blog", "news", "articles", "latest posts", "recent posts"];
  const blogFound = blogSignals.filter(k => lowerMd.includes(k));
  if (blogFound.length) {
    insights.push({
      insight_type: "structure",
      title: "Blog / News Section",
      description: "Website appears to have a blog or news section",
      raw_value_json: { signals: blogFound },
      confidence_score: 0.75,
    });
  }

  // Address patterns
  const addressPatterns = markdown.match(/\d{1,5}\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Plaza|Square|Sq)[.,]?\s*(?:Suite|Ste|Apt|#)?\s*\d*[.,]?\s*[\w\s]*,?\s*[A-Z]{2}\s*\d{5}/gi);
  if (addressPatterns?.length) {
    insights.push({
      insight_type: "contact",
      title: "Physical Address",
      description: addressPatterns[0],
      raw_value_json: { addresses: addressPatterns },
      confidence_score: 0.8,
    });
  }

  // CTA phrases
  const ctaPhrases = [...new Set((markdown.match(/(?:Get Started|Contact Us|Request a Demo|Free Trial|Sign Up|Learn More|Book Now|Schedule|Get a Quote|Try Free)/gi) || []))];
  if (ctaPhrases.length) {
    insights.push({
      insight_type: "structure",
      title: "Call-to-Action Phrases",
      description: `Found ${ctaPhrases.length} CTA phrase(s)`,
      raw_value_json: { ctas: ctaPhrases },
      confidence_score: 0.85,
    });
  }

  return insights;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = supabaseAdmin();

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await sb.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");
    const userId = userData.user.id;

    const { source_id, scan_id, workspace_id } = await req.json();
    if (!source_id || !scan_id || !workspace_id) throw new Error("source_id, scan_id, workspace_id required");

    const startTime = Date.now();

    // Get source info
    const { data: source } = await sb.from("scan_sources").select("*").eq("id", source_id).single();
    if (!source) throw new Error("Source not found");

    const url = (source as any).url_or_identifier;

    // Phase: crawling
    await updateScanPhase(sb, scan_id, "crawling");
    await sb.from("scan_sources").update({ scan_status: "scanning" } as any).eq("id", source_id);

    // Scrape with Firecrawl
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    let markdown = "";
    let pageTitle = "";
    let pagesScanned = 0;
    let allLinks: string[] = [];

    if (FIRECRAWL_API_KEY) {
      let formattedUrl = String(url).trim();
      if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;

      const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: formattedUrl,
          formats: ["markdown", "links"],
          onlyMainContent: false,
        }),
      });

      const scrapeData = await scrapeRes.json();
      if (scrapeRes.ok) {
        markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
        pageTitle = scrapeData.data?.metadata?.title || "";
        allLinks = scrapeData.data?.links || scrapeData.links || [];
        pagesScanned = 1;
      } else {
        console.error("Firecrawl error:", scrapeData);
      }
    }

    await updateScanPhase(sb, scan_id, "extracting", { pages_scanned: pagesScanned } as any);

    // Phase: lightweight extraction
    const lightInsights = lightweightExtract(markdown, url);

    // Phase: AI analysis (only if we have content)
    await updateScanPhase(sb, scan_id, "analyzing");

    let aiInsights: typeof lightInsights = [];
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (markdown.length > 100 && LOVABLE_API_KEY) {
      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              {
                role: "system",
                content: `Analyze this website content and extract structured business intelligence. Return JSON with these sections:
- business_info: { name, description, industry, unique_selling_points[] }
- products: [{ title, description, pricing_signal }]
- services: [{ title, description }]
- opportunities: [{ title, description }]
Be concise. Max 5 items per array.`,
              },
              {
                role: "user",
                content: `URL: ${url}\nTitle: ${pageTitle}\n\nContent:\n${markdown.slice(0, 6000)}`,
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "extract_intelligence",
                  description: "Extract structured business intelligence",
                  parameters: {
                    type: "object",
                    properties: {
                      business_info: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          description: { type: "string" },
                          industry: { type: "string" },
                          unique_selling_points: { type: "array", items: { type: "string" } },
                        },
                        required: ["name", "description", "industry"],
                      },
                      products: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            title: { type: "string" },
                            description: { type: "string" },
                            pricing_signal: { type: "string" },
                          },
                          required: ["title", "description"],
                        },
                      },
                      services: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            title: { type: "string" },
                            description: { type: "string" },
                          },
                          required: ["title", "description"],
                        },
                      },
                      opportunities: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            title: { type: "string" },
                            description: { type: "string" },
                          },
                          required: ["title", "description"],
                        },
                      },
                    },
                    required: ["business_info", "products", "services", "opportunities"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "extract_intelligence" } },
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            const parsed = JSON.parse(toolCall.function.arguments);

            // Business info
            if (parsed.business_info) {
              const bi = parsed.business_info;
              aiInsights.push({
                insight_type: "business_info",
                title: bi.name || "Business Summary",
                description: bi.description || "",
                raw_value_json: {
                  industry: bi.industry,
                  unique_selling_points: bi.unique_selling_points || [],
                },
                confidence_score: 0.85,
              });
            }

            // Products
            for (const p of (parsed.products || []).slice(0, 5)) {
              aiInsights.push({
                insight_type: "product",
                title: p.title,
                description: p.description,
                raw_value_json: { pricing_signal: p.pricing_signal || null },
                confidence_score: 0.8,
              });
            }

            // Services
            for (const s of (parsed.services || []).slice(0, 5)) {
              aiInsights.push({
                insight_type: "service",
                title: s.title,
                description: s.description,
                raw_value_json: {},
                confidence_score: 0.8,
              });
            }

            // Opportunities
            for (const o of (parsed.opportunities || []).slice(0, 3)) {
              aiInsights.push({
                insight_type: "opportunity",
                title: o.title,
                description: o.description,
                raw_value_json: {},
                confidence_score: 0.7,
              });
            }
          }
        }
      } catch (aiErr) {
        console.error("AI extraction error:", aiErr);
      }
    }

    // Combine and deduplicate
    const allInsights = [...aiInsights, ...lightInsights];

    // Insert insights
    if (allInsights.length) {
      const rows = allInsights.map((i) => ({
        source_id,
        workspace_id,
        scan_id,
        user_id: userId,
        insight_type: i.insight_type,
        title: i.title,
        description: i.description,
        raw_value_json: i.raw_value_json,
        confidence_score: i.confidence_score,
      }));

      await sb.from("scan_insights").insert(rows as any);
    }

    const durationMs = Date.now() - startTime;

    // Complete scan
    await sb.from("source_scans").update({
      status: "completed",
      scan_phase: "completed",
      completed_at: new Date().toISOString(),
      items_found: allInsights.length,
      insights_found: allInsights.length,
      pages_scanned: pagesScanned,
      duration_ms: durationMs,
    } as any).eq("id", scan_id);

    await sb.from("scan_sources").update({
      scan_status: "active",
      last_scan_at: new Date().toISOString(),
    } as any).eq("id", source_id);

    return new Response(
      JSON.stringify({
        success: true,
        insights_count: allInsights.length,
        pages_scanned: pagesScanned,
        duration_ms: durationMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("scan-source-extract error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
