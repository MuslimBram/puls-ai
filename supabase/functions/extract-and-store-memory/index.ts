// extract-and-store-memory/index.ts
// ============================================================
// Thirret pas çdo bisede të mbyllur (ose pas handoff-it).
// Merr historikun e bisedës, kalon te AI, nxjerr memoria,
// i ruan te business_memory me logji upsert + confirm.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceKey } from "../_shared/admin-client.ts";

// ----------------------------------------------------------------
// Tipet
// ----------------------------------------------------------------
interface ExtractMemoryRequest {
  conversation_id: string;
  business_id: string;
  customer_id?: string;
  // Opsionale: mund të dërgosh mesazhet direkt (kursejn një query)
  messages_snapshot?: Array<{ role: "user" | "assistant"; content: string }>;
}

interface ExtractedMemory {
  entity_type:
    | "product" | "service" | "price_point"
    | "business_hour" | "location" | "policy" | "faq_answer"
    | "customer_preference" | "customer_purchase"
    | "customer_complaint" | "customer_interest"
    | "conversation_pattern" | "objection" | "successful_upsell";
  memory_key: string;
  memory_value: Record<string, unknown>;
  confidence: number;         // 0.0–1.0, e vlerësuar nga AI
  is_customer_specific: boolean; // true = lidhet me customer_id
  reasoning: string;          // pse u nxor kjo memorie (debug)
}

interface ExtractionResult {
  memories: ExtractedMemory[];
  summary: string;            // permbledhje e bisedës (1-2 fjali)
  sentiment: "positive" | "neutral" | "negative";
  has_purchase_signal: boolean;
  has_complaint_signal: boolean;
}

// ----------------------------------------------------------------
// Prompt kryesor për AI
// ----------------------------------------------------------------
function buildExtractionPrompt(
  businessContext: string,
  conversationText: string,
  existingMemoryKeys: string[]
): string {
  return `Ti je analizues i bisedave për një biznes. Detyra jote është të nxjerrësh informacion të dobishëm nga kjo bisedë dhe ta kthesh si JSON i strukturuar.

KONTEKSTI I BIZNESIT:
${businessContext}

BISEDA:
${conversationText}

MEMORIA EKZISTUESE (shmang dyfishimin):
${existingMemoryKeys.length > 0 ? existingMemoryKeys.join(", ") : "asnjë akoma"}

DETYRA:
Nxirr çdo informacion të dobishëm nga kjo bisedë. Mendoji këto kategori:
- Produkte/shërbime me çmime që u përmendën
- Orare, politika, informacion praktik i biznesit
- Preferencat e klientit, blerjet, ankesat, interesat
- Pyetje të shpeshta që ky biznes do t'i marrë sërish
- Kundërshtime / arsye refuzimi dhe si u trajtuan
- Sinjale blerjeje ose interesi të fortë

RREGULLA:
1. memory_key duhet të jetë i shkurtër, unik, i lexueshëm (p.sh. "espresso_price", "delivery_policy")
2. confidence: 1.0 = e konfirmuar qartë, 0.5 = e nënkuptuar, 0.3 = e supozuar
3. is_customer_specific: true VETËM nëse lidhet me sjelljen/preferencën e këtij klienti specifik
4. Mos dyfisho memoria ekzistuese — përditëso vetëm nëse vlera ka ndryshuar
5. Prefero saktësi mbi sasi — 3 memoria të mira > 10 të dobëta

Kthe VETËM JSON të vlefshëm pa asnjë tekst jashtë tij:

{
  "memories": [
    {
      "entity_type": "product",
      "memory_key": "espresso_double",
      "memory_value": {"name": "Espresso Doppio", "price_lek": 200, "available": true},
      "confidence": 0.95,
      "is_customer_specific": false,
      "reasoning": "klienti pyeti çmimin dhe operatori konfirmoi"
    }
  ],
  "summary": "Klienti pyeti për menunë e kafeve dhe bëri rezervim për 2 persona të shtunën.",
  "sentiment": "positive",
  "has_purchase_signal": true,
  "has_complaint_signal": false
}`;
}

