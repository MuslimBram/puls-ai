export const LEAH_EMBEDDING_PROVIDER = "openai" as const;
export const LEAH_EMBEDDING_MODEL = "text-embedding-3-small" as const;
export const LEAH_EMBEDDING_DIMENSIONS = 1536 as const;

export type LeahEmbeddingResult = {
  embedding: number[];
  provider: typeof LEAH_EMBEDDING_PROVIDER;
  model: typeof LEAH_EMBEDDING_MODEL;
  dimensions: typeof LEAH_EMBEDDING_DIMENSIONS;
  providerRequestId: string | null;
  inputTokens: number | null;
};

export class LeahEmbeddingKnownError extends Error {
  constructor(public status: number, public code: string) {
    super(`embedding ${code}`);
    this.name = "LeahEmbeddingKnownError";
  }
}

export class LeahEmbeddingUnknownOutcomeError extends Error {
  constructor(message = "embedding provider outcome unknown") {
    super(message);
    this.name = "LeahEmbeddingUnknownOutcomeError";
  }
}

function errorCode(status: number): string {
  if (status === 400) return "bad_request";
  if (status === 401) return "invalid_credential";
  if (status === 402) return "payment_required";
  if (status === 403) return "forbidden";
  if (status === 404) return "endpoint_not_found";
  if (status === 408) return "provider_timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_5xx";
  return "provider_http_error";
}

function embeddingKey(): string {
  // MR8A uses the already-separated LEAH server credential first. The legacy
  // OpenAI key is only a compatibility fallback while credential migration is in progress.
  return (Deno.env.get("LEAH_OPENAI_CODE_API_KEY") ?? Deno.env.get("OPENAI_API_KEY") ?? "").trim();
}

export function vectorLiteral(values: number[]): string {
  if (values.length !== LEAH_EMBEDDING_DIMENSIONS) throw new Error("embedding dimension mismatch");
  if (!values.every((value) => Number.isFinite(value))) throw new Error("embedding contains non-finite values");
  return `[${values.join(",")}]`;
}

export async function embedLeahText(input: string, timeoutMs = 30_000): Promise<LeahEmbeddingResult> {
  const apiKey = embeddingKey();
  if (!apiKey) throw new LeahEmbeddingKnownError(503, "embedding_credential_missing");
  const text = input.trim();
  if (!text || text.length > 100_000) throw new LeahEmbeddingKnownError(400, "invalid_embedding_input");

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: LEAH_EMBEDDING_MODEL,
        input: text,
        encoding_format: "float",
        dimensions: LEAH_EMBEDDING_DIMENSIONS,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Once dispatch was attempted, a transport timeout/disconnect is not treated
    // as a known provider rejection. The durable attempt is settled as `unknown`.
    throw new LeahEmbeddingUnknownOutcomeError();
  }

  if (!response.ok) throw new LeahEmbeddingKnownError(response.status, errorCode(response.status));

  let data: Record<string, unknown>;
  try {
    const parsed = await response.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad payload");
    data = parsed as Record<string, unknown>;
  } catch {
    throw new LeahEmbeddingUnknownOutcomeError("unreadable successful embedding response");
  }

  const rows = Array.isArray(data.data) ? data.data : [];
  const first = rows[0] && typeof rows[0] === "object" ? rows[0] as Record<string, unknown> : null;
  const values = Array.isArray(first?.embedding) ? first.embedding : [];
  const embedding = values.map((value) => Number(value));
  if (embedding.length !== LEAH_EMBEDDING_DIMENSIONS || !embedding.every(Number.isFinite)) {
    throw new LeahEmbeddingUnknownOutcomeError("invalid successful embedding vector");
  }

  const usage = data.usage && typeof data.usage === "object" && !Array.isArray(data.usage)
    ? data.usage as Record<string, unknown>
    : {};
  const promptTokens = typeof usage.prompt_tokens === "number" && Number.isFinite(usage.prompt_tokens)
    ? Math.max(0, Math.floor(usage.prompt_tokens))
    : null;

  return {
    embedding,
    provider: LEAH_EMBEDDING_PROVIDER,
    model: LEAH_EMBEDDING_MODEL,
    dimensions: LEAH_EMBEDDING_DIMENSIONS,
    providerRequestId: response.headers.get("x-request-id") ?? response.headers.get("request-id"),
    inputTokens: promptTokens,
  };
}
