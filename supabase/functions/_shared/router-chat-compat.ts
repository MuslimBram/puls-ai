import { callAI, type AIMessage } from "./ai-client.ts";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatRequest = {
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  model?: string;
};

type RouterContext = {
  workspaceId?: string;
  userId?: string;
  authHeader?: string | null;
  taskType?: string;
};

/**
 * Compatibility adapter for older OpenAI-style internal callers.
 *
 * It does not call a provider directly. Every request is routed through the
 * canonical Pulse AI ai-router so provider selection, failover, workspace
 * authorization and usage accounting remain centralized.
 */
export async function routerChatCompletion(
  request: ChatRequest,
  context: RouterContext,
): Promise<Response> {
  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    throw new Error("messages are required");
  }

  const messages: AIMessage[] = request.messages.map((message) => ({
    role: message.role,
    content: String(message.content ?? ""),
  }));

  const result = await callAI(messages, {
    maxTokens: request.max_tokens,
    taskType: context.taskType ?? "balanced",
    workspaceId: context.workspaceId,
    userId: context.userId,
    authHeader: context.authHeader ?? null,
  });

  return new Response(
    JSON.stringify({
      choices: [{ message: { content: result.text } }],
      model: result.model,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
