import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { url } = await req.json();
    if (!url) throw new Error("URL is required");

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;

    // Scrape website with Firecrawl
    console.log("Scraping:", formattedUrl);
    const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ["markdown", "links"],
        onlyMainContent: true,
      }),
    });

    const scrapeData = await scrapeRes.json();
    if (!scrapeRes.ok) throw new Error(scrapeData.error || "Scrape failed");

    const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
    const pageTitle = scrapeData.data?.metadata?.title || scrapeData.metadata?.title || "";

    // Use AI to extract structured business data
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: "Extract structured business information from this website content. Return JSON with: products (array of strings), services (array of strings), tone (string), topics (array of strings), keywords (array of strings), target_audience (string), industry (string), unique_selling_points (array of strings)."
          },
          {
            role: "user",
            content: `Website: ${formattedUrl}\nTitle: ${pageTitle}\n\nContent:\n${markdown.slice(0, 8000)}`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_business_data",
            description: "Extract structured business data from website content",
            parameters: {
              type: "object",
              properties: {
                products: { type: "array", items: { type: "string" } },
                services: { type: "array", items: { type: "string" } },
                tone: { type: "string" },
                topics: { type: "array", items: { type: "string" } },
                keywords: { type: "array", items: { type: "string" } },
                target_audience: { type: "string" },
                industry: { type: "string" },
                unique_selling_points: { type: "array", items: { type: "string" } }
              },
              required: ["products", "services", "tone", "topics", "keywords", "target_audience", "industry", "unique_selling_points"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_business_data" } }
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      throw new Error("AI extraction failed");
    }

    const aiData = await aiRes.json();
    let extractedData: Record<string, unknown> = {};

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        extractedData = JSON.parse(toolCall.function.arguments);
      } catch {
        extractedData = { raw: toolCall.function.arguments };
      }
    }

    // Store in content_knowledge
    const { data: knowledge, error: insertError } = await supabase
      .from("content_knowledge")
      .upsert({
        user_id: userId,
        source_type: "website",
        source_url: formattedUrl,
        extracted_data: { ...extractedData, page_title: pageTitle },
        scanned_at: new Date().toISOString(),
      }, { onConflict: "user_id,source_url" })
      .select()
      .single();

    // If upsert fails due to no unique constraint, just insert
    if (insertError) {
      const { data: inserted } = await supabase
        .from("content_knowledge")
        .insert({
          user_id: userId,
          source_type: "website",
          source_url: formattedUrl,
          extracted_data: { ...extractedData, page_title: pageTitle },
          scanned_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      return new Response(JSON.stringify({ success: true, data: extractedData, knowledge: inserted }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: true, data: extractedData, knowledge }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("scan-business-content error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
