// journey-engine/index.ts
// ============================================================
// Dy funksione në një Edge Function:
//
// POST /journey-engine?action=update
//   → Analizon bisedën e fundit dhe përditëson fazën e klientit
//   → Thirret fire-and-forget pas çdo bisede (si memory extraction)
//
// POST /journey-engine?action=enrich
//   → Kthen rregullat e komunikimit për fazën aktuale
//   → Thirret nga ai-customer-agent para çdo përgjigje
//   → Shton udhëzimet e journey-t mbi system prompt e memories
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronAuth } from "../_shared/cron-auth.ts";

// ----------------------------------------------------------------
// Tipet
// ----------------------------------------------------------------
type JourneyPhase =
  | "first_touch" | "exploring" | "considering" | "converting"
  | "onboarding" | "active" | "at_risk" | "dormant" | "champion";

type CommunicationStyle =
  | "welcoming" | "educational" | "consultative" | "closing"
  | "supportive" | "nurturing" | "reengaging" | "appreciative";

type TouchpointType =
  | "inbound_message" | "ai_reply" | "human_reply"
  | "offer_sent" | "offer_accepted" | "offer_rejected"
  | "purchase_made" | "complaint_filed" | "complaint_resolved"
  | "referral_made" | "phase_transition" | "opted_out" | "reengaged";

interface UpdateRequest {
  action: "update";
  business_id: string;
  customer_id: string;
  conversation_id?: string;
  // Konteksti i bisedës së fundit
  last_message_text?: string;
  last_message_role?: "user" | "assistant";
  has_purchase?: boolean;
  has_complaint?: boolean;
  has_referral?: boolean;
  message_count_in_conversation?: number;
  days_since_last_message?: number;
}

interface EnrichRequest {
  action: "enrich";
  business_id: string;
  customer_id: string;
  base_system_prompt: string;  // system prompt nga recall-business-context
  incoming_message: string;
}

interface CommunicationRule {
  phase: JourneyPhase;
  style: CommunicationStyle;
  tone_instruction: string;
  what_to_do: string;
  what_to_avoid: string;
  example_opener: string | null;
  transition_signals: string;
}

