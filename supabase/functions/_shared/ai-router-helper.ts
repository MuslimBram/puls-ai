import { getServiceKey } from "./admin-client.ts";

type RouterMessage = { role: string; content: string | Array<unknown> };

type CallAIRouterOptions = {
  taskType?: string;
  workspaceId?: string;
  userId?: string;
  authHeader?: string | null;
  maxTokens?: number;
  preferCheap?: boolean;
};

export async function callAIRouter(
  messages: RouterMessage[],
  systemPrompt: string,
  options: CallAIRouterOptions = {},
): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("SUPABASE_URL missing");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.authHeader) {
    headers.Authorization = options.authHeader;
  } else {
    headers.Authorization = ["Bearer", getServiceKey()].join(" ");
    const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
    if (internalSecret) headers["x-internal-secret"] = internalSecret;
  }

  const payload: Record<string, unknown> = {
    task_type: options.taskType ?? "balanced",
    messages,
    system_prompt: systemPrompt,
    max_tokens: options.maxTokens ?? 500,
  };

  if (options.workspaceId) payload.workspace_id = options.workspaceId;
  if (options.userId) payload.user_id = options.userId;
  if (options.preferCheap !== undefined) payload.prefer_cheap = options.preferCheap;

  const res = await fetch(`${supabaseUrl}/functions/v1/ai-router`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let code = "";
    let message = "";
    try {
      const err = await res.json() as Record<string, unknown>;
      code = String(err.code ?? "");
      message = String(err.error ?? "");
    } catch {
      // noop
    }
    throw new Error(`ai-router ${res.status}${code ? ` ${code}` : ""}${message ? `: ${message}` : ""}`);
  }

  const data = await res.json() as Record<string, unknown>;
  return String(
    data.response ??
    data.content ??
    data.text ??
    "",
  );
}
