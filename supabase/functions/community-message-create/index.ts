// supabase/functions/community-message-create/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  CORS_HEADERS,
  jsonResponse,
  errorResponse,
  createSupabaseClients,
  getAuthUser,
  detectContactInformation,
} from "../community-shared/helpers.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { userClient, adminClient } = createSupabaseClients(req);
    const user = await getAuthUser(req, userClient);

    const body = await req.json();
    const { interest_id, message } = body;

    if (!interest_id || !message) {
      return errorResponse("Missing required fields: interest_id, message", 400, "INVALID_INPUT");
    }

    // 1. Verify interest, participant status, tax_paid state, and expiry
    const { data: interest, error: interestError } = await adminClient
      .from("community_interests")
      .select("*")
      .eq("id", interest_id)
      .maybeSingle();

    if (interestError || !interest) {
      return errorResponse("Interest thread not found", 404, "INTEREST_NOT_FOUND");
    }

    // Verify caller is participant (buyer or seller)
    if (interest.buyer_user_id !== user.id && interest.seller_user_id !== user.id) {
      return errorResponse("Caller is not a participant in this interest thread", 403, "UNAUTHORIZED_PARTICIPANT");
    }

    // Verify tax/chat state
    if (!interest.tax_paid || interest.status !== "tax_paid") {
      return errorResponse("Service tax must be paid by seller before messages can be sent", 400, "SERVICE_TAX_REQUIRED");
    }

    // Verify expiry
    if (new Date(interest.expires_at) < new Date()) {
      return errorResponse("Interest thread has expired", 400, "THREAD_EXPIRED");
    }

    // 2. Server-side Contact Information Detection
    const contactCheck = detectContactInformation(message);
    if (contactCheck.hasContact) {
      // Create confirmed violation row via service role
      await adminClient.from("community_violations").insert({
        user_id: user.id,
        violation_type: "contact_info_in_message",
        severity: "high",
        notes: `Attempted to share contact information (${contactCheck.type}: ${contactCheck.match}) in message.`,
      });

      // DO NOT send message! Fail request closed.
      return errorResponse(
        "Sharing direct contact information (phone, email, social links) is forbidden.",
        400,
        "CONTACT_INFO_VIOLATION",
        { detection: contactCheck }
      );
    }

    // 3. Insert clean message (sender derived strictly from JWT user.id)
    const { data: msgRecord, error: msgError } = await adminClient
      .from("community_interest_messages")
      .insert({
        interest_id,
        sender_user_id: user.id,
        message,
        is_system: false,
      })
      .select()
      .single();

    if (msgError) {
      return errorResponse(msgError.message, 400, "MESSAGE_CREATE_FAILED");
    }

    // Notify recipient
    const recipientId = interest.buyer_user_id === user.id ? interest.seller_user_id : interest.buyer_user_id;
    await adminClient.from("community_notifications").insert({
      user_id: recipientId,
      type: "new_message",
      title: "New Community Message",
      message: "You received a new message in your interest chat.",
      payload: { interest_id, message_id: msgRecord.id },
    });

    return jsonResponse({ success: true, message: msgRecord });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 401, "UNAUTHORIZED");
  }
});
