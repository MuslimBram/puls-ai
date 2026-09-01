import { getServiceKey } from "./admin-client.ts";

export type CrawlPage = {
  markdown?: string;
  links?: string[];
  metadata?: Record<string, unknown>;
};

export type SecurityDecision = {
  category: string;
  risk_score: number;
  action: "allow" | "tag" | "quarantine" | "reject";
  reason_code: string;
};

export type SafePage = {
  url: string;
  title: string;
  markdown: string;
  links: string[];
  metadata: Record<string, unknown>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeScanUrl(value: string): string {
  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Unsupported scan URL scheme");
  parsed.hash = "";
  return parsed.toString();
}

export function getCrawlPageUrl(page: CrawlPage, fallback: string): string {
  const metadata = page.metadata ?? {};
  const candidate = metadata.url ?? metadata.sourceURL ?? metadata.sourceUrl ?? metadata.canonicalUrl ?? fallback;
  return typeof candidate === "string" ? normalizeScanUrl(candidate) : fallback;
}

export function getCrawlPageTitle(page: CrawlPage): string {
  const metadata = page.metadata ?? {};
  for (const key of ["title", "ogTitle", "pageTitle"]) {
    if (typeof metadata[key] === "string" && String(metadata[key]).trim()) return String(metadata[key]).trim();
  }
  return "";
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function lightweightExtract(markdown: string) {
  const contacts: Array<{ type: string; value: string }> = [];
  const socialLinks: Record<string, string[]> = {};

  const emails = [...new Set(markdown.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])];
  emails.forEach((value) => contacts.push({ type: "email", value }));

  const phones = [...new Set(markdown.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g) || [])]
    .filter((value) => value.replace(/\D/g, "").length >= 7);
  phones.forEach((value) => contacts.push({ type: "phone", value }));

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

  const ctas = [...new Set(markdown.match(/(?:Get Started|Contact Us|Request a Demo|Free Trial|Sign Up|Learn More|Book Now|Schedule|Get a Quote|Try Free|Buy Now|Order Now|Shop Now|Subscribe)/gi) || [])];
  const pricingSignals: string[] = [];
  const lower = markdown.toLowerCase();
  for (const keyword of ["price", "pricing", "cost", "$", "€", "per month", "/mo", "free plan", "premium", "enterprise"]) {
    if (lower.includes(keyword)) pricingSignals.push(keyword);
  }

  return { contacts, socialLinks, ctas, pricingSignals };
}

export function extractMedia(markdown: string, sourceUrl: string) {
  const media: Array<{ url: string; media_type: string; alt_text?: string; source_url: string }> = [];
  const seen = new Set<string>();

  for (const match of markdown.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/gi)) {
    const url = match[2];
    if (seen.has(url)) continue;
    seen.add(url);
    media.push({ url, media_type: "image", alt_text: match[1] || undefined, source_url: sourceUrl });
    if (media.length >= 100) break;
  }

  for (const url of markdown.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|vimeo\.com|tiktok\.com)\/[^\s)"\]]+/gi) || []) {
    if (seen.has(url)) continue;
    seen.add(url);
    media.push({ url, media_type: "video", source_url: sourceUrl });
    if (media.length >= 120) break;
  }

  return media;
}

export function buildEvidenceInput(pages: SafePage[]): string {
  const maxTotal = 48_000;
  let output = "";
  for (const page of pages) {
    const block = [`--- PAGE URL: ${page.url}`, `TITLE: ${page.title}`, page.markdown.slice(0, 8_000), ""].join("\n");
    if (output.length + block.length > maxTotal) break;
    output += block;
  }
  return output;
}

export async function crawlWebsiteDeep(apiKey: string, rootUrl: string, limit: number): Promise<CrawlPage[]> {
  const startResponse = await fetch("https://api.firecrawl.dev/v2/crawl", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: rootUrl,
      limit,
      crawlEntireDomain: true,
      allowExternalLinks: false,
      allowSubdomains: false,
      sitemap: "include",
      ignoreQueryParameters: true,
      deduplicateSimilarURLs: true,
      scrapeOptions: { formats: ["markdown", "links"], onlyMainContent: false },
    }),
  });

  const started = await startResponse.json().catch(() => ({}));
  if (!startResponse.ok) {
    if (startResponse.status === 402) throw new Error("Firecrawl credits insufficient for configured deep-scan page limit");
    throw new Error(typeof started?.error === "string" ? started.error : "Website crawl failed to start");
  }

  if (started?.status === "completed" && Array.isArray(started?.data)) return started.data.slice(0, limit) as CrawlPage[];

  const crawlId = started?.id ?? started?.data?.id;
  if (typeof crawlId !== "string" || !crawlId) throw new Error("Firecrawl crawl id missing");

  const timeoutMs = clampInt(Deno.env.get("BUSINESS_SCAN_CRAWL_TIMEOUT_MS"), 70_000, 10_000, 120_000);
  const deadline = Date.now() + timeoutMs;
  let latestPages: CrawlPage[] = [];

  while (Date.now() < deadline) {
    await sleep(2_000);
    const statusResponse = await fetch(`https://api.firecrawl.dev/v2/crawl/${encodeURIComponent(crawlId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const status = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) throw new Error(typeof status?.error === "string" ? status.error : "Website crawl status failed");

    if (Array.isArray(status?.data)) latestPages = status.data.slice(0, limit) as CrawlPage[];
    if (status?.status === "completed") return latestPages;
    if (status?.status === "failed" || status?.status === "cancelled") throw new Error(`Website crawl ${String(status.status)}`);
  }

  throw new Error("Website crawl timed out before completion");
}

export async function runKnowledgeFirewall(
  workspaceId: string,
  scanHistoryId: string,
  url: string,
  content: string,
  links: string[],
): Promise<SecurityDecision> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = getServiceKey() ?? "";
  const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "";
  if (!supabaseUrl || !serviceKey || !internalSecret) {
    return { category: "unknown", risk_score: 100, action: "quarantine", reason_code: "KNOWLEDGE_FIREWALL_NOT_CONFIGURED" };
  }

  const eventId = `website-scan:${scanHistoryId}:${(await sha256Hex(url)).slice(0, 24)}`.slice(0, 200);
  const response = await fetch(`${supabaseUrl}/functions/v1/content-security-firewall`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: serviceKey, "x-internal-secret": internalSecret },
    body: JSON.stringify({
      workspace_id: workspaceId,
      source: "website_scan",
      event_id: eventId,
      content: content.slice(0, 100_000),
      urls: links.filter((item) => typeof item === "string").slice(0, 50),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.decision) {
    return { category: "unknown", risk_score: 100, action: "quarantine", reason_code: "KNOWLEDGE_FIREWALL_UNAVAILABLE" };
  }

  const decision = payload.decision as Record<string, unknown>;
  const action = String(decision.action ?? "");
  if (!["allow", "tag", "quarantine", "reject"].includes(action)) {
    return { category: "unknown", risk_score: 100, action: "quarantine", reason_code: "KNOWLEDGE_FIREWALL_INVALID_DECISION" };
  }

  return {
    category: typeof decision.category === "string" ? decision.category : "unknown",
    risk_score: Number.isFinite(Number(decision.risk_score)) ? Number(decision.risk_score) : 100,
    action: action as SecurityDecision["action"],
    reason_code: typeof decision.reason_code === "string" ? decision.reason_code : "UNKNOWN",
  };
}
