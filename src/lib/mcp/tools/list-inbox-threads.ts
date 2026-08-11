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
  name: "list_inbox_threads",
  title: "List inbox threads",
  description:
    "List unified inbox conversation threads for the signed-in user, most recently active first.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).optional(),
    channel_type: z
      .string()
      .optional()
      .describe("Filter by channel type (whatsapp, instagram, email, sms, ...)."),
    status: z
      .string()
      .optional()
      .describe("Filter by thread status (new, open, pending, resolved, closed)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, channel_type, status }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    let q = sb(ctx)
      .from("conversation_threads")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(limit ?? 20);

    if (channel_type) q = q.eq("channel_type", channel_type);
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : {
          content: [{ type: "text", text: JSON.stringify(data) }],
          structuredContent: { threads: data ?? [] },
        };
  },
});
