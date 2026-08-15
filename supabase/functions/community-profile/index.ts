// supabase/functions/community-profile/index.ts
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

    if (req.method === "POST") {
      // Lazy activation of community profile via community_activate_profile RPC
      const { data, error } = await userClient.rpc("community_activate_profile");
      if (error) {
        return errorResponse(error.message, 400, "ACTIVATION_FAILED");
      }
      return jsonResponse({ success: true, profile: data });
    }

    if (req.method === "GET") {
      const url = new URL(req.url);
      const targetUserId = url.searchParams.get("user_id") || user.id;

      const { data: profile, error } = await userClient
        .from("community_profiles")
        .select("*")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (error) {
        return errorResponse(error.message, 400, "PROFILE_FETCH_FAILED");
      }

      return jsonResponse({ success: true, profile });
    }

    return errorResponse("Method not allowed", 405);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 401, "UNAUTHORIZED");
  }
});
