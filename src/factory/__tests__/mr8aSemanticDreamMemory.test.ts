import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260901210000_leah_semantic_dream_memory.sql"),
  "utf8",
);
const hardening = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260901210050_leah_semantic_truth_hardening.sql"),
  "utf8",
);
const runtime = readFileSync(
  resolve(process.cwd(), "supabase/functions/leah-semantic-memory/index.ts"),
  "utf8",
);
const embeddingClient = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/leah-embedding-client.ts"),
  "utf8",
);
const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");
const verifier = readFileSync(
  resolve(process.cwd(), "scripts/verify-leah-semantic-dream-memory.sql"),
  "utf8",
);

describe("MR8A Semantic / Dream Memory source contract", () => {
  it("uses a real pgvector column and durable embedding attempt ledger", () => {
    expect(migration).toContain("embedding extensions.vector(1536)");
    expect(migration).toContain("create table public.leah_memory_embedding_attempts");
    expect(migration).toContain("status in ('in_flight','succeeded','failed','unknown')");
    expect(migration).toContain("leah_semantic_memory_embedding_hnsw_idx");
    expect(migration).toContain("extensions.vector_cosine_ops");
  });

  it("makes fake embedded=true structurally impossible", () => {
    expect(migration).toContain("embedded semantic memory requires a real vector");
    expect(migration).toContain("embedded semantic memory requires a succeeded matching attempt");
    expect(migration).toContain("semantic embedding evidence mismatch");
    expect(migration).toContain("Direct embedded mark disabled by MR8A");
    expect(migration).toContain("where status = 'embedded'\n  and embedding is null");
  });

  it("separates admission from settlement and preserves stale-settlement truth only", () => {
    expect(migration).toContain("leah_begin_semantic_embedding_for_task");
    expect(migration).toContain("t.lease_expires_at > clock_timestamp()");
    expect(migration).toContain("Settlement preserves truth for an already-admitted side effect");
    expect(migration).toContain("lease_token_hash");
    expect(hardening).toContain("lease_token_hash is not null");
  });

  it("has tenant-scoped vector retrieval with ranking, expiry and forgetting", () => {
    expect(migration).toContain("leah_recall_semantic_for_actor");
    expect(migration).toContain("leah_recall_semantic_for_task");
    expect(migration).toContain("m.workspace_id=_workspace_id and m.project_id=_project_id");
    expect(migration).toContain("0.70*s.similarity");
    expect(migration).toContain("leah_forget_semantic_for_actor");
    expect(migration).toContain("leah_expire_semantic_memories");
    expect(migration).toContain("status='forgotten',chunk='',embedding=null");
  });

  it("materializes dream memory only from proven embedded same-project sources", () => {
    expect(migration).toContain("leah_create_dream_memory_for_task");
    expect(migration).toContain("m.status='embedded' and m.embedding is not null");
    expect(migration).toContain("Dream source set contains duplicate, foreign, expired or non-embedded memory");
    expect(runtime).toContain('action === "semantic.dream"');
    expect(runtime).toContain("embedForTask(taskId, leaseToken, semanticId)");
  });

  it("uses a real OpenAI embeddings request and never a deterministic fake embedding", () => {
    expect(embeddingClient).toContain('https://api.openai.com/v1/embeddings');
    expect(embeddingClient).toContain('text-embedding-3-small');
    expect(embeddingClient).toContain("LEAH_EMBEDDING_DIMENSIONS = 1536");
    expect(embeddingClient).toContain("LEAH_OPENAI_CODE_API_KEY");
    expect(embeddingClient).not.toMatch(/deterministic|fakeEmbedding|hashEmbedding/i);
  });

  it("keeps the new runtime behind LEAH session or worker-secret authentication", () => {
    expect(config).toContain("[functions.leah-semantic-memory]");
    expect(config).toMatch(/\[functions\.leah-semantic-memory\]\s+verify_jwt = false/);
    expect(runtime).toContain("resolveLeahSession(req, admin)");
    expect(runtime).toContain("requireWorker(req)");
    expect(runtime).toContain("workspace_id is server-derived and must not be supplied");
  });

  it("ships an adversarial runtime verifier for cross-tenant, fake embedding, dream and forgetting", () => {
    expect(verifier).toContain("fake embedded=true succeeded");
    expect(verifier).toContain("cross-workspace semantic recall succeeded");
    expect(verifier).toContain("legacy semantic.mark fabricated embedded=true");
    expect(verifier).toContain("stale task lease admitted new embedding");
    expect(verifier).toContain("forgotten memory remained retrievable");
    expect(verifier).toContain("MR8A SEMANTIC / DREAM MEMORY CONTRACT: PASS");
  });
});
