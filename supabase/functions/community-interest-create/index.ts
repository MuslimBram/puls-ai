// supabase/functions/community-interest-create/index.ts
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
    const { userClient, adminClient } = createSupabaseClients(req);
    const user = await getAuthUser(req, userClient);

    const body = await req.json();
    const { post_id, offer_amount, message } = body;

    if (!post_id || offer_amount === undefined) {
      return errorResponse("Missing required fields: post_id, offer_amount", 400, "INVALID_INPUT");
    }

    // Fetch post to verify seller
    const { data: post, error: postError } = await userClient
      .from("community_posts")
      .select("id, author_user_id, status, title")
      .eq("id", post_id)
      .maybeSingle();

    if (postError || !post || post.status !== "active") {
      return errorResponse("Post not found or is not active", 400, "POST_NOT_ACTIVE");
    }

    if (post.author_user_id === user.id) {
      return errorResponse("Cannot create an offer on your own post", 400, "SELF_OFFER_FORBIDDEN");
    }

    // Check if an existing interest/offer exists for this buyer & post
    const { data: existingInterest } = await userClient
      .from("community_interests")
      .select("*")
      .eq("post_id", post_id)
      .eq("buyer_user_id", user.id)
      .maybeSingle();

    let interest;
    if (existingInterest) {
      // Re-offering: update offer_amount, message, updated_at; MUST NOT reset expires_at!
      const { data: updatedInterest, error: updateError } = await userClient
        .from("community_interests")
        .update({
          offer_amount: Number(offer_amount),
          message: message || existingInterest.message,
          updated_at: new Date().toISOString(),
          // expires_at is NOT touched on re-offering!
        })
        .eq("id", existingInterest.id)
        .select()
        .single();

      if (updateError) {
        return errorResponse(updateError.message, 400, "OFFER_UPDATE_FAILED");
      }
      interest = updatedInterest;
    } else {
      // New offer
      const { data: newInterest, error: createError } = await userClient
        .from("community_interests")
        .insert({
          post_id,
          buyer_user_id: user.id,
          seller_user_id: post.author_user_id,
          offer_amount: Number(offer_amount),
          message: message || null,
          status: "pending",
        })
        .select()
        .single();

      if (createError) {
        return errorResponse(createError.message, 400, "OFFER_CREATE_FAILED");
      }
      interest = newInterest;
    }

    // Notify seller
    await adminClient.from("community_notifications").insert({
      user_id: post.author_user_id,
      type: "new_offer",
      title: "New Interest / Offer Received",
      message: `Received an offer of ${offer_amount} ALL on '${post.title}'`,
      payload: { interest_id: interest.id, post_id: post.id, offer_amount },
    });

    return jsonResponse({ success: true, interest });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 401, "UNAUTHORIZED");
  }
});
