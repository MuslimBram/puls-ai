#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";

const PRODUCTION_PROJECT_REF = "wlvlgghqwwhhqaqqopml";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function uuid() {
  return crypto.randomUUID();
}

function redact(value) {
  if (!value) return value;
  if (typeof value === "string" && value.length > 16) return `${value.slice(0, 6)}…${value.slice(-4)}`;
  return value;
}

const target = required("MR9_TARGET");
const supabaseUrl = required("MR9_SUPABASE_URL").replace(/\/$/, "");
const anonKey = required("MR9_SUPABASE_ANON_KEY");
const email = required("MR9_TEST_EMAIL");
const password = required("MR9_TEST_PASSWORD");
const workspaceId = required("MR9_WORKSPACE_ID");
const workerSecret = required("MR9_WORKER_SECRET");
const deploymentTargetId = required("MR9_DEPLOY_TARGET_ID");

if (target !== "staging") throw new Error("MR9 harness is staging-only; MR9_TARGET must equal staging");
if (supabaseUrl.includes(PRODUCTION_PROJECT_REF)) throw new Error("MR9 harness refuses the Pulse AI Production Supabase project");
if (workerSecret.length < 32) throw new Error("MR9_WORKER_SECRET must be at least 32 characters");

const functionsBase = `${supabaseUrl}/functions/v1`;
const evidence = [];
let accessToken = "";
let leahSession = "";
let projectId = "";
let executionId = "";
let claimedTaskId = "";
let leaseToken = "";
let recipientTaskId = "";

function record(stage, verdict, details = {}) {
  evidence.push({ stage, verdict, ...details });
  console.log(`[MR9] ${verdict.padEnd(5)} ${stage}`);
}

async function request(url, { method = "POST", headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 500) }; }
  return { status: response.status, ok: response.ok, body: json, headers: response.headers };
}

async function edge(slug, body, headers = {}) {
  return request(`${functionsBase}/${slug}`, { headers, body });
}

function expectStatus(result, expected, stage) {
  assert.equal(result.status, expected, `${stage}: expected ${expected}, got ${result.status}: ${JSON.stringify(result.body)}`);
  record(stage, "PASS", { status: result.status });
}

function expect2xx(result, stage) {
  assert.ok(result.status >= 200 && result.status < 300, `${stage}: expected 2xx, got ${result.status}: ${JSON.stringify(result.body)}`);
  record(stage, "PASS", { status: result.status });
}

function nestedId(value, keys) {
  for (const path of keys) {
    let current = value;
    for (const key of path.split(".")) current = current?.[key];
    if (typeof current === "string" && /^[0-9a-f-]{36}$/i.test(current)) return current;
  }
  return null;
}

function providerIdFromCatalog(body) {
  const providers = body?.providers;
  assert.ok(Array.isArray(providers) && providers.length > 0, "task-bound provider catalog is empty");
  const first = providers[0];
  if (typeof first === "string" && first.trim()) return first.trim();
  if (first && typeof first === "object") {
    for (const key of ["provider", "provider_id", "id"]) {
      if (typeof first[key] === "string" && first[key].trim()) return first[key].trim();
    }
  }
  throw new Error(`provider catalog row has no provider id: ${JSON.stringify(first)}`);
}