// ----------------------------------------------------------------
// Logjika e tranzicionit të fazës (deterministe, jo AI)
// ----------------------------------------------------------------
function determinePhaseTransition(
  currentPhase: JourneyPhase,
  context: {
    daysSinceLastMessage: number;
    messageCountInConversation: number;
    hasPurchase: boolean;
    hasComplaint: boolean;
    hasReferral: boolean;
    purchaseCount: number;
    totalRevenueLek: number;
    churnRisk: number;
    lastMessageText: string;
    lastMessageRole: "user" | "assistant";
  }
): { newPhase: JourneyPhase; trigger: string } | null {

  const msg = context.lastMessageText.toLowerCase();

  // ── Sinjale universale (nga çdo fazë) ──────────────────────

  // Blerje → onboarding (gjithmonë)
  if (context.hasPurchase && currentPhase !== "onboarding" && currentPhase !== "active") {
    return { newPhase: "onboarding", trigger: "purchase_confirmed" };
  }

  // Referim → champion (nga active ose onboarding)
  if (
    context.hasReferral &&
    context.purchaseCount >= 2 &&
    currentPhase !== "champion"
  ) {
    return { newPhase: "champion", trigger: "referral_made_with_history" };
  }

  // Ankesë serioze → at_risk (nga çdo fazë pozitive)
  if (
    context.hasComplaint &&
    ["active", "onboarding", "converting", "champion"].includes(currentPhase)
  ) {
    return { newPhase: "at_risk", trigger: "complaint_filed" };
  }

  // Heshtje e gjatë
  if (context.daysSinceLastMessage >= 30 && currentPhase === "active") {
    return { newPhase: "dormant", trigger: "no_response_30d" };
  }
  if (context.daysSinceLastMessage >= 14 && currentPhase === "active") {
    return { newPhase: "at_risk", trigger: "no_response_14d" };
  }

  // ── Tranzicione specifike sipas fazës ──────────────────────

  switch (currentPhase) {
    case "first_touch": {
      // 2+ mesazhe ose pyetje specifike → exploring
      if (context.messageCountInConversation >= 2 || context.lastMessageRole === "user") {
        return { newPhase: "exploring", trigger: "engagement_started" };
      }
      break;
    }

    case "exploring": {
      // Pyet çmim specifik ose krahason
      const priceSingals = ["sa kushton", "çmim", "euro", "lekë", "a ka", "si funksionon", "detaje"];
      if (priceSingals.some(s => msg.includes(s))) {
        return { newPhase: "considering", trigger: "specific_interest_shown" };
      }
      break;
    }

    case "considering": {
      // Sinjale blerjeje
      const buySingals = ["do ta marr", "po mendoj ta blej", "si mund ta", "si porosit", "sa shpejt", "disponueshëm"];
      if (buySingals.some(s => msg.includes(s))) {
        return { newPhase: "converting", trigger: "purchase_intent_expressed" };
      }
      break;
    }

    case "onboarding": {
      // Konfirmon suksesin → active
      const okSignals = ["faleminderit", "mirë", "funksionon", "e mora", "shumë mirë", "ok", "perfekt"];
      if (okSignals.some(s => msg.includes(s)) && context.lastMessageRole === "user") {
        return { newPhase: "active", trigger: "onboarding_confirmed_success" };
      }
      // Ose pas 48 orësh pa ankesë → active automatikisht
      if (context.daysSinceLastMessage >= 2 && !context.hasComplaint) {
        return { newPhase: "active", trigger: "onboarding_period_passed" };
      }
      break;
    }

    case "at_risk": {
      // U kthye → active
      if (context.lastMessageRole === "user" && context.daysSinceLastMessage <= 3) {
        return { newPhase: "active", trigger: "customer_reengaged" };
      }
      break;
    }

    case "dormant": {
      // Çdo mesazh hyrës → converting (jo active — kanë nevojë për ofertë)
      if (context.lastMessageRole === "user") {
        return { newPhase: "converting", trigger: "reengaged_after_dormancy" };
      }
      break;
    }

    case "active": {
      // LTV të lartë + purchase_count të lartë → champion
      if (context.purchaseCount >= 5 || context.totalRevenueLek >= 80000) {
        return { newPhase: "champion", trigger: "champion_threshold_reached" };
      }
      break;
    }

    default:
      break;
  }

  return null; // asnjë tranzicion — mbetet në fazën aktuale
}

