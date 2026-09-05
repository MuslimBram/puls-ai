import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createAdminClient } from "../_shared/admin-client.ts";
import { resolveLeahSession, rejectWorkspaceInjection } from "../_shared/leah-session.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { generateProvider, parseProviderId, ProviderKnownError, ProviderUnknownOutcomeError } from "../_shared/leah-provider-client.ts";

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
    if (!(roles ?? []).some((row) => row.role === "admin" || row.role === "super_admin")) {
      return json(req, { error: "LEAH chat requires an administrator role" }, 403);
    }
    const userText = requiredText(body.user, "user", 12000);
    const conversation = Array.isArray(body.conversation) ? body.conversation.slice(-20) : [];
    const safeConversation = conversation.filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).role && typeof (item as Record<string, unknown>).content === "string")
      .map((item) => ({ role: (item as Record<string, unknown>).role === "assistant" ? "assistant" : "user", content: String((item as Record<string, unknown>).content).slice(0, 12000) }));
    const { data: bindings, error: bindingError } = await admin.from("leah_workspace_provider_bindings")
      .select("provider, model, secret_id, status, validation_status")
      .eq("workspace_id", session.workspaceId).eq("status", "active").order("provider");
    if (bindingError) throw bindingError;
    const binding = (bindings ?? []).find((row) => row.provider === "openai") ?? (bindings ?? [])[0];
    if (!binding) return json(req, { error: "No active LEAH provider binding" }, 404);
    if (binding.validation_status !== "valid") return json(req, { error: "LEAH provider is not validated" }, 409);
    const { data: secret, error: secretError } = await admin.rpc("leah_vault_read_for_runtime", { _workspace_id: session.workspaceId, _user_id: session.userId, _secret_id: binding.secret_id, _execution_id: null });
    if (secretError) throw secretError;
    if (typeof secret !== "string" || !secret) throw new Error("Secret unavailable");
    const result = await generateProvider({
      provider: parseProviderId(binding.provider),
      apiKey: secret,
      model: binding.model,
      system: "You are LEAH, the Pulse AI assistant. Answer clearly and helpfully. Never claim to have taken an external action unless the system confirms it.",
      user: safeConversation.length ? JSON.stringify([...safeConversation, { role: "user", content: userText }]) : userText,
      timeoutMs: 30000,
    });
    if (!result.valid || !result.text.trim()) return json(req, { error: "Invalid provider output" }, 502);
    return json(req, { text: result.text.trim(), provider: binding.provider, model: binding.model, provider_request_id: result.providerRequestId, usage: result.usage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal LEAH chat error";
    const status = message.includes("session") ? 401 : message.includes("required") || message.includes("server-derived") ? 400 : error instanceof ProviderKnownError ? error.status : error instanceof ProviderUnknownOutcomeError ? 409 : 500;
    return json(req, { error: status === 500 ? "Internal LEAH chat error" : message }, status);
  }
});