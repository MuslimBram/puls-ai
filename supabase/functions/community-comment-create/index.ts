// supabase/functions/community-comment-create/index.ts
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
    const { post_id, content, parent_id, workspace_id, event_id } = body;

    const postId = typeof post_id === "string" ? post_id.trim() : "";
    const commentContent = typeof content === "string" ? content : "";
    if (!postId || !commentContent.trim()) {
      return errorResponse("Missing required fields: post_id, content", 400, "INVALID_INPUT");
    }
    if (parent_id !== undefined && parent_id !== null && typeof parent_id !== "string") {
      return errorResponse("parent_id must be a string when provided", 400, "INVALID_INPUT");
    }
    if (workspace_id !== undefined && workspace_id !== null && typeof workspace_id !== "string") {
      return errorResponse("workspace_id must be a string when provided", 400, "INVALID_INPUT");
    }

    const parentId = typeof parent_id === "string" && parent_id.trim() ? parent_id.trim() : null;
    const requestedWorkspaceId = typeof workspace_id === "string" && workspace_id.trim() ? workspace_id.trim() : null;

    const parsedEvent = parseCommunityEventId(event_id);
    if (!parsedEvent.ok) {
      return errorResponse(parsedEvent.message, 400, "INVALID_EVENT_ID");
    }
    const eventId = parsedEvent.eventId;

    // The unique database boundary is (author_user_id, event_id). Query that
    // exact key first so an event cannot be silently reused on another post.
    const { data: existingComment, error: existingCommentError } = await adminClient
      .from("community_comments")
      .select("*")
      .eq("author_user_id", user.id)
      .eq("event_id", eventId)
      .maybeSingle();

    if (existingCommentError) {
      return errorResponse("Unable to verify comment idempotency", 503, "IDEMPOTENCY_LOOKUP_FAILED");
    }

    if (existingComment) {
      const payloadMatches = existingComment.post_id === postId
        && existingComment.content === commentContent
        && (existingComment.parent_id ?? null) === parentId
        && (existingComment.workspace_id ?? null) === requestedWorkspaceId;

      if (!payloadMatches) {
        return errorResponse(
          "event_id is already bound to a different comment payload",
          409,
          "EVENT_ID_PAYLOAD_MISMATCH",
          { event_id: eventId },
        );
      }

      return jsonResponse({ success: true, reused: true, event_id: eventId, comment: existingComment });
    }

    // A blocked write also consumes its event id. A retry of that logical write
    // must remain blocked instead of becoming a later successful write.
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
      if (existingViolation.violation_type === "contact_info_in_comment") {
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

    const { data: post, error: postError } = await userClient
      .from("community_posts")
      .select("id, status")
      .eq("id", postId)
      .maybeSingle();

    if (postError || !post || post.status !== "active") {
      return errorResponse("Post not found or is closed", 400, "POST_NOT_ACTIVE");
    }

    if (parentId) {
      const { data: parentComment, error: parentError } = await userClient
        .from("community_comments")
        .select("id, post_id")
        .eq("id", parentId)
        .maybeSingle();

      if (parentError || !parentComment || parentComment.post_id !== postId) {
        return errorResponse("Parent comment does not belong to this post", 400, "INVALID_PARENT_COMMENT");
      }
    }

    let authorizedWorkspaceId: string | null = null;
    if (requestedWorkspaceId) {
      const { data: ws } = await adminClient
        .from("workspaces")
        .select("id, owner_id")
        .eq("id", requestedWorkspaceId)
        .maybeSingle();

      if (ws?.owner_id === user.id) {
        authorizedWorkspaceId = ws.id;
      } else if (ws) {
        const { data: member } = await adminClient
          .from("workspace_members")
          .select("workspace_id")
          .eq("workspace_id", requestedWorkspaceId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (member) authorizedWorkspaceId = ws.id;
      }

      if (!authorizedWorkspaceId) {
        return errorResponse("Unauthorized workspace ID", 403, "UNAUTHORIZED_WORKSPACE");
      }
    }

    const moderation = moderateCommunityText([{ field: "content", text: commentContent }]);
    if (!moderation.allowed) {
      const { error: violationError } = await adminClient.from("community_violations").insert({
        user_id: user.id,
        event_id: eventId,
        violation_type: "contact_info_in_comment",
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

    const { data: comment, error: commentError } = await adminClient
      .from("community_comments")
      .insert({
        post_id: postId,
        author_user_id: user.id,
        workspace_id: authorizedWorkspaceId,
        parent_id: parentId,
        content: commentContent,
        event_id: eventId,
      })
      .select()
      .single();

    if (commentError) {
      if (commentError.code === "23505") {
        const { data: racedComment } = await adminClient
          .from("community_comments")
          .select("*")
          .eq("author_user_id", user.id)
          .eq("event_id", eventId)
          .maybeSingle();

        if (racedComment) {
          const payloadMatches = racedComment.post_id === postId
            && racedComment.content === commentContent
            && (racedComment.parent_id ?? null) === parentId
            && (racedComment.workspace_id ?? null) === authorizedWorkspaceId;

          if (!payloadMatches) {
            return errorResponse(
              "event_id is already bound to a different comment payload",
              409,
              "EVENT_ID_PAYLOAD_MISMATCH",
              { event_id: eventId },
            );
          }

          return jsonResponse({ success: true, reused: true, event_id: eventId, comment: racedComment });
        }
      }
      return errorResponse("Unable to create comment", 400, "COMMENT_CREATE_FAILED");
    }

    return jsonResponse({ success: true, reused: false, event_id: eventId, comment });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const unauthorized = message === "Missing Authorization header" || message === "Unauthorized user token";
    return errorResponse(unauthorized ? message : "Internal server error", unauthorized ? 401 : 500, unauthorized ? "UNAUTHORIZED" : "INTERNAL_ERROR");
  }
});
