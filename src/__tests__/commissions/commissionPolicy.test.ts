import { beforeEach, describe, expect, it } from "vitest";
import {
  COMMISSION_POLICY,
  COMMISSION_POLICY_RULES,
  computeManagementFeeCommission,
  computeReversalAmount,
  computeSubscriptionPaymentCommissions,
  isEligiblePayment,
  POLICY_EFFECTIVE_FROM,
  referredBusinessDiscount,
  resolvePartnerProgram,
  roundMoney,
} from "../../../supabase/functions/_shared/commission-policy";
import {
  processManagementFee,
  processSubscriptionPayment,
  reverseCommissionsForPayment,
} from "../../../supabase/functions/_shared/commission-engine";
import { MemoryCommissionStore, type MemPayment } from "./memoryCommissionStore";

const AFTER = "2026-12-01T10:00:00Z";
const day = (n: number) => new Date(Date.parse(AFTER) + n * 86_400_000).toISOString();

function pay(store: MemoryCommissionStore, p: Partial<MemPayment> & { id: string; workspaceId: string }) {
  const row: MemPayment = { amount: 9900, status: "paid", createdAt: AFTER, ...p };
  store.payments.push(row);
  return processSubscriptionPayment(store, { ...row, currency: "ALL", payerUserId: store.workspaces.get(row.workspaceId)?.ownerUserId });
}

function seedPartner(store: MemoryCommissionStore, program: "freelancer" | "ambassador", status = "active") {
  store.partners.set("P1", { id: "P1", userId: "partner-user", status, program });
  store.workspaces.set("W1", { ownerUserId: "biz-owner", referredByPartnerId: "P1" });
}

describe("owner-approved policy constants", () => {
  it("matches the owner decision exactly", () => {
    expect(COMMISSION_POLICY.referral.firstPaymentPercent).toBe(15);
    expect(COMMISSION_POLICY.referral.referredDiscountPercent).toBe(15);
    expect(COMMISSION_POLICY.freelancer.firstPaymentReferralPercent).toBe(15);
    expect(COMMISSION_POLICY.freelancer.managementFeeSharePercent).toBe(20);
    expect(COMMISSION_POLICY.ambassador.lifetimeRecurringPercent).toBe(15);
    expect(COMMISSION_POLICY.ambassador.firstPaymentBonusPercent).toBe(15);
  });

  it("never resolves a partner to a 0% program", () => {
    expect(resolvePartnerProgram(null, [])).toBe("freelancer");
    expect(resolvePartnerProgram(undefined, ["ambassador"])).toBe("ambassador");
    expect(resolvePartnerProgram("ambassador", ["freelancer"])).toBe("ambassador");
    for (const rule of COMMISSION_POLICY_RULES) expect(rule.percent).toBeGreaterThan(0);
  });

  it("rounds money to cents", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(1485)).toBe(1485);
  });
});

describe("eligibility", () => {
  it.each([
    ["failed", 9900, 0, false],
    ["pending", 9900, 0, false],
    ["unpaid", 9900, 0, false],
    ["paid", 0, 0, false],
    ["paid", 9900, 9900, false],
    ["paid", 9900, 100, false],
    ["paid", 9900, 0, true],
    ["succeeded", 9900, 0, true],
  ])("status=%s amount=%s refunded=%s → %s", (status, amount, refundAmount, expected) => {
    expect(isEligiblePayment({ id: "x", status, amount, refundAmount })).toBe(expected);
  });

  it("a disputed payment is never eligible", () => {
    expect(isEligiblePayment({ id: "x", status: "paid", amount: 100, disputed: true })).toBe(false);
  });
});

