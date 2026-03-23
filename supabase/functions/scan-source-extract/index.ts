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
    { auth: { persistSession: false } },
  );

type BusinessRecord = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  business_name: string;
  industry: string | null;
  target_audience: string | null;
  short_description: string | null;
  main_services: string | null;
};

type ScanSourceRecord = {
  id: string;
  business_id: string | null;
  platform: string;
  source_type: string;
  url_or_identifier: string;
  label: string | null;
  workspace_id: string;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function chunkText(text: string, maxChunkSize = 1200) {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) return [] as string[];

  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).length > maxChunkSize && current) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function updateScanPhase(
  sb: ReturnType<typeof createClient>,
  scanId: string,
  phase: string,
  extra: Record<string, unknown> = {},
) {
  await sb.from("source_scans").update({ scan_phase: phase, ...extra } as never).eq("id", scanId);
}

function lightweightExtract(markdown: string) {
  const emails = [...new Set(markdown.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])];
  const phones = [...new Set(markdown.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g) || [])].filter((phone) => phone.replace(/\D/g, "").length >= 7);
  const ctas = [...new Set((markdown.match(/(?:Get Started|Contact Us|Request a Demo|Free Trial|Sign Up|Learn More|Book Now|Schedule|Get a Quote|Try Free|Buy Now|Order Now|Shop Now|Subscribe|Message Us|Send Message)/gi) || []))];

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

  const pricingSignals = uniqueStrings([
    markdown.toLowerCase().includes("pricing") ? "pricing" : null,
    markdown.toLowerCase().includes("price") ? "price" : null,
    markdown.includes("$") ? "usd" : null,
    markdown.includes("€") ? "eur" : null,
    markdown.toLowerCase().includes("free trial") ? "free trial" : null,
    markdown.toLowerCase().includes("book now") ? "book now" : null,
    markdown.toLowerCase().includes("subscribe") ? "subscribe" : null,
  ]);

  return {
    contacts: [
      ...emails.map((value) => ({ type: "email", value })),
      ...phones.map((value) => ({ type: "phone", value })),
    ],
    socialLinks,
    ctas,
    pricingSignals,
  };
}

function normalizeSourceTarget(platform: string, rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) throw new Error("Source identifier is empty");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const cleanHandle = trimmed.replace(/^@/, "").replace(/^\/+/, "");

  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/${cleanHandle}`;
    case "facebook":
      return `https://www.facebook.com/${cleanHandle}`;
    case "linkedin":
      if (cleanHandle.startsWith("company/") || cleanHandle.startsWith("in/")) {
        return `https://www.linkedin.com/${cleanHandle}`;
      }
      return `https://www.linkedin.com/company/${cleanHandle}`;
    case "telegram":
      return `https://t.me/${cleanHandle}`;
    case "whatsapp":
      return cleanHandle.startsWith("wa.me/") ? `https://${cleanHandle}` : `https://wa.me/${cleanHandle.replace(/\D/g, "")}`;
    case "web":
    case "other":
    default:
      return `https://${cleanHandle}`;
  }
}

