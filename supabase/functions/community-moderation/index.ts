// supabase/functions/community-moderation/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  CORS_HEADERS,
  jsonResponse,
  errorResponse,
  createSupabaseClients,
  getAuthUser,
} from "../community-shared/helpers.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { userClient } = createSupabaseClients(req);
    await getAuthUser(req, userClient);

    const body = await req.json();
    const { report_id, action, notes } = body;

    if (!report_id || !action) {
      return errorResponse("Missing required fields: report_id, action", 400, "INVALID_INPUT");
    }

    if (!["confirm", "dismiss"].includes(action)) {
      return errorResponse("Action must be 'confirm' or 'dismiss'", 400, "INVALID_ACTION");
    }

    // Call review_community_report RPC
    const { data: success, error } = await userClient.rpc("review_community_report", {
      p_report_id: report_id,
      p_action: action,
      p_notes: notes || null,
    });

    if (error) {
      return errorResponse(error.message, 400, "REVIEW_FAILED");
    }

    return jsonResponse({ success: true, action, report_id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 401, "UNAUTHORIZED");
  }
});