describe("A. Referral Program", () => {
  let store: MemoryCommissionStore;
  beforeEach(() => {
    store = new MemoryCommissionStore();
    store.workspaces.set("W1", { ownerUserId: "biz-owner", referredByPartnerId: null });
    store.signupReferrers.set("biz-owner", { referrerUserId: "referrer", referralCode: "REF1" });
  });

  it("first payment: 15% to the referrer", async () => {
    const r = await pay(store, { id: "pay1", workspaceId: "W1" });
    expect(r).toMatchObject({ status: "processed", beneficiary: "referrer", inserted: ["referral_commission"] });
    expect(store.sumFor("referrer")).toBe(1485);
  });

  it("referred business gets a 15% discount", () => {
    expect(referredBusinessDiscount(9900)).toEqual({ percent: 15, discount: 1485, payable: 8415 });
  });

  it("renewal: no referral commission", async () => {
    await pay(store, { id: "pay1", workspaceId: "W1" });
    const r = await pay(store, { id: "pay2", workspaceId: "W1", createdAt: day(30) });
    expect(r).toEqual({ status: "skipped", reason: "renewal_not_commissionable" });
    expect(store.rows).toHaveLength(1);
  });

  it("self-referral is blocked and flagged", async () => {
    store.signupReferrers.set("biz-owner", { referrerUserId: "biz-owner", referralCode: "MINE" });
    const r = await pay(store, { id: "pay1", workspaceId: "W1" });
    expect(r).toEqual({ status: "skipped", reason: "self_referral" });
    expect(store.risk[0].reason).toBe("self_referral");
  });

  it("a referrer who is a member of the workspace cannot earn on it", async () => {
    store.members.add("W1:referrer");
    expect(await pay(store, { id: "pay1", workspaceId: "W1" })).toEqual({ status: "skipped", reason: "self_referral" });
  });
});

describe("B. Freelancer", () => {
  let store: MemoryCommissionStore;
  beforeEach(() => {
    store = new MemoryCommissionStore();
    seedPartner(store, "freelancer");
  });

  it("first payment: 15% referral commission", async () => {
    const r = await pay(store, { id: "pay1", workspaceId: "W1" });
    expect(r).toMatchObject({ inserted: ["referral_commission"] });
    expect(store.sumFor("P1")).toBe(1485);
  });

  it("renewal: nothing", async () => {
    await pay(store, { id: "pay1", workspaceId: "W1" });
    expect(await pay(store, { id: "pay2", workspaceId: "W1", createdAt: day(30) })).toMatchObject({ status: "skipped" });
  });

  it("collected management fee: 20% management share, tracked separately", async () => {
    store.managed.add("P1:W1");
    await pay(store, { id: "pay1", workspaceId: "W1" });
    const r = await processManagementFee(store, { id: "fee1", partnerId: "P1", workspaceId: "W1", amount: 20000, status: "collected", currency: "ALL" });
    expect(r).toMatchObject({ inserted: ["management_fee_commission"] });
    expect(store.sumFor("P1", (x) => x.commissionType === "management_fee_commission")).toBe(4000);
    expect(store.sumFor("P1", (x) => x.commissionType === "referral_commission")).toBe(1485);
  });

  it("no management fee collected: no management commission", async () => {
    store.managed.add("P1:W1");
    for (const status of ["invoiced", "pending", "failed", "cancelled"]) {
      const r = await processManagementFee(store, { id: `fee-${status}`, partnerId: "P1", workspaceId: "W1", amount: 20000, status });
      expect(r).toEqual({ status: "skipped", reason: "fee_not_collected" });
    }
    expect(computeManagementFeeCommission({ id: "f", amount: 0, status: "collected" })).toBeNull();
    expect(store.rows).toHaveLength(0);
  });

  it("management fee only for a business the freelancer actively manages", async () => {
    const r = await processManagementFee(store, { id: "fee1", partnerId: "P1", workspaceId: "W1", amount: 20000, status: "collected" });
    expect(r).toEqual({ status: "skipped", reason: "not_actively_managed" });
  });

  it("an ambassador cannot earn management fees", async () => {
    store.partners.set("P1", { id: "P1", userId: "partner-user", status: "active", program: "ambassador" });
    store.managed.add("P1:W1");
    const r = await processManagementFee(store, { id: "fee1", partnerId: "P1", workspaceId: "W1", amount: 20000, status: "collected" });
    expect(r).toEqual({ status: "skipped", reason: "not_a_freelancer" });
  });

  it("duplicate management-fee event: no duplicate commission", async () => {
    store.managed.add("P1:W1");
    const fee = { id: "fee1", partnerId: "P1", workspaceId: "W1", amount: 20000, status: "collected" };
    await processManagementFee(store, fee);
    const again = await processManagementFee(store, fee);
    expect(again).toMatchObject({ inserted: [], duplicates: ["management_fee_commission"] });
    expect(store.rows).toHaveLength(1);
  });
});