function buildKnowledgeChunks(input: {
  business: BusinessRecord;
  source: ScanSourceRecord;
  targetUrl: string;
  pageTitle: string;
  markdown: string;
  profileSummary: string;
  businessSummary: string;
  products: Array<{ title?: string; description?: string; pricing_signal?: string }>;
  services: Array<{ title?: string; description?: string }>;
  recentPosts: Array<{ title?: string; description?: string }>;
  offers: Array<{ title?: string; description?: string }>;
  contacts: Array<{ type?: string; value?: string }>;
  socialLinks: Record<string, string[]>;
  pricingSignals: string[];
  ctas: string[];
  suggestedKeywords: string[];
  competitorHints: Array<{ name?: string; url?: string }>;
  toneOfVoice: string;
}) {
  const { business, source } = input;
  const chunks: Array<{ title: string; content: string; topicTags: string[]; contentType: string }> = [];
  const baseTags = uniqueStrings([
    business.business_name,
    business.industry,
    source.platform,
    source.source_type,
    input.toneOfVoice,
    ...input.suggestedKeywords,
  ]);

  const addChunk = (title: string, contentType: string, lines: Array<string | null | undefined>, extraTags: string[] = []) => {
    const content = lines.filter(Boolean).join("\n").trim();
    if (!content) return;
    chunks.push({
      title,
      content,
      contentType,
      topicTags: uniqueStrings([...baseTags, ...extraTags]),
    });
  };

  addChunk(
    `${source.platform} profile overview`,
    "social_profile",
    [
      `Business: ${business.business_name}`,
      `Platform: ${source.platform}`,
      source.label ? `Label: ${source.label}` : null,
      `Source: ${input.targetUrl}`,
      input.pageTitle ? `Title: ${input.pageTitle}` : null,
      business.short_description ? `Existing business description: ${business.short_description}` : null,
      input.profileSummary ? `Profile summary: ${input.profileSummary}` : null,
      input.businessSummary ? `Business summary: ${input.businessSummary}` : null,
      input.toneOfVoice ? `Tone of voice: ${input.toneOfVoice}` : null,
      business.target_audience ? `Target audience: ${business.target_audience}` : null,
    ],
    ["overview", "profile"],
  );

  addChunk(
    "Products and services",
    "social_catalog",
    [
      ...input.products.map((product, index) => `Product ${index + 1}: ${product.title || "Untitled"}${product.description ? ` — ${product.description}` : ""}${product.pricing_signal ? ` (pricing: ${product.pricing_signal})` : ""}`),
      ...input.services.map((service, index) => `Service ${index + 1}: ${service.title || "Untitled"}${service.description ? ` — ${service.description}` : ""}`),
      business.main_services ? `Existing main services: ${business.main_services}` : null,
    ],
    ["products", "services"],
  );

  addChunk(
    "Offers and conversion signals",
    "social_signals",
    [
      ...input.offers.map((offer, index) => `Offer ${index + 1}: ${offer.title || "Untitled"}${offer.description ? ` — ${offer.description}` : ""}`),
      ...input.pricingSignals.map((signal, index) => `Pricing signal ${index + 1}: ${signal}`),
      ...input.ctas.map((cta, index) => `CTA ${index + 1}: ${cta}`),
      ...input.contacts.map((contact, index) => `Contact ${index + 1}: ${contact.type || "method"} — ${contact.value || ""}`),
    ],
    ["offers", "pricing", "cta", "contact"],
  );

  addChunk(
    "Recent social content",
    "social_posts",
    input.recentPosts.map((post, index) => `Post ${index + 1}: ${post.title || "Untitled"}${post.description ? ` — ${post.description}` : ""}`),
    ["posts", "content"],
  );

  addChunk(
    "Audience and market intelligence",
    "social_intelligence",
    [
      input.suggestedKeywords.length ? `Suggested keywords: ${input.suggestedKeywords.join(", ")}` : null,
      ...input.competitorHints.map((competitor, index) => `Competitor ${index + 1}: ${competitor.name || "Unknown"}${competitor.url ? ` — ${competitor.url}` : ""}`),
      ...Object.entries(input.socialLinks).map(([platform, urls]) => `${platform}: ${urls.join(", ")}`),
    ],
    ["keywords", "competitors", "social"],
  );

  const rawChunks = chunkText(input.markdown.slice(0, 6000), 1000).slice(0, 3);
  rawChunks.forEach((chunk, index) => {
    addChunk(`Source content digest ${index + 1}`, "source_digest", [chunk], ["raw-content", "digest"]);
  });

  return chunks;
}

