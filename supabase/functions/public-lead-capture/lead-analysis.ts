export type PublicLeadCaptureBody = {
  name: string;
  email: string;
  phone?: string;
  business_name?: string;
  message?: string;
  interested_plan?: string;
  team_size?: string;
  honeypot?: string;
  source?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  page_url?: string;
  target_workspace_id?: string;
};

export type AskAIOptions = {
  taskType?: string;
  workspaceId?: string;
  userId?: string;
  authHeader?: string | null;
};

export type AskAIFunction = (
  systemPrompt: string,
  userPrompt: string,
  maxTokens?: number,
  options?: AskAIOptions,
) => Promise<string>;

export type LeadAnalysis = {
  score: number;
  intent: "cold" | "warm" | "hot";
  notes: string;
  usedAI: boolean;
  routedWorkspaceId: string | null;
};

export type LeadAnalysisDeps = {
  askAI: AskAIFunction;
  resolveTrustedWorkspaceId?: (body: PublicLeadCaptureBody) => string | null | Promise<string | null>;
};

export function deterministicLeadFallback(body: PublicLeadCaptureBody): LeadAnalysis {
  const hasMessage = Boolean(body.message?.trim());
  return {
    score: hasMessage ? 0.6 : 0.4,
    intent: hasMessage ? "warm" : "cold",
    notes: "Deterministic fallback classification applied.",
    usedAI: false,
    routedWorkspaceId: null,
  };
}

export async function analyzePublicLead(
  body: PublicLeadCaptureBody,
  deps: LeadAnalysisDeps,
): Promise<LeadAnalysis> {
  const trustedWorkspaceId = await (deps.resolveTrustedWorkspaceId?.(body) ?? null);
  const fallback = deterministicLeadFallback(body);

  if (!trustedWorkspaceId) {
    return fallback;
  }

  const aiPrompt = `Analizo këtë lead dhe kthe VETËM JSON të vlefshëm:
Emri: ${body.name}
Email: ${body.email}
Biznesi: ${body.business_name ?? "i panjohur"}
Mesazhi: ${body.message ?? "nuk ka mesazh"}
Plani: ${body.interested_plan ?? "i panjohur"}

Kthe: {"score": 0.0-1.0, "intent": "cold|warm|hot", "notes": "1 fjali"}`;

  try {
    const aiResult = await deps.askAI(
      "Ti je analizues i leads. Kthen VETËM JSON të vlefshëm pa markdown.",
      aiPrompt,
      150,
      { workspaceId: trustedWorkspaceId, taskType: "text_classification" },
    );
    const parsed = JSON.parse(aiResult.replace(/```json|```/g, "").trim()) as Record<string, unknown>;
    const intent = parsed.intent;

    return {
      score: Math.min(1, Math.max(0, Number(parsed.score ?? fallback.score))),
      intent: intent === "cold" || intent === "warm" || intent === "hot" ? intent : fallback.intent,
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      usedAI: true,
      routedWorkspaceId: trustedWorkspaceId,
    };
  } catch {
    return {
      ...fallback,
      routedWorkspaceId: trustedWorkspaceId,
    };
  }
}
