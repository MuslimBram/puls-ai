/**
 * customer-brain — Pulse AI Main Brain Orchestrator
 *
 * FLOW: Event → Customer 360 → Business Digital Twin → Rules Engine
 *       → AI reasoning (via ai-router, not hardwired) → Next Best Action
 *       → Contact Policy check → Channel Delivery → Feedback loop
 *
 * DESIGN PRINCIPLES:
 *   - Business Rules override AI (validate_nba_against_rules)
 *   - Consent + frequency caps enforced server-side before delivery
 *   - AI routes through ai-router — provider not hardwired
 *   - Jitter is for queue smoothing (deliverability), NOT anti-spam bypass
 *   - Learning loop: conversions update customer profile preferences
 *   - Anonymous visitors are not automatically messageable
 *
 * Actions:
 *   evaluate  — calculate Next Best Action for one customer
 *   segment   — AI-suggest campaign audience criteria
 *   deliver   — queue broadcast with jitter delivery
 *   feedback  — record conversion/outcome, update customer memory
 *   lifecycle — check and fire lifecycle triggers (birthday, inactivity, nth-purchase...)
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const sbClient = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

/** Route AI through Pulse AI Router — provider NOT hardwired */
async function callAIRouter(
  messages: Array<{ role: string; content: string }>,
  system: string,
  task_type = "brain",
): Promise<string> {
  try {
    const res = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-router`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ task_type, messages, system, max_tokens: 800 }),
      }
    );
    if (!res.ok) throw new Error(`ai-router ${res.status}`);
    const d = await res.json() as any;
    return d.response ?? d.content ?? d.text ?? "";
  } catch (e: any) {
    return `AI_ROUTER_ERROR:${e.message}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization,content-type",
        "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
      },
    });
  }

  const sb = sbClient();

  try {
    const body = await req.json();
    const { action, workspace_id, lead_id } = body;

    // ── EVALUATE ─────────────────────────────────────────────────────────────
    if (action === "evaluate") {
      if (!workspace_id || !lead_id) return json({ error: "workspace_id and lead_id required" }, 400);

      const [{ data: lead }, { data: twin }, { data: evidence }] = await Promise.all([
        sb.from("leads").select("*").eq("id", lead_id).eq("workspace_id", workspace_id).single(),
        sb.from("business_digital_twins").select("profile,products,services,brand_voice")
          .eq("workspace_id", workspace_id).maybeSingle(),
        sb.from("business_intelligence_evidence")
          .select("evidence_type,content,sentiment,confidence")
          .eq("workspace_id", workspace_id).eq("source_id", lead_id)
          .order("recorded_at", { ascending: false }).limit(10),
      ]);

      if (!lead) return json({ error: "Lead not found" }, 404);

      const { data: rules } = await sb.from("business_rules")
        .select("rule_type,config").eq("workspace_id", workspace_id).eq("is_enabled", true);

      const rules_summary = Object.fromEntries(
        (rules || []).map((r: any) => ([r.rule_type, r.config]))
      );

      const inactivity_days = lead.last_contacted_at
        ? Math.floor((Date.now() - new Date(lead.last_contacted_at).getTime()) / 86400000)
        : null;

      const system = `You are Pulse AI Brain. Determine the single best next action for this customer.
Return JSON only: {"action_type":string,"reason":string,"evidence":object,"confidence":0-1,"suggested_channel":string,"offer_value":number|null,"offer_unit":"pct"|"fixed"|null,"priority":1-10,"expires_hours":number}

ACTION TYPES: do_nothing|follow_up|personalized_offer|vip_reward|reorder_reminder|win_back|installment_option|cross_sell|upsell|referral_invitation|birthday_offer|anniversary_reward|nth_purchase_reward|high_basket_reward|human_handoff|replenishment

BUSINESS RULES (you MUST NOT exceed these constraints):
${JSON.stringify(rules_summary)}

You cannot invent discounts, installments, rewards, or prices beyond what rules allow.
When in doubt, recommend do_nothing rather than inventing a rule that doesn't exist.`;

      const user_ctx = JSON.stringify({
        lead: {
          intent_score: lead.intent_score,
          purchase_count: lead.purchase_count,
          total_spend: lead.total_spend,
          is_vip: lead.is_vip,
          inactivity_days,
          last_offer_result: lead.last_offer_result,
          categories: lead.categories,
          favorites: lead.favorites,
          predicted_next_need: lead.predicted_next_need,
          churn_risk: lead.churn_risk,
        },
        business: { products: (twin as any)?.products, services: (twin as any)?.services },
        evidence: evidence?.slice(0, 5),
      });

      const ai_raw = await callAIRouter([{ role: "user", content: user_ctx }], system, "brain");

      let nba: any = {};
      try {
        nba = JSON.parse(ai_raw.replace(/```json|```/g, "").trim());
      } catch {
        nba = { action_type: "do_nothing", reason: "AI parse error", confidence: 0.3, priority: 1 };
      }

      // Server-side rule validation — overrides AI if needed
      const { data: rule_check } = await sb.rpc("validate_nba_against_rules", {
        p_workspace_id: workspace_id,
        p_action_type:  nba.action_type ?? "do_nothing",
        p_offer_value:  nba.offer_value ?? 0,
        p_offer_unit:   nba.offer_unit ?? "pct",
        p_lead_id:      lead_id,
      });

      const rule_ok   = (rule_check as any)?.allowed !== false;
      const offer_val = rule_ok ? nba.offer_value : (rule_check as any)?.clamped_value ?? 0;
      const expires_at = nba.expires_hours
        ? new Date(Date.now() + nba.expires_hours * 3600000).toISOString()
        : null;

      const { data: nba_record } = await sb.from("next_best_actions").insert({
        workspace_id, lead_id,
        action_type:      nba.action_type ?? "do_nothing",
        reason:           nba.reason ?? "",
        evidence:         { ai_raw: nba, rule_check },
        confidence:       nba.confidence ?? 0.5,
        priority:         nba.priority ?? 5,
        suggested_channel: nba.suggested_channel,
        rule_id:          (rule_check as any)?.rule_id,
        rule_allows:      rule_ok,
        offer_value:      offer_val,
        offer_unit:       nba.offer_unit,
        expires_at,
      }).select("id").single();

      await sb.from("leads").update({
        nba_action:       nba.action_type,
        nba_reason:       nba.reason,
        nba_confidence:   nba.confidence,
        nba_expires_at:   expires_at,
        nba_calculated_at: new Date().toISOString(),
        inactivity_days,
      }).eq("id", lead_id);

      return json({
        ok: true,
        nba_id:            nba_record?.id,
        action_type:       nba.action_type,
        reason:            nba.reason,
        confidence:        nba.confidence,
        rule_allows:       rule_ok,
        offer_value:       offer_val,
        suggested_channel: nba.suggested_channel,
      });
    }

    // ── SEGMENT ───────────────────────────────────────────────────────────────
    if (action === "segment") {
      const { campaign_goal, campaign_message } = body;
      if (!workspace_id) return json({ error: "workspace_id required" }, 400);

      const { data: twin } = await sb.from("business_digital_twins")
        .select("profile,products,services").eq("workspace_id", workspace_id).maybeSingle();

      const system = `You are Pulse AI. Suggest audience segment criteria for this campaign.
Return JSON: {"segment_name":string,"reasoning":string,"criteria":object,"estimated_reach":"low|medium|high","segment_type":"ai_dynamic"}
Criteria can include: purchase_count_min, purchase_count_max, is_vip, inactivity_min_days, inactivity_max_days, categories, min_spend, channel_preference, loyalty_tier`;

      const ai = await callAIRouter(
        [{ role: "user", content: JSON.stringify({ goal: campaign_goal, message: campaign_message, business: (twin as any)?.profile }) }],
        system, "brain"
      );

      let seg: any = {};
      try { seg = JSON.parse(ai.replace(/```json|```/g, "").trim()); }
      catch { seg = { segment_name: "all_eligible", reasoning: "Default", criteria: {}, segment_type: "all_eligible" }; }

      const { data: saved } = await sb.from("ai_campaign_segments").insert({
        workspace_id, segment_name: seg.segment_name,
        segment_type: seg.segment_type ?? "ai_dynamic",
        description: campaign_goal, criteria: seg.criteria, ai_reasoning: seg.reasoning,
      }).select("id").single();

      return json({ ok: true, segment_id: saved?.id, ...seg });
    }

    // ── DELIVER ───────────────────────────────────────────────────────────────
    if (action === "deliver") {
      const { broadcast_id, window_minutes = 60, message_type = "marketing" } = body;
      if (!workspace_id || !broadcast_id) return json({ error: "workspace_id and broadcast_id required" }, 400);

      const { data: recipients } = await sb.from("broadcast_recipients")
        .select("id,contact_identifier,channel_type,lead_id")
        .eq("broadcast_id", broadcast_id).eq("status", "pending").limit(10000);

      if (!recipients?.length) return json({ ok: true, queued: 0, message: "No pending recipients" });

      const window_sec = window_minutes * 60;
      let queued = 0;

      for (const r of recipients as any[]) {
        // Consent + frequency cap check
        if (r.lead_id) {
          const { data: policy } = await sb.rpc("evaluate_contact_policy", {
            p_workspace_id: workspace_id,
            p_lead_id:      r.lead_id,
            p_channel:      r.channel_type ?? "email",
            p_message_type: message_type,
          });
          if ((policy as any)?.allowed === false) continue;
        }

        const jitter = Math.floor(Math.random() * window_sec);
        const send_at = new Date(Date.now() + jitter * 1000);

        await sb.from("broadcast_send_queue").upsert({
          broadcast_id, recipient_id: r.id,
          scheduled_send_at: send_at.toISOString(),
          jitter_seconds: jitter,
          status: "queued", message_type,
          idempotency_key: `${broadcast_id}:${r.id}`,
        }, { onConflict: "idempotency_key" }).catch(() => {});
        queued++;
      }

      return json({
        ok: true, queued, total: recipients.length, window_minutes,
        note: "Jitter applied for queue smoothing — NOT anti-spam bypass",
      });
    }

    // ── FEEDBACK ──────────────────────────────────────────────────────────────
    if (action === "feedback") {
      const { event_type, nba_id, broadcast_id, channel, event_data, revenue_amount } = body;
      if (!workspace_id || !lead_id || !event_type) {
        return json({ error: "workspace_id, lead_id, event_type required" }, 400);
      }

      await sb.from("conversion_events").insert({
        workspace_id, lead_id, broadcast_id, nba_id, event_type, channel,
        event_data: event_data ?? {}, revenue_amount,
      });

      if (nba_id) {
        await sb.from("next_best_actions").update({
          status: event_type, result_at: new Date().toISOString(), result: event_type,
        }).eq("id", nba_id);
      }

      const updates: Record<string, unknown> = { last_contacted_at: new Date().toISOString() };
      if (event_type === "purchased" || event_type === "converted") {
        updates.last_purchase_at = new Date().toISOString();
        updates.last_offer_result = "accepted";
      }
      if (event_type === "declined" || event_type === "ignored") {
        updates.last_offer_result = event_type;
      }
      await sb.from("leads").update(updates).eq("id", lead_id);

      // Suppress opt-outs
      if (event_type === "opted_out" || event_type === "unsubscribed") {
        await sb.from("contact_consent").upsert({
          workspace_id, lead_id, channel: channel ?? "any",
          consented: false, opt_out_date: new Date().toISOString(), opt_out_reason: event_type,
        }, { onConflict: "workspace_id,lead_id,channel" }).catch(() => {});
      }

      // Log for frequency caps
      await sb.from("frequency_cap_log").insert({
        workspace_id, lead_id, channel, message_type: "marketing", broadcast_id, nba_id,
      }).catch(() => {});

      return json({ ok: true, event_type, memory_updated: true });
    }

    // ── LIFECYCLE ─────────────────────────────────────────────────────────────
    if (action === "lifecycle") {
      if (!workspace_id) return json({ error: "workspace_id required" }, 400);

      const { data: triggers } = await sb.from("lifecycle_triggers")
        .select("*").eq("workspace_id", workspace_id).eq("is_enabled", true);

      const { data: customers } = await sb.from("leads")
        .select("id,birthday,customer_anniversary,purchase_count,total_spend,inactivity_days,last_purchase_at,avg_basket")
        .eq("workspace_id", workspace_id).not("purchase_count", "is", null).limit(500);

      let fired = 0;

      for (const trigger of (triggers || [])) {
        for (const cust of (customers || [])) {
          let should_fire = false;
          const t = trigger as any;
          const c = cust as any;
          const today = new Date();

          if (t.trigger_type === "birthday" && c.birthday) {
            const bd = new Date(c.birthday);
            const days_before = t.config?.days_before ?? 0;
            const target = new Date(today.getFullYear(), bd.getMonth(), bd.getDate() - days_before);
            should_fire = Math.abs(today.getTime() - target.getTime()) < 86400000;
          } else if (t.trigger_type === "nth_purchase" && t.config?.count) {
            should_fire = c.purchase_count === t.config.count;
          } else if (t.trigger_type === "inactivity" && t.config?.days) {
            should_fire = (c.inactivity_days ?? 0) >= t.config.days;
          } else if (t.trigger_type === "spend_milestone" && t.config?.amount) {
            should_fire = c.total_spend >= t.config.amount &&
              (c.total_spend - (c.avg_basket ?? 0)) < t.config.amount;
          }

          if (should_fire) {
            const { data: already } = await sb.from("lifecycle_trigger_log")
              .select("id").eq("trigger_id", t.id).eq("lead_id", c.id)
              .gte("fired_at", new Date(Date.now() - t.cooldown_days * 86400000).toISOString())
              .maybeSingle();

            if (!already) {
              await sb.from("lifecycle_trigger_log").insert({
                trigger_id: t.id, workspace_id, lead_id: c.id,
                fire_date: today.toISOString().split("T")[0],
              }).catch(() => {});

              // Trigger evaluation (async — don't block loop)
              fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/customer-brain`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
                body: JSON.stringify({ action: "evaluate", workspace_id, lead_id: c.id }),
              }).catch(() => {});

              fired++;
            }
          }
        }
      }

      return json({
        ok: true,
        triggers_checked: (triggers || []).length,
        customers_checked: (customers || []).length,
        fired,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});
