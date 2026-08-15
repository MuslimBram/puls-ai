/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3C: PURE QUALITY GATE ENGINE
 *
 * Evaluates WorkerResult artifacts against TaskPlan, ContextPack, and ExecutionPlan.
 * Produces a normalized QualityReport.
 *
 * STRICTLY PURE ENGINE:
 * - NO shell commands
 * - NO npm invocations
 * - NO Playwright / browser calls
 * - NO MCP calls
 * - NO external HTTP / provider calls
 * - ZERO credits consumed
 */

import {
  TaskPlannerOutput,
  ContextPack,
  ExecutionPlan,
  WorkerResult,
  QualityReport,
  WorkerQualityEvaluation,
  CheckResult,
  CheckType,
  GateDecision,
  ViolationDetail,
  TaskType,
  WorkerType,
} from "./types";
import { getWorkerClass } from "./phase2bBridge";
import { scanArtifactsForSecrets } from "./secretScanner";
import { evaluateScopeCompliance } from "./scopeChecker";

/**
 * Determines required check types based on task type.
 */
export function getRequiredChecksForTaskType(taskType: TaskType): CheckType[] {
  switch (taskType) {
    case "ui":
      return [
        "build",
        "lint",
        "browser",
        "screenshots",
        "acceptance_criteria",
        "forbidden_actions",
        "external_call_policy",
        "budget_policy",
        "isolation_integrity",
      ];

    case "backend":
      return [
        "build",
        "tests",
        "lint",
        "runtime",
        "security",
        "acceptance_criteria",
        "forbidden_actions",
        "external_call_policy",
        "budget_policy",
        "isolation_integrity",
      ];

    case "debugging":
      return [
        "tests", // regression tests
        "build",
        "lint",
        "acceptance_criteria",
        "forbidden_actions",
        "external_call_policy",
        "isolation_integrity",
      ];

    case "security":
      return [
        "tests",
        "security",
        "forbidden_actions",
        "external_call_policy",
        "budget_policy",
        "isolation_integrity",
      ];

    case "database":
      return [
        "build",
        "security",
        "acceptance_criteria",
        "forbidden_actions",
        "external_call_policy",
        "isolation_integrity",
      ];

    case "full_prototype":
      return [
        "build",
        "tests",
        "lint",
        "runtime",
        "browser",
        "screenshots",
        "acceptance_criteria",
        "forbidden_actions",
        "external_call_policy",
        "budget_policy",
        "isolation_integrity",
      ];

    default:
      return [
        "build",
        "tests",
        "lint",
        "acceptance_criteria",
        "forbidden_actions",
        "external_call_policy",
        "isolation_integrity",
      ];
  }
}

/**
 * Evaluates an individual WorkerResult against plan rules.
 */
