// supabase/functions/community-message-create/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  CORS_HEADERS,
  jsonResponse,
  errorResponse,
  createSupabaseClients,
  getAuthUser,
  parseCommunityEventId,
  moderateCommunityText,
} from "../community-shared/helpers.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { userClient, adminClient } = createSupabaseClients(req);
    const user = await getAuthUser(req, userClient);

    const body = await req.json();
    const { interest_id, message, event_id } = body;

    if (!interest_id || !message) {
      return errorResponse("Missing required fields: interest_id, message", 400, "INVALID_INPUT");
    }

    const parsedEvent = parseCommunityEventId(event_id);
    if (!parsedEvent.ok) {
      return errorResponse(parsedEvent.message, 400, "INVALID_EVENT_ID");
    }
    const eventId = parsedEvent.eventId;

    const { data: interest, error: interestError } = await adminClient
      .from("community_interests")
      .select("*")
      .eq("id", interest_id)
      .maybeSingle();

    if (interestError || !interest) {
      return errorResponse("Interest thread not found", 404, "INTEREST_NOT_FOUND");
    }

    if (interest.buyer_user_id !== user.id && interest.seller_user_id !== user.id) {
      return errorResponse("Caller is not a participant in this interest thread", 403, "UNAUTHORIZED_PARTICIPANT");
    }

    const { data: existingMessage } = await adminClient
      .from("community_interest_messages")
      .select("*")
      .eq("interest_id", interest_id)
      .eq("sender_user_id", user.id)
      .eq("event_id", eventId)
      .maybeSingle();

    if (existingMessage) {
      return jsonResponse({ success: true, reused: true, event_id: eventId, message: existingMessage });
    }

    if (!interest.tax_paid || interest.status !== "tax_paid") {
      return errorResponse("Service tax must be paid by seller before messages can be sent", 400, "SERVICE_TAX_REQUIRED");
    }

    if (new Date(interest.expires_at) < new Date()) {
      return errorResponse("Interest thread has expired", 400, "THREAD_EXPIRED");
    }

    const moderation = moderateCommunityText([{ field: "message", text: message }]);
    if (!moderation.allowed) {
      await adminClient.from("community_violations").insert({
        user_id: user.id,
        event_id: eventId,
        violation_type: "contact_info_in_message",
        severity: moderation.severity,
        notes: `Attempted to share contact information in ${moderation.field} (${moderation.detection.type}: ${moderation.detection.match}).`,
      });

      return errorResponse(
        "Sharing direct contact information (phone, email, social links) is forbidden.",
        400,
        moderation.code,
        { event_id: eventId, field: moderation.field, detection: moderation.detection },
      );
    }

    const { data: msgRecord, error: msgError } = await adminClient
      .from("community_interest_messages")
      .insert({
        interest_id,
        sender_user_id: user.id,
        message,
        is_system: false,
        event_id: eventId,
      })
      .select()
      .single();

    if (msgError) {
      if (msgError.code === "23505") {
        const { data: racedMessage } = await adminClient
          .from("community_interest_messages")
          .select("*")
          .eq("interest_id", interest_id)
          .eq("sender_user_id", user.id)
          .eq("event_id", eventId)
          .maybeSingle();

        if (racedMessage) {
          return jsonResponse({ success: true, reused: true, event_id: eventId, message: racedMessage });
        }
      }
      return errorResponse(msgError.message, 400, "MESSAGE_CREATE_FAILED");
    }

    const recipientId = interest.buyer_user_id === user.id ? interest.seller_user_id : interest.buyer_user_id;
    await adminClient.from("community_notifications").insert({
      user_id: recipientId,
      type: "new_message",
      title: "New Community Message",
      message: "You received a new message in your interest chat.",
      payload: { interest_id, message_id: msgRecord.id, event_id: eventId },
    });

    return jsonResponse({ success: true, reused: false, event_id: eventId, message: msgRecord });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 401, "UNAUTHORIZED");
  }
});