async function upsertKnowledgeBase(args: {
  sb: ReturnType<typeof createClient>;
  business: BusinessRecord;
  source: ScanSourceRecord;
  targetUrl: string;
  pageTitle: string;
  metadata: Record<string, unknown>;
  chunks: Array<{ title: string; content: string; topicTags: string[]; contentType: string }>;
}) {
  const { sb, business, source, targetUrl, pageTitle, metadata, chunks } = args;

  const sourceName = source.label?.trim() || pageTitle || `${business.business_name} — ${source.platform}`;
  const knowledgeSourceType = source.platform === "web" ? "website" : "social";

  const { data: existingSource, error: existingSourceError } = await sb
    .from("knowledge_sources")
    .select("id")
    .eq("user_id", business.user_id)
    .eq("business_id", business.id)
    .eq("source_type", knowledgeSourceType)
    .eq("source_url", targetUrl)
    .maybeSingle();

  if (existingSourceError) throw existingSourceError;

  let knowledgeSourceId = existingSource?.id as string | undefined;

  const sourcePayload = {
    user_id: business.user_id,
    workspace_id: business.workspace_id,
    business_id: business.id,
    source_type: knowledgeSourceType,
    source_name: sourceName,
    source_url: targetUrl,
    status: "active",
    is_enabled: true,
    last_scanned_at: new Date().toISOString(),
    metadata,
  };

  if (knowledgeSourceId) {
    const { error: updateSourceError } = await sb
      .from("knowledge_sources")
      .update(sourcePayload)
      .eq("id", knowledgeSourceId);
    if (updateSourceError) throw updateSourceError;

    const { error: deleteChunksError } = await sb
      .from("knowledge_chunks")
      .delete()
      .eq("source_id", knowledgeSourceId);
    if (deleteChunksError) throw deleteChunksError;
  } else {
    const { data: createdSource, error: createSourceError } = await sb
      .from("knowledge_sources")
      .insert(sourcePayload)
      .select("id")
      .single();
    if (createSourceError) throw createSourceError;
    knowledgeSourceId = createdSource.id;
  }

  const chunkRows = chunks.map((chunk, index) => ({
    user_id: business.user_id,
    workspace_id: business.workspace_id,
    business_id: business.id,
    source_id: knowledgeSourceId!,
    content: chunk.content,
    summary: chunk.content.slice(0, 200),
    topic_tags: chunk.topicTags,
    content_type: chunk.contentType,
    page_url: targetUrl,
    page_title: chunk.title,
    chunk_index: index,
    word_count: chunk.content.split(/\s+/).filter(Boolean).length,
  }));

  const { error: insertChunksError } = await sb.from("knowledge_chunks").insert(chunkRows);
  if (insertChunksError) throw insertChunksError;

  return { knowledgeSourceId, sourceName, chunksCreated: chunkRows.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = supabaseAdmin();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await sb.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");
    const userId = userData.user.id;

    const { source_id, scan_id, workspace_id, business_id } = await req.json();
    if (!source_id || !scan_id || !workspace_id) throw new Error("source_id, scan_id, workspace_id required");

    const startTime = Date.now();

    const { data: source } = await sb.from("scan_sources").select("*").eq("id", source_id).single();
    if (!source) throw new Error("Source not found");

    const typedSource = source as ScanSourceRecord;
    const effectiveBusinessId = business_id || typedSource.business_id;
    if (!effectiveBusinessId) throw new Error("Select a business before scanning this source");

    const { data: business, error: businessError } = await sb
      .from("business_profiles")
      .select("id, user_id, workspace_id, business_name, industry, target_audience, short_description, main_services")
      .eq("id", effectiveBusinessId)
      .eq("workspace_id", workspace_id)
      .single();
    if (businessError || !business) throw new Error("Business not found for this workspace");
    if (business.user_id !== userId) throw new Error("Forbidden");

    const targetUrl = normalizeSourceTarget(typedSource.platform, typedSource.url_or_identifier);

    await updateScanPhase(sb, scan_id, "crawling");
    await sb.from("scan_sources").update({ scan_status: "scanning", business_id: business.id } as never).eq("id", source_id);

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured");

    const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ["markdown", "links", "summary"],
        onlyMainContent: false,
      }),
    });

    const scrapeData = await scrapeRes.json();
    if (!scrapeRes.ok) {
      const scrapeError = scrapeData?.error || scrapeData?.message || `Failed to scrape ${typedSource.platform} source`;
      const isUnsupported = typeof scrapeError === "string" && scrapeError.toLowerCase().includes("do not support this site");

      if (isUnsupported) {
        // Mark scan as completed with warning instead of failing
        await sb.from("scan_sources").update({ scan_status: "active", last_scan_at: new Date().toISOString() } as never).eq("id", source_id);
        if (scan_id) {
          await sb.from("source_scans").update({ status: "completed", scan_phase: "done", completed_at: new Date().toISOString(), result_summary: { warning: "Kjo faqe nuk mbështetet për skanim automatik. Provoni një URL tjetër." } } as never).eq("id", scan_id);
        }
        return new Response(JSON.stringify({
          success: true,
          warning: "Kjo faqe nuk mbështetet për skanim automatik. Provoni një URL tjetër.",
          insights_count: 0,
          duration_ms: Date.now() - startTime,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      throw new Error(scrapeError);
    }

    const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
    const pageTitle = scrapeData.data?.metadata?.title || scrapeData.metadata?.title || typedSource.label || typedSource.url_or_identifier;
    const pagesScanned = markdown ? 1 : 0;

    await updateScanPhase(sb, scan_id, "extracting", { pages_scanned: pagesScanned } as never);

    const { contacts, socialLinks, ctas, pricingSignals } = lightweightExtract(markdown);

    await updateScanPhase(sb, scan_id, "analyzing");

    let products: Array<{ title?: string; description?: string; pricing_signal?: string }> = [];
    let services: Array<{ title?: string; description?: string }> = [];
    let recentPosts: Array<{ title?: string; description?: string }> = [];
    let offers: Array<{ title?: string; description?: string }> = [];
    let profileSummary = scrapeData.data?.summary || scrapeData.summary || "";
    let businessSummary = "";
    let toneOfVoice = "";
    let suggestedKeywords: string[] = [];
    let competitorHints: Array<{ name?: string; url?: string }> = [];

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
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `Analyze this ${typedSource.platform} source and normalize it into a business knowledge structure shared with website scans. Extract business summary, products, services, offers, recent post themes, tone, keywords, and competitor hints.`,
              },
              {
                role: "user",
                content: `Platform: ${typedSource.platform}\nSource: ${targetUrl}\nTitle: ${pageTitle}\n\nContent:\n${markdown.slice(0, 9000)}`,
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "extract_social_business_context",
                  description: "Normalize website or social source content into a shared business knowledge schema",
                  parameters: {
                    type: "object",
                    properties: {
                      profile_summary: { type: "string" },
                      business_summary: { type: "string" },
                      tone_of_voice: { type: "string" },
                      suggested_keywords: { type: "array", items: { type: "string" } },
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
                      recent_posts: {
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
                      offers: {
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
                      competitor_hints: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            url: { type: "string" },
                          },
                          required: ["name"],
                        },
                      },
                    },
                    required: ["profile_summary", "business_summary", "tone_of_voice", "suggested_keywords", "products", "services", "recent_posts", "offers", "competitor_hints"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "extract_social_business_context" } },
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            const parsed = JSON.parse(toolCall.function.arguments);
            profileSummary = parsed.profile_summary || profileSummary;
            businessSummary = parsed.business_summary || "";
            toneOfVoice = parsed.tone_of_voice || "";
            suggestedKeywords = (parsed.suggested_keywords || []).slice(0, 15);
            products = (parsed.products || []).slice(0, 8);
            services = (parsed.services || []).slice(0, 8);
            recentPosts = (parsed.recent_posts || []).slice(0, 8);
            offers = (parsed.offers || []).slice(0, 8);
            competitorHints = (parsed.competitor_hints || []).slice(0, 5);
          }
        }
      } catch (aiError) {
        console.error("AI extraction error:", aiError);
      }
    }

    const insightRows: Array<Record<string, unknown>> = [];
    const addInsight = (
      type: string,
      title: string,
      description: string,
      rawValueJson: Record<string, unknown>,
      confidenceScore: number,
    ) => {
      insightRows.push({
        source_id,
        business_id: business.id,
        workspace_id,
        scan_id,
        user_id: userId,
        insight_type: type,
        title,
        description,
        raw_value_json: rawValueJson,
        confidence_score: confidenceScore,
      });
    };

    if (profileSummary || businessSummary) {
      addInsight(
        "business_info",
        pageTitle,
        businessSummary || profileSummary,
        { profile_summary: profileSummary, business_summary: businessSummary, platform: typedSource.platform },
        0.85,
      );
    }
    products.forEach((product) => addInsight("product", product.title || "Product", product.description || "", { pricing_signal: product.pricing_signal || null }, 0.8));
    services.forEach((service) => addInsight("service", service.title || "Service", service.description || "", {}, 0.8));
    recentPosts.forEach((post) => addInsight("social_post", post.title || "Post", post.description || "", { platform: typedSource.platform }, 0.72));
    offers.forEach((offer) => addInsight("offer", offer.title || "Offer", offer.description || "", { platform: typedSource.platform }, 0.78));
    if (contacts.length) addInsight("contact", "Contact Methods", `Found ${contacts.length} contact method(s)`, { contacts }, 0.95);
    if (Object.keys(socialLinks).length) addInsight("social", "Social Media Links", `Found profiles on ${Object.keys(socialLinks).join(", ")}`, socialLinks, 0.95);
    if (ctas.length) addInsight("cta", "Call-to-Action Phrases", `Found ${ctas.length} CTA phrase(s)`, { ctas }, 0.85);
    if (pricingSignals.length) addInsight("pricing", "Pricing Signals", `Found ${pricingSignals.length} pricing signal(s)`, { pricing_signals: pricingSignals }, 0.78);

    if (insightRows.length) {
      await sb.from("scan_insights").insert(insightRows as never[]);
    }

    const chunks = buildKnowledgeChunks({
      business,
      source: typedSource,
      targetUrl,
      pageTitle,
      markdown,
      profileSummary,
      businessSummary,
      products,
      services,
      recentPosts,
      offers,
      contacts,
      socialLinks,
      pricingSignals,
      ctas,
      suggestedKeywords,
      competitorHints,
      toneOfVoice,
    });

    const metadata = {
      origin: "scan_source_extract",
      adapter: typedSource.platform === "web" ? "website" : "social",
      platform: typedSource.platform,
      business_id: business.id,
      source_id,
      source_scan_id: scan_id,
      normalized_target: targetUrl,
      label: typedSource.label,
      total_chunks: chunks.length,
      total_insights: insightRows.length,
      topics: uniqueStrings(chunks.flatMap((chunk) => chunk.topicTags)).slice(0, 20),
    };

    const knowledgeResult = await upsertKnowledgeBase({
      sb,
      business,
      source: typedSource,
      targetUrl,
      pageTitle,
      metadata,
      chunks,
    });

    const durationMs = Date.now() - startTime;
    const completedAt = new Date().toISOString();

    await sb.from("source_scans").update({
      business_id: business.id,
      status: "completed",
      scan_phase: "completed",
      completed_at: completedAt,
      items_found: insightRows.length,
      insights_found: insightRows.length,
      pages_scanned: pagesScanned,
      duration_ms: durationMs,
    } as never).eq("id", scan_id);

    await sb.from("scan_sources").update({
      business_id: business.id,
      scan_status: "active",
      last_scan_at: completedAt,
    } as never).eq("id", source_id);

    return new Response(
      JSON.stringify({
        success: true,
        insights_count: insightRows.length,
        pages_scanned: pagesScanned,
        duration_ms: durationMs,
        chunks_created: knowledgeResult.chunksCreated,
        knowledge_source_id: knowledgeResult.knowledgeSourceId,
        knowledge_source_name: knowledgeResult.sourceName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("scan-source-extract error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});