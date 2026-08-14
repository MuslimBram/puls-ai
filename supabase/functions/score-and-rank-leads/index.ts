// score-and-rank-leads/index.ts
// ============================================================
// Thirret:
//   a) Pas çdo bisede (nga ai-customer-agent, fire-and-forget)
//   b) Nga cron job çdo orë (për të kapur inaktivitetin)
//   c) Manualisht nga dashboard-i i stafit
//
// Bën:
//   1. Zbulimi i sinjaleve nga mesazhet + memoria
//   2. Llogaritja e lead_score
//   3. Parashikimi i churn_risk
//   4. Rekomandimi i aksionit konkret
//   5. Ruajtja te customer_revenue_profile + revenue_signals
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronAuth } from "../_shared/cron-auth.ts";

// ----------------------------------------------------------------
// Tipet
// ----------------------------------------------------------------
type SignalType =
  | "price_inquiry" | "availability_check" | "urgency_expressed"
  | "comparison_shopping" | "multiple_item_interest" | "return_visitor"
  | "purchased_base_tier" | "high_engagement" | "referred_others"
  | "no_response_7d" | "no_response_30d" | "complaint_unresolved"
  | "price_objection" | "competitor_mention"
  | "expressed_satisfaction" | "asked_about_referral" | "high_ltv_customer";

type LeadStage =
  | "stranger" | "aware" | "interested" | "evaluating"
  | "ready_to_buy" | "customer" | "loyal" | "churned";

type RevenueAction =
  | "send_upsell_offer" | "send_loyalty_reward" | "schedule_followup"
  | "send_winback_offer" | "request_referral" | "flag_for_human" | "do_nothing";

interface ScoreRequest {
  business_id: string;
  customer_id?: string;   // null = skoro TË GJITHË klientët e biznesit
  conversation_id?: string; // nëse thirret pas bisede specifike
  trigger?: "post_conversation" | "cron" | "manual";
}

interface CustomerData {
  id: string;
  name: string | null;
  opted_out_of_offers: boolean;
  created_at: string;
}

interface MessageData {
  id: string;
  content: string;
  role: string;
  created_at: string;
  conversation_id: string;
}

// ----------------------------------------------------------------
// Detektimi i sinjaleve nga teksti i mesazheve
// ----------------------------------------------------------------
const SIGNAL_PATTERNS: Record<SignalType, string[]> = {
  price_inquiry: [
    "sa kushton", "sa është", "çmim", "tarif", "euro", "lekë", "lek",
    "how much", "price", "cost"
  ],
  availability_check: [
    "a keni", "a mundeni", "a është i disponueshëm", "keni akoma",
    "do you have", "available", "in stock"
  ],
  urgency_expressed: [
    "sot", "tani", "urgjent", "sa shpejt", "menjëherë", "nesër",
    "today", "urgent", "asap", "right now", "immediately"
  ],
  comparison_shopping: [
    "vs", "krahasuar me", "më lirë se", "a është mirë", "ju apo",
    "compared to", "better than", "versus", "or"
  ],
  multiple_item_interest: [], // detektohet nga numri i produkteve të pyetura
  return_visitor: [],         // detektohet nga timestamps
  purchased_base_tier: [],    // detektohet nga purchase history
  high_engagement: [],        // detektohet nga numri i mesazheve
  referred_others: [],        // detektohet nga partner_referrals
  no_response_7d: [],         // detektohet nga timestamps
  no_response_30d: [],        // detektohet nga timestamps
  complaint_unresolved: [
    "problem", "gabim", "nuk funksionon", "i pakënaqur", "jo mirë",
    "issue", "broken", "not working", "unhappy", "disappointed"
  ],
  price_objection: [
    "shumë shtrenjtë", "i shtrenjtë", "nuk e kam buxhetin",
    "too expensive", "too much", "can't afford", "budget"
  ],
  competitor_mention: [
    "vs", "konkurrent", "tjetri", "alternativ",
    "competitor", "alternative", "instead of"
  ],
  expressed_satisfaction: [
    "faleminderit", "shumë mirë", "i kënaqur", "excellent", "perfect",
    "thank you", "great", "amazing", "love it", "wonderful", "5 yje"
  ],
  asked_about_referral: [
    "referim", "rekomandim", "shokëve", "familjes",
    "referral", "recommend", "friends", "share"
  ],
  high_ltv_customer: [], // detektohet nga total_revenue
};

