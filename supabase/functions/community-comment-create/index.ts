// supabase/functions/community-comment-create/index.ts
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
    const { post_id, content, parent_id, workspace_id } = body;

    if (!post_id || !content) {
      return errorResponse("Missing required fields: post_id, content", 400, "INVALID_INPUT");
    }

    // Verify post exists and is active
    const { data: post, error: postError } = await userClient
      .from("community_posts")
      .select("id, status")
      .eq("id", post_id)
      .maybeSingle();

    if (postError || !post || post.status !== "active") {
      return errorResponse("Post not found or is closed", 400, "POST_NOT_ACTIVE");
    }

    // Verify workspace authorization if provided
    let authorizedWorkspaceId: string | null = null;
    if (workspace_id) {
      const { data: ws } = await adminClient
        .from("workspaces")
        .select("id, owner_id")
        .eq("id", workspace_id)
        .maybeSingle();

      if (ws && (ws.owner_id === user.id)) {
        authorizedWorkspaceId = ws.id;
      }
    }

    const { data: comment, error: commentError } = await userClient
      .from("community_comments")
      .insert({
        post_id,
        author_user_id: user.id,
        workspace_id: authorizedWorkspaceId,
        parent_id: parent_id || null,
        content,
      })
      .select()
      .single();

    if (commentError) {
      return errorResponse(commentError.message, 400, "COMMENT_CREATE_FAILED");
    }

    return jsonResponse({ success: true, comment });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 401, "UNAUTHORIZED");
  }
});
