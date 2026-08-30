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

    if (!post_id || !content) {
      return errorResponse("Missing required fields: post_id, content", 400, "INVALID_INPUT");
    }

    const parsedEvent = parseCommunityEventId(event_id);
    if (!parsedEvent.ok) {
      return errorResponse(parsedEvent.message, 400, "INVALID_EVENT_ID");
    }
    const eventId = parsedEvent.eventId;

    const { data: post, error: postError } = await userClient
      .from("community_posts")
      .select("id, status")
      .eq("id", post_id)
      .maybeSingle();

    if (postError || !post || post.status !== "active") {
      return errorResponse("Post not found or is closed", 400, "POST_NOT_ACTIVE");
    }

    const { data: existingComment } = await adminClient
      .from("community_comments")
      .select("*")
      .eq("author_user_id", user.id)
      .eq("post_id", post_id)
      .eq("event_id", eventId)
      .maybeSingle();

    if (existingComment) {
      return jsonResponse({ success: true, reused: true, event_id: eventId, comment: existingComment });
    }

    let authorizedWorkspaceId: string | null = null;
    if (workspace_id) {
      const { data: ws } = await adminClient
        .from("workspaces")
        .select("id, owner_id")
        .eq("id", workspace_id)
        .maybeSingle();

      if (ws?.owner_id === user.id) {
        authorizedWorkspaceId = ws.id;
      } else if (ws) {
        const { data: member } = await adminClient
          .from("workspace_members")
          .select("workspace_id")
          .eq("workspace_id", workspace_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (member) authorizedWorkspaceId = ws.id;
      }

      if (!authorizedWorkspaceId) {
        return errorResponse("Unauthorized workspace ID", 403, "UNAUTHORIZED_WORKSPACE");
      }
    }

    const moderation = moderateCommunityText([{ field: "content", text: content }]);
    if (!moderation.allowed) {
      await adminClient.from("community_violations").insert({
        user_id: user.id,
        event_id: eventId,
        violation_type: "contact_info_in_comment",
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

    const { data: comment, error: commentError } = await adminClient
      .from("community_comments")
      .insert({
        post_id,
        author_user_id: user.id,
        workspace_id: authorizedWorkspaceId,
        parent_id: parent_id || null,
        content,
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
          .eq("post_id", post_id)
          .eq("event_id", eventId)
          .maybeSingle();

        if (racedComment) {
          return jsonResponse({ success: true, reused: true, event_id: eventId, comment: racedComment });
        }
      }
      return errorResponse(commentError.message, 400, "COMMENT_CREATE_FAILED");
    }

    return jsonResponse({ success: true, reused: false, event_id: eventId, comment });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 401, "UNAUTHORIZED");
  }
});
