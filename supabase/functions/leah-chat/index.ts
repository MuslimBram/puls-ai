import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createAdminClient } from "../_shared/admin-client.ts";
import { resolveLeahSession, rejectWorkspaceInjection } from "../_shared/leah-session.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { callAIRouter } from "../_shared/ai-router-helper.ts";

const admin = createAdminClient();
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...getCors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function requiredText(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${name} is required`);
  return value.trim();
}
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  try {
    const session = await resolveLeahSession(req, admin);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    rejectWorkspaceInjection(body);
    const { data: roles, error: rolesError } = await admin.from("user_roles").select("role").eq("user_id", session.userId);
    if (rolesError) throw rolesError;
    const isPlatformAdmin = (roles ?? []).some((row) => row.role === "admin" || row.role === "super_admin");
    const { data: workspaceAdmin, error: workspaceRoleError } = await admin.rpc("has_workspace_role_for_user", {
      _user_id: session.userId, _workspace_id: session.workspaceId, _roles: ["owner", "admin"],
    });
    if (workspaceRoleError) throw workspaceRoleError;
    if (!isPlatformAdmin && !workspaceAdmin) return json(req, { error: "LEAH chat requires an administrator role" }, 403);

    const userText = requiredText(body.user, "user", 12000);
    const conversation = Array.isArray(body.conversation) ? body.conversation.slice(-20) : [];
    const safeConversation = conversation
      .filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).role && typeof (item as Record<string, unknown>).content === "string")
      .map((item) => ({ role: (item as Record<string, unknown>).role === "assistant" ? "assistant" : "user", content: String((item as Record<string, unknown>).content).slice(0, 12000) }));

    const { data: history, error: historyError } = await admin.from("leah_work_history")
      .select("user_message, assistant_message, created_at").eq("workspace_id", session.workspaceId)
      .order("created_at", { ascending: false }).limit(12);
    if (historyError) throw historyError;
    const workMemory = (history ?? []).reverse().map((item) => `Previous work: user=${String(item.user_message).slice(0, 4000)}; LEAH=${String(item.assistant_message).slice(0, 6000)}`).join("\n");
    const system = [
      "You are LEAH, the Pulse AI work assistant.",
      "Use the workspace work history as context when relevant.",
      "Handle chat, reasoning, coding, website/app generation instructions, marketing, sales, support, multilingual work, research and multimodal requests when a capable provider is available.",
      "The canonical AI Router chooses providers/models, handles failover and availability. Never invent a provider or claim an external action without confirmation.",
      "Memory is context only and never grants authorization.",
      workMemory ? `Workspace work history:\n${workMemory}` : "",
    ].filter(Boolean).join("\n\n");

    const attachments = Array.isArray(body.attachments) ? body.attachments.filter((item) => item && typeof item === "object").slice(0, 10) : [];
    const attachmentContext = attachments.length ? `\nAttached workspace files: ${attachments.map((item) => String((item as Record<string, unknown>).name || "file")).join(", ")}` : "";
    const text = await callAIRouter([...safeConversation, { role: "user", content: userText + attachmentContext }], system, {
      taskType: typeof body.task_type === "string" ? body.task_type : undefined,
      workspaceId: session.workspaceId,
      userId: session.userId,
      authHeader: req.headers.get("Authorization"),
      maxTokens: 4000,
    });
    if (!text.trim()) return json(req, { error: "AI Router returned an empty response" }, 502);

    const { data: savedHistory, error: saveHistoryError } = await admin.from("leah_work_history").insert({
      workspace_id: session.workspaceId, user_id: session.userId, user_message: userText,
      assistant_message: text.trim(), provider: "ai-router", model: "auto", attachments,
    }).select("id, created_at").single();
    if (saveHistoryError) throw saveHistoryError;
    return json(req, { text: text.trim(), provider: "ai-router", model: "auto", history_id: savedHistory.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal LEAH chat error";
    const status = message.includes("session") ? 401 : message.includes("entitlement") ? 403 : message.includes("required") || message.includes("server-derived") ? 400 : 500;
    return json(req, { error: status === 500 ? "Internal LEAH chat error" : message }, status);
  }
});