function detectSignalsFromText(
  messages: MessageData[],
  productCount: number
): Array<{ signal: SignalType; strength: number; excerpt: string; messageId: string }> {
  const detected: Array<{ signal: SignalType; strength: number; excerpt: string; messageId: string }> = [];

  // Vetëm mesazhet e klientit
  const userMessages = messages.filter((m) => m.role === "user");

  for (const msg of userMessages) {
    const lowerContent = msg.content.toLowerCase();

    for (const [signalKey, patterns] of Object.entries(SIGNAL_PATTERNS)) {
      if (patterns.length === 0) continue; // sinjalet e timestamp-based kalojnë

      const matchCount = patterns.filter((p) => lowerContent.includes(p)).length;
      if (matchCount === 0) continue;

      const strength = Math.min(1.0, 0.5 + matchCount * 0.25);
      const excerpt = msg.content.substring(0, 150);

      detected.push({
        signal: signalKey as SignalType,
        strength,
        excerpt,
        messageId: msg.id,
      });
    }
  }

  // Sinjal produktesh të shumta (nëse pyeti 2+ produkte)
  if (productCount >= 2) {
    const lastMsg = userMessages[userMessages.length - 1];
    if (lastMsg) {
      detected.push({
        signal: "multiple_item_interest",
        strength: Math.min(1.0, 0.5 + productCount * 0.1),
        excerpt: `Pyeti për ${productCount} produkte`,
        messageId: lastMsg.id,
      });
    }
  }

  return detected;
}

// ----------------------------------------------------------------
// Llogaritja e churn risk
// ----------------------------------------------------------------
function calculateChurnRisk(
  daysSinceLastMessage: number,
  purchaseCount: number,
  hasUnresolvedComplaint: boolean,
  hasPriceObjection: boolean,
  hasMentionedCompetitor: boolean
): number {
  let risk = 0.0;

  // Inaktiviteti është sinjali #1 i churn
  if (daysSinceLastMessage > 60)      risk += 0.50;
  else if (daysSinceLastMessage > 30) risk += 0.35;
  else if (daysSinceLastMessage > 14) risk += 0.20;
  else if (daysSinceLastMessage > 7)  risk += 0.10;

  // Ankesë e pa-zgjidhur
  if (hasUnresolvedComplaint) risk += 0.25;

  // Kundërshtime çmimi + konkurrentë
  if (hasPriceObjection)      risk += 0.15;
  if (hasMentionedCompetitor) risk += 0.20;

  // Klientët me histori blerjeje kanë churn risk më të ulët
  if (purchaseCount >= 3)  risk -= 0.15;
  else if (purchaseCount >= 1) risk -= 0.07;

  return Math.min(1.0, Math.max(0.0, risk));
}

// ----------------------------------------------------------------
// Vendim-marrja: çfarë aksioni rekomandohet
// ----------------------------------------------------------------
function decideAction(
  leadScore: number,
  churnRisk: number,
  leadStage: LeadStage,
  activeSignals: SignalType[],
  purchaseCount: number,
  totalRevenueLek: number
): { action: RevenueAction; reason: string; priority: number } {

  // 1. Churn i lartë — rikthimi është prioriteti
  if (churnRisk > 0.6 && purchaseCount > 0) {
    return {
      action: "send_winback_offer",
      reason: `Churn risk ${Math.round(churnRisk * 100)}% — klient që ka blerë por nuk komunikon`,
      priority: 9,
    };
  }

  // 2. Ankesë e pa-zgjidhur — njeriu duhet ndërhyjë
  if (activeSignals.includes("complaint_unresolved")) {
    return {
      action: "flag_for_human",
      reason: "Ankesë e hapur — AI nuk duhet t'i dërgojë oferta deri sa të zgjidhet",
      priority: 10,
    };
  }

  // 3. Lead shumë i nxehtë — ofertë e drejtpërdrejtë
  if (leadScore >= 80 && activeSignals.includes("urgency_expressed")) {
    return {
      action: "send_upsell_offer",
      reason: `Score ${leadScore}/100 + urgjencë e shprehur — momenti optimal`,
      priority: 8,
    };
  }

  // 4. Klient besnik me LTV të lartë — kërko referim
  if (
    purchaseCount >= 3 &&
    totalRevenueLek > 30000 &&
    !activeSignals.includes("asked_about_referral")
  ) {
    return {
      action: "request_referral",
      reason: `${purchaseCount} blerje, ${totalRevenueLek.toLocaleString()}L total — profil ideal referuesi`,
      priority: 6,
    };
  }

  // 5. Klient me paketë bazë + engagement i lartë — upsell
  if (
    activeSignals.includes("purchased_base_tier") &&
    activeSignals.includes("high_engagement")
  ) {
    return {
      action: "send_upsell_offer",
      reason: "Ka paketën bazë dhe engagement të lartë — gati për nivel tjetër",
      priority: 7,
    };
  }

  // 6. Lead i interesuar por jo i nxehtë — followup manual
  if (leadScore >= 50 && leadStage === "interested") {
    return {
      action: "schedule_followup",
      reason: `Score ${leadScore}/100 në fazë interesi — kontakt personal mund të konvertojë`,
      priority: 5,
    };
  }

  // 7. Kënaqësi e shprehur — momento i mbarë për reward
  if (
    activeSignals.includes("expressed_satisfaction") &&
    purchaseCount >= 1
  ) {
    return {
      action: "send_loyalty_reward",
      reason: "Shprehu kënaqësi — momento i mbarë për të forcuar besnikërinë",
      priority: 4,
    };
  }

  // 8. Asgjë e veçantë — mos ndërhyj
  return {
    action: "do_nothing",
    reason: "Asnjë sinjal i fortë aktual — monitoro",
    priority: 0,
  };
}

