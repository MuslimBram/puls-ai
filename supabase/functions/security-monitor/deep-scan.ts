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

export type ThreatCategory =
  | "malware" | "phishing" | "sql_injection" | "xss" | "prompt_injection"
  | "command_injection" | "spam" | "scam" | "fraud" | "brute_force"
  | "bot_activity" | "api_abuse" | "ddos" | "account_takeover" | "chargeback_abuse"
  | "dangerous_link" | "suspicious_file" | "clean";

export type Severity = "low" | "medium" | "high" | "critical";

export interface ThreatResult {
  found: boolean;
  category: ThreatCategory;
  severity: Severity;
  score: number;
  matched: string;
  action: "allow" | "flag" | "block" | "quarantine";
  reason: string;
}

export type VerifiedWorkspaceAIContext = {
  workspaceId: string;
  authHeader: string;
  userId: string;
};

export function hasVerifiedWorkspaceAIContext(
  context: VerifiedWorkspaceAIContext | null | undefined,
): context is VerifiedWorkspaceAIContext {
  return Boolean(context?.workspaceId && context?.authHeader && context?.userId);
}

export async function runVerifiedDeepScan(
  content: string,
  context: string,
  aiContext: VerifiedWorkspaceAIContext | null,
  askAI: AskAIFunction,
): Promise<ThreatResult | null> {
  if (!hasVerifiedWorkspaceAIContext(aiContext)) {
    return null;
  }

  try {
    const result = await askAI(
      `You are an enterprise-grade security analyst. Analyze this content and return ONLY JSON.
Kategoritë e mundshme: malware,phishing,sql_injection,xss,prompt_injection,command_injection,spam,scam,fraud,brute_force,bot_activity,api_abuse,account_takeover,dangerous_link,clean
Return: {"found":boolean,"category":"...","severity":"low|medium|high|critical","score":0.0-1.0,"reason":"...","action":"allow|flag|block|quarantine"}`,
      `Content: "${content.slice(0, 800)}"\nContext: ${context}`,
      200,
      {
        workspaceId: aiContext.workspaceId,
        authHeader: aiContext.authHeader,
        taskType: "text_classification",
        userId: aiContext.userId,
      },
    );
    const parsed = JSON.parse(result.replace(/```json|```/g, "").trim()) as Record<string, unknown>;
    if (!parsed.found || parsed.category === "clean") return null;

    return {
      found: true,
      category: parsed.category as ThreatCategory,
      severity: parsed.severity as Severity,
      score: Number(parsed.score ?? 0.5),
      matched: content.slice(0, 30),
      action: (parsed.action as ThreatResult["action"] | undefined) ?? "flag",
      reason: typeof parsed.reason === "string" ? parsed.reason : "AI detektoi kërcënim",
    };
  } catch {
    return null;
  }
}
