/**
 * Frontend view of the OFFICIAL PARTNER & REFERRAL POLICY.
 *
 * Re-exports the exact constants the edge functions use, so the numbers shown
 * on every page are the numbers actually paid. Never hard-code a commission
 * percentage in UI copy — build it from these values.
 */
export {
  COMMISSION_POLICY,
  COMMISSION_POLICY_RULES,
  COMMISSION_POLICY_VERSION,
  POLICY_EFFECTIVE_FROM,
  type CommissionType,
  type PartnerProgram,
} from "../../supabase/functions/_shared/commission-policy";

import { COMMISSION_POLICY as P } from "../../supabase/functions/_shared/commission-policy";

export const COMMISSION_TYPE_LABEL: Record<string, string> = {
  legacy_first_payment: "Legacy (pre-policy)",
  referral_commission: "Referral 15% (first payment)",
  management_fee_commission: "Management fee 20%",
  ambassador_lifetime_commission: "Ambassador 15% lifetime",
  ambassador_first_payment_bonus: "Ambassador 15% first-payment bonus",
};

/** Policy sentences in Albanian and English, built from the live constants. */
export const policyCopy = (isSq: boolean) =>
  isSq
    ? {
        title: "Politika zyrtare e partnerëve dhe referimeve",
        referral: `Programi i referimit: ${P.referral.firstPaymentPercent}% e pagesës së parë të suksesshme të biznesit të referuar (një herë). Biznesi i referuar merr ${P.referral.referredDiscountPercent}% zbritje në pagesën e parë.`,
        freelancer: `Freelancer: ${P.freelancer.firstPaymentReferralPercent}% komision referimi në pagesën e parë + ${P.freelancer.managementFeeSharePercent}% e tarifave të menaxhimit të arkëtuara realisht nga bizneset që menaxhon.`,
        ambassador: `Ambasador: ${P.ambassador.lifetimeRecurringPercent}% komision jetësor në çdo pagesë të suksesshme + bonus një herë ${P.ambassador.firstPaymentBonusPercent}% në pagesën e parë (pagesa e parë = ${P.ambassador.lifetimeRecurringPercent + P.ambassador.firstPaymentBonusPercent}% gjithsej, rinovimet = ${P.ambassador.lifetimeRecurringPercent}%).`,
        rules: `Komisionet llogariten mbi shumën e paguar realisht. Pagesat e papaguara, të dështuara, të rimbursuara ose të kontestuara nuk japin komision. Rimbursimet dhe chargeback-et e kthejnë komisionin. Vetë-referimi nuk lejohet. Komisioni i ri pret ${P.refundWindowDays} ditë (afati i rimbursimit) para miratimit.`,
      }
    : {
        title: "Official partner & referral policy",
        referral: `Referral Program: ${P.referral.firstPaymentPercent}% of the referred business's first successful payment (once). The referred business gets a ${P.referral.referredDiscountPercent}% discount on its first payment.`,
        freelancer: `Freelancer: ${P.freelancer.firstPaymentReferralPercent}% referral commission on the first payment + ${P.freelancer.managementFeeSharePercent}% of management fees actually collected from businesses they manage.`,
        ambassador: `Ambassador: ${P.ambassador.lifetimeRecurringPercent}% lifetime commission on every successful payment + a one-time ${P.ambassador.firstPaymentBonusPercent}% bonus on the first payment (first payment = ${P.ambassador.lifetimeRecurringPercent + P.ambassador.firstPaymentBonusPercent}% total, renewals = ${P.ambassador.lifetimeRecurringPercent}%).`,
        rules: `Commissions are calculated on the amount actually paid. Unpaid, failed, refunded or disputed payments earn nothing. Refunds and chargebacks reverse the commission. Self-referral is not allowed. New commissions wait ${P.refundWindowDays} days (refund window) before approval.`,
      };
