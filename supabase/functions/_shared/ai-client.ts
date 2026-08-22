// supabase/functions/_shared/ai-client.ts
// ============================================================
// AI Client i unifikuar (AI-1B)
// Canonical path: ai-router only
// ============================================================

import { callAIRouter } from "./ai-router-helper.ts";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  text: string;
  provider: string;
  model: string;
}

export async function callAI(
  messages: AIMessage[],
  options: {
    maxTokens?: number;
    systemPrompt?: string;
    taskType?: string;
    workspaceId?: string;
    userId?: string;
    authHeader?: string | null;
  } = {},
): Promise<AIResponse> {
  const maxTokens = options.maxTokens ?? 1000;
  const taskType = options.taskType ?? "balanced";

  const systemMsg = messages.find((m) => m.role === "system")?.content
    ?? options.systemPrompt
    ?? "You are a helpful AI assistant.";

  const routerMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  if (!options.workspaceId && !options.authHeader) {
    throw new Error("ai-router requires workspace context or verified auth");
  }

  const text = await callAIRouter(routerMessages, systemMsg, {
    taskType,
    workspaceId: options.workspaceId,
    userId: options.userId,
    authHeader: options.authHeader ?? null,
    maxTokens,
  });

  return { text, provider: "ai-router", model: "ai-router" };
}

export async function askAI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 800,
  options: {
    taskType?: string;
    workspaceId?: string;
    userId?: string;
    authHeader?: string | null;
  } = {},
): Promise<string> {
  const result = await callAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { maxTokens, ...options },
  );
  return result.text;
}