// ----------------------------------------------------------------
// Llogaritja e "best contact hour"
// ----------------------------------------------------------------
function findBestContactHour(messages: MessageData[]): number | null {
  if (messages.length < 5) return null; // jo mjaftueshëm të dhëna

  const hourCounts: Record<number, number> = {};
  const userMessages = messages.filter((m) => m.role === "user");

  for (const msg of userMessages) {
    const hour = new Date(msg.created_at).getHours();
    hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
  }

  let bestHour = 10; // default: ora 10
  let maxCount = 0;
  for (const [hour, count] of Object.entries(hourCounts)) {
    if (count > maxCount) {
      maxCount = count;
      bestHour = parseInt(hour);
    }
  }

  return bestHour;
}

// ----------------------------------------------------------------
// Determinimi i lead_stage
// ----------------------------------------------------------------
function determineLeadStage(
  purchaseCount: number,
  leadScore: number,
  daysSinceLastMessage: number,
  activeSignals: SignalType[]
): LeadStage {
  if (daysSinceLastMessage > 60 && purchaseCount > 0) return "churned";
  if (purchaseCount >= 3) return "loyal";
  if (purchaseCount >= 1) return "customer";
  if (activeSignals.includes("urgency_expressed") || leadScore >= 75) return "ready_to_buy";
  if (activeSignals.includes("comparison_shopping") || leadScore >= 55) return "evaluating";
  if (activeSignals.includes("price_inquiry") || leadScore >= 35) return "interested";
  if (leadScore >= 10) return "aware";
  return "stranger";
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

  let body: ScoreRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body i pavlefshëm" }), { status: 400 });
  }

  const { business_id, customer_id, conversation_id, trigger = "manual" } = body;
  if (!business_id) {
    return new Response(JSON.stringify({ error: "business_id i detyrueshëm" }), { status: 400 });
  }

  try {
    // ── Gjej klientët për t'i skoruar ──────────────────────────
    let customerIds: string[] = [];

    if (customer_id) {
      customerIds = [customer_id];
    } else {
      // Skoro klientët aktualë (komunikuan në 90 ditët e fundit)
      const { data: recentCustomers } = await supabase
        .from("customers")
        .select("id")
        .eq("business_id", business_id)
        .gte("updated_at", new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString())
        .limit(500); // max 500 per thirrje cron

      customerIds = (recentCustomers ?? []).map((c: { id: string }) => c.id);
    }

    const results: Array<{
      customer_id: string;
      lead_score: number;
      lead_stage: LeadStage;
      churn_risk: number;
      recommended_action: RevenueAction;
      signals_detected: number;
    }> = [];

    // ── Processo çdo klient ────────────────────────────────────
    for (const cid of customerIds) {
      try {
        // 1. Të dhënat e klientit
        const { data: customer } = await supabase
          .from("customers")
          .select("id, name, opted_out_of_offers, created_at")
          .eq("id", cid)
          .single();

        if (!customer || (customer as CustomerData).opted_out_of_offers) continue;

        // 2. Blerjet
        const { data: purchases } = await supabase
          .from("partner_commissions") // nëse ka tabelë purchases — adapto
          .select("amount_lek, created_at")
          .eq("business_id", business_id)
          .limit(100);
        // SHËNIM: nëse ke tabelë purchases/orders, ndërroje këtë query

        const purchaseCount = purchases?.length ?? 0;
        const totalRevenueLek = (purchases ?? []).reduce(
          (sum: number, p: { amount_lek?: number }) => sum + (p.amount_lek ?? 0),
          0
        );

        // 3. Mesazhet e fundit (90 ditë)
        const { data: messages } = await supabase
          .from("messages")
          .select("id, content, role, created_at, conversation_id")
          .eq("business_id", business_id) // nëse messages ka business_id
          .in("conversation_id",
            // Gjej conversation_id-et e klientit
            (await supabase
              .from("conversations")
              .select("id")
              .eq("customer_id", cid)
              .eq("business_id", business_id)
            ).data?.map((c: { id: string }) => c.id) ?? []
          )
          .gte("created_at", new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString())
          .order("created_at", { ascending: false })
          .limit(200);

        const allMessages: MessageData[] = (messages ?? []) as MessageData[];

        // 4. Timestamps
        const lastMessageDate = allMessages.length > 0
          ? new Date(allMessages[0].created_at)
          : new Date((customer as CustomerData).created_at);
        const daysSinceLastMessage = Math.floor(
          (Date.now() - lastMessageDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const firstContactDate = new Date((customer as CustomerData).created_at);

        // 5. Memoria e klientit (për kontekst)
        const { data: customerMemory } = await supabase
          .from("business_memory")
          .select("entity_type, memory_key, memory_value")
          .eq("business_id", business_id)
          .eq("customer_id", cid)
          .gte("confidence", 0.4);

        const hasUnresolvedComplaint = (customerMemory ?? []).some(
          (m: { entity_type: string }) => m.entity_type === "customer_complaint"
        );

        // 6. Detektimi i sinjaleve
        // Numëro produktet e ndryshme të pyetura (nga memoria)
        const productsMentioned = new Set(
          (customerMemory ?? [])
            .filter((m: { entity_type: string }) => m.entity_type === "customer_interest")
            .map((m: { memory_key: string }) => m.memory_key)
        ).size;

        const newSignals = detectSignalsFromText(allMessages, productsMentioned);

        // Sinjale të bazuara në kohë
        if (daysSinceLastMessage >= 30) newSignals.push({ signal: "no_response_30d", strength: 1.0, excerpt: "", messageId: "" });
        else if (daysSinceLastMessage >= 7) newSignals.push({ signal: "no_response_7d", strength: 0.7, excerpt: "", messageId: "" });
        if (hasUnresolvedComplaint) newSignals.push({ signal: "complaint_unresolved", strength: 1.0, excerpt: "", messageId: "" });
        if (purchaseCount >= 1) newSignals.push({ signal: "purchased_base_tier", strength: 0.9, excerpt: "", messageId: "" });
        if (allMessages.filter((m: MessageData) => m.role === "user").length >= 10) newSignals.push({ signal: "high_engagement", strength: 0.8, excerpt: "", messageId: "" });
        if (totalRevenueLek > 30000) newSignals.push({ signal: "high_ltv_customer", strength: 1.0, excerpt: "", messageId: "" });

        // Return visitor: kthim pas 24 orësh
        const uniqueDays = new Set(
          allMessages.map((m: MessageData) => new Date(m.created_at).toDateString())
        ).size;
        if (uniqueDays >= 2) newSignals.push({ signal: "return_visitor", strength: 0.7, excerpt: "", messageId: "" });

        const activeSignals = [...new Set(newSignals.map((s) => s.signal))];

        // 7. Llogarit scores
        const leadScore = (() => {
          let s = 0;
          s += Math.min(30, purchaseCount * 10);
          s += totalRevenueLek > 50000 ? 20 : totalRevenueLek > 20000 ? 15 : totalRevenueLek > 5000 ? 10 : totalRevenueLek > 0 ? 5 : 0;
          s += daysSinceLastMessage <= 1 ? 20 : daysSinceLastMessage <= 7 ? 15 : daysSinceLastMessage <= 30 ? 8 : daysSinceLastMessage <= 60 ? 3 : 0;
          if (activeSignals.includes("urgency_expressed"))       s += 15;
          if (activeSignals.includes("price_inquiry"))           s += 10;
          if (activeSignals.includes("availability_check"))      s += 8;
          if (activeSignals.includes("multiple_item_interest"))  s += 12;
          if (activeSignals.includes("return_visitor"))          s += 7;
          if (activeSignals.includes("expressed_satisfaction"))  s += 5;
          if (activeSignals.includes("price_objection"))         s -= 10;
          if (activeSignals.includes("competitor_mention"))      s -= 8;
          if (activeSignals.includes("no_response_30d"))         s -= 15;
          return Math.max(0, Math.min(100, s));
        })();

        const churnRisk = calculateChurnRisk(
          daysSinceLastMessage,
          purchaseCount,
          hasUnresolvedComplaint,
          activeSignals.includes("price_objection"),
          activeSignals.includes("competitor_mention")
        );

        const leadStage = determineLeadStage(purchaseCount, leadScore, daysSinceLastMessage, activeSignals);
        const { action, reason, priority } = decideAction(leadScore, churnRisk, leadStage, activeSignals, purchaseCount, totalRevenueLek);
        const bestContactHour = findBestContactHour(allMessages);
        const avgOrderValue = purchaseCount > 0 ? Math.round(totalRevenueLek / purchaseCount) : 0;
        const predictedLtv = avgOrderValue * Math.max(purchaseCount, 1) * 2;

        // 8. Ruaj te customer_revenue_profile (UPSERT)
        await supabase
          .from("customer_revenue_profile")
          .upsert({
            business_id,
            customer_id: cid,
            lead_score: leadScore,
            lead_stage: leadStage,
            total_revenue_lek: totalRevenueLek,
            purchase_count: purchaseCount,
            avg_order_value_lek: avgOrderValue,
            predicted_ltv_lek: predictedLtv,
            active_signals: activeSignals,
            recommended_action: action,
            action_reason: reason,
            action_priority: priority,
            churn_risk_score: churnRisk,
            churn_risk_updated_at: new Date().toISOString(),
            best_contact_hour: bestContactHour,
            last_message_at: allMessages.length > 0 ? allMessages[0].created_at : null,
            last_scored_at: new Date().toISOString(),
          }, { onConflict: "business_id,customer_id" });

        // 9. Ruaj sinjalet e reja te revenue_signals
        const signalsToInsert = newSignals
          .filter((s) => s.messageId !== "")
          .map((s) => ({
            business_id,
            customer_id: cid,
            signal_type: s.signal,
            signal_strength: s.strength,
            detected_from: trigger === "post_conversation" ? "message" : "scoring_run",
            message_id: s.messageId || null,
            raw_excerpt: s.excerpt.substring(0, 200),
          }));

        if (signalsToInsert.length > 0) {
          await supabase.from("revenue_signals").insert(signalsToInsert);
        }

        // 10. Krijo aksion nëse ka prioritet > 3 dhe nuk ekziston i ngjashëm
        if (priority > 3) {
          const { data: existingAction } = await supabase
            .from("revenue_actions")
            .select("id")
            .eq("business_id", business_id)
            .eq("customer_id", cid)
            .eq("action_type", action)
            .eq("status", "pending")
            .maybeSingle();

          if (!existingAction) {
            await supabase.from("revenue_actions").insert({
              business_id,
              customer_id: cid,
              action_type: action,
              priority,
              triggered_by: activeSignals,
              lead_score_at_time: leadScore,
              churn_risk_at_time: churnRisk,
            });
          }
        }

        results.push({
          customer_id: cid,
          lead_score: leadScore,
          lead_stage: leadStage,
          churn_risk: churnRisk,
          recommended_action: action,
          signals_detected: newSignals.length,
        });

      } catch (customerErr) {
        console.error(`Gabim për klientin ${cid}:`, customerErr);
        // Vazhdo me tjetrin
      }
    }

    // ── Përditëso statistikat e biznesit ──────────────────────
    const hotLeads = results.filter((r) => r.lead_score > 70).length;
    const atRisk = results.filter((r) => r.churn_risk > 0.6).length;
    const upsellOpps = results.filter(
      (r) => r.recommended_action === "send_upsell_offer"
    ).length;

    await supabase.from("business_revenue_stats").upsert({
      business_id,
      total_leads: results.length,
      hot_leads_count: hotLeads,
      at_risk_customers: atRisk,
      upsell_opportunities: upsellOpps,
      avg_lead_score: results.length > 0
        ? results.reduce((s, r) => s + r.lead_score, 0) / results.length
        : 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "business_id" });

    return new Response(
      JSON.stringify({
        success: true,
        customers_scored: results.length,
        hot_leads: hotLeads,
        at_risk: atRisk,
        upsell_opportunities: upsellOpps,
        trigger,
        results: customer_id ? results : undefined, // detajet vetëm për klient specifik
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
    console.error("score-and-rank-leads error:", message);
    return new Response(JSON.stringify({ success: false, error: message }), { status: 500 });
  }
});
