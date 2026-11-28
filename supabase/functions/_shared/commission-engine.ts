/**
 * _shared/commission-engine.ts
 *
 * Applies the owner-approved commission policy (commission-policy.ts) to real
 * payments. Storage is behind the CommissionStore interface so the exact same
 * logic runs in edge functions (Supabase store) and in tests (in-memory store).
 *
 * Guarantees:
 *  - Idempotent: every commission is keyed by (beneficiary, commission type,
 *    source payment). Re-delivered webhooks and repeated cron runs never
 *    create a second row; the database unique indexes are the final guard.
 *  - One attribution per workspace: a partner referral (freelancer/ambassador)
 *    takes precedence over an ordinary business referral; never both.
 *  - Self-referral, inactive/suspended partners and ineligible payments
 *    (unpaid, failed, zero, refunded, disputed) produce nothing.
 *  - Reversals never delete history: unpaid commissions are cancelled,
 *    already-approved ones are clawed back with a separate negative entry.
 */
import {
  type CommissionDraft,
  type ManagementFeeFacts,
  type PaymentFacts,
  type SourcePaymentKind,
  computeManagementFeeCommission,
  computeReversalAmount,
  computeSubscriptionPaymentCommissions,
  isCoveredByPolicy,
  isEligiblePayment,
  POLICY_EFFECTIVE_FROM,
} from "./commission-policy.ts";

export type Beneficiary =
  | { kind: "partner"; partnerId: string; partnerUserId: string; program: "freelancer" | "ambassador" }
  | { kind: "referrer"; referrerUserId: string; referralCode: string };

export interface PartnerRecord {
  id: string;
  userId: string;
  status: string;
  program: "freelancer" | "ambassador";
}

export interface StoredCommission {
  id: string;
  beneficiaryKind: "partner" | "referrer";
  beneficiaryId: string;
  workspaceId: string;
  commissionType: string;
  amount: number;
  status: string;
  sourcePaymentKind: SourcePaymentKind;
  sourcePaymentId: string;
}

export type ReversalReason = "refund" | "chargeback" | "fraud" | "admin";

export interface CommissionStore {
  getWorkspace(workspaceId: string): Promise<{ ownerUserId: string; referredByPartnerId: string | null } | null>;
  getPartner(partnerId: string): Promise<PartnerRecord | null>;
  /** The ordinary-referral code the workspace owner signed up with, resolved to its owner. */
  findSignupReferrer(userId: string): Promise<{ referrerUserId: string; referralCode: string } | null>;
  isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean>;
  /** Id of the earliest eligible payment ever recorded for the workspace. */
  getFirstEligiblePaymentId(workspaceId: string): Promise<string | null>;
  /** Once-only commission types (incl. legacy) the beneficiary already holds for the workspace. */
  listOnceTypes(beneficiary: Beneficiary, workspaceId: string): Promise<string[]>;
  insertCommission(beneficiary: Beneficiary, workspaceId: string, draft: CommissionDraft): Promise<"inserted" | "duplicate">;
  listCommissionsForSource(kind: SourcePaymentKind, sourceId: string): Promise<StoredCommission[]>;
  reverseCommission(commission: StoredCommission, amount: number, reason: ReversalReason): Promise<"reversed" | "already_reversed">;
  isActivelyManaging(partnerId: string, workspaceId: string): Promise<boolean>;
  flagRisk(subject: { partnerId?: string; userId?: string }, reason: string, details: Record<string, unknown>): Promise<void>;
}

export interface SubscriptionPaymentEvent extends PaymentFacts {
  workspaceId: string | null;
  payerUserId?: string | null;
}

export type ProcessResult =
  | { status: "skipped"; reason: string }
  | { status: "processed"; beneficiary: Beneficiary["kind"]; inserted: string[]; duplicates: string[] };

const skipped = (reason: string): ProcessResult => ({ status: "skipped", reason });

async function resolveBeneficiary(
  store: CommissionStore,
  workspaceId: string,
  ownerUserId: string,
  payerUserId: string | null | undefined,
  referredByPartnerId: string | null,
): Promise<Beneficiary | { skip: string }> {
  if (referredByPartnerId) {
    const partner = await store.getPartner(referredByPartnerId);
    if (!partner) return { skip: "partner_not_found" };
    if (partner.status !== "active") return { skip: `partner_${partner.status || "inactive"}` };
    const selfReferral =
      partner.userId === ownerUserId ||
      (payerUserId != null && partner.userId === payerUserId) ||
      (await store.isWorkspaceMember(workspaceId, partner.userId));
    if (selfReferral) {
      await store.flagRisk({ partnerId: partner.id }, "self_referral", { workspaceId });
      return { skip: "self_referral" };
    }
    return { kind: "partner", partnerId: partner.id, partnerUserId: partner.userId, program: partner.program };
  }

  const referrer = await store.findSignupReferrer(ownerUserId);
  if (!referrer) return { skip: "not_referred" };
  const selfReferral =
    referrer.referrerUserId === ownerUserId ||
    (payerUserId != null && referrer.referrerUserId === payerUserId) ||
    (await store.isWorkspaceMember(workspaceId, referrer.referrerUserId));
  if (selfReferral) {
    await store.flagRisk({ userId: referrer.referrerUserId }, "self_referral", { workspaceId });
    return { skip: "self_referral" };
  }
  return { kind: "referrer", referrerUserId: referrer.referrerUserId, referralCode: referrer.referralCode };
}

