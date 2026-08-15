// supabase/functions/community-post-create/index.ts
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
    const { title, content, category, price, location, workspace_id, attachments } = body;

    if (!title || !content || !category || price === undefined) {
      return errorResponse("Missing required fields: title, content, category, price", 400, "INVALID_INPUT");
    }

    // 1. Validate Price Band
    const { data: band, error: bandError } = await userClient
      .from("community_price_bands")
      .select("*")
      .eq("category", category)
      .maybeSingle();

    if (bandError || !band) {
      return errorResponse(`Invalid category '${category}'`, 400, "INVALID_CATEGORY");
    }

    const numericPrice = Number(price);
    if (isNaN(numericPrice) || numericPrice < Number(band.min_price) || numericPrice > Number(band.max_price)) {
      return errorResponse(
        `Price ${price} is out of price band range (${band.min_price} - ${band.max_price} ${band.currency}) for category '${category}'`,
        400,
        "PRICE_OUT_OF_BAND"
      );
    }

    // 2. Validate Business Workspace Identity if provided
    let authorizedWorkspaceId: string | null = null;
    if (workspace_id) {
      if (workspace_id === user.id) {
        return errorResponse("Cannot use user UUID as workspace UUID", 400, "INVALID_WORKSPACE_UUID");
      }

      const { data: ws } = await adminClient
        .from("workspaces")
        .select("id, owner_id")
        .eq("id", workspace_id)
        .maybeSingle();

      if (ws) {
        if (ws.owner_id === user.id) {
          authorizedWorkspaceId = ws.id;
        } else {
          const { data: member } = await adminClient
            .from("workspace_members")
            .select("workspace_id")
            .eq("workspace_id", workspace_id)
            .eq("user_id", user.id)
            .maybeSingle();

          if (member) {
            authorizedWorkspaceId = ws.id;
          }
        }
      }

      if (!authorizedWorkspaceId) {
        return errorResponse("Unauthorized workspace ID", 403, "UNAUTHORIZED_WORKSPACE");
      }
    }

    // 3. Create Post
    const { data: post, error: postError } = await userClient
      .from("community_posts")
      .insert({
        author_user_id: user.id,
        workspace_id: authorizedWorkspaceId,
        title,
        content,
        category,
        price: numericPrice,
        currency: band.currency || "ALL",
        location: location || null,
        status: "active",
      })
      .select()
      .single();

    if (postError || !post) {
      return errorResponse(postError?.message || "Failed to create post", 400, "POST_CREATE_FAILED");
    }

    // 4. Validate & Process Attachments if provided
    const createdAttachments = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        const path = att.storage_path || att.path;
        if (!path) continue;

        // Security checks: own-folder write, path traversal rejection
        if (!path.startsWith(`${user.id}/`)) {
          return errorResponse(`Attachment path '${path}' must start with user ID '${user.id}/'`, 400, "INVALID_ATTACHMENT_PATH");
        }
        if (path.includes("..") || path.includes("//")) {
          return errorResponse("Path traversal or malformed path rejected", 400, "PATH_TRAVERSAL_REJECTED");
        }

        // Check object actually exists in storage metadata
        const { data: storageObj, error: storageError } = await adminClient.storage
          .from("community-attachments")
          .list(user.id, { search: path.replace(`${user.id}/`, "") });

        if (storageError || !storageObj || storageObj.length === 0) {
          return errorResponse(`Attachment '${path}' does not exist in storage`, 400, "ATTACHMENT_NOT_FOUND");
        }

        const objMetadata = storageObj[0];
        const trustedMime = objMetadata.metadata?.mimetype || att.mime_type || "application/octet-stream";
        const trustedSize = objMetadata.metadata?.size || att.file_size || 0;

        const { data: attRecord, error: attError } = await adminClient
          .from("community_attachments")
          .insert({
            post_id: post.id,
            owner_user_id: user.id,
            storage_path: path,
            file_name: att.file_name || objMetadata.name,
            mime_type: trustedMime,
            file_size: trustedSize,
          })
          .select()
          .single();

        if (!attError && attRecord) {
          createdAttachments.push(attRecord);
        }
      }
    }

    return jsonResponse({
      success: true,
      post: {
        ...post,
        community_attachments: createdAttachments,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 401, "UNAUTHORIZED");
  }
});
