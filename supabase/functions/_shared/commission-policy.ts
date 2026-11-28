/**
 * _shared/commission-policy.ts
 *
 * OFFICIAL PARTNER & REFERRAL POLICY — owner approved (policy version below).
 *
 * This module is the single source of truth for every commission percentage
 * paid by Pulse AI. It is pure TypeScript (no Deno / Supabase imports) so the
 * same file is used by the edge functions AND by the Vitest suite.
 *
 *   | Program            | What is paid                                              |
 *   |--------------------|-----------------------------------------------------------|
 *   | Referral Program   | 15% of the referred business's FIRST eligible payment     |
 *   | Referred business  | 15% discount on its first payment                         |
 *   | Freelancer         | 15% on the FIRST eligible payment + 20% of management     |
 *   |                    | fees actually collected from businesses they manage       |
 *   | Ambassador         | 15% on EVERY eligible payment (lifetime) + a one-time 15% |
 *   |                    | bonus on the FIRST eligible payment (first payment = 30%) |
 *
 * Rules that are enforced here and must never be bypassed:
 *  - Percentages come from this file, never from a nullable DB column, so a
 *    missing value can never silently become 0%.
 *  - Commission types are distinct and never mixed or double counted.
 *  - Only paid, positive, non-refunded, non-disputed payments are eligible.
 *  - Payments created before POLICY_EFFECTIVE_FROM are left to the legacy
 *    records; nothing already earned is recalculated retroactively.
 */

export const COMMISSION_POLICY_VERSION = "owner-v1-2026-11-28";

/**
 * Payments created before this instant are NOT processed by the new policy.
 * They keep whatever legacy commission (if any) was already recorded.
 * Must match the seed row in the policy migration.
 */
export const POLICY_EFFECTIVE_FROM = "2026-11-28T00:00:00Z";

export const COMMISSION_POLICY = {
  referral: {
    /** Paid once, on the referred business's first eligible payment. */
    firstPaymentPercent: 15,
    /** Discount the referred business receives on its first payment. */
    referredDiscountPercent: 15,
    /** How many billing cycles the referred discount applies to. */
    referredDiscountCycles: 1,
  },
  freelancer: {
    /** Paid once, on the referred business's first eligible payment. */
    firstPaymentReferralPercent: 15,
    /** Share of management fees ACTUALLY COLLECTED from managed businesses. */
    managementFeeSharePercent: 20,
  },
  ambassador: {
    /** Paid on every eligible subscription payment, for the lifetime of the customer. */
    lifetimeRecurringPercent: 15,
    /** Extra, one-time bonus on the first eligible payment. */
    firstPaymentBonusPercent: 15,
  },
  /** Days a new commission waits before it can be approved (refund protection). */
  refundWindowDays: 7,
} as const;

export type PartnerProgram = "referral" | "freelancer" | "ambassador";

export type CommissionType =
  | "referral_commission"
  | "management_fee_commission"
  | "ambassador_lifetime_commission"
  | "ambassador_first_payment_bonus";

/** Commission rows written before this policy keep this type. */
export const LEGACY_COMMISSION_TYPE = "legacy_first_payment" as const;

export const COMMISSION_TYPES: readonly CommissionType[] = [
  "referral_commission",
  "management_fee_commission",
  "ambassador_lifetime_commission",
  "ambassador_first_payment_bonus",
];

/** Commission types that may exist at most ONCE per (beneficiary, referred workspace). */
export const ONCE_PER_WORKSPACE_TYPES: readonly CommissionType[] = [
  "referral_commission",
  "ambassador_first_payment_bonus",
];

export type SourcePaymentKind = "subscription_payment" | "management_fee";

export interface CommissionDraft {
  commissionType: CommissionType;
  percent: number;
  grossAmount: number;
  amount: number;
  currency: string;
  sourcePaymentKind: SourcePaymentKind;
  sourcePaymentId: string;
  isFirstPayment: boolean;
  policyVersion: string;
}

/** Payment statuses that mean money was actually received. */
export const ELIGIBLE_PAYMENT_STATUSES: readonly string[] = [
  "paid",
  "succeeded",
  "completed",
  "captured",
];

export interface PaymentFacts {
  id: string;
  amount: number;
  currency?: string | null;
  status?: string | null;
  createdAt?: string | null;
  refundAmount?: number | null;
  disputed?: boolean | null;
}