/** Generates the commissions owed for one successful subscription payment. */
export async function processSubscriptionPayment(
  store: CommissionStore,
  payment: SubscriptionPaymentEvent,
  options: { effectiveFrom?: string } = {},
): Promise<ProcessResult> {
  if (!payment.workspaceId) return skipped("no_workspace");
  if (!isEligiblePayment(payment)) return skipped("ineligible_payment");
  if (!isCoveredByPolicy(payment.createdAt, options.effectiveFrom ?? POLICY_EFFECTIVE_FROM)) {
    return skipped("before_policy_effective_date");
  }

  const ws = await store.getWorkspace(payment.workspaceId);
  if (!ws) return skipped("workspace_not_found");

  const who = await resolveBeneficiary(store, payment.workspaceId, ws.ownerUserId, payment.payerUserId, ws.referredByPartnerId);
  if ("skip" in who) return skipped(who.skip);

  const firstId = await store.getFirstEligiblePaymentId(payment.workspaceId);
  const isFirst = firstId === payment.id;
  const existingOnceTypes = await store.listOnceTypes(who, payment.workspaceId);
  const program = who.kind === "partner" ? who.program : "referral";

  const drafts = computeSubscriptionPaymentCommissions({
    program,
    payment,
    isFirstEligiblePayment: isFirst,
    existingOnceTypes,
  });
  if (drafts.length === 0) return skipped(isFirst ? "nothing_owed" : "renewal_not_commissionable");

  const inserted: string[] = [];
  const duplicates: string[] = [];
  for (const draft of drafts) {
    const r = await store.insertCommission(who, payment.workspaceId, draft);
    (r === "inserted" ? inserted : duplicates).push(draft.commissionType);
  }
  return { status: "processed", beneficiary: who.kind, inserted, duplicates };
}

export interface ManagementFeeEvent extends ManagementFeeFacts {
  partnerId: string;
  workspaceId: string;
}

/** 20% of a management fee the freelancer's managed business actually paid. */
export async function processManagementFee(store: CommissionStore, fee: ManagementFeeEvent): Promise<ProcessResult> {
  const draft = computeManagementFeeCommission(fee);
  if (!draft) return skipped("fee_not_collected");
  const partner = await store.getPartner(fee.partnerId);
  if (!partner) return skipped("partner_not_found");
  if (partner.status !== "active") return skipped(`partner_${partner.status || "inactive"}`);
  if (partner.program !== "freelancer") return skipped("not_a_freelancer");
  if (!(await store.isActivelyManaging(partner.id, fee.workspaceId))) return skipped("not_actively_managed");
  const ws = await store.getWorkspace(fee.workspaceId);
  if (!ws) return skipped("workspace_not_found");
  if (ws.ownerUserId === partner.userId) {
    await store.flagRisk({ partnerId: partner.id }, "self_managed_fee", { workspaceId: fee.workspaceId });
    return skipped("self_referral");
  }
  const who: Beneficiary = { kind: "partner", partnerId: partner.id, partnerUserId: partner.userId, program: "freelancer" };
  const r = await store.insertCommission(who, fee.workspaceId, draft);
  return {
    status: "processed",
    beneficiary: "partner",
    inserted: r === "inserted" ? [draft.commissionType] : [],
    duplicates: r === "duplicate" ? [draft.commissionType] : [],
  };
}

export interface ReversalEvent {
  sourcePaymentKind: SourcePaymentKind;
  sourcePaymentId: string;
  paymentAmount: number;
  /** Total refunded so far. Omit for a full refund / chargeback. */
  refundedAmount?: number | null;
  reason: ReversalReason;
}

/** Cancels or claws back every commission generated from a refunded / disputed payment. */
export async function reverseCommissionsForPayment(
  store: CommissionStore,
  event: ReversalEvent,
): Promise<{ reversed: string[]; alreadyReversed: string[] }> {
  const commissions = await store.listCommissionsForSource(event.sourcePaymentKind, event.sourcePaymentId);
  const reversed: string[] = [];
  const alreadyReversed: string[] = [];
  for (const c of commissions) {
    if (c.amount <= 0) continue; // reversal rows themselves
    const amount = computeReversalAmount(c.amount, event.paymentAmount, event.refundedAmount, event.reason);
    if (amount <= 0) continue;
    const r = await store.reverseCommission(c, amount, event.reason);
    (r === "reversed" ? reversed : alreadyReversed).push(c.id);
  }
  return { reversed, alreadyReversed };
}
