// supabase/functions/community-rate-post/index.ts
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
    const { target_user_id, score, comment } = body;

    if (!target_user_id || score === undefined) {
      return errorResponse("Missing required fields: target_user_id, score", 400, "INVALID_INPUT");
    }

    if (target_user_id === user.id) {
      return errorResponse("Cannot rate yourself", 400, "SELF_RATING_FORBIDDEN");
    }

    const numericScore = Number(score);
    if (isNaN(numericScore) || numericScore < 1 || numericScore > 5) {
      return errorResponse("Score must be an integer between 1 and 5", 400, "INVALID_SCORE");
    }

    const { data: rating, error } = await userClient
      .from("community_ratings")
      .upsert({
        target_user_id,
        rater_user_id: user.id,
        score: numericScore,
        comment: comment || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "target_user_id, rater_user_id" })
      .select()
      .single();

    if (error) {
      return errorResponse(error.message, 400, "RATING_FAILED");
    }

    return jsonResponse({ success: true, rating });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 401, "UNAUTHORIZED");
  }
});
