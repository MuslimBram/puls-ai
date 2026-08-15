// supabase/functions/community-tax-pay/index.ts
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
    const { interest_id } = body;

    if (!interest_id) {
      return errorResponse("Missing interest_id", 400, "INVALID_INPUT");
    }

    // Call atomic RPC pay_community_service_tax
    const { data: result, error } = await userClient.rpc("pay_community_service_tax", {
      _interest_id: interest_id,
    });

    if (error) {
      return errorResponse(error.message, 400, "TAX_PAYMENT_FAILED");
    }

    if (!result?.success) {
      return errorResponse(result?.message || "Service tax payment failed", 400, result?.code || "TAX_PAYMENT_REJECTED", result);
    }

    return jsonResponse({ success: true, payment: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 401, "UNAUTHORIZED");
  }
});
