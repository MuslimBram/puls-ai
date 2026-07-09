// recall-business-context/index.ts
// ============================================================
// Thirret nga ai-customer-agent PARA se të gjenerojë përgjigjen.
// Kthen kontekstin e plotë të memories për të ndërtuar
// system prompt të pasuruar me njohuri reale të biznesit.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface RecallRequest {
  business_id: string;
  customer_id?: string;
  incoming_message: string; // mesazhi i ri i klientit
  min_confidence?: number;  // default: 0.4
}

interface MemoryContext {
  // Çfarë shet biznesi
  products: Array<{ name: string; price?: unknown; available?: boolean; key: string }>;
  services: Array<{ name: string; key: string; details: unknown }>;

  // Si funksionon biznesi
  hours?: unknown;
  location?: unknown;
  policies: Array<{ key: string; details: unknown }>;
  faqs: Array<{ question?: string; answer?: string; key: string }>;

  // Ky klient specifik
  customer_profile?: {
    preferences: unknown[];
    purchases: unknown[];
    complaints: unknown[];
    interests: unknown[];
  };

  // Logjika e bisedave
  known_objections: Array<{ trigger?: string; response?: string; key: string }>;
  successful_upsells: Array<{ key: string; details: unknown }>;

  // Meta
  total_memories: number;
  avg_confidence: number;
  relevant_to_query: string[]; // çelësat relevantë për mesazhin aktual
}

// ----------------------------------------------------------------
// Ndërto system prompt të pasuruar me memorie
// ----------------------------------------------------------------
function buildEnrichedSystemPrompt(
  businessName: string,
  memory: MemoryContext,
  customerName: string | null
): string {
  const parts: string[] = [];

  parts.push(`Ti je asistenti AI i biznesit "${businessName}".`);
  parts.push("Komunikoni me ton profesional por miqësor, në shqip.");

  // Produktet & çmimet
  if (memory.products.length > 0) {
    const productLines = memory.products
      .map((p) => {
        const price = p.price ? ` — ${p.price} Lekë` : "";
        const avail = p.available === false ? " (pa disponueshëm)" : "";
        return `  • ${p.name}${price}${avail}`;
      })
      .join("\n");
    parts.push(`\nPRODUKTET/MENUJA:\n${productLines}`);
  }

  // Shërbimet
  if (memory.services.length > 0) {
    const serviceLines = memory.services
      .map((s) => `  • ${s.name}`)
      .join("\n");
    parts.push(`\nSHËRBIMET:\n${serviceLines}`);
  }

  // Oraret
  if (memory.hours) {
    const h = memory.hours as Record<string, string>;
    const hourLines = Object.entries(h)
      .map(([day, time]) => `  ${day}: ${time}`)
      .join("\n");
    parts.push(`\nORARET:\n${hourLines}`);
  }

  // Vendndodhja
  if (memory.location) {
    parts.push(`\nVENDNDODHJA: ${JSON.stringify(memory.location)}`);
  }

  // Politikat
  if (memory.policies.length > 0) {
    const policyLines = memory.policies
      .map((p) => `  • ${p.key}: ${JSON.stringify(p.details)}`)
      .join("\n");
    parts.push(`\nPOLITIKAT:\n${policyLines}`);
  }

  // FAQ
  if (memory.faqs.length > 0) {
    const faqLines = memory.faqs
      .map((f) => `  P: ${f.question ?? f.key}\n  P: ${f.answer ?? "shih info"}`)
      .join("\n");
    parts.push(`\nPYETJE TË SHPESHTA:\n${faqLines}`);
  }

  // Profili i klientit (nëse ka)
  if (memory.customer_profile && customerName) {
    const cp = memory.customer_profile;
    const profileParts: string[] = [`\nKY KLIENT (${customerName}):`];

    if (cp.preferences.length > 0) {
      profileParts.push(`  Preferencat: ${JSON.stringify(cp.preferences)}`);
    }
    if (cp.purchases.length > 0) {
      profileParts.push(`  Ka blerë më parë: ${cp.purchases.length} herë`);
    }
    if (cp.complaints.length > 0) {
      profileParts.push(`  KUJDES: ka pasur ${cp.complaints.length} ankesë më parë`);
    }
    if (cp.interests.length > 0) {
      profileParts.push(`  Ka treguar interes për: ${JSON.stringify(cp.interests)}`);
    }
    parts.push(profileParts.join("\n"));
  }

  // Kundërshtimet e njohura
  if (memory.known_objections.length > 0) {
    const objLines = memory.known_objections
      .map((o) => `  Nëse thotë "${o.trigger}" → "${o.response}"`)
      .join("\n");
    parts.push(`\nSI TI TRAJTOSH KUNDËRSHTIMET:\n${objLines}`);
  }

  // Rregulla finale
  parts.push(`\nRREGULLA:
  1. Përgjigjju VETËM me info nga konteksti i mësipërm — mos shpik çmime apo orare
  2. Nëse nuk e di diçka, thuaj "do të kontrolloj dhe të njoftoj" — mos gënje
  3. Nëse klienti tregon interes blerjeje, ofroji hap konkret (rezervim / porosi)
  4. Nëse klienti ka ankesë, shpreh keqardhje sinqerisht para se të shpjegosh`);

  return parts.join("\n");
}

