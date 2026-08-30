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

async function ensureMessageNotification(
  adminClient: ReturnType<typeof createSupabaseClients>["adminClient"],
  recipientId: string,
  interestId: string,
  messageId: string,
  eventId: string,
): Promise<boolean> {
  const { error } = await adminClient.from("community_notifications").upsert({
    user_id: recipientId,
    type: "new_message",
    title: "New Community Message",
    message: "You received a new message in your interest chat.",
    event_id: eventId,
    payload: { interest_id: interestId, message_id: messageId, event_id: eventId },
  }, {
    onConflict: "user_id,type,event_id",
    ignoreDuplicates: true,
  });

  return !error;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { userClient, adminClient } = createSupabaseClients(req);
    const user = await getAuthUser(req, userClient);

    const body = await req.json();
    const { interest_id, message, event_id } = body;

    const interestId = typeof interest_id === "string" ? interest_id.trim() : "";
    const messageContent = typeof message === "string" ? message : "";
    if (!interestId || !messageContent.trim()) {
      return errorResponse("Missing required fields: interest_id, message", 400, "INVALID_INPUT");
    }

    const parsedEvent = parseCommunityEventId(event_id);
    if (!parsedEvent.ok) {
      return errorResponse(parsedEvent.message, 400, "INVALID_EVENT_ID");
    }
    const eventId = parsedEvent.eventId;

    // The database uniqueness boundary is (sender_user_id, event_id), not the
    // interest id. Query that exact key so event ids cannot cross conversations.
    const { data: existingMessage, error: existingMessageError } = await adminClient
      .from("community_interest_messages")
      .select("*")
      .eq("sender_user_id", user.id)
      .eq("event_id", eventId)
      .maybeSingle();

    if (existingMessageError) {
      return errorResponse("Unable to verify message idempotency", 503, "IDEMPOTENCY_LOOKUP_FAILED");
    }

    if (existingMessage) {
      if (existingMessage.interest_id !== interestId || existingMessage.message !== messageContent) {
        return errorResponse(
          "event_id is already bound to a different message payload",
          409,
          "EVENT_ID_PAYLOAD_MISMATCH",
          { event_id: eventId },
        );
      }

      const { data: existingInterest, error: existingInterestError } = await adminClient
        .from("community_interests")
        .select("buyer_user_id, seller_user_id")
        .eq("id", existingMessage.interest_id)
        .maybeSingle();

      if (existingInterestError || !existingInterest) {
        return errorResponse("Interest thread not found", 404, "INTEREST_NOT_FOUND");
      }
      if (existingInterest.buyer_user_id !== user.id && existingInterest.seller_user_id !== user.id) {
        return errorResponse("Caller is not a participant in this interest thread", 403, "UNAUTHORIZED_PARTICIPANT");
      }

      const recipientId = existingInterest.buyer_user_id === user.id
        ? existingInterest.seller_user_id
        : existingInterest.buyer_user_id;
      const notificationPersisted = await ensureMessageNotification(
        adminClient,
        recipientId,
        interestId,
        existingMessage.id,
        eventId,
      );
      if (!notificationPersisted) {
        return errorResponse("Unable to persist message notification", 503, "NOTIFICATION_PERSIST_FAILED");
      }
      return jsonResponse({ success: true, reused: true, event_id: eventId, message: existingMessage });
    }

    const { data: existingViolation, error: existingViolationError } = await adminClient
      .from("community_violations")
      .select("id, violation_type")
      .eq("user_id", user.id)
      .eq("event_id", eventId)
      .maybeSingle();

    if (existingViolationError) {
      return errorResponse("Unable to verify moderation idempotency", 503, "IDEMPOTENCY_LOOKUP_FAILED");
    }

    if (existingViolation) {
      if (existingViolation.violation_type === "contact_info_in_message") {
        return errorResponse(
          "Sharing direct contact information (phone, email, social links) is forbidden.",
          400,
          "CONTACT_INFO_VIOLATION",
          { event_id: eventId, reused: true },
        );
      }
      return errorResponse(
        "event_id was already consumed by another blocked community write",
        409,
        "EVENT_ID_ALREADY_USED",
        { event_id: eventId },
      );
    }

    const { data: interest, error: interestError } = await adminClient
      .from("community_interests")
      .select("*")
      .eq("id", interestId)
      .maybeSingle();

    if (interestError || !interest) {
      return errorResponse("Interest thread not found", 404, "INTEREST_NOT_FOUND");
    }

    if (interest.buyer_user_id !== user.id && interest.seller_user_id !== user.id) {
      return errorResponse("Caller is not a participant in this interest thread", 403, "UNAUTHORIZED_PARTICIPANT");
    }

    const recipientId = interest.buyer_user_id === user.id ? interest.seller_user_id : interest.buyer_user_id;

    if (!interest.tax_paid || interest.status !== "tax_paid") {
      return errorResponse("Service tax must be paid by seller before messages can be sent", 400, "SERVICE_TAX_REQUIRED");
    }

    if (new Date(interest.expires_at) < new Date()) {
      return errorResponse("Interest thread has expired", 400, "THREAD_EXPIRED");
    }

    const moderation = moderateCommunityText([{ field: "message", text: messageContent }]);
    if (!moderation.allowed) {
      const { error: violationError } = await adminClient.from("community_violations").insert({
        user_id: user.id,
        event_id: eventId,
        violation_type: "contact_info_in_message",
        severity: moderation.severity,
        notes: `Attempted to share contact information in ${moderation.field}; detector type=${moderation.detection.type || "unknown"}.`,
      });

      if (violationError && violationError.code !== "23505") {
        return errorResponse("Unable to persist moderation decision", 503, "MODERATION_PERSIST_FAILED");
      }

      return errorResponse(
        "Sharing direct contact information (phone, email, social links) is forbidden.",
        400,
        moderation.code,
        {
          event_id: eventId,
          field: moderation.field,
          detection: moderation.detection,
          reused: violationError?.code === "23505",
        },
      );
    }

    const { data: msgRecord, error: msgError } = await adminClient
      .from("community_interest_messages")
      .insert({
        interest_id: interestId,
        sender_user_id: user.id,
        message: messageContent,
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
          .eq("sender_user_id", user.id)
          .eq("event_id", eventId)
          .maybeSingle();

        if (racedMessage) {
          if (racedMessage.interest_id !== interestId || racedMessage.message !== messageContent) {
            return errorResponse(
              "event_id is already bound to a different message payload",
              409,
              "EVENT_ID_PAYLOAD_MISMATCH",
              { event_id: eventId },
            );
          }

          const notificationPersisted = await ensureMessageNotification(
            adminClient,
            recipientId,
            interestId,
            racedMessage.id,
            eventId,
          );
          if (!notificationPersisted) {
            return errorResponse("Unable to persist message notification", 503, "NOTIFICATION_PERSIST_FAILED");
          }
          return jsonResponse({ success: true, reused: true, event_id: eventId, message: racedMessage });
        }
      }
      return errorResponse("Unable to create message", 400, "MESSAGE_CREATE_FAILED");
    }

    const notificationPersisted = await ensureMessageNotification(
      adminClient,
      recipientId,
      interestId,
      msgRecord.id,
      eventId,
    );
    if (!notificationPersisted) {
      return errorResponse("Unable to persist message notification", 503, "NOTIFICATION_PERSIST_FAILED");
    }

    return jsonResponse({ success: true, reused: false, event_id: eventId, message: msgRecord });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const unauthorized = message === "Missing Authorization header" || message === "Unauthorized user token";
    return errorResponse(unauthorized ? message : "Internal server error", unauthorized ? 401 : 500, unauthorized ? "UNAUTHORIZED" : "INTERNAL_ERROR");
  }
});
