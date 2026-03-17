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

function lightweightExtract(markdown: string) {
  const contacts: Array<{ type: string; value: string }> = [];
  const socialLinks: Record<string, string[]> = {};

  // Emails
  const emails = [...new Set(markdown.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])];
  emails.forEach((e) => contacts.push({ type: "email", value: e }));

  // Phones
  const phones = [...new Set(markdown.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g) || [])].filter((p) => p.replace(/\D/g, "").length >= 7);
  phones.forEach((p) => contacts.push({ type: "phone", value: p }));

  // Social
  const patterns: Record<string, RegExp> = {
    instagram: /https?:\/\/(?:www\.)?instagram\.com\/[^\s)"\]]+/gi,
    facebook: /https?:\/\/(?:www\.)?facebook\.com\/[^\s)"\]]+/gi,
    linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/[^\s)"\]]+/gi,
    telegram: /https?:\/\/(?:t\.me|telegram\.me)\/[^\s)"\]]+/gi,
    youtube: /https?:\/\/(?:www\.)?youtube\.com\/[^\s)"\]]+/gi,
    twitter: /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[^\s)"\]]+/gi,
    whatsapp: /https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^\s)"\]]+/gi,
    tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/[^\s)"\]]+/gi,
  };
  for (const [platform, regex] of Object.entries(patterns)) {
    const matches = [...new Set(markdown.match(regex) || [])];
    if (matches.length) socialLinks[platform] = matches;
  }

  // CTAs
  const ctas = [...new Set((markdown.match(/(?:Get Started|Contact Us|Request a Demo|Free Trial|Sign Up|Learn More|Book Now|Schedule|Get a Quote|Try Free|Buy Now|Order Now|Shop Now|Subscribe)/gi) || []))];

  // Pricing signals
  const pricingSignals: string[] = [];
  const pricingKws = ["price", "pricing", "cost", "$", "€", "per month", "/mo", "free plan", "premium", "enterprise"];
  const lower = markdown.toLowerCase();
  pricingKws.forEach((kw) => { if (lower.includes(kw)) pricingSignals.push(kw); });

  return { contacts, socialLinks, ctas, pricingSignals };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = supabaseAdmin();

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await sb.auth.getUser(jwt);
    if (userError || !userData.user) throw new Error("Not authenticated");

    const { business_id, scan_history_id, source_id, source_scan_id, workspace_id, url } = await req.json();
    if (!business_id || !scan_history_id || !workspace_id || !url) {
      throw new Error("business_id, scan_history_id, workspace_id, url required");
    }

    const startTime = Date.now();

    // Update phase
    await sb.from("business_scan_history").update({ status: "scanning", scan_phase: "crawling" } as any).eq("id", scan_history_id);

    // Scrape with Firecrawl
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    let markdown = "";
    let pageTitle = "";
    let pagesScanned = 0;

    if (FIRECRAWL_API_KEY) {
      let formattedUrl = String(url).trim();
      if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;

      const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: formattedUrl, formats: ["markdown", "links"], onlyMainContent: false }),
      });

      const scrapeData = await scrapeRes.json();
      if (scrapeRes.ok) {
        markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
        pageTitle = scrapeData.data?.metadata?.title || "";
        pagesScanned = 1;
      } else {
        console.error("Firecrawl error:", scrapeData);
        if (!scrapeRes.ok && scrapeRes.status === 402) {
          throw new Error("Firecrawl credits insufficient. Please top up.");
        }
      }
    } else {
      throw new Error("FIRECRAWL_API_KEY not configured");
    }

    // Phase: extracting
    await sb.from("business_scan_history").update({ scan_phase: "extracting", pages_scanned: pagesScanned } as any).eq("id", scan_history_id);

    // Lightweight extraction
    const { contacts, socialLinks, ctas, pricingSignals } = lightweightExtract(markdown);

    // Phase: AI analysis
    await sb.from("business_scan_history").update({ scan_phase: "analyzing" } as any).eq("id", scan_history_id);

    let products: any[] = [];
    let services: any[] = [];
    let toneOfVoice = "";
    let suggestedKeywords: string[] = [];
    let competitorHints: any[] = [];
    let summaryJson: Record<string, unknown> = {};

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (markdown.length > 100 && LOVABLE_API_KEY) {
      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `You are a business intelligence analyst. Analyze the website content and extract structured data. Return JSON via the tool call.`,
              },
              {
                role: "user",
                content: `URL: ${url}\nTitle: ${pageTitle}\n\nContent:\n${markdown.slice(0, 8000)}`,
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "extract_business_data",
                  description: "Extract structured business intelligence from website",
                  parameters: {
                    type: "object",
                    properties: {
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
                          properties: { title: { type: "string" }, description: { type: "string" } },
                          required: ["title", "description"],
                        },
                      },
                      tone_of_voice: { type: "string", description: "e.g. professional, casual, luxury, friendly" },
                      suggested_keywords: { type: "array", items: { type: "string" } },
                      competitor_hints: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: { name: { type: "string" }, url: { type: "string" } },
                          required: ["name"],
                        },
                      },
                      business_summary: { type: "string" },
                      industry: { type: "string" },
                      target_audience: { type: "string" },
                      unique_selling_points: { type: "array", items: { type: "string" } },
                    },
                    required: ["products", "services", "tone_of_voice", "suggested_keywords"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "extract_business_data" } },
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            const parsed = JSON.parse(toolCall.function.arguments);
            products = (parsed.products || []).slice(0, 10);
            services = (parsed.services || []).slice(0, 10);
            toneOfVoice = parsed.tone_of_voice || "";
            suggestedKeywords = (parsed.suggested_keywords || []).slice(0, 15);
            competitorHints = (parsed.competitor_hints || []).slice(0, 5);
            summaryJson = {
              business_summary: parsed.business_summary || "",
              industry: parsed.industry || "",
              target_audience: parsed.target_audience || "",
              unique_selling_points: parsed.unique_selling_points || [],
            };
          }
        }
      } catch (aiErr) {
        console.error("AI extraction error:", aiErr);
      }
    }

    // Build insight rows linked to business
    const insightRows: any[] = [];
    const addInsight = (type: string, title: string, desc: string, json: Record<string, unknown>, score: number) => {
      if (!source_id || !source_scan_id) return;
      insightRows.push({
        source_id,
        business_id,
        workspace_id,
        scan_id: source_scan_id,
        user_id: userData.user.id,
        insight_type: type,
        title,
        description: desc,
        raw_value_json: json,
        confidence_score: score,
      });
    };

    products.forEach((p) => addInsight("product", p.title, p.description, { pricing_signal: p.pricing_signal }, 0.8));
    services.forEach((s) => addInsight("service", s.title, s.description, {}, 0.8));
    if (contacts.length) addInsight("contact", "Contact Methods", `Found ${contacts.length} contact method(s)`, { contacts }, 0.95);
    if (Object.keys(socialLinks).length) addInsight("social", "Social Media Links", `Found on ${Object.keys(socialLinks).join(", ")}`, socialLinks, 0.95);
    if (ctas.length) addInsight("cta", "Call-to-Action Phrases", `Found ${ctas.length} CTA(s)`, { ctas }, 0.85);
    if (summaryJson.business_summary) addInsight("business_info", pageTitle || "Business Summary", summaryJson.business_summary as string, summaryJson, 0.85);

    if (insightRows.length) {
      await sb.from("scan_insights").insert(insightRows);
    }

    const durationMs = Date.now() - startTime;

    await sb.from("business_scan_history").update({
      status: "completed",
      scan_phase: "completed",
      pages_scanned: pagesScanned,
      insights_count: insightRows.length,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
      summary_json: summaryJson,
      products_found: products,
      services_found: services,
      contact_methods: contacts,
      social_links: socialLinks,
      pricing_signals: pricingSignals.map((s) => ({ signal: s })),
      tone_of_voice: toneOfVoice,
      suggested_keywords: suggestedKeywords,
      cta_signals: ctas.map((c) => ({ cta: c })),
      competitor_hints: competitorHints,
    } as any).eq("id", scan_history_id);

    if (source_scan_id) {
      await sb.from("source_scans").update({
        business_id,
        status: "completed",
        scan_phase: "completed",
        completed_at: new Date().toISOString(),
        items_found: insightRows.length,
        insights_found: insightRows.length,
        pages_scanned: pagesScanned,
        duration_ms: durationMs,
      } as any).eq("id", source_scan_id);
    }

    if (source_id) {
      await sb.from("scan_sources").update({
        business_id,
        scan_status: "active",
        last_scan_at: new Date().toISOString(),
      } as any).eq("id", source_id);
    }

    return new Response(
      JSON.stringify({ success: true, insights_count: insightRows.length, pages_scanned: pagesScanned, duration_ms: durationMs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("business-scan-extract error:", error);

    try {
      const sb = supabaseAdmin();
      const body = await req.clone().json().catch(() => ({}));
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (body.scan_history_id) {
        await sb.from("business_scan_history").update({
          status: "failed",
          scan_phase: "failed",
          error_message: errorMessage,
        } as any).eq("id", body.scan_history_id);
      }

      if (body.source_scan_id) {
        await sb.from("source_scans").update({
          business_id: body.business_id,
          status: "error",
          scan_phase: "error",
          error_message: errorMessage,
        } as any).eq("id", body.source_scan_id);
      }

      if (body.source_id) {
        await sb.from("scan_sources").update({
          business_id: body.business_id,
          scan_status: "error",
        } as any).eq("id", body.source_id);
      }
    } catch (_) { /* ignore */ }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
