// Install Industry Pack — provisions pipeline stages, automations,
// broadcast templates, knowledge base entries from a published industry pack.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PackContents = {
  pipeline?: { name: string; stages: { name: string; color?: string }[] };
  automations?: {
    name: string;
    description?: string;
    trigger_type: string;
    trigger_config: Record<string, unknown>;
    actions: unknown[];
  }[];
  broadcasts?: { name: string; channel: string; body: string }[];
  knowledge?: { title: string; content: string }[];
  widgets?: { key: string; title: string; metric: string }[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // user-scoped client (for authz)
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  // admin client (for provisioning)
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { pack_slug, workspace_id, business_id } = body ?? {};
    if (!pack_slug || !workspace_id) {
      return json({ error: "pack_slug and workspace_id are required" }, 400);
    }

    // verify workspace membership
    const { data: memberCheck, error: memErr } = await admin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (memErr) throw memErr;
    if (!memberCheck) return json({ error: "Forbidden: not a workspace member" }, 403);

    // load pack
    const { data: pack, error: packErr } = await admin
      .from("industry_packs")
      .select("id, slug, name, contents")
      .eq("slug", pack_slug)
      .eq("is_published", true)
      .maybeSingle();
    if (packErr) throw packErr;
    if (!pack) return json({ error: "Pack not found" }, 404);

    // already installed?
    const { data: existing } = await admin
      .from("workspace_industry_packs")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("pack_id", pack.id)
      .maybeSingle();
    if (existing) {
      return json({ error: "Pack already installed", install_id: existing.id }, 409);
    }

    const contents = (pack.contents ?? {}) as PackContents;
    const log: Record<string, unknown> = {
      pipeline_stage_ids: [],
      automation_ids: [],
      template_ids: [],
      knowledge_source_id: null,
      widgets: contents.widgets ?? [],
    };

    // 1) pipeline stages
    if (contents.pipeline?.stages?.length) {
      const rows = contents.pipeline.stages.map((s, idx) => ({
        workspace_id,
        user_id: userId,
        name: s.name,
        color: s.color ?? "#6366f1",
        sort_order: idx,
        is_default: idx === 0,
      }));
      const { data: stageRows, error } = await admin
        .from("pipeline_stages")
        .insert(rows)
        .select("id, name");
      if (error) throw new Error(`pipeline_stages: ${error.message}`);
      log.pipeline_stage_ids = stageRows?.map((r) => r.id) ?? [];
    }

    // 2) automation workflows (inactive by default — user activates)
    if (contents.automations?.length) {
      const rows = contents.automations.map((a) => ({
        user_id: userId,
        workspace_id,
        name: a.name,
        description: a.description ?? `Installed from ${pack.name}`,
        trigger_type: a.trigger_type,
        trigger_config: a.trigger_config ?? {},
        actions: a.actions ?? [],
        is_active: false,
      }));
      const { data, error } = await admin
        .from("automation_workflows")
        .insert(rows)
        .select("id");
      if (error) throw new Error(`automation_workflows: ${error.message}`);
      log.automation_ids = data?.map((r) => r.id) ?? [];
    }

    // 3) broadcast templates (whatsapp_templates as drafts)
    if (contents.broadcasts?.length) {
      const rows = contents.broadcasts.map((b) => ({
        user_id: userId,
        workspace_id,
        template_name: `${pack.slug}_${b.name}`,
        template_language: "en",
        category: "UTILITY",
        status: "draft",
        body_text: b.body,
      }));
      const { data, error } = await admin
        .from("whatsapp_templates")
        .upsert(rows, { onConflict: "user_id,template_name,template_language", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(`whatsapp_templates: ${error.message}`);
      log.template_ids = data?.map((r) => r.id) ?? [];
    }

    // 4) knowledge source + chunks
    if (contents.knowledge?.length) {
      const { data: src, error: srcErr } = await admin
        .from("knowledge_sources")
        .insert({
          user_id: userId,
          workspace_id,
          business_id: business_id ?? null,
          source_type: "manual",
          source_name: `${pack.name} Knowledge Base`,
          status: "ready",
          metadata: { from_industry_pack: pack.slug },
        })
        .select("id")
        .single();
      if (srcErr) throw new Error(`knowledge_sources: ${srcErr.message}`);
      log.knowledge_source_id = src.id;

      const chunkRows = contents.knowledge.map((k, idx) => ({
        source_id: src.id,
        user_id: userId,
        chunk_index: idx,
        content: `# ${k.title}\n\n${k.content}`,
        metadata: { title: k.title },
      }));
      const { error: chunkErr } = await admin.from("knowledge_chunks").insert(chunkRows);
      if (chunkErr) throw new Error(`knowledge_chunks: ${chunkErr.message}`);
    }

    // 5) record install
    const { data: installRow, error: installErr } = await admin
      .from("workspace_industry_packs")
      .insert({
        workspace_id,
        pack_id: pack.id,
        business_id: business_id ?? null,
        installed_by: userId,
        status: "installed",
        install_log: log,
      })
      .select("id")
      .single();
    if (installErr) throw installErr;

    // bump install count
    await admin
      .from("industry_packs")
      .update({ install_count: (pack as any).install_count ? undefined : undefined })
      .eq("id", pack.id);
    await admin.rpc("noop").catch(() => {});
    await admin
      .from("industry_packs")
      // @ts-ignore - increment via raw
      .update({ install_count: ((pack as any).install_count ?? 0) + 1 } as any)
      .eq("id", pack.id);

    return json({
      ok: true,
      install_id: installRow.id,
      summary: {
        pipeline_stages: (log.pipeline_stage_ids as string[]).length,
        automations: (log.automation_ids as string[]).length,
        broadcast_templates: (log.template_ids as string[]).length,
        knowledge_entries: contents.knowledge?.length ?? 0,
        widgets: (log.widgets as unknown[]).length,
      },
    });
  } catch (err) {
    console.error("install-industry-pack error", err);
    return json({ error: (err as Error).message ?? "Install failed" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
