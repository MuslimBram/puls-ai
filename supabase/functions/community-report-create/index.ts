// supabase/functions/community-report-create/index.ts
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
    const user = await getAuthUser(req, userClient);

    const body = await req.json();
    const { target_type, target_id, reason } = body;

    if (!target_type || !target_id || !reason) {
      return errorResponse("Missing required fields: target_type, target_id, reason", 400, "INVALID_INPUT");
    }

    const validTypes = ["post", "comment", "profile", "message", "other"];
    if (!validTypes.includes(target_type)) {
      return errorResponse(`Invalid target_type '${target_type}'`, 400, "INVALID_TARGET_TYPE");
    }

    // Insert user report allegation (status = pending).
    // MUST NOT create a violation directly.
    const { data: report, error } = await userClient
      .from("community_reports")
      .insert({
        reporter_user_id: user.id,
        target_type,
        target_id,
        reason,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      return errorResponse(error.message, 400, "REPORT_CREATE_FAILED");
    }

    return jsonResponse({ success: true, report });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 401, "UNAUTHORIZED");
  }
});
