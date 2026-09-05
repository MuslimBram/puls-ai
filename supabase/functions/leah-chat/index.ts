import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createAdminClient } from "../_shared/admin-client.ts";
import { resolveLeahSession, rejectWorkspaceInjection } from "../_shared/leah-session.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { routeLeahRequest } from "../_shared/leah-orchestrator.ts";
import { generateProvider, parseProviderId, ProviderKnownError, ProviderUnknownOutcomeError } from "../_shared/leah-provider-client.ts";

const admin = createAdminClient();
const cors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function requireAdmin(userId: string, workspaceId: string) {
  const { data, error } = await admin.rpc("has_workspace_role_for_user", {
    _user_id: userId,
    _workspace_id: workspaceId,
    _roles: ["owner", "admin"],
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: LEAH chat requires workspace admin access");
}

async function providerCredential(workspaceId: string, userId: string, provider: string) {
  const { data: binding, error: bindingError } = await admin
    .from("leah_workspace_provider_bindings")
    .select("id,provider,secret_id,model,status,validation_status")
    .eq("workspace_id", workspaceId)
    .eq("provider", provider)
    .eq("status", "active")
    .maybeSingle();
  if (bindingError) throw bindingError;
  if (!binding) throw new Error("LEAH provider binding not found");
  if (binding.validation_status !== "valid") throw new Error("LEAH provider is not validated");

  const { data: secret, error: secretError } = await admin.rpc("leah_vault_read_for_runtime", {
    _workspace_id: workspaceId,
    _user_id: userId,
    _secret_id: binding.secret_id,
    _execution_id: null,
  });
  if (secretError) throw secretError;
  if (typeof secret !== "string" || !secret) throw new Error("LEAH provider credential unavailable");
  return { binding, apiKey: secret };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const session = await resolveLeahSession(req, admin);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    rejectWorkspaceInjection(body);

    const user = typeof body.user === "string" ? body.user.trim() : "";
    if (!user || user.length > 20_000) throw new Error("user is required");

    await requireAdmin(session.userId, session.workspaceId);

    const logicalRequestId = crypto.randomUUID();
    const routing = await routeLeahRequest({
      admin,
      workspaceId: session.workspaceId,
      logicalRequestId,
      capability: "general",
      estimatedInputTokens: Math.min(8_000, Math.ceil(user.length / 3)),
      estimatedOutputTokens: 1_500,
    });

    // Admin/Owner access is intentionally free of the future customer paywall.
    // The orchestrator still chooses the provider/model; an approval gate does not
    // block platform administrators while paid customer entitlement is being built.
    const provider = parseProviderId(routing.provider);
    const { binding, apiKey } = await providerCredential(session.workspaceId, session.userId, provider);
    const conversation = Array.isArray(body.conversation) ? body.conversation : [];
    const context = conversation
      .slice(-12)
      .map((item) => item && typeof item === "object"
        ? `${String((item as Record<string, unknown>).role ?? "user")}: ${String((item as Record<string, unknown>).content ?? "")}`
        : "")
      .filter(Boolean)
      .join("\n");

    const result = await generateProvider({
      provider,
      apiKey,
      model: routing.model || binding.model,
      system: "You are LEAH, Pulse AI's generation assistant. Produce the requested result directly. Do not mention internal provider selection, routing, API keys, or orchestration unless explicitly asked.",
      user: context ? `${context}\n\nCurrent request:\n${user}` : user,
      timeoutMs: 60_000,
    });

    if (!result.valid || !result.text.trim()) throw new Error("LEAH provider returned no valid result");

    return json(req, {
      text: result.text,
      provider: routing.provider,
      model: routing.model || binding.model,
      routing_reason: routing.reason,
      usage: result.usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LEAH generation failed";
    const status = message === "LEAH session required" || message === "LEAH session invalid or expired"
      ? 401
      : message.startsWith("Forbidden") || message.includes("entitlement")
        ? 403
        : error instanceof ProviderKnownError
          ? 502
          : error instanceof ProviderUnknownOutcomeError
            ? 409
            : message.includes("required") || message.includes("Invalid") || message.includes("not found")
              ? 400
              : 500;
    return json(req, { error: status === 500 ? "Internal LEAH generation error" : message }, status);
  }
});
