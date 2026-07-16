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
  name: "create_lead",
  title: "Create lead",
  description: "Create a new lead in the signed-in user's CRM.",
  inputSchema: {
    name: z.string().trim().min(1).describe("Lead full name."),
    email: z.string().trim().optional().describe("Lead email."),
    phone: z.string().trim().optional().describe("Lead phone."),
    source: z.string().trim().optional().describe("Where the lead came from."),
    notes: z.string().trim().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await sb(ctx)
      .from("leads")
      .insert({
        user_id: ctx.getUserId(),
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        source: input.source ?? "mcp",
        notes: input.notes ?? null,
        status: "new",
      })
      .select()
      .single();
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : { content: [{ type: "text", text: `Lead created: ${data?.id}` }], structuredContent: { lead: data } };
  },
});