/** Rounds to cents, half away from zero, without binary-float drift. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + 1e-9)) / 100;
}

export function percentOf(amount: number, percent: number): number {
  return roundMoney((amount * percent) / 100);
}

export function normalizeCurrency(currency?: string | null): string {
  const c = String(currency ?? "").trim().toUpperCase();
  return c || "ALL";
}

/**
 * True only when real money was received and has not been given back.
 * Unpaid, failed, zero, refunded and disputed payments are never eligible.
 */
export function isEligiblePayment(payment: PaymentFacts): boolean {
  const status = String(payment.status ?? "").trim().toLowerCase();
  if (!ELIGIBLE_PAYMENT_STATUSES.includes(status)) return false;
  const amount = Number(payment.amount);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (payment.disputed) return false;
  // Any refund (full or partial) recorded before the commission exists makes the
  // payment non-commissionable. Refunds that arrive AFTER a commission was
  // created are handled by computeReversalAmount (pro rata), so a payment is
  // never reduced twice.
  const refunded = Number(payment.refundAmount ?? 0);
  if (Number.isFinite(refunded) && refunded > 0) return false;
  return true;
}

/** Payments before the effective date belong to the legacy records. */
export function isCoveredByPolicy(createdAt?: string | null, effectiveFrom: string = POLICY_EFFECTIVE_FROM): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  const e = Date.parse(effectiveFrom);
  if (!Number.isFinite(t) || !Number.isFinite(e)) return false;
  return t >= e;
}

/** The amount commissions are calculated on: what was paid, minus partial refunds. */
export function commissionableAmount(payment: PaymentFacts): number {
  const paid = Number(payment.amount) || 0;
  const refunded = Math.max(0, Number(payment.refundAmount ?? 0) || 0);
  return roundMoney(Math.max(0, paid - refunded));
}

export interface SubscriptionCommissionInput {
  program: PartnerProgram;
  payment: PaymentFacts;
  /** True when this is the referred workspace's first eligible payment. */
  isFirstEligiblePayment: boolean;
  /**
   * First-payment commission types this beneficiary ALREADY holds for the
   * workspace (including legacy first-payment commissions). Those are never
   * generated a second time.
   */
  existingOnceTypes?: readonly string[];
}

/**
 * Commission drafts for one subscription payment.
 *
 *   referral   → first payment only: 15% referral_commission
 *   freelancer → first payment only: 15% referral_commission
 *   ambassador → every payment: 15% ambassador_lifetime_commission
 *                first payment additionally: 15% ambassador_first_payment_bonus
 */
export function computeSubscriptionPaymentCommissions(input: SubscriptionCommissionInput): CommissionDraft[] {
  const { program, payment, isFirstEligiblePayment } = input;
  if (!isEligiblePayment(payment)) return [];
  const gross = commissionableAmount(payment);
  if (gross <= 0) return [];

  const existing = new Set(input.existingOnceTypes ?? []);
  // A legacy first-payment commission means the first payment was already paid out.
  const firstPaymentAlreadyPaid = existing.has(LEGACY_COMMISSION_TYPE);
  const currency = normalizeCurrency(payment.currency);
  const base = {
    grossAmount: gross,
    currency,
    sourcePaymentKind: "subscription_payment" as const,
    sourcePaymentId: payment.id,
    isFirstPayment: isFirstEligiblePayment,
    policyVersion: COMMISSION_POLICY_VERSION,
  };

  const drafts: CommissionDraft[] = [];
  const addOnce = (commissionType: CommissionType, percent: number) => {
    if (!isFirstEligiblePayment || firstPaymentAlreadyPaid || existing.has(commissionType)) return;
    drafts.push({ ...base, commissionType, percent, amount: percentOf(gross, percent) });
  };

  switch (program) {
    case "referral":
      addOnce("referral_commission", COMMISSION_POLICY.referral.firstPaymentPercent);
      break;
    case "freelancer":
      addOnce("referral_commission", COMMISSION_POLICY.freelancer.firstPaymentReferralPercent);
      break;
    case "ambassador": {
      const lifetime = COMMISSION_POLICY.ambassador.lifetimeRecurringPercent;
      drafts.push({
        ...base,
        commissionType: "ambassador_lifetime_commission",
        percent: lifetime,
        amount: percentOf(gross, lifetime),
      });
      addOnce("ambassador_first_payment_bonus", COMMISSION_POLICY.ambassador.firstPaymentBonusPercent);
      break;
    }
    default:
      return [];
  }
  return drafts.filter((d) => d.amount > 0);
}

