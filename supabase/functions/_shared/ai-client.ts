// supabase/functions/_shared/ai-client.ts
// ============================================================
// AI Client i unifikuar
// Primary:  Lovable AI Gateway (ai.gateway.lovable.dev)
// Fallback: Anthropic API (api.anthropic.com)
// ============================================================

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  text: string;
  provider: "lovable" | "anthropic";
  model: string;
}

/**
 * Thirr AI me fallback automatik.
 * Provon Lovable Gateway fillimisht, kalon te Anthropic nëse dështon.
 */
export async function callAI(
  messages: AIMessage[],
  options: {
    maxTokens?: number;
    model?: string;
    systemPrompt?: string;
  } = {}
): Promise<AIResponse> {
  const maxTokens = options.maxTokens ?? 1000;
  const lovableModel = options.model ?? "google/gemini-3-flash-preview";
  const anthropicModel = "claude-sonnet-4-6";

  // Ndaj system nga user messages
  const systemMsg = messages.find((m) => m.role === "system")?.content
    ?? options.systemPrompt
    ?? "You are a helpful AI assistant.";
  const userMessages = messages.filter((m) => m.role !== "system");

  // ── 1. Provo Lovable Gateway ──────────────────────────────
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: lovableModel,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: systemMsg },
            ...userMessages,
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json() as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = data.choices?.[0]?.message?.content ?? "";
        if (text) return { text, provider: "lovable", model: lovableModel };
      }

      // Rate limit ose credits të mbaruar → kalon te Anthropic
      if (res.status === 429 || res.status === 402) {
        console.warn(`Lovable Gateway: ${res.status} — duke kaluar te Anthropic`);
      }
    } catch (err) {
      console.warn("Lovable Gateway dështoi:", err);
    }
  }

  // ── 2. Fallback: Anthropic API ────────────────────────────
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    throw new Error(
      "Asnjë AI provider i disponueshëm. Vendos LOVABLE_API_KEY ose ANTHROPIC_API_KEY."
    );
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: anthropicModel,
      max_tokens: maxTokens,
      system: systemMsg,
      messages: userMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API dështoi: ${res.status} — ${err}`);
  }

  const data = await res.json() as {
    content?: Array<{ text?: string }>;
  };
  const text = data.content?.[0]?.text ?? "";
  return { text, provider: "anthropic", model: anthropicModel };
}

/**
 * Thirrje e thjeshtë: sistem + një mesazh përdoruesi
 */
export async function askAI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 800
): Promise<string> {
  const result = await callAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { maxTokens }
  );
  return result.text;
}
