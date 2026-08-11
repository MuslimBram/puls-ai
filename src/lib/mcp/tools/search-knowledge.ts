import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "search_knowledge",
  title: "Search knowledge base",
  description:
    "Full-text search over the signed-in user's knowledge base chunks (scan results, documents, FAQs).",
  inputSchema: {
    query: z.string().min(2).describe("Text to search for inside knowledge chunks."),
    limit: z.number().int().min(1).max(50).optional(),
    business_id: z.string().uuid().optional().describe("Restrict the search to one business."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit, business_id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    let q = sb(ctx)
      .from("knowledge_chunks")
      .select("id, business_id, content, content_type, chunk_index, created_at")
      .ilike("content", `%${query.replace(/[%_]/g, "")}%`)
      .order("created_at", { ascending: false })
      .limit(limit ?? 10);

    if (business_id) q = q.eq("business_id", business_id);

    const { data, error } = await q;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : {
          content: [{ type: "text", text: JSON.stringify(data) }],
          structuredContent: { chunks: data ?? [] },
        };
  },
});