export interface ManagementFeeFacts {
  id: string;
  amount: number;
  currency?: string | null;
  /** Only "collected" fees generate a commission. */
  status?: string | null;
  refundAmount?: number | null;
}

/** 20% of a management fee that was ACTUALLY collected. Nothing otherwise. */
export function computeManagementFeeCommission(fee: ManagementFeeFacts): CommissionDraft | null {
  if (String(fee.status ?? "").toLowerCase() !== "collected") return null;
  const gross = roundMoney(Math.max(0, (Number(fee.amount) || 0) - Math.max(0, Number(fee.refundAmount ?? 0) || 0)));
  if (gross <= 0) return null;
  const percent = COMMISSION_POLICY.freelancer.managementFeeSharePercent;
  return {
    commissionType: "management_fee_commission",
    percent,
    grossAmount: gross,
    amount: percentOf(gross, percent),
    currency: normalizeCurrency(fee.currency),
    sourcePaymentKind: "management_fee",
    sourcePaymentId: fee.id,
    isFirstPayment: false,
    policyVersion: COMMISSION_POLICY_VERSION,
  };
}

/**
 * Amount to claw back when a payment is (partially) refunded or charged back.
 * Full refund / chargeback → the whole commission. Partial refund → pro rata.
 */
export function computeReversalAmount(
  commissionAmount: number,
  paymentAmount: number,
  refundedAmount: number | null | undefined,
  reason: "refund" | "chargeback" | "fraud" | "admin",
): number {
  const commission = Math.max(0, Number(commissionAmount) || 0);
  if (commission === 0) return 0;
  if (reason !== "refund") return roundMoney(commission);
  const paid = Number(paymentAmount) || 0;
  const refunded = Number(refundedAmount ?? paid) || 0;
  if (paid <= 0 || refunded >= paid) return roundMoney(commission);
  return roundMoney(commission * (Math.max(0, refunded) / paid));
}

/** The discount a referred business gets on its first payment. */
export function referredBusinessDiscount(amount: number): { percent: number; discount: number; payable: number } {
  const percent = COMMISSION_POLICY.referral.referredDiscountPercent;
  const discount = percentOf(Math.max(0, Number(amount) || 0), percent);
  return { percent, discount, payable: roundMoney(Math.max(0, Number(amount) || 0) - discount) };
}

/** Maps the user's platform roles to the partner program used for commissions. */
export function resolvePartnerProgram(
  explicitProgram: string | null | undefined,
  roles: readonly string[] = [],
): Exclude<PartnerProgram, "referral"> {
  const p = String(explicitProgram ?? "").toLowerCase();
  if (p === "ambassador" || p === "freelancer") return p;
  if (roles.includes("ambassador")) return "ambassador";
  // Conservative default: a partner without an explicit program earns the
  // freelancer/referral first-payment rate — never 0%, never lifetime by accident.
  return "freelancer";
}

/** Human-readable policy rows, used by the admin screen and the help knowledge. */
export const COMMISSION_POLICY_RULES: ReadonlyArray<{
  program: PartnerProgram;
  commissionType: CommissionType | "referred_business_discount";
  percent: number;
  appliesTo: "first_payment" | "every_payment" | "collected_management_fee";
}> = [
  { program: "referral", commissionType: "referral_commission", percent: COMMISSION_POLICY.referral.firstPaymentPercent, appliesTo: "first_payment" },
  { program: "referral", commissionType: "referred_business_discount", percent: COMMISSION_POLICY.referral.referredDiscountPercent, appliesTo: "first_payment" },
  { program: "freelancer", commissionType: "referral_commission", percent: COMMISSION_POLICY.freelancer.firstPaymentReferralPercent, appliesTo: "first_payment" },
  { program: "freelancer", commissionType: "management_fee_commission", percent: COMMISSION_POLICY.freelancer.managementFeeSharePercent, appliesTo: "collected_management_fee" },
  { program: "ambassador", commissionType: "ambassador_lifetime_commission", percent: COMMISSION_POLICY.ambassador.lifetimeRecurringPercent, appliesTo: "every_payment" },
  { program: "ambassador", commissionType: "ambassador_first_payment_bonus", percent: COMMISSION_POLICY.ambassador.firstPaymentBonusPercent, appliesTo: "first_payment" },
];