// ----------------------------------------------------------------
// Gji memories relevante për mesazhin aktual
// ----------------------------------------------------------------
function findRelevantKeys(
  incomingMessage: string,
  allMemories: Array<{ memory_key: string; memory_value: unknown }>
): string[] {
  const msgLower = incomingMessage.toLowerCase();
  const relevant: string[] = [];

  // Fjalë kyçe të zakonshme dhe çfarë memories lidhen
  const triggers: Array<{ words: string[]; types: string[] }> = [
    { words: ["çmim", "kushton", "sa", "tarif", "euro", "lek"], types: ["product", "price_point", "service"] },
    { words: ["orë", "hap", "mbyll", "kur", "ora"], types: ["business_hour"] },
    { words: ["ku", "adres", "lokacion", "vend"], types: ["location"] },
    { words: ["anulim", "kthim", "rimburs", "garanci"], types: ["policy"] },
    { words: ["wifi", "parking", "kartel", "cash"], types: ["faq_answer"] },
    { words: ["rezerv", "book", "takim", "appointment"], types: ["faq_answer", "policy"] },
  ];

  for (const trigger of triggers) {
    if (trigger.words.some((w) => msgLower.includes(w))) {
      for (const mem of allMemories) {
        if (trigger.types.some((t) => mem.memory_key.includes(t))) {
          relevant.push(mem.memory_key);
        }
      }
    }
  }

  return [...new Set(relevant)];
}