try {
  // Negative: private session endpoint must reject missing JWT.
  expectStatus(await edge("leah-session", { workspace_id: workspaceId }), 401, "session rejects missing JWT");

  // Authenticate test actor against the isolated staging project.
  const login = await request(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey },
    body: { email, password },
  });
  expect2xx(login, "staging test user authenticates");
  accessToken = login.body?.access_token;
  assert.ok(typeof accessToken === "string" && accessToken.length > 20, "missing access token");

  // Positive: issue LEAH session only from authoritative Pulse JWT + workspace + entitlement.
  const session = await edge("leah-session", { workspace_id: workspaceId, mode: "direct" }, {
    Authorization: `Bearer ${accessToken}`,
  });
  expect2xx(session, "LEAH direct session issuance");
  leahSession = session.body?.session_token;
  assert.ok(typeof leahSession === "string" && leahSession.length > 20, "missing LEAH session token");

  // Negative: tenant identity must remain server-derived on the session API.
  expectStatus(await edge("leah-api", { action: "projects.list", workspace_id: workspaceId }, {
    "X-Leah-Session": leahSession,
  }), 400, "LEAH API rejects workspace injection");

  // Positive project lifecycle start.
  const createdProject = await edge("leah-api", {
    action: "projects.create",
    name: `MR9 Golden Journey ${new Date().toISOString()}`,
    description: "Disposable staging certification project",
    goal: "Prove the LEAH positive and negative Golden Journey without Production mutation",
  }, { "X-Leah-Session": leahSession });
  expectStatus(createdProject, 201, "project create");
  projectId = nestedId(createdProject.body, ["project.id"]);
  assert.ok(projectId, "project id missing");

  const idem = `mr9-${uuid()}`;
  const executionInput = { certification: "MR9", requested_at: new Date().toISOString() };
  const firstStart = await edge("leah-api", {
    action: "executions.start",
    project_id: projectId,
    idempotency_key: idem,
    input: executionInput,
  }, { "X-Leah-Session": leahSession });
  assert.equal(firstStart.status, 201, `first execution start must create: ${JSON.stringify(firstStart.body)}`);
  record("execution first start", "PASS", { status: firstStart.status });

  const replayStart = await edge("leah-api", {
    action: "executions.start",
    project_id: projectId,
    idempotency_key: idem,
    input: executionInput,
  }, { "X-Leah-Session": leahSession });
  assert.equal(replayStart.status, 200, `execution replay must return 200: ${JSON.stringify(replayStart.body)}`);
  record("execution idempotent replay", "PASS", { status: replayStart.status });

  executionId = nestedId(firstStart.body, ["execution_id", "execution.id", "id"])
    || nestedId(replayStart.body, ["execution_id", "execution.id", "id"]);
  if (!executionId) {
    const executions = await edge("leah-api", { action: "executions.list", project_id: projectId }, { "X-Leah-Session": leahSession });
    expect2xx(executions, "execution list fallback");
    executionId = executions.body?.executions?.[0]?.id || "";
  }
  assert.ok(executionId, "execution id missing");

  // Worker boundary must fail closed before any side effect.
  expectStatus(await edge("leah-worker", { action: "tasks.claim", worker_id: "mr9-invalid-worker" }, {
    "X-Leah-Worker-Secret": "x".repeat(32),
  }), 401, "worker rejects wrong secret");

  // Add a second task before claim so Agent Bus has a deterministic recipient target.
  const added = await edge("leah-worker", {
    action: "tasks.add",
    execution_id: executionId,
    input: { purpose: "MR9 recipient" },
    agent_role: "reviewer",
    priority: 90,
    max_attempts: 2,
  }, { "X-Leah-Worker-Secret": workerSecret });
  expectStatus(added, 201, "worker adds recipient task");
  const addedTaskId = nestedId(added.body, ["task.id", "task"]);
  assert.ok(addedTaskId, "recipient task id missing");

  const claim = await edge("leah-worker", {
    action: "tasks.claim",
    worker_id: `mr9-${uuid()}`,
    lease_seconds: 300,
  }, { "X-Leah-Worker-Secret": workerSecret });
  expect2xx(claim, "worker claims live task lease");
  claimedTaskId = nestedId(claim.body, ["task.id"]);
  leaseToken = claim.body?.task?.lease_token;
  assert.ok(claimedTaskId && typeof leaseToken === "string", `claim did not expose task lease: ${JSON.stringify(claim.body)}`);
  assert.equal(claim.body?.task?.execution_id, executionId, `worker claimed an unrelated staging task: ${JSON.stringify(claim.body?.task)}`);

  const tasks = await edge("leah-api", { action: "tasks.list", execution_id: executionId }, { "X-Leah-Session": leahSession });
  expect2xx(tasks, "task list after claim");
  recipientTaskId = tasks.body?.tasks?.find((row) => row.id !== claimedTaskId)?.id || addedTaskId;
  assert.ok(recipientTaskId && recipientTaskId !== claimedTaskId, "Agent Bus recipient task missing");

  // Agent-to-Agent durable send + replay + conflicting reuse negative.
  const busKey = `mr9-bus-${uuid()}`;
  const sent = await edge("leah-agent-bus", {
    action: "send",
    task_id: claimedTaskId,
    lease_token: leaseToken,
    recipient_task_id: recipientTaskId,
    topic: "mr9.golden-journey",
    kind: "event",
    payload: { phase: "positive", marker: "mr9" },
    idempotency_key: busKey,
  }, { "X-Leah-Worker-Secret": workerSecret });
  expectStatus(sent, 201, "Agent Bus send");

  const busReplay = await edge("leah-agent-bus", {
    action: "send",
    task_id: claimedTaskId,
    lease_token: leaseToken,
    recipient_task_id: recipientTaskId,
    topic: "mr9.golden-journey",
    kind: "event",
    payload: { phase: "positive", marker: "mr9" },
    idempotency_key: busKey,
  }, { "X-Leah-Worker-Secret": workerSecret });
  expectStatus(busReplay, 200, "Agent Bus idempotent replay");

  expectStatus(await edge("leah-agent-bus", {
    action: "send",
    task_id: claimedTaskId,
    lease_token: leaseToken,
    recipient_task_id: recipientTaskId,
    topic: "mr9.golden-journey",
    kind: "event",
    payload: { phase: "conflicting-reuse" },
    idempotency_key: busKey,
  }, { "X-Leah-Worker-Secret": workerSecret }), 409, "Agent Bus conflicting idempotency reuse rejected");

  // Provider boundary: caller cannot inject model/key/base URL; provider selection comes from server-owned catalog entries.
  expectStatus(await edge("leah-provider-proxy", {
    action: "catalog",
    task_id: claimedTaskId,
    lease_token: leaseToken,
    model: "caller-injected-model",
  }, { "X-Leah-Worker-Secret": workerSecret }), 400, "provider proxy rejects model injection");

  const catalog = await edge("leah-provider-proxy", {
    action: "catalog",
    task_id: claimedTaskId,
    lease_token: leaseToken,
  }, { "X-Leah-Worker-Secret": workerSecret });
  expect2xx(catalog, "task-bound provider catalog");
  const provider = providerIdFromCatalog(catalog.body);

  const attemptId = uuid();
  const logicalRequestId = uuid();
  const generation = await edge("leah-provider-proxy", {
    action: "generate",
    task_id: claimedTaskId,
    lease_token: leaseToken,
    attempt_id: attemptId,
    logical_request_id: logicalRequestId,
    provider,
    system: "Return a concise certification response. Do not execute tools.",
    user: "Reply with the exact text MR9_PROVIDER_OK",
  }, { "X-Leah-Worker-Secret": workerSecret });
  expect2xx(generation, "real task-bound provider inference");
  assert.ok(typeof generation.body?.text === "string" && generation.body.text.length > 0, "provider returned no text");

  const usage = generation.body?.usage || {};
  const usageSource = ["provider", "estimated", "unavailable"].includes(usage.usageSource) ? usage.usageSource : "unavailable";
  expect2xx(await edge("leah-provider-proxy", {
    action: "settle",
    task_id: claimedTaskId,
    lease_token: leaseToken,
    attempt_id: attemptId,
    outcome: "succeeded",
    provider_request_id: generation.body?.provider_request_id || null,
    usage_source: usageSource,
    input_tokens: Number.isInteger(usage.inputTokens) ? usage.inputTokens : null,
    output_tokens: Number.isInteger(usage.outputTokens) ? usage.outputTokens : null,
    total_tokens: Number.isInteger(usage.totalTokens) ? usage.totalTokens : null,
    canonical_result: true,
    metadata: { certification: "MR9" },
  }, { "X-Leah-Worker-Secret": workerSecret }), "provider attempt canonical settlement");

  // Semantic memory must reject caller tenant injection, then perform a real embedding.
  expectStatus(await edge("leah-semantic-memory", {
    action: "semantic.remember",
    workspace_id: workspaceId,
    project_id: projectId,
    source_ref: "mr9://forbidden",
    chunk: "forbidden",
  }, { "X-Leah-Session": leahSession }), 400, "semantic memory rejects workspace injection");

  const remembered = await edge("leah-semantic-memory", {
    action: "semantic.remember",
    project_id: projectId,
    source_ref: `mr9://${uuid()}`,
    chunk: "Macro-Run 9 semantic memory staging certification marker.",
    memory_kind: "semantic",
    importance: 0.8,
    confidence: 0.9,
  }, { "X-Leah-Session": leahSession });
  expect2xx(remembered, "real semantic memory embedding");

  // Observability worker evidence + user health read.
  expectStatus(await edge("leah-observability", {
    action: "events.emit",
    workspace_id: workspaceId,
    task_id: claimedTaskId,
    lease_token: leaseToken,
    event_key: `mr9-forbidden-${uuid()}`,
    trace_id: uuid(),
    span_id: uuid(),
    category: "certification",
    severity: "info",
    event_name: "mr9.workspace.inject",
    attributes: {},
  }, { "X-Leah-Worker-Secret": workerSecret }), 400, "observability rejects workspace injection");

  const rejectedEvent = await edge("leah-observability", {
    action: "events.emit",
    task_id: claimedTaskId,
    lease_token: leaseToken,
    event_key: `mr9-${uuid()}`,
    trace_id: uuid(),
    span_id: uuid(),
    category: "certification",
    severity: "info",
    event_name: "mr9.golden_journey.secret_negative",
    attributes: { phase: "negative", secret_material: "placeholder-only" },
  }, { "X-Leah-Worker-Secret": workerSecret });
  assert.ok(rejectedEvent.status >= 400, `secret-like telemetry key should be rejected: ${JSON.stringify(rejectedEvent.body)}`);
  record("observability rejects secret-like attributes", "PASS", { status: rejectedEvent.status });

  const safeEvent = await edge("leah-observability", {
    action: "events.emit",
    task_id: claimedTaskId,
    lease_token: leaseToken,
    event_key: `mr9-${uuid()}`,
    trace_id: uuid(),
    span_id: uuid(),
    category: "certification",
    severity: "info",
    event_name: "mr9.golden_journey.live",
    attributes: { phase: "positive", marker: "mr9" },
  }, { "X-Leah-Worker-Secret": workerSecret });
  expectStatus(safeEvent, 201, "observability emits lease-bound event");

  const health = await edge("leah-observability", { action: "health.get", project_id: projectId }, { "X-Leah-Session": leahSession });
  expect2xx(health, "session reads canonical runtime health");

  // Recovery evidence is non-destructive: checkpoint -> verify -> drill -> Preview plan verify.
  const checkpoint = await edge("leah-observability", { action: "recovery.checkpoint.create", project_id: projectId }, { "X-Leah-Session": leahSession });
  expectStatus(checkpoint, 201, "recovery checkpoint create");
  const checkpointId = nestedId(checkpoint.body, ["checkpoint.id", "checkpoint"]);
  assert.ok(checkpointId, "checkpoint id missing");

  expect2xx(await edge("leah-observability", { action: "recovery.checkpoint.verify", checkpoint_id: checkpointId }, { "X-Leah-Session": leahSession }), "recovery checkpoint verify");
  expectStatus(await edge("leah-observability", { action: "recovery.drill.run", checkpoint_id: checkpointId }, { "X-Leah-Session": leahSession }), 201, "recovery integrity drill");

  const plan = await edge("leah-observability", { action: "recovery.plan.prepare", checkpoint_id: checkpointId, environment: "preview" }, { "X-Leah-Session": leahSession });
  expectStatus(plan, 201, "Preview recovery plan prepare");
  const planId = nestedId(plan.body, ["plan.id", "plan"]);
  assert.ok(planId, "recovery plan id missing");
  expect2xx(await edge("leah-observability", { action: "recovery.plan.verify", plan_id: planId }, { "X-Leah-Session": leahSession }), "Preview recovery plan verify");

  // Build/deploy control-plane positive path. This does not claim a physical provider deploy.
  const artifact = await edge("leah-worker", {
    action: "artifacts.put",
    task_id: claimedTaskId,
    lease_token: leaseToken,
    kind: "source",
    path: "mr9/index.txt",
    content: "Macro-Run 9 staging build artifact",
  }, { "X-Leah-Worker-Secret": workerSecret });
  expectStatus(artifact, 201, "staging source artifact");
  const artifactId = nestedId(artifact.body, ["artifact.id", "artifact"]);
  assert.ok(artifactId, "artifact id missing");

  const build = await edge("leah-build-deploy", {
    action: "build.begin",
    task_id: claimedTaskId,
    lease_token: leaseToken,
    build_key: `mr9-build-${uuid()}`,
    artifact_ids: [artifactId],
    builder: "mr9-certifier",
    builder_version: "1",
  }, { "X-Leah-Worker-Secret": workerSecret });
  expectStatus(build, 201, "staging build admission");
  const buildId = nestedId(build.body, ["build.id", "build"]);
  assert.ok(buildId, "build id missing");

  const digest = crypto.createHash("sha256").update("Macro-Run 9 staging build output").digest("hex");
  expect2xx(await edge("leah-build-deploy", {
    action: "build.finish",
    task_id: claimedTaskId,
    lease_token: leaseToken,
    build_id: buildId,
    outcome: "succeeded",
    output_digest: digest,
    output_metadata: { certification: "MR9" },
  }, { "X-Leah-Worker-Secret": workerSecret }), "staging build settlement");

  const deployment = await edge("leah-build-deploy", {
    action: "deployment.request",
    task_id: claimedTaskId,
    lease_token: leaseToken,
    build_id: buildId,
    target_id: deploymentTargetId,
    request_key: `mr9-deploy-${uuid()}`,
  }, { "X-Leah-Worker-Secret": workerSecret });
  expectStatus(deployment, 201, "Preview deployment request");
  const deploymentId = nestedId(deployment.body, ["deployment.id", "deployment"]);
  assert.ok(deploymentId, "deployment id missing");

  const beginDeployment = await edge("leah-build-deploy", {
    action: "deployment.begin",
    task_id: claimedTaskId,
    lease_token: leaseToken,
    deployment_id: deploymentId,
  }, { "X-Leah-Worker-Secret": workerSecret });
  expect2xx(beginDeployment, "Preview deployment quota reservation");
  record("physical cloud deploy remains external to MR8D control plane", "PASS");

  // Finish the live lease and prove session revocation closes browser authority.
  expect2xx(await edge("leah-worker", {
    action: "tasks.finish",
    task_id: claimedTaskId,
    lease_token: leaseToken,
    status: "succeeded",
    output: { certification: "MR9" },
  }, { "X-Leah-Worker-Secret": workerSecret }), "worker finishes claimed task");

  expect2xx(await edge("leah-api", { action: "session.revoke" }, { "X-Leah-Session": leahSession }), "session revoke");
  expectStatus(await edge("leah-api", { action: "projects.list" }, { "X-Leah-Session": leahSession }), 401, "revoked session fails closed");

  console.log("\nMR9 GOLDEN JOURNEY: PASS");
  console.log(JSON.stringify({
    verdict: "PASS",
    target,
    supabase_url: redact(supabaseUrl),
    project_id: projectId,
    execution_id: executionId,
    stages: evidence,
  }, null, 2));
} catch (error) {
  record("macro-run", "FAIL", { error: error instanceof Error ? error.message : String(error) });
  console.error("\nMR9 GOLDEN JOURNEY: FAIL");
  console.error(JSON.stringify({ verdict: "FAIL", target, stages: evidence }, null, 2));
  process.exitCode = 1;
}
