import { callAI, type AIMessage } from "./ai-client.ts";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type FunctionTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

type ChatRequest = {
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  model?: string;
  tools?: FunctionTool[];
  tool_choice?: unknown;
};

type RouterContext = {
  workspaceId?: string;
  userId?: string;
  authHeader?: string | null;
  taskType?: string;
  allowInternalNoWorkspace?: boolean;
};

function stripCodeFence(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function selectedTool(request: ChatRequest): FunctionTool | null {
  if (!request.tools?.length) return null;

  const choice = request.tool_choice as
    | { type?: string; function?: { name?: string } }
    | undefined;
  const requestedName = choice?.function?.name;

  if (requestedName) {
    return request.tools.find((tool) => tool.function.name === requestedName) ?? request.tools[0];
  }

  return request.tools[0];
}

/**
 * Compatibility adapter for older OpenAI-style internal callers.
 *
 * It does not call a provider directly. Every request is routed through the
 * canonical Pulse AI ai-router so provider selection, failover, workspace
 * authorization and usage accounting remain centralized.
 *
 * Existing function/tool-call contracts are preserved without provider-level
 * tool dispatch: the selected JSON schema is added to the routed prompt and
 * the validated JSON text is exposed again through message.tool_calls.
 */
export async function routerChatCompletion(
  request: ChatRequest,
  context: RouterContext,
): Promise<Response> {
  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    throw new Error("messages are required");
  }

  const tool = selectedTool(request);
  const messages: AIMessage[] = request.messages.map((message) => ({
    role: message.role,
    content: String(message.content ?? ""),
  }));

  if (tool) {
    const schema = tool.function.parameters ?? { type: "object" };
    const structuredInstruction = [
      `Return ONLY a valid JSON object for function "${tool.function.name}".`,
      tool.function.description ? `Purpose: ${tool.function.description}` : "",
      `JSON schema: ${JSON.stringify(schema)}`,
      "Do not wrap the JSON in markdown or add explanatory text.",
    ].filter(Boolean).join("\n");

    const existingSystem = messages.find((message) => message.role === "system");
    if (existingSystem) {
      existingSystem.content = `${existingSystem.content}\n\n${structuredInstruction}`;
    } else {
      messages.unshift({ role: "system", content: structuredInstruction });
    }
  }

  let result;
  try {
    result = await callAI(messages, {
      maxTokens: request.max_tokens,
      taskType: context.taskType ?? "balanced",
      workspaceId: context.workspaceId,
      userId: context.userId,
      authHeader: context.authHeader ?? null,
      allowInternalNoWorkspace: context.allowInternalNoWorkspace,
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "AI router request failed",
    }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const content = result.text ?? "";
  let toolCalls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }> | undefined;

  if (tool) {
    const cleaned = stripCodeFence(content);
    try {
      const parsed = JSON.parse(cleaned);
      toolCalls = [{
        id: `router_${crypto.randomUUID()}`,
        type: "function",
        function: {
          name: tool.function.name,
          arguments: JSON.stringify(parsed),
        },
      }];
    } catch {
      return new Response(JSON.stringify({
        error: `Structured AI response for ${tool.function.name} was not valid JSON`,
      }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(
    JSON.stringify({
      choices: [{
        message: {
          content,
          ...(toolCalls ? { tool_calls: toolCalls } : {}),
        },
      }],
      model: result.model,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
