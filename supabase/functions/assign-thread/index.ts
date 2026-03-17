import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) throw new Error("Unauthorized");

    const { thread_id, workspace_id, action, agent_id, status } = await req.json();

    // Manual assign
    if (action === "manual_assign" && agent_id) {
      const { error } = await supabase
        .from("conversation_threads")
        .update({ assigned_to: agent_id, updated_at: new Date().toISOString() })
        .eq("id", thread_id);
      if (error) throw error;

      return new Response(JSON.stringify({ assigned_to: agent_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auto-assign via DB function
    if (action === "auto_assign") {
      const { data, error } = await supabase.rpc("assign_thread_round_robin", {
        _workspace_id: workspace_id,
        _thread_id: thread_id,
      });
      if (error) throw error;

      return new Response(JSON.stringify({ assigned_to: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // State transition with SLA compute
    if (action === "transition" && status) {
      const { error } = await supabase
        .from("conversation_threads")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", thread_id);
      if (error) throw error;

      // Compute SLA after transition
      if (workspace_id) {
        await supabase.rpc("compute_thread_sla", {
          _thread_id: thread_id,
          _workspace_id: workspace_id,
        });
      }

      // Record first response if agent replies and thread transitions from new
      if (status === "open") {
        await supabase
          .from("conversation_threads")
          .update({ first_response_at: new Date().toISOString() })
          .eq("id", thread_id)
          .is("first_response_at", null);
      }

      return new Response(JSON.stringify({ status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bulk auto-assign all unassigned new threads
    if (action === "bulk_auto_assign" && workspace_id) {
      const { data: unassigned } = await supabase
        .from("conversation_threads")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "new")
        .is("assigned_to", null)
        .limit(50);

      const results = [];
      for (const t of unassigned ?? []) {
        const { data } = await supabase.rpc("assign_thread_round_robin", {
          _workspace_id: workspace_id,
          _thread_id: t.id,
        });
        results.push({ thread_id: t.id, assigned_to: data });
      }

      return new Response(JSON.stringify({ assigned: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid action");
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