export function evaluateWorkerResult(
  taskPlan: TaskPlannerOutput,
  execPlan: ExecutionPlan,
  workerRes: WorkerResult
): WorkerQualityEvaluation {
  const checks: CheckResult[] = [];
  const violations: ViolationDetail[] = [];
  const requiredCheckTypes = getRequiredChecksForTaskType(taskPlan.task_type);

  const isNoSpend = !taskPlan.budget_policy.allow_spend;

  // 1. Build Check
  if (requiredCheckTypes.includes("build")) {
    if (!workerRes.build_result) {
      checks.push({
        check_id: `chk_build_${workerRes.worker_id}`,
        type: "build",
        required: true,
        status: "missing_evidence",
        score: 0,
        evidence: [],
        reason: "Missing mandatory build result artifact.",
        blocking: true,
      });
      violations.push({
        code: "MISSING_BUILD_EVIDENCE",
        severity: "critical",
        check_type: "build",
        message: "Build result artifact is missing for build-required task.",
        worker_id: workerRes.worker_id,
      });
    } else if (!workerRes.build_result.success) {
      checks.push({
        check_id: `chk_build_${workerRes.worker_id}`,
        type: "build",
        required: true,
        status: "fail",
        score: 0,
        evidence: workerRes.build_result.errors || [],
        reason: "Build failed with compilation/type errors.",
        blocking: true,
      });
      violations.push({
        code: "BUILD_FAILURE",
        severity: "critical",
        check_type: "build",
        message: `Build execution failed: ${(workerRes.build_result.errors || []).join("; ")}`,
        worker_id: workerRes.worker_id,
      });
    } else {
      checks.push({
        check_id: `chk_build_${workerRes.worker_id}`,
        type: "build",
        required: true,
        status: "pass",
        score: 100,
        evidence: [workerRes.build_result.output || "Build succeeded cleanly."],
        reason: "Build completed successfully with 0 errors.",
        blocking: false,
      });
    }
  }

  // 2. Tests Check
  if (requiredCheckTypes.includes("tests")) {
    if (!workerRes.test_result) {
      checks.push({
        check_id: `chk_test_${workerRes.worker_id}`,
        type: "tests",
        required: true,
        status: "missing_evidence",
        score: 0,
        evidence: [],
        reason: "Missing mandatory test execution result artifact.",
        blocking: true,
      });
      violations.push({
        code: "MISSING_TEST_EVIDENCE",
        severity: "critical",
        check_type: "tests",
        message: "Test execution result artifact is missing.",
        worker_id: workerRes.worker_id,
      });
    } else if (workerRes.test_result.failed > 0) {
      checks.push({
        check_id: `chk_test_${workerRes.worker_id}`,
        type: "tests",
        required: true,
        status: "fail",
        score: Math.max(0, 100 - workerRes.test_result.failed * 25),
        evidence: [workerRes.test_result.output || `${workerRes.test_result.failed} tests failed.`],
        reason: `${workerRes.test_result.failed} test(s) failed out of ${workerRes.test_result.total}.`,
        blocking: true,
      });
      violations.push({
        code: "TEST_FAILURE",
        severity: "critical",
        check_type: "tests",
        message: `${workerRes.test_result.failed} test(s) failed during verification.`,
        worker_id: workerRes.worker_id,
      });
    } else {
      checks.push({
        check_id: `chk_test_${workerRes.worker_id}`,
        type: "tests",
        required: true,
        status: "pass",
        score: 100,
        evidence: [`${workerRes.test_result.passed}/${workerRes.test_result.total} tests passed.`],
        reason: "All tests passed with zero failures.",
        blocking: false,
      });
    }
  }

  // 3. Security & Secret Scan Check
  const secretScan = scanArtifactsForSecrets(
    workerRes.logs || [],
    workerRes.changed_files || [],
    [
      workerRes.build_result?.output || "",
      workerRes.test_result?.output || "",
      workerRes.runtime_result?.details || "",
    ]
  );

  if (secretScan.secrets_detected || workerRes.security_result?.secrets_detected) {
    checks.push({
      check_id: `chk_sec_${workerRes.worker_id}`,
      type: "security",
      required: true,
      status: "fail",
      score: 0,
      evidence: secretScan.findings.map((f) => `${f.pattern_name} in ${f.source}`),
      reason: "Secrets or credentials detected in worker output artifacts.",
      blocking: true,
    });
    violations.push({
        code: "SECRET_LEAKAGE_DETECTED",
        severity: "critical",
        check_type: "security",
        message: "Secrets or API keys detected in worker execution artifacts.",
        worker_id: workerRes.worker_id,
    });
  } else {
    checks.push({
      check_id: `chk_sec_${workerRes.worker_id}`,
      type: "security",
      required: requiredCheckTypes.includes("security"),
      status: "pass",
      score: 100,
      evidence: [secretScan.summary],
      reason: "No secrets or security vulnerabilities detected.",
      blocking: false,
    });
  }

  // 4. No-Spend & External Call Policy Check
  const externalCalls = workerRes.external_calls || 0;
  const creditsConsumed = workerRes.credits_consumed || 0;

  if (isNoSpend && (externalCalls > 0 || creditsConsumed > 0)) {
    checks.push({
      check_id: `chk_spend_${workerRes.worker_id}`,
      type: "budget_policy",
      required: true,
      status: "fail",
      score: 0,
      evidence: [`external_calls: ${externalCalls}`, `credits_consumed: ${creditsConsumed}`],
      reason: "External API calls or credits consumed under zero-cost no-spend policy.",
      blocking: true,
    });
    violations.push({
      code: "NO_SPEND_POLICY_VIOLATION",
      severity: "critical",
      check_type: "budget_policy",
      message: "External API calls or credit consumption occurred when budget policy forbids spend.",
      worker_id: workerRes.worker_id,
    });
  } else {
    checks.push({
      check_id: `chk_spend_${workerRes.worker_id}`,
      type: "budget_policy",
      required: true,
      status: "pass",
      score: 100,
      evidence: [`external_calls: ${externalCalls}`, `credits_consumed: ${creditsConsumed}`],
      reason: "Zero-cost spend policy strictly complied with.",
      blocking: false,
    });
  }

  // 5. Scope & Isolation Integrity Check
  const scopeEval = evaluateScopeCompliance(taskPlan, workerRes);
  if (!scopeEval.scope_valid) {
    const isBlocking = scopeEval.main_target_detected || scopeEval.forbidden_files.length > 0;
    checks.push({
      check_id: `chk_scope_${workerRes.worker_id}`,
      type: "isolation_integrity",
      required: true,
      status: "fail",
      score: isBlocking ? 0 : 50,
      evidence: scopeEval.violations,
      reason: scopeEval.summary,
      blocking: isBlocking,
    });
    violations.push({
      code: isBlocking ? "SCOPE_BLOCKING_VIOLATION" : "SCOPE_WARNING_VIOLATION",
      severity: isBlocking ? "critical" : "medium",
      check_type: "isolation_integrity",
      message: scopeEval.summary,
      worker_id: workerRes.worker_id,
    });
  } else {
    checks.push({
      check_id: `chk_scope_${workerRes.worker_id}`,
      type: "isolation_integrity",
      required: true,
      status: "pass",
      score: 100,
      evidence: [scopeEval.summary],
      reason: "Worker execution scope and branch isolation strictly maintained.",
      blocking: false,
    });
  }

  // 6. UI / Browser / Screenshot Evidence Checks
  if (requiredCheckTypes.includes("browser") || requiredCheckTypes.includes("screenshots")) {
    if (!workerRes.browser_result && (!workerRes.screenshots || workerRes.screenshots.length === 0)) {
      checks.push({
        check_id: `chk_browser_${workerRes.worker_id}`,
        type: "browser",
        required: true,
        status: "missing_evidence",
        score: 0,
        evidence: [],
        reason: "UI task missing required browser verification or screenshot artifacts.",
        blocking: taskPlan.task_type === "ui", // Blocking for UI tasks
      });
      if (taskPlan.task_type === "ui") {
        violations.push({
          code: "MISSING_UI_BROWSER_EVIDENCE",
          severity: "high",
          check_type: "browser",
          message: "UI task requires browser verification or screenshot evidence.",
          worker_id: workerRes.worker_id,
        });
      }
    } else {
      checks.push({
        check_id: `chk_browser_${workerRes.worker_id}`,
        type: "browser",
        required: true,
        status: workerRes.browser_result?.passed !== false ? "pass" : "fail",
        score: workerRes.browser_result?.passed !== false ? 100 : 0,
        evidence: workerRes.screenshots || [workerRes.browser_result?.details || "Browser verified."],
        reason: workerRes.browser_result?.passed !== false ? "Browser verification passed." : "Browser check failed.",
        blocking: workerRes.browser_result?.passed === false,
      });
    }
  }

  // Calculate Overall Worker Score (weighted average of check scores)
  const totalScoreSum = checks.reduce((sum, chk) => sum + chk.score, 0);
  const rawScore = checks.length > 0 ? Math.round(totalScoreSum / checks.length) : 0;

  // Has blocking violations?
  const hasBlockingViolation = checks.some((chk) => chk.blocking && (chk.status === "fail" || chk.status === "missing_evidence"));
  const eligible = !hasBlockingViolation;

  let workerStatus: GateDecision = "pass";
  if (hasBlockingViolation) {
    workerStatus = checks.some((c) => c.status === "missing_evidence") ? "insufficient_evidence" : "fail";
  }

  const workerClass = getWorkerClass(workerRes.worker_id);

  return {
    worker_id: workerRes.worker_id,
    worker_class: workerClass,
    overall_score: rawScore,
    status: workerStatus,
    eligible,
    checks,
    violations,
  };
}