// ----------------------------------------------------------------
// Handler kryesor
// ----------------------------------------------------------------
serve(async (req: Request): Promise<Response> => {
  // CORS për dashboard-in tonë
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
    return new Response(JSON.stringify({ error: "Metoda e gabuar" }), { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!
  );

  let body: ExtractMemoryRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body i pavlefshëm" }), { status: 400 });
  }

  const { conversation_id, business_id, customer_id, messages_snapshot } = body;
  if (!conversation_id || !business_id) {
    return new Response(
      JSON.stringify({ error: "conversation_id dhe business_id janë të detyrueshëm" }),
      { status: 400 }
    );
  }

  try {
    // ── 1. Merr mesazhet nëse nuk u dërguan direkt ─────────────
    let messages = messages_snapshot;
    if (!messages) {
      const { data: msgs, error: msgErr } = await supabase
        .from("messages")
        .select("role, content, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true });

      if (msgErr) throw new Error(`Mesazhet nuk u morën: ${msgErr.message}`);
      messages = (msgs ?? []).map((m: { role: "user" | "assistant"; content: string }) => ({ role: m.role, content: m.content }));
    }

    if (!messages || messages.length < 2) {
      // Bisedë shumë e shkurtër — nuk ia vlen nxjerrja
      return new Response(
        JSON.stringify({ stored: 0, reason: "bisedë_shumë_e_shkurtër" }),
        { status: 200 }
      );
    }

    // ── 2. Merr kontekstin ekzistues të biznesit ───────────────
    const { data: business } = await supabase
      .from("businesses")
      .select("name, business_type, city")
      .eq("id", business_id)
      .single();

    const businessContext = business
      ? `Emri: ${business.name}, Lloji: ${business.business_type ?? "i panjohur"}, Qyteti: ${business.city ?? "i panjohur"}`
      : "Biznes i panjohur";

    // ── 3. Merr çelësat ekzistues (për të shmangur dyfishimin) ─
    const { data: existingMemories } = await supabase
      .from("business_memory")
      .select("memory_key, entity_type")
      .eq("business_id", business_id)
      .gt("confidence", 0.3);

    const existingKeys = (existingMemories ?? []).map(
      (m: { entity_type: string; memory_key: string }) => `${m.entity_type}:${m.memory_key}`
    );

    // ── 4. Ndërto tekstin e bisedës ───────────────────────────
    const conversationText = messages
      .map((m: { role: string; content: string }) => `${m.role === "user" ? "KLIENTI" : "BIZNESI/AI"}: ${m.content}`)
      .join("\n");

    // ── 5. Thirrje API Claude për nxjerrjen e memories ────────
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: buildExtractionPrompt(businessContext, conversationText, existingKeys),
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API dështoi: ${claudeRes.status} ${errText}`);
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text ?? "";

    // ── 6. Parse i JSON-it nga AI ─────────────────────────────
    let extraction: ExtractionResult;
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      extraction = JSON.parse(cleaned);
    } catch {
      console.error("JSON parse dështoi:", rawText.substring(0, 500));
      return new Response(
        JSON.stringify({ stored: 0, error: "ai_nuk_ktheu_json_te_vlefshëm" }),
        { status: 200 } // 200 jo 500 — dështimi i nxjerrjes nuk duhet të bllokojë bisedën
      );
    }

    // ── 7. Ruaj memoriat me UPSERT ────────────────────────────
    let storedCount = 0;
    let updatedCount = 0;

    for (const mem of extraction.memories ?? []) {
      // Validim bazik
      if (!mem.entity_type || !mem.memory_key || !mem.memory_value) continue;
      if (mem.confidence < 0.3) continue; // injorojë nëse besueshmëria është shumë e ulët

      const record = {
        business_id,
        entity_type: mem.entity_type,
        memory_key: mem.memory_key.toLowerCase().replace(/\s+/g, "_").substring(0, 100),
        memory_value: mem.memory_value,
        confidence: Math.min(1.0, Math.max(0.0, mem.confidence)),
        source: "conversation",
        customer_id: mem.is_customer_specific ? (customer_id ?? null) : null,
        learned_from_conversation_id: conversation_id,
        last_confirmed_at: new Date().toISOString(),
      };

      // UPSERT: nëse ekziston me të njëjtin key, përditëso
      const { data: existing } = await supabase
        .from("business_memory")
        .select("id, confidence, confirmation_count")
        .eq("business_id", business_id)
        .eq("entity_type", mem.entity_type)
        .eq("memory_key", record.memory_key)
        .is("customer_id", record.customer_id)
        .maybeSingle();

      if (existing) {
        // Konfirmo dhe rritet besueshmëria
        const newConfidence = Math.min(
          1.0,
          existing.confidence + 0.10 * mem.confidence
        );
        await supabase
          .from("business_memory")
          .update({
            memory_value: mem.memory_value,
            confidence: newConfidence,
            confirmation_count: (existing.confirmation_count ?? 1) + 1,
            last_confirmed_at: new Date().toISOString(),
            learned_from_conversation_id: conversation_id,
          })
          .eq("id", existing.id);
        updatedCount++;
      } else {
        // Krijon të re
        const { error: insertErr } = await supabase
          .from("business_memory")
          .insert(record);

        if (insertErr) {
          // Konflikti unique constraint = ekziston tashmë (race condition)
          if (!insertErr.message.includes("uq_business_memory_key")) {
            console.error("Insert memory dështoi:", insertErr.message);
          }
        } else {
          storedCount++;
        }
      }
    }

    // ── 8. Ruaj sinjalet e bisedës te conversations ───────────
    await supabase
      .from("conversations")
      .update({
        // Shto kolona te skema nëse nuk ekzistojnë:
        // ai_summary, conversation_sentiment, has_purchase_signal
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation_id);
    // Shënim: kolona ai_summary / sentiment mund të shtohen te skema
    // ekzistuese me ALTER TABLE conversations ADD COLUMN IF NOT EXISTS...

    // ── 9. Kthe rezultatin ────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        stored: storedCount,
        updated: updatedCount,
        total_extracted: extraction.memories?.length ?? 0,
        summary: extraction.summary,
        sentiment: extraction.sentiment,
        has_purchase_signal: extraction.has_purchase_signal,
        has_complaint_signal: extraction.has_complaint_signal,
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
    console.error("extract-and-store-memory error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500 }
    );
  }
});
