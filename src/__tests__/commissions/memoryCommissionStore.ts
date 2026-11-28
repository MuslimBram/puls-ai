/**
 * In-memory CommissionStore used by the commission policy tests.
 * It mirrors the uniqueness rules of the database migration so idempotency
 * and double-counting are tested against the same constraints production uses.
 */
import type { CommissionDraft, SourcePaymentKind } from "../../../supabase/functions/_shared/commission-policy";
import { ONCE_PER_WORKSPACE_TYPES, isEligiblePayment } from "../../../supabase/functions/_shared/commission-policy";
import type {
  Beneficiary,
  CommissionStore,
  PartnerRecord,
  ReversalReason,
  StoredCommission,
} from "../../../supabase/functions/_shared/commission-engine";

export interface MemPayment {
  id: string;
  workspaceId: string;
  amount: number;
  status: string;
  createdAt: string;
  refundAmount?: number;
}

export interface MemRow extends StoredCommission {
  percent: number;
  grossAmount: number;
  currency: string;
  reversalOf?: string;
  reversalReason?: ReversalReason;
}

export class MemoryCommissionStore implements CommissionStore {
  workspaces = new Map<string, { ownerUserId: string; referredByPartnerId: string | null }>();
  partners = new Map<string, PartnerRecord>();
  signupReferrers = new Map<string, { referrerUserId: string; referralCode: string }>();
  members = new Set<string>();
  managed = new Set<string>();
  payments: MemPayment[] = [];
  rows: MemRow[] = [];
  legacyFirstPayment = new Set<string>();
  risk: Array<{ subject: { partnerId?: string; userId?: string }; reason: string }> = [];
  /** Wallet balances keyed by beneficiary id: approved (current) and pending. */
  wallet = new Map<string, { pending: number; current: number }>();
  private seq = 0;

  private beneficiaryId(b: Beneficiary): string {
    return b.kind === "partner" ? b.partnerId : b.referrerUserId;
  }

  private bal(id: string) {
    if (!this.wallet.has(id)) this.wallet.set(id, { pending: 0, current: 0 });
    return this.wallet.get(id)!;
  }

  async getWorkspace(id: string) { return this.workspaces.get(id) ?? null; }
  async getPartner(id: string) { return this.partners.get(id) ?? null; }
  async findSignupReferrer(userId: string) { return this.signupReferrers.get(userId) ?? null; }
  async isWorkspaceMember(ws: string, user: string) { return this.members.has(`${ws}:${user}`); }
  async isActivelyManaging(partnerId: string, ws: string) { return this.managed.has(`${partnerId}:${ws}`); }

  async getFirstEligiblePaymentId(workspaceId: string) {
    const eligible = this.payments
      .filter((p) => p.workspaceId === workspaceId && isEligiblePayment({ ...p, refundAmount: 0 }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return eligible[0]?.id ?? null;
  }

  async listOnceTypes(b: Beneficiary, workspaceId: string) {
    const id = this.beneficiaryId(b);
    const types = this.rows
      .filter((r) => r.beneficiaryId === id && r.workspaceId === workspaceId && !r.reversalOf)
      .map((r) => r.commissionType)
      .filter((t) => (ONCE_PER_WORKSPACE_TYPES as readonly string[]).includes(t));
    if (this.legacyFirstPayment.has(`${id}:${workspaceId}`)) types.push("legacy_first_payment");
    return types;
  }

  async insertCommission(b: Beneficiary, workspaceId: string, d: CommissionDraft) {
    const id = this.beneficiaryId(b);
    // UNIQUE (beneficiary, commission_type, source kind, source id)
    const dupSource = this.rows.some((r) => !r.reversalOf && r.beneficiaryId === id && r.commissionType === d.commissionType
      && r.sourcePaymentKind === d.sourcePaymentKind && r.sourcePaymentId === d.sourcePaymentId);
    // UNIQUE (beneficiary, workspace, type) for once-only types
    const dupOnce = (ONCE_PER_WORKSPACE_TYPES as readonly string[]).includes(d.commissionType)
      && this.rows.some((r) => !r.reversalOf && r.beneficiaryId === id && r.workspaceId === workspaceId && r.commissionType === d.commissionType);
    if (dupSource || dupOnce) return "duplicate" as const;
    this.rows.push({
      id: `c${++this.seq}`,
      beneficiaryKind: b.kind,
      beneficiaryId: id,
      workspaceId,
      commissionType: d.commissionType,
      amount: d.amount,
      percent: d.percent,
      grossAmount: d.grossAmount,
      currency: d.currency,
      status: "pending_refund_window",
      sourcePaymentKind: d.sourcePaymentKind,
      sourcePaymentId: d.sourcePaymentId,
    });
    this.bal(id).pending += d.amount;
    return "inserted" as const;
  }

  async listCommissionsForSource(kind: SourcePaymentKind, sourceId: string) {
    return this.rows.filter((r) => r.sourcePaymentKind === kind && r.sourcePaymentId === sourceId && !r.reversalOf);
  }

  async reverseCommission(c: StoredCommission, amount: number, reason: ReversalReason) {
    const row = this.rows.find((r) => r.id === c.id)!;
    if (row.status === "reversed" || row.status === "cancelled") return "already_reversed" as const;
    const w = this.bal(row.beneficiaryId);
    if (row.status === "approved" || row.status === "paid") {
      // Claw back with a separate negative entry; history is kept.
      this.rows.push({ ...row, id: `c${++this.seq}`, amount: -amount, status: "approved", reversalOf: row.id, reversalReason: reason });
      w.current -= amount;
      row.status = "reversed";
    } else {
      w.pending -= row.amount;
      row.status = "cancelled";
    }
    return "reversed" as const;
  }

  async flagRisk(subject: { partnerId?: string; userId?: string }, reason: string) {
    this.risk.push({ subject, reason });
  }

  /** Test helper: simulates the refund window passing and admin approval. */
  approveAll() {
    for (const r of this.rows) {
      if (r.status === "pending_refund_window" && !r.reversalOf) {
        r.status = "approved";
        const w = this.bal(r.beneficiaryId);
        w.pending -= r.amount;
        w.current += r.amount;
      }
    }
  }

  sumFor(id: string, filter: (r: MemRow) => boolean = () => true) {
    return Math.round(this.rows.filter((r) => r.beneficiaryId === id && filter(r) && r.status !== "cancelled")
      .reduce((s, r) => s + r.amount, 0) * 100) / 100;
  }
}