/**
 * Pure Quality Gate Engine entry point.
 * Evaluates worker results and produces normalized QualityReport.
 */
export function evaluateQualityGate(
  taskPlan: TaskPlannerOutput,
  contextPack: ContextPack,
  execPlan: ExecutionPlan,
  workerResults: WorkerResult[]
): QualityReport {
  const evaluations: WorkerQualityEvaluation[] = workerResults.map((wr) =>
    evaluateWorkerResult(taskPlan, execPlan, wr)
  );

  // Rank worker evaluations by overall_score descending
  evaluations.sort((a, b) => b.overall_score - a.overall_score);
  evaluations.forEach((evalItem, index) => {
    evalItem.rank = index + 1;
  });

  const eligibleWorkers: WorkerType[] = evaluations.filter((e) => e.eligible).map((e) => e.worker_id);
  const rejectedWorkers: WorkerType[] = evaluations.filter((e) => !e.eligible).map((e) => e.worker_id);

  const allChecks: CheckResult[] = [];
  const allViolations: ViolationDetail[] = [];
  const warnings: string[] = [];

  evaluations.forEach((e) => {
    allChecks.push(...e.checks);
    allViolations.push(...e.violations);
  });

  // Calculate overall gate score
  const avgScore = evaluations.length > 0
    ? Math.round(evaluations.reduce((sum, e) => sum + e.overall_score, 0) / evaluations.length)
    : 0;

  // Determine Gate Decision (FAIL CLOSED)
  const hasCriticalViolation = allViolations.some((v) => v.severity === "critical");
  const hasMissingEvidence = allChecks.some((c) => c.status === "missing_evidence" && c.blocking);
  const isSecurityTask = taskPlan.task_type === "security";
  const requiresHumanApproval = taskPlan.human_approval_required.required;

  let overallStatus: GateDecision = "pass";
  let recommendedAction = "Proceed to Phase 3D Pulse Judge winner selection.";

  // CRITICAL SCORING RULE: High score NEVER overrides a blocking failure!
  if (hasCriticalViolation || rejectedWorkers.length === evaluations.length) {
    overallStatus = "fail";
    recommendedAction = "Quality Gate rejected all workers due to critical violations or blocking failures.";
  } else if (hasMissingEvidence) {
    overallStatus = "insufficient_evidence";
    recommendedAction = "Quality Gate requires additional evidence artifacts before decision.";
  } else if (isSecurityTask || requiresHumanApproval) {
    overallStatus = "needs_human_review";
    recommendedAction = "Security task or human approval policy requires explicit human review.";
  } else if (eligibleWorkers.length === 0) {
    overallStatus = "needs_repair";
    recommendedAction = "Worker execution artifacts require repair intervention.";
  }

  const qualityReportId = `qr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  return {
    quality_report_id: qualityReportId,
    execution_id: execPlan.execution_id,
    task_id: taskPlan.task_id,
    overall_status: overallStatus,
    overall_score: avgScore,
    gate_decision: overallStatus,
    worker_results: evaluations,
    checks: allChecks,
    evidence: {
      total_workers_evaluated: workerResults.length,
      eligible_worker_count: eligibleWorkers.length,
      rejected_worker_count: rejectedWorkers.length,
      task_type: taskPlan.task_type,
      budget_policy: taskPlan.budget_policy.policy_name,
    },
    violations: allViolations,
    warnings,
    recommended_action: recommendedAction,
    eligible_workers: eligibleWorkers,
    rejected_workers: rejectedWorkers,
    requires_human_review: isSecurityTask || requiresHumanApproval || overallStatus === "needs_human_review",
    created_at: new Date().toISOString(),
  };
}
