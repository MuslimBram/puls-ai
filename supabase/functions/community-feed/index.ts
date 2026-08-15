// supabase/functions/community-feed/index.ts
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
    await getAuthUser(req, userClient);

    const url = new URL(req.url);
    const category = url.searchParams.get("category");
    const search = url.searchParams.get("search");
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    let query = userClient
      .from("community_posts")
      .select("*, community_attachments(*)", { count: "exact" })
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (category) {
      query = query.eq("category", category);
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
    }

    const { data: posts, count, error } = await query;
    if (error) {
      return errorResponse(error.message, 400, "FEED_FETCH_FAILED");
    }

    // Generate signed URLs for attachments (configurable TTL, default 60s)
    const signedTtl = parseInt(Deno.env.get("COMMUNITY_ATTACHMENT_SIGNED_TTL") || "60", 10);
    const postsWithSignedAttachments = await Promise.all(
      (posts || []).map(async (post) => {
        if (!post.community_attachments || post.community_attachments.length === 0) {
          return post;
        }

        const attachmentsWithUrls = await Promise.all(
          post.community_attachments.map(async (att: { storage_path: string }) => {
            const { data } = await adminClient.storage
              .from("community-attachments")
              .createSignedUrl(att.storage_path, signedTtl);

            return {
              ...att,
              signed_url: data?.signedUrl || null,
            };
          })
        );

        return { ...post, community_attachments: attachmentsWithUrls };
      })
    );

    return jsonResponse({
      success: true,
      posts: postsWithSignedAttachments,
      total: count || 0,
      limit,
      offset,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 401, "UNAUTHORIZED");
  }
});
