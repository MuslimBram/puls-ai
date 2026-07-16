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
  name: "list_inbox_messages",
  title: "List inbox messages",
  description: "List recent unified inbox messages for the signed-in user.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).optional(),
    channel: z.string().optional().describe("Filter by channel (whatsapp, instagram, email, sms, ...)."),
    unread_only: z.boolean().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, channel, unread_only }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = sb(ctx).from("inbox_messages").select("*").order("created_at", { ascending: false }).limit(limit ?? 20);
    if (channel) q = q.eq("channel", channel);
    if (unread_only) q = q.eq("is_read", false);
    const { data, error } = await q;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { messages: data ?? [] } };
  },
});
