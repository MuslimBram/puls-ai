// supabase/functions/agent-config-manager/index.ts
// ============================================================
// Menaxhon konfigurimin e AI Agent per workspace
// GET  → merr config aktuale
// POST → përditëso config
// PUT  → shto FAQ/training data
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { askAI } from "../_shared/ai-client.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } }
  );

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "get_config";
  const workspaceId = url.searchParams.get("workspace_id") ?? user.id;

  // ── GET: merr config + knowledge ────────────────────────────
  if (req.method === "GET" || action === "get_config") {
    const { data: config } = await supabase
      .from("agent_full_context")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const { data: training } = await supabase
      .from("ai_training_data")
      .select("id, type, question, answer, priority, is_active")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .limit(50);

    const { data: memoryStats } = await supabase
      .from("business_memory_stats")
      .select("*")
      .eq("business_id", workspaceId)
      .maybeSingle();

    return json({
      config: config ?? null,
      training_data: training ?? [],
      memory_stats: memoryStats ?? null,
    });
  }

  // ── POST: përditëso config ───────────────────────────────────
  if (req.method === "POST" && action === "update_config") {
    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return json({ error: "Body i pavlefshëm" }, 400); }

    const allowedFields = [
      "agent_name", "agent_tone", "language",
      "max_ai_replies_per_conv", "handoff_keywords",
      "auto_reply_enabled", "auto_reply_delay_sec",
      "proactive_offers", "memory_enabled",
      "instagram_enabled", "whatsapp_enabled",
      "facebook_enabled", "telegram_enabled", "sms_enabled",
      "business_description", "business_hours", "custom_instructions",
    ];
    const safeBody: Record<string, unknown> = {};
    for (const f of allowedFields) {
      if (body[f] !== undefined) safeBody[f] = body[f];
    }

    const { error } = await supabase
      .from("ai_agent_configs")
      .upsert({ workspace_id: workspaceId, ...safeBody, updated_at: new Date().toISOString() },
              { onConflict: "workspace_id" });

    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  // ── PUT: shto training data (FAQ/produkt/politikë) ───────────
  if (req.method === "PUT" || action === "add_training") {
    let body: {
      type: string;
      question?: string;
      answer: string;
      priority?: number;
    };
    try { body = await req.json(); }
    catch { return json({ error: "Body i pavlefshëm" }, 400); }

    if (!body.answer) return json({ error: "answer është i detyrueshëm" }, 400);

    const { data, error } = await supabase
      .from("ai_training_data")
      .insert({
        workspace_id: workspaceId,
        type: body.type ?? "faq",
        question: body.question ?? null,
        answer: body.answer,
        priority: body.priority ?? 5,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) return json({ error: error.message }, 500);
    return json({ success: true, id: data?.id });
  }

  // ── POST action=generate_instructions: AI gjeneron udhëzime ──
  if (action === "generate_instructions") {
    const { data: config } = await supabase
      .from("ai_agent_configs")
      .select("business_description, agent_tone, language")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const { data: training } = await supabase
      .from("ai_training_data")
      .select("type, question, answer")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .limit(20);

    const description = config?.business_description ?? "Biznes i përgjithshëm";
    const tone = config?.agent_tone ?? "professional_friendly";

    try {
      const instructions = await askAI(
        "Ti je ekspert i konfigurimit të AI chatbots. Gjenero udhëzime të qarta dhe profesionale.",
        `Gjenero udhëzime për AI agent bazuar te:
Biznesi: ${description}
Toni: ${tone}
Knowledge base: ${JSON.stringify((training ?? []).slice(0, 5))}

Kthe udhëzime në shqip, 3-5 paragrafë, konkrete dhe të zbatueshme.`,
        500
      );

      // Ruaj te config
      await supabase.from("ai_agent_configs")
        .update({ custom_instructions: instructions, updated_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId);

      return json({ success: true, instructions });
    } catch (err) {
      return json({ error: "AI nuk u përgjigj. Provo sërish." }, 503);
    }
  }

  // ── DELETE: fshi training data ───────────────────────────────
  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id i detyrueshëm" }, 400);

    const { error } = await supabase
      .from("ai_training_data")
      .delete()
      .eq("id", id)
      .eq("workspace_id", workspaceId);

    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  return json({ error: "Veprim i panjohur" }, 400);
});
