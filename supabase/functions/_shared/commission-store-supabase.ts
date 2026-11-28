/**
 * _shared/commission-store-supabase.ts
 *
 * CommissionStore backed by the Supabase service-role client. All money
 * movements that must be atomic (reversals, wallet credits) go through the
 * SECURITY DEFINER functions from migration 20261128120000.
 */
// deno-lint-ignore-file no-explicit-any
import {
  type CommissionDraft,
  ELIGIBLE_PAYMENT_STATUSES,
  LEGACY_COMMISSION_TYPE,
  ONCE_PER_WORKSPACE_TYPES,
  resolvePartnerProgram,
  type SourcePaymentKind,
} from "./commission-policy.ts";
import type { Beneficiary, CommissionStore, PartnerRecord, ReversalReason, StoredCommission } from "./commission-engine.ts";

const isDuplicate = (err: any) =>
  !!err && (err.code === "23505" || String(err.message ?? "").toLowerCase().includes("duplicate"));

export function createSupabaseCommissionStore(sb: any, log: (msg: string, extra?: unknown) => void = console.log): CommissionStore {
  return {
    async getWorkspace(workspaceId) {
      const { data, error } = await sb.from("workspaces")
        .select("owner_id, referred_by_partner_id").eq("id", workspaceId).maybeSingle();
      if (error) throw error;
      return data ? { ownerUserId: data.owner_id, referredByPartnerId: data.referred_by_partner_id ?? null } : null;
    },

    async getPartner(partnerId): Promise<PartnerRecord | null> {
      const { data, error } = await sb.from("partner_accounts")
        .select("id, user_id, status, partner_program").eq("id", partnerId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      let roles: string[] = [];
      if (!data.partner_program) {
        const { data: r } = await sb.from("user_roles").select("role").eq("user_id", data.user_id);
        roles = (r ?? []).map((x: any) => String(x.role));
      }
      return { id: data.id, userId: data.user_id, status: data.status, program: resolvePartnerProgram(data.partner_program, roles) };
    },

    async findSignupReferrer(userId) {
      // Attribution comes from the referred user's own signup metadata, never
      // from a row a referrer could have written.
      const { data: u, error } = await sb.auth.admin.getUserById(userId);
      if (error || !u?.user) return null;
      const code = String(u.user.user_metadata?.referral_code ?? "").trim();
      if (!code) return null;
      const { data: rc } = await sb.from("business_referral_codes")
        .select("user_id, referral_code, is_active").eq("referral_code", code).maybeSingle();
      if (!rc || rc.is_active === false) return null;
      return { referrerUserId: rc.user_id, referralCode: rc.referral_code };
    },

    async isWorkspaceMember(workspaceId, userId) {
      const { data } = await sb.from("workspace_members")
        .select("id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
      return !!data;
    },

    async getFirstEligiblePaymentId(workspaceId) {
      const { data, error } = await sb.from("billing_history")
        .select("id, amount, status, created_at")
        .eq("workspace_id", workspaceId)
        .in("status", [...ELIGIBLE_PAYMENT_STATUSES])
        .gt("amount", 0)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },

    async listOnceTypes(b: Beneficiary, workspaceId) {
      if (b.kind === "partner") {
        const { data, error } = await sb.from("partner_commissions")
          .select("commission_type, is_first_payment")
          .eq("partner_id", b.partnerId).eq("workspace_id", workspaceId).is("reversal_of", null);
        if (error) throw error;
        return (data ?? [])
          .filter((r: any) =>
            (ONCE_PER_WORKSPACE_TYPES as readonly string[]).includes(r.commission_type) ||
            (r.commission_type === LEGACY_COMMISSION_TYPE && r.is_first_payment))
          .map((r: any) => r.commission_type);
      }
      const { data, error } = await sb.from("referral_rewards")
        .select("commission_type").eq("workspace_id", workspaceId).is("reversal_of", null);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.commission_type);
    },

    async insertCommission(b: Beneficiary, workspaceId, d: CommissionDraft) {
      if (b.kind === "partner") {
        const { data: sub } = await sb.from("subscriptions")
          .select("id, plan, stripe_subscription_id").eq("workspace_id", workspaceId).maybeSingle();
        const nowIso = new Date().toISOString();
        const { error } = await sb.from("partner_commissions").insert({
          partner_id: b.partnerId,
          workspace_id: workspaceId,
          subscription_id: sub?.stripe_subscription_id || sub?.id || null,
          plan_name: sub?.plan || "standard",
          billing_period_start: nowIso,
          billing_period_end: nowIso,
          gross_amount: d.grossAmount,
          commission_percent: d.percent,
          commission_amount: d.amount,
          commission_status: "pending_refund_window",
          is_first_payment: d.isFirstPayment,
          source_invoice_id: d.sourcePaymentId,
          commission_type: d.commissionType,
          policy_version: d.policyVersion,
          source_payment_kind: d.sourcePaymentKind,
          source_payment_id: d.sourcePaymentId,
          currency: d.currency,
          management_fee_id: d.sourcePaymentKind === "management_fee" ? d.sourcePaymentId : null,
        });
        if (error) {
          if (isDuplicate(error)) return "duplicate";
          throw error;
        }
        await sb.rpc("refresh_partner_pending", { _partner_id: b.partnerId });
        log(`[commissions] ${d.commissionType} ${d.amount} ${d.currency} → partner ${b.partnerId} (source ${d.sourcePaymentId})`);
        return "inserted";
      }

      const { data: ws } = await sb.from("workspaces").select("owner_id").eq("id", workspaceId).maybeSingle();
      const referredUserId = ws?.owner_id;
      const { error } = await sb.from("referral_rewards").insert({
        referrer_user_id: b.referrerUserId,
        referred_user_id: referredUserId,
        workspace_id: workspaceId,
        referral_code: b.referralCode,
        source_payment_id: d.sourcePaymentId,
        gross_amount: d.grossAmount,
        reward_percent: d.percent,
        reward_amount: d.amount,
        currency: d.currency,
        reward_status: "pending_refund_window",
        policy_version: d.policyVersion,
      });
      if (error) {
        if (isDuplicate(error)) return "duplicate";
        throw error;
      }
      // Keep the referrer's referral list (ReferralProgram page) in sync, server-side.
      const { data: existing } = await sb.from("business_referrals")
        .select("id").eq("referrer_user_id", b.referrerUserId).eq("referred_user_id", referredUserId).maybeSingle();
      if (existing) {
        await sb.from("business_referrals")
          .update({ reward_amount: d.amount, reward_status: "pending" }).eq("id", existing.id);
      } else {
        await sb.from("business_referrals").insert({
          referrer_user_id: b.referrerUserId,
          referred_user_id: referredUserId,
          referral_code: b.referralCode,
          status: "active",
          reward_status: "pending",
          reward_amount: d.amount,
        });
      }
      log(`[commissions] referral_commission ${d.amount} ${d.currency} → referrer ${b.referrerUserId}`);
      return "inserted";
    },

    async listCommissionsForSource(kind: SourcePaymentKind, sourceId: string): Promise<StoredCommission[]> {
      const out: StoredCommission[] = [];
      const { data: pc, error } = await sb.from("partner_commissions")
        .select("id, partner_id, workspace_id, commission_type, commission_amount, commission_status, source_payment_kind, source_payment_id")
        .eq("source_payment_kind", kind).eq("source_payment_id", sourceId).is("reversal_of", null);
      if (error) throw error;
      for (const r of pc ?? []) {
        out.push({
          id: r.id, beneficiaryKind: "partner", beneficiaryId: r.partner_id, workspaceId: r.workspace_id,
          commissionType: r.commission_type, amount: Number(r.commission_amount), status: r.commission_status,
          sourcePaymentKind: r.source_payment_kind, sourcePaymentId: r.source_payment_id,
        });
      }
      if (kind === "subscription_payment") {
        const { data: rr, error: rrErr } = await sb.from("referral_rewards")
          .select("id, referrer_user_id, workspace_id, commission_type, reward_amount, reward_status, source_payment_kind, source_payment_id")
          .eq("source_payment_id", sourceId).is("reversal_of", null);
        if (rrErr) throw rrErr;
        for (const r of rr ?? []) {
          out.push({
            id: r.id, beneficiaryKind: "referrer", beneficiaryId: r.referrer_user_id, workspaceId: r.workspace_id,
            commissionType: r.commission_type, amount: Number(r.reward_amount), status: r.reward_status,
            sourcePaymentKind: r.source_payment_kind, sourcePaymentId: r.source_payment_id,
          });
        }
      }
      return out;
    },

    async reverseCommission(c: StoredCommission, amount: number, reason: ReversalReason) {
      const fn = c.beneficiaryKind === "partner" ? "reverse_partner_commission" : "reverse_referral_reward";
      const args = c.beneficiaryKind === "partner"
        ? { _commission_id: c.id, _amount: amount, _reason: reason }
        : { _reward_id: c.id, _amount: amount, _reason: reason };
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw error;
      return data === "reversed" ? "reversed" : "already_reversed";
    },

    async isActivelyManaging(partnerId, workspaceId) {
      const { data: partner } = await sb.from("partner_accounts").select("user_id").eq("id", partnerId).maybeSingle();
      if (!partner) return false;
      const [{ data: rel }, { data: client }] = await Promise.all([
        sb.from("freelancer_business_relations").select("id")
          .eq("freelancer_user_id", partner.user_id).eq("business_workspace_id", workspaceId)
          .eq("relation_type", "management").eq("status", "active").maybeSingle(),
        sb.from("partner_clients").select("id")
          .eq("partner_id", partnerId).eq("workspace_id", workspaceId).eq("relationship_status", "active").maybeSingle(),
      ]);
      return !!rel || !!client;
    },

    async flagRisk(subject, reason, details) {
      if (subject.partnerId) {
        await sb.from("partner_risk_flags").insert({
          partner_id: subject.partnerId,
          flag_type: reason,
          severity: "high",
          description: `Commission blocked: ${reason}`,
          metadata: details,
        });
      } else {
        log(`[commissions] risk ${reason} for referrer ${subject.userId}`, details);
      }
    },
  };
}