// ----------------------------------------------------------------
// Ndërtimi i shtesës në system prompt (nga journey)
// ----------------------------------------------------------------
function buildJourneyPromptAddition(
  phase: JourneyPhase,
  style: CommunicationStyle,
  rule: CommunicationRule,
  customerName: string | null,
  purchaseCount: number,
  daysInPhase: number
): string {
  const name = customerName ? customerName.split(" ")[0] : null;
  const nameRef = name ? ` (${name})` : "";

  const parts: string[] = [];

  parts.push(`\n--- UDHËZIME TË UDHËTIMIT TË KLIENTIT${nameRef} ---`);
  parts.push(`Faza aktuale: ${phase.toUpperCase().replace("_", " ")} | Stili: ${style}`);
  parts.push(`Ditë në këtë fazë: ${daysInPhase} | Blerje totale: ${purchaseCount}`);

  parts.push(`\nTONI: ${rule.tone_instruction}`);
  parts.push(`BËJE: ${rule.what_to_do}`);
  parts.push(`SHMANGE: ${rule.what_to_avoid}`);

  if (rule.example_opener) {
    parts.push(`SHEMBULL HAPJEJE: "${rule.example_opener}"`);
  }

  // Udhëzime shtesë sipas fazës
  if (phase === "champion") {
    parts.push("KUJDES: Ky klient është VIP. Trajtoje si partner, jo si klient të zakonshëm.");
  } else if (phase === "at_risk") {
    parts.push("KUJDES: Mos dërgo asnjë ofertë komerciale. Fokusi është te kuptimi i problemit.");
  } else if (phase === "converting") {
    parts.push("KUJDES: Ky klient është gati të blejë. Bëje të lehtë veprimin — hap konkret, jo shpjegime.");
  } else if (phase === "first_touch") {
    parts.push("KUJDES: Nuk di asgjë për këtë klient. Filloji nga zero, mirëpritje e sinqertë.");
  }

  parts.push("--- FUND I UDHËZIMEVE TË UDHËTIMIT ---");

  return parts.join("\n");
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

  let body: UpdateRequest | EnrichRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body i pavlefshëm" }), { status: 400 });
  }

  const { business_id, customer_id } = body;
  if (!business_id || !customer_id) {
    return new Response(
      JSON.stringify({ error: "business_id dhe customer_id janë të detyrueshëm" }),
      { status: 400 }
    );
  }

  // ── RRUGA 1: UPDATE (pas bisedës) ───────────────────────────
  if (body.action === "update") {
    const req_body = body as UpdateRequest;

    try {
      // 1. Gjej ose krijo profilin e journey-t
      let { data: journey } = await supabase
        .from("customer_journey")
        .select("*")
        .eq("business_id", business_id)
        .eq("customer_id", customer_id)
        .maybeSingle();

      const isNewCustomer = !journey;

      if (!journey) {
        const { data: newJourney } = await supabase
          .from("customer_journey")
          .insert({
            business_id,
            customer_id,
            current_phase: "first_touch",
            communication_style: "welcoming",
          })
          .select()
          .single();
        journey = newJourney;
      }

      if (!journey) throw new Error("Journey nuk u krijua");

      // 2. Merr të dhënat e revenue profile (purchase_count, etc.)
      const { data: revProfile } = await supabase
        .from("customer_revenue_profile")
        .select("purchase_count, total_revenue_lek, churn_risk_score")
        .eq("business_id", business_id)
        .eq("customer_id", customer_id)
        .maybeSingle();

      const context = {
        daysSinceLastMessage: req_body.days_since_last_message ?? 0,
        messageCountInConversation: req_body.message_count_in_conversation ?? 1,
        hasPurchase: req_body.has_purchase ?? false,
        hasComplaint: req_body.has_complaint ?? false,
        hasReferral: req_body.has_referral ?? false,
        purchaseCount: revProfile?.purchase_count ?? 0,
        totalRevenueLek: revProfile?.total_revenue_lek ?? 0,
        churnRisk: revProfile?.churn_risk_score ?? 0,
        lastMessageText: req_body.last_message_text ?? "",
        lastMessageRole: req_body.last_message_role ?? "user",
      };

      // 3. Vendos nëse ka tranzicion
      const transition = determinePhaseTransition(
        journey.current_phase as JourneyPhase,
        context
      );

      // 4. Cakto stilin e komunikimit sipas fazës
      const phaseToStyle: Record<JourneyPhase, CommunicationStyle> = {
        first_touch: "welcoming",
        exploring: "educational",
        considering: "consultative",
        converting: "closing",
        onboarding: "supportive",
        active: "nurturing",
        at_risk: "reengaging",
        dormant: "reengaging",
        champion: "appreciative",
      };

      const targetPhase = transition ? transition.newPhase : (journey.current_phase as JourneyPhase);
      const targetStyle = phaseToStyle[targetPhase];
      const daysInPhase = transition ? 0 : journey.days_in_current_phase + 1;

      // 5. Përditëso journey-n
      await supabase
        .from("customer_journey")
        .update({
          current_phase: targetPhase,
          communication_style: targetStyle,
          days_in_current_phase: daysInPhase,
          total_touchpoints: (journey.total_touchpoints ?? 0) + 1,
          phase_trigger: transition?.trigger ?? journey.phase_trigger,
          phase_started_at: transition ? new Date().toISOString() : journey.phase_started_at,
        })
        .eq("business_id", business_id)
        .eq("customer_id", customer_id);

      // 6. Log tranzicionin nëse ndodhi
      if (transition) {
        await supabase.from("journey_transitions").insert({
          business_id,
          customer_id,
          from_phase: journey.current_phase,
          to_phase: transition.newPhase,
          trigger_type: "phase_transition" as TouchpointType,
          trigger_details: transition.trigger,
          conversation_id: req_body.conversation_id ?? null,
        });
      }

      // 7. Log touchpoint
      await supabase.from("journey_touchpoints").insert({
        business_id,
        customer_id,
        touchpoint_type: (context.lastMessageRole === "user" ? "inbound_message" : "ai_reply") as TouchpointType,
        conversation_id: req_body.conversation_id ?? null,
        occurred_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({
          success: true,
          is_new_customer: isNewCustomer,
          previous_phase: journey.current_phase,
          current_phase: targetPhase,
          communication_style: targetStyle,
          phase_changed: !!transition,
          transition_trigger: transition?.trigger ?? null,
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
      const msg = err instanceof Error ? err.message : String(err);
      console.error("journey-engine update error:", msg);
      return new Response(JSON.stringify({ success: false, error: msg }), { status: 500 });
    }
  }

  // ── RRUGA 2: ENRICH (para përgjigjes AI) ────────────────────
  if (body.action === "enrich") {
    const req_body = body as EnrichRequest;

    try {
      // 1. Merr profilin e journey-t
      const { data: journey } = await supabase
        .from("customer_journey")
        .select(`
          current_phase, communication_style, days_in_current_phase,
          satisfaction_score, response_rate
        `)
        .eq("business_id", business_id)
        .eq("customer_id", customer_id)
        .maybeSingle();

      // Nëse nuk ka journey akoma → klient i ri, stil "welcoming"
      const currentPhase: JourneyPhase = (journey?.current_phase as JourneyPhase) ?? "first_touch";
      const currentStyle: CommunicationStyle = (journey?.communication_style as CommunicationStyle) ?? "welcoming";
      const daysInPhase = journey?.days_in_current_phase ?? 0;

      // 2. Merr rregullën e komunikimit për këtë fazë
      const { data: rule } = await supabase
        .from("journey_communication_rules")
        .select("*")
        .eq("phase", currentPhase)
        .eq("active", true)
        .maybeSingle();

      // 3. Merr info klienti
      const { data: customer } = await supabase
        .from("customers")
        .select("name, display_name")
        .eq("id", customer_id)
        .maybeSingle();

      const customerName = customer?.display_name ?? customer?.name ?? null;

      // 4. Merr purchase count
      const { data: revProfile } = await supabase
        .from("customer_revenue_profile")
        .select("purchase_count")
        .eq("business_id", business_id)
        .eq("customer_id", customer_id)
        .maybeSingle();

      const purchaseCount = revProfile?.purchase_count ?? 0;

      // 5. Ndërto shtesën e journey-t
      let journeyAddition = "";
      if (rule) {
        journeyAddition = buildJourneyPromptAddition(
          currentPhase,
          currentStyle,
          rule as CommunicationRule,
          customerName,
          purchaseCount,
          daysInPhase
        );
      } else {
        // Fallback nëse nuk ka rregull (nuk duhet të ndodhë)
        journeyAddition = "\nKomuniko me ton miqësor dhe të ndihmës.";
      }

      // 6. Bashko me base system prompt
      const enrichedPrompt = req_body.base_system_prompt + journeyAddition;

      return new Response(
        JSON.stringify({
          enriched_system_prompt: enrichedPrompt,
          current_phase: currentPhase,
          communication_style: currentStyle,
          days_in_phase: daysInPhase,
          has_journey_data: !!journey,
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
      const msg = err instanceof Error ? err.message : String(err);
      console.error("journey-engine enrich error:", msg);
      // Dështimi i enrich-it NUK duhet të bllokojë përgjigjen
      // Kthejm base prompt të pandryshuar
      return new Response(
        JSON.stringify({
          enriched_system_prompt: (body as EnrichRequest).base_system_prompt,
          current_phase: "first_touch",
          communication_style: "welcoming",
          has_journey_data: false,
          error: msg,
        }),
        { status: 200 }  // 200 me qëllim — agent vazhdon me base prompt
      );
    }
  }

  return new Response(JSON.stringify({ error: "action duhet të jetë 'update' ose 'enrich'" }), { status: 400 });
});