describe("C. Ambassador", () => {
  let store: MemoryCommissionStore;
  beforeEach(() => {
    store = new MemoryCommissionStore();
    seedPartner(store, "ambassador");
  });

  it("first payment: 15% lifetime + 15% bonus = 30%", async () => {
    const r = await pay(store, { id: "pay1", workspaceId: "W1" });
    expect(r).toMatchObject({ inserted: ["ambassador_lifetime_commission", "ambassador_first_payment_bonus"] });
    expect(store.sumFor("P1", (x) => x.commissionType === "ambassador_lifetime_commission")).toBe(1485);
    expect(store.sumFor("P1", (x) => x.commissionType === "ambassador_first_payment_bonus")).toBe(1485);
    expect(store.sumFor("P1")).toBe(2970);
  });

  it("first and subsequent renewals: 15% each, bonus never repeats", async () => {
    await pay(store, { id: "pay1", workspaceId: "W1" });
    const r2 = await pay(store, { id: "pay2", workspaceId: "W1", createdAt: day(30) });
    const r3 = await pay(store, { id: "pay3", workspaceId: "W1", createdAt: day(60) });
    expect(r2).toMatchObject({ inserted: ["ambassador_lifetime_commission"] });
    expect(r3).toMatchObject({ inserted: ["ambassador_lifetime_commission"] });
    expect(store.sumFor("P1")).toBe(2970 + 1485 + 1485);
    expect(store.rows.filter((x) => x.commissionType === "ambassador_first_payment_bonus")).toHaveLength(1);
  });

  it("duplicate webhook: no duplicate commission", async () => {
    await pay(store, { id: "pay1", workspaceId: "W1" });
    const again = await processSubscriptionPayment(store, {
      id: "pay1", workspaceId: "W1", amount: 9900, status: "paid", createdAt: AFTER, currency: "ALL",
    });
    // The bonus is already held so it is not even drafted; the lifetime row hits the unique key.
    expect(again).toMatchObject({ inserted: [], duplicates: ["ambassador_lifetime_commission"] });
    expect(store.rows).toHaveLength(2);
  });

  it("full refund before approval: commissions cancelled, wallet pending back to 0", async () => {
    await pay(store, { id: "pay1", workspaceId: "W1" });
    const r = await reverseCommissionsForPayment(store, { sourcePaymentKind: "subscription_payment", sourcePaymentId: "pay1", paymentAmount: 9900, reason: "refund" });
    expect(r.reversed).toHaveLength(2);
    expect(store.rows.every((x) => x.status === "cancelled")).toBe(true);
    expect(store.wallet.get("P1")).toEqual({ pending: 0, current: 0 });
  });

  it("chargeback after approval: clawed back with a separate entry, history kept", async () => {
    await pay(store, { id: "pay1", workspaceId: "W1" });
    store.approveAll();
    expect(store.wallet.get("P1")!.current).toBe(2970);
    await reverseCommissionsForPayment(store, { sourcePaymentKind: "subscription_payment", sourcePaymentId: "pay1", paymentAmount: 9900, reason: "chargeback" });
    expect(store.wallet.get("P1")!.current).toBe(0);
    expect(store.rows).toHaveLength(4); // 2 originals (reversed) + 2 negative clawbacks
    expect(store.rows.filter((x) => x.amount < 0)).toHaveLength(2);
    expect(store.sumFor("P1")).toBe(0);
  });

  it("repeated reversal event does not double-reverse", async () => {
    await pay(store, { id: "pay1", workspaceId: "W1" });
    const ev = { sourcePaymentKind: "subscription_payment" as const, sourcePaymentId: "pay1", paymentAmount: 9900, reason: "refund" as const };
    await reverseCommissionsForPayment(store, ev);
    const second = await reverseCommissionsForPayment(store, ev);
    expect(second.reversed).toHaveLength(0);
  });

  it("partial refund reverses pro rata", () => {
    expect(computeReversalAmount(1485, 9900, 4950, "refund")).toBe(742.5);
    expect(computeReversalAmount(1485, 9900, undefined, "chargeback")).toBe(1485);
  });

  it("commission is calculated on the actually paid amount, not the list price", async () => {
    await pay(store, { id: "pay1", workspaceId: "W1", amount: 8415 }); // after 15% referred discount
    expect(store.sumFor("P1")).toBe(roundMoney(8415 * 0.3));
  });

  it("suspended ambassador earns nothing", async () => {
    store.partners.get("P1")!.status = "suspended";
    expect(await pay(store, { id: "pay1", workspaceId: "W1" })).toEqual({ status: "skipped", reason: "partner_suspended" });
  });

  it("unpaid / failed / refunded payments generate nothing", async () => {
    expect(await pay(store, { id: "f1", workspaceId: "W1", status: "failed" })).toEqual({ status: "skipped", reason: "ineligible_payment" });
    expect(await pay(store, { id: "f2", workspaceId: "W1", status: "open" })).toEqual({ status: "skipped", reason: "ineligible_payment" });
    expect(await pay(store, { id: "f3", workspaceId: "W1", refundAmount: 9900 })).toEqual({ status: "skipped", reason: "ineligible_payment" });
    expect(store.rows).toHaveLength(0);
  });

  it("legacy: payments before the policy date are not recalculated", async () => {
    const before = new Date(Date.parse(POLICY_EFFECTIVE_FROM) - 86_400_000).toISOString();
    expect(await pay(store, { id: "old", workspaceId: "W1", createdAt: before })).toEqual({ status: "skipped", reason: "before_policy_effective_date" });
    // The next (post-policy) payment is a renewal: lifetime 15% only, no retroactive bonus.
    const r = await pay(store, { id: "new", workspaceId: "W1", createdAt: day(1) });
    expect(r).toMatchObject({ inserted: ["ambassador_lifetime_commission"] });
  });

  it("legacy first-payment commission blocks a second first-payment bonus", () => {
    const drafts = computeSubscriptionPaymentCommissions({
      program: "ambassador",
      payment: { id: "p", amount: 1000, status: "paid" },
      isFirstEligiblePayment: true,
      existingOnceTypes: ["legacy_first_payment"],
    });
    expect(drafts.map((d) => d.commissionType)).toEqual(["ambassador_lifetime_commission"]);
  });

  it("self-referral by the ambassador is blocked", async () => {
    store.workspaces.set("W1", { ownerUserId: "partner-user", referredByPartnerId: "P1" });
    expect(await pay(store, { id: "pay1", workspaceId: "W1" })).toEqual({ status: "skipped", reason: "self_referral" });
  });
});

describe("no double counting across programs", () => {
  it("a partner-referred workspace never also pays the ordinary referrer", async () => {
    const store = new MemoryCommissionStore();
    seedPartner(store, "freelancer");
    store.signupReferrers.set("biz-owner", { referrerUserId: "referrer", referralCode: "REF1" });
    const r = await pay(store, { id: "pay1", workspaceId: "W1" });
    expect(r).toMatchObject({ beneficiary: "partner" });
    expect(store.sumFor("referrer")).toBe(0);
  });
});