// ----------------------------------------------------------------
// Handler kryesor
// ----------------------------------------------------------------
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: RecallRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body i pavlefshëm" }), { status: 400 });
  }

  const { business_id, customer_id, incoming_message, min_confidence = 0.4 } = body;

  if (!business_id || !incoming_message) {
    return new Response(
      JSON.stringify({ error: "business_id dhe incoming_message janë të detyrueshëm" }),
      { status: 400 }
    );
  }

  try {
    // ── 1. Merr të gjitha memoriat e biznesit (confidence > threshold) ──
    const { data: memories, error: memErr } = await supabase
      .from("business_memory")
      .select("entity_type, memory_key, memory_value, confidence, customer_id")
      .eq("business_id", business_id)
      .gte("confidence", min_confidence)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("confidence", { ascending: false })
      .limit(150); // limit për të mos tejkaluar context window

    if (memErr) throw new Error(`Memoria nuk u mor: ${memErr.message}`);

    // ── 2. Info të biznesit ──────────────────────────────────
    const { data: business } = await supabase
      .from("businesses")
      .select("name, business_type, city")
      .eq("id", business_id)
      .single();

    // ── 3. Info e klientit (nëse ka) ────────────────────────
    let customerName: string | null = null;
    if (customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select("name, display_name")
        .eq("id", customer_id)
        .single();
      customerName = customer?.display_name ?? customer?.name ?? null;
    }

    // ── 4. Organizo memoriat sipas tipit ────────────────────
    interface MemoryRow {
      entity_type: string;
      memory_key: string;
      memory_value: Record<string, unknown>;
      confidence: number;
      customer_id: string | null;
    }
    const allMems: MemoryRow[] = (memories ?? []) as MemoryRow[];
    const globalMems = allMems.filter((m: MemoryRow) => m.customer_id === null);
    const customerMems = customer_id
      ? allMems.filter((m: MemoryRow) => m.customer_id === customer_id)
      : [];

    const context: MemoryContext = {
      products: globalMems
        .filter((m) => m.entity_type === "product")
        .map((m) => ({
          key: m.memory_key,
          name: (m.memory_value as Record<string,unknown>)?.name as string ?? m.memory_key,
          price: (m.memory_value as Record<string,unknown>)?.price_lek,
          available: (m.memory_value as Record<string,unknown>)?.available as boolean,
        })),

      services: globalMems
        .filter((m) => m.entity_type === "service")
        .map((m) => ({ key: m.memory_key, name: m.memory_key, details: m.memory_value })),

      hours: globalMems.find((m) => m.entity_type === "business_hour")?.memory_value,
      location: globalMems.find((m) => m.entity_type === "location")?.memory_value,

      policies: globalMems
        .filter((m) => m.entity_type === "policy")
        .map((m) => ({ key: m.memory_key, details: m.memory_value })),

      faqs: globalMems
        .filter((m) => m.entity_type === "faq_answer")
        .map((m) => ({
          key: m.memory_key,
          question: (m.memory_value as Record<string,unknown>)?.question as string,
          answer: (m.memory_value as Record<string,unknown>)?.answer as string,
        })),

      customer_profile:
        customerMems.length > 0
          ? {
              preferences: customerMems
                .filter((m) => m.entity_type === "customer_preference")
                .map((m) => m.memory_value),
              purchases: customerMems
                .filter((m) => m.entity_type === "customer_purchase")
                .map((m) => m.memory_value),
              complaints: customerMems
                .filter((m) => m.entity_type === "customer_complaint")
                .map((m) => m.memory_value),
              interests: customerMems
                .filter((m) => m.entity_type === "customer_interest")
                .map((m) => m.memory_value),
            }
          : undefined,

      known_objections: globalMems
        .filter((m) => m.entity_type === "objection")
        .map((m) => ({
          key: m.memory_key,
          trigger: (m.memory_value as Record<string,unknown>)?.trigger as string,
          response: (m.memory_value as Record<string,unknown>)?.response_that_works as string,
        })),

      successful_upsells: globalMems
        .filter((m) => m.entity_type === "successful_upsell")
        .map((m) => ({ key: m.memory_key, details: m.memory_value })),

      total_memories: allMems.length,
      avg_confidence:
        allMems.length > 0
          ? allMems.reduce((s, m) => s + m.confidence, 0) / allMems.length
          : 0,

      relevant_to_query: findRelevantKeys(incoming_message, globalMems),
    };

    // ── 5. Ndërto system prompt të pasuruar ─────────────────
    const businessName = business?.name ?? "Biznesi";
    const enrichedSystemPrompt = buildEnrichedSystemPrompt(
      businessName,
      context,
      customerName
    );

    return new Response(
      JSON.stringify({
        system_prompt: enrichedSystemPrompt,
        memory_context: context,
        business_name: businessName,
        customer_name: customerName,
        has_memory: allMems.length > 0,
        memory_quality: context.avg_confidence > 0.7 ? "e lartë" : context.avg_confidence > 0.4 ? "mesatare" : "e ulët",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("recall-business-context error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500 }
    );
  }
});
