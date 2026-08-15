/**
 * PULSE AI — LIDHJET NATIVE MODULE
 * AI ENGINE & v2.3.1 CRITICAL FINALIZATION CONTRACT
 *
 * Implements deterministic claim, daily rate limiting, and the frozen v2.3.1 order:
 * router dispatch -> parse -> validate -> persist verdict -> ONLY THEN reserved -> completed.
 */

import { AiClaimResult, AiUsageRecord, AiVia } from "./types";

export class LidhjetAiEngine {
  private dailyCounters: Map<string, number> = new Map(); // key: user_id:module:YYYY-MM-DD
  private usageStore: Map<string, AiUsageRecord> = new Map(); // key: usage_id
  private requestStore: Map<string, AiUsageRecord> = new Map(); // key: user_id:module:request_id
  private domainStore: Map<string, unknown> = new Map(); // key: domain_target_id
  private dispatchCount: number = 0;

  public resetStores() {
    this.dailyCounters.clear();
    this.usageStore.clear();
    this.requestStore.clear();
    this.domainStore.clear();
    this.dispatchCount = 0;
  }

  public getDispatchCount(): number {
    return this.dispatchCount;
  }

  public getDailyCount(userId: string, moduleName: string, dateStr: string): number {
    const key = `${userId}:${moduleName}:${dateStr}`;
    return this.dailyCounters.get(key) || 0;
  }

  public getDomainResult(targetId: string): unknown | undefined {
    return this.domainStore.get(targetId);
  }

  /**
   * Atomic Claim & Rate Limiting
   */
  public claimRequest(
    userId: string,
    moduleName: string,
    dailyLimit: number,
    requestId: string | null,
    via: AiVia,
    workspaceId: string | null,
    dateStr: string = new Date().toISOString().split("T")[0]
  ): AiClaimResult {
    // Check request_id idempotency
    if (requestId) {
      const reqKey = `${userId}:${moduleName}:${requestId}`;
      const existing = this.requestStore.get(reqKey);

      if (existing) {
        if (existing.status === "completed") {
          return {
            allowed: false,
            status: "completed",
            reused: true,
            record_id: existing.id,
          };
        }
        if (existing.status === "failed") {
          return {
            allowed: false,
            status: "failed",
            reused: true,
            error: existing.error_message || "Previous execution failed",
          };
        }
        if (existing.status === "reserved") {
          return {
            allowed: false,
            status: "in_progress",
            code: "409_in_progress",
            reused: true,
          };
        }
      }
    }

    // System workspace path: enforce daily limit & increment counter
    if (via === "system") {
      const counterKey = `${userId}:${moduleName}:${dateStr}`;
      const currentCount = this.dailyCounters.get(counterKey) || 0;

      if (currentCount >= dailyLimit) {
        return {
          allowed: false,
          status: "capped",
          code: "daily_limit_exceeded",
        };
      }

      this.dailyCounters.set(counterKey, currentCount + 1);
    }
    // User workspace path: counter NOT consumed (ai-router manages workspace limits)

    // Create reservation record
    const usageId = `usage_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record: AiUsageRecord = {
      id: usageId,
      request_id: requestId,
      user_id: userId,
      module: moduleName,
      via,
      workspace_id: workspaceId,
      status: "reserved",
      error_message: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    };

    this.usageStore.set(usageId, record);
    if (requestId) {
      const reqKey = `${userId}:${moduleName}:${requestId}`;
      this.requestStore.set(reqKey, record);
    }

    return {
      allowed: true,
      status: "reserved",
      usage_id: usageId,
    };
  }

  /**
   * Execute Request obeying frozen v2.3.1 finalization order:
   * 1. router dispatch succeeds
   * 2. parse response
   * 3. validate response
   * 4. persist verdict/result to domain target
   * 5. ONLY THEN update reserved -> completed
   */
  public executeRequest(
    userId: string,
    moduleName: string,
    dailyLimit: number,
    requestId: string | null,
    via: AiVia,
    workspaceId: string | null,
    targetDomainId: string,
    options?: {
      forcePersistenceFailure?: boolean;
      forceCrashBeforeCompleted?: boolean;
      mockResponseData?: unknown;
    }
  ): { success: boolean; status: string; result?: unknown; error?: string; code?: string } {
    // 1. Claim
    const claim = this.claimRequest(userId, moduleName, dailyLimit, requestId, via, workspaceId);

    if (!claim.allowed) {
      if (claim.code === "409_in_progress") {
        return { success: false, status: "in_progress", code: "409_in_progress", error: "Request in progress" };
      }
      if (claim.code === "daily_limit_exceeded") {
        return { success: false, status: "capped", code: "daily_limit_exceeded", error: "Daily limit reached" };
      }
      if (claim.reused) {
        if (claim.status === "completed") {
          return {
            success: true,
            status: "completed",
            result: this.domainStore.get(targetDomainId) || { status: "active", reused: true },
          };
        }
        if (claim.status === "failed") {
          return { success: false, status: "failed", error: claim.error || "Previous request failed" };
        }
      }
    }

    const usageRecord = this.usageStore.get(claim.usage_id!);
    if (!usageRecord) {
      return { success: false, status: "failed", error: "Usage record not found" };
    }

    // 2. Dispatch to Router Stub
    this.dispatchCount++;
    const routerData = options?.mockResponseData || {
      status: "active",
      score: 95,
      summary: "Assessed cleanly",
    };

    // 3. Parse & Validate
    if (!routerData) {
      usageRecord.status = "failed";
      usageRecord.error_message = "Invalid router response";
      return { success: false, status: "failed", error: "Invalid router response" };
    }

    // 4. Persist verdict/result to domain target
    if (options?.forcePersistenceFailure) {
      usageRecord.status = "failed";
      usageRecord.error_message = "Domain persistence failure";
      return { success: false, status: "failed", error: "Domain persistence failure" };
    }

    this.domainStore.set(targetDomainId, routerData);

    // Simulate crash after verdict persistence but BEFORE completed transition
    if (options?.forceCrashBeforeCompleted) {
      // Status remains 'reserved'
      return { success: false, status: "in_progress", code: "409_in_progress", error: "Crashed before completed transition" };
    }

    // 5. ONLY THEN: update reserved -> completed
    if (usageRecord.status === "reserved") {
      usageRecord.status = "completed";
      usageRecord.completed_at = new Date().toISOString();
    }

    return {
      success: true,
      status: "completed",
      result: routerData,
    };
  }
}

export const defaultAiEngine = new LidhjetAiEngine();
