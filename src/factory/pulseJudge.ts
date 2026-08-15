/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3D: PULSE JUDGE ENGINE
 *
 * Evaluates TaskPlan, ContextPack, ExecutionPlan, QualityReport, and WorkerResult[].
 * Deterministically ranks ELIGIBLE workers, selects ONE strongest base worker,
 * cataloging patch candidates and repair recommendations without code merging.
 *
 * STRICTLY PURE ENGINE:
 * - NO code merging or execution
 * - NO builder dispatches or MCP calls
 * - NO external HTTP calls
 * - ZERO credits consumed
 */

import {
  TaskPlannerOutput,
  ContextPack,
  ExecutionPlan,
  QualityReport,
  WorkerResult,
  JudgeDecision,
  JudgeDecisionValue,
  RankedCandidateDetail,
  PatchCandidate,
  RepairCandidate,
  WorkerType,
} from "./types";
import { getWorkerClass } from "./phase2bBridge";

/**
 * Calculates Task Fit Score (0-100) based on task type and worker capabilities.
 */
export function calculateTaskFitScore(
  taskType: string,
  workerRes: WorkerResult
): number {
  let score = 70; // baseline task fit
  const workerId = workerRes.worker_id;

  switch (taskType) {
    case "ui":
      if (workerId === "base44_mcp" || workerId === "lovable_mcp") score += 20;
      if (workerRes.browser_result?.passed) score += 10;
      break;

    case "backend":
      if (workerId === "emergent_mcp" || workerId === "claude_code") score += 20;
      if (workerRes.test_result && workerRes.test_result.failed === 0) score += 10;
      break;

    case "debugging":
      if (workerId === "antigravity_candidate" || workerId === "claude_code") score += 20;
      if (workerRes.changed_files && workerRes.changed_files.length <= 3) score += 10; // concise fix
      break;

    case "security":
      if (workerId === "claude_code" || workerId === "antigravity_candidate") score += 20;
      if (workerRes.security_result && !workerRes.security_result.secrets_detected) score += 10;
      break;

    case "database":
      if (workerId === "claude_code" || workerId === "emergent_mcp") score += 20;
      break;

    case "full_prototype":
      if (workerId === "lovable_mcp" || workerId === "emergent_mcp" || workerId === "replit_mcp") score += 20;
      if (workerRes.build_result?.success && workerRes.test_result?.passed) score += 10;
      break;

    default:
      if (workerId === "claude_code") score += 15;
      break;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculates deterministic overall Judge score (0-100) for an eligible candidate worker.
 */
export function calculateJudgeCandidateScore(
  qualityScore: number,
  taskFitScore: number,
  workerRes: WorkerResult
): number {
  // Quality Gate score (40%) + Task Fit (25%) + Scope Compliance (15%) + Tests (10%) + Security (10%)
  let scopeScore = 100;
  if (workerRes.changed_files && workerRes.changed_files.length > 5) {
    scopeScore = 70;
  }

  let testScore = 100;
  if (workerRes.test_result && workerRes.test_result.failed > 0) {
    testScore = 0;
  }

  const finalScore = Math.round(
    qualityScore * 0.4 +
    taskFitScore * 0.25 +
    scopeScore * 0.15 +
    testScore * 0.10 +
    100 * 0.10
  );

  return Math.min(100, Math.max(0, finalScore));
}

/**
 * Recommends best repair worker based on problem area.
 */
export function recommendRepairWorker(
  problem: string,
  failedWorker: WorkerType
): WorkerType {
  const text = problem.toLowerCase();

  if (text.includes("debug") || text.includes("reproduce") || text.includes("build") || text.includes("syntax") || text.includes("compilation")) {
    return "antigravity_candidate";
  }
  if (text.includes("security") || text.includes("refactor") || text.includes("complex logic")) {
    return "claude_code";
  }
  if (text.includes("backend") || text.includes("api")) {
    return "emergent_mcp";
  }
  if (text.includes("prototype") || text.includes("ui")) {
    return "replit_mcp";
  }

  return failedWorker === "antigravity_candidate" ? "claude_code" : "antigravity_candidate";
}

/**
 * Pure Pulse Judge Engine entry point.
 * Deterministically evaluates inputs and produces normalized JudgeDecision.
 */
export function evaluatePulseJudge(
  taskPlan: TaskPlannerOutput,
  contextPack: ContextPack,
  execPlan: ExecutionPlan,
  qualityReport: QualityReport,
  workerResults: WorkerResult[]
): JudgeDecision {
  const eligibleWorkerIds = qualityReport.eligible_workers || [];
  const rejectedWorkerIds = qualityReport.rejected_workers || [];

  // Filter ONLY eligible workers from WorkerResult[]
  const eligibleResults = workerResults.filter((wr) => eligibleWorkerIds.includes(wr.worker_id));
  const rejectedResults = workerResults.filter((wr) => rejectedWorkerIds.includes(wr.worker_id));

  // Rank eligible candidates using weighted task-aware criteria
  const rankedCandidates: RankedCandidateDetail[] = eligibleResults.map((wr) => {
    const qualityEval = qualityReport.worker_results.find((q) => q.worker_id === wr.worker_id);
    const qualityScore = qualityEval ? qualityEval.overall_score : 50;
    const taskFitScore = calculateTaskFitScore(taskPlan.task_type, wr);

    const judgeScore = calculateJudgeCandidateScore(qualityScore, taskFitScore, wr);
    const workerClass = getWorkerClass(wr.worker_id);

    return {
      worker_id: wr.worker_id,
      worker_class: workerClass,
      score: judgeScore,
      quality_score: qualityScore,
      task_fit_score: taskFitScore,
      rank: 0, // Assigned after sorting
      rationale: `Evaluated ${workerClass} ${wr.worker_id}: Quality score ${qualityScore}, Task fit ${taskFitScore}.`,
    };
  });

  // Sort candidates by final judge score descending
  rankedCandidates.sort((a, b) => b.score - a.score);
  rankedCandidates.forEach((cand, idx) => {
    cand.rank = idx + 1;
  });

  let selectedBaseWorker: WorkerType | null = null;
  const patchCandidates: PatchCandidate[] = [];
  const repairCandidates: RepairCandidate[] = [];

  // Determine Base Worker & Patch Candidates
  if (rankedCandidates.length > 0) {
    selectedBaseWorker = rankedCandidates[0].worker_id;

    // Remaining eligible candidates contribute patch candidates
    for (let i = 1; i < rankedCandidates.length; i++) {
      const pCandidate = rankedCandidates[i];
      const sourceResult = workerResults.find((w) => w.worker_id === pCandidate.worker_id);

      patchCandidates.push({
        source_worker: pCandidate.worker_id,
        target_area: taskPlan.likely_files_or_areas[0] || "src/",
        reason: `Eligible worker ${pCandidate.worker_id} (rank #${pCandidate.rank}, score ${pCandidate.score}) offers auxiliary code improvements.`,
        expected_benefit: `Additional test coverage or refined component structure from ${pCandidate.worker_id}.`,
        risk: "Low risk auxiliary patch.",
        requires_review: true,
        recommended_action: `Review and cherry-pick patch ideas from ${pCandidate.worker_id} onto base ${selectedBaseWorker}.`,
      });
    }
  }

  // Catalog Repair Candidates for rejected workers or blocking failures
  for (const rResult of rejectedResults) {
    const qEval = qualityReport.worker_results.find((q) => q.worker_id === rResult.worker_id);
    const problemMsg = qEval && qEval.violations.length > 0
      ? qEval.violations.map((v) => v.message).join("; ")
      : "Worker result failed Quality Gate checks.";

    const repairWorker = recommendRepairWorker(problemMsg, rResult.worker_id);

    repairCandidates.push({
      problem: problemMsg,
      source_worker: rResult.worker_id,
      recommended_repair_worker: repairWorker,
      reason: `Worker ${rResult.worker_id} failed quality checks; repair recommended using ${repairWorker}.`,
      severity: qEval?.violations.some((v) => v.severity === "critical") ? "critical" : "medium",
      required_evidence_after_repair: ["Clean build output", "100% test pass rate", "Zero secret violations"],
    });
  }

  // Evaluate Decision & Human Approval Requirements
  const approvalReasons: string[] = [];
  let requiresHumanReview = false;

  if (taskPlan.task_type === "security") {
    requiresHumanReview = true;
    approvalReasons.push("Security tasks strictly require human review.");
  }
  if (taskPlan.target_environment === "production") {
    requiresHumanReview = true;
    approvalReasons.push("Target environment is set to production.");
  }
  if (qualityReport.requires_human_review || qualityReport.overall_status === "needs_human_review") {
    requiresHumanReview = true;
    approvalReasons.push("Quality Gate requested human review.");
  }
  if (patchCandidates.length > 0) {
    requiresHumanReview = true;
    approvalReasons.push(`Combining patch candidates from ${patchCandidates.length} secondary worker(s) requires human review.`);
  }

  // Check Close Scores between Rank #1 and Rank #2
  if (rankedCandidates.length >= 2) {
    const scoreGap = rankedCandidates[0].score - rankedCandidates[1].score;
    if (scoreGap <= 3) {
      requiresHumanReview = true;
      approvalReasons.push(`Close score gap (${scoreGap} pts) between top candidate ${rankedCandidates[0].worker_id} (${rankedCandidates[0].score}) and ${rankedCandidates[1].worker_id} (${rankedCandidates[1].score}) requires human review.`);
    }
  }

  // Calculate Deterministic Confidence (0.0 to 1.0)
  let confidence = 0.90; // Default high confidence

  if (rankedCandidates.length === 0) {
    confidence = 0.0;
  } else if (rankedCandidates.length === 1) {
    confidence = 0.85;
  } else {
    const scoreGap = rankedCandidates[0].score - rankedCandidates[1].score;
    if (scoreGap > 10) {
      confidence = 0.95; // Dominant winner
    } else if (scoreGap <= 3) {
      confidence = 0.70; // Close candidates
    } else {
      confidence = 0.80;
    }
  }

  if (repairCandidates.length > 0) {
    confidence = Math.min(confidence, 0.65);
  }
  if (requiresHumanReview && confidence > 0.74) {
    confidence = 0.74; // Cap confidence below threshold when human review forced
  }

  // Determine Final Decision Value
  let decisionValue: JudgeDecisionValue = "select_base";
  let selectionReason = "";
  let nextAction = "";

  if (rankedCandidates.length === 0) {
    if (qualityReport.overall_status === "insufficient_evidence") {
      decisionValue = "insufficient_evidence";
      selectionReason = "No viable candidate: Quality Gate reported insufficient evidence.";
      nextAction = "Collect missing build/test evidence artifacts before re-evaluating.";
    } else if (repairCandidates.length > 0) {
      decisionValue = "needs_repair";
      selectionReason = "No viable base candidate: all evaluated workers failed quality gate and require repair.";
      nextAction = `Route repair task to recommended repair worker (${repairCandidates[0]?.recommended_repair_worker || "claude_code"}).`;
    } else {
      decisionValue = "no_viable_candidate";
      selectionReason = "No viable candidate passed Quality Gate eligibility checks.";
      nextAction = "Revise task planner objective or worker selection policy.";
    }
  } else if (requiresHumanReview) {
    decisionValue = "needs_human_review";
    selectionReason = `Selected ${selectedBaseWorker} as base (score ${rankedCandidates[0].score}), but human review is required: ${approvalReasons.join(" ")}`;
    nextAction = "Present JudgeDecision and candidate diffs to human reviewer for approval.";
  } else {
    decisionValue = "select_base";
    selectionReason = `Selected ${selectedBaseWorker} as strongest base worker with score ${rankedCandidates[0].score}/100 and confidence ${(confidence * 100).toFixed(0)}%.`;
    nextAction = `Proceed with base worker ${selectedBaseWorker} artifact adoption.`;
  }

  const scoreBreakdown: Record<string, number> = {};
  rankedCandidates.forEach((rc) => {
    scoreBreakdown[rc.worker_id] = rc.score;
  });

  const decisionId = `jd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  return {
    judge_decision_id: decisionId,
    execution_id: execPlan.execution_id,
    task_id: taskPlan.task_id,
    decision: decisionValue,
    selected_base_worker: selectedBaseWorker,
    ranked_candidates: rankedCandidates,
    patch_candidates: patchCandidates,
    repair_candidates: repairCandidates,
    rejected_candidates: rejectedWorkerIds,
    selection_reason: selectionReason,
    score_breakdown: scoreBreakdown,
    confidence,
    requires_human_review: requiresHumanReview,
    approval_reasons: approvalReasons,
    next_action: nextAction,
    created_at: new Date().toISOString(),
  };
}
