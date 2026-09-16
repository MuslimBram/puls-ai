/**
 * _shared/platform-roles.ts
 *
 * FAZA 1A — the single source of truth for "who legitimately bypasses plan limits".
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 * Four deployed functions each carried their own copy of this expression, and
 * they DIVERGED. As of 2026-09-15 production looked like this:
 *
 *   enforce-limits     v52  ["super_admin","admin"]                     correct
 *   ai-router          v65  no role bypass at all                       correct
 *   check-subscription v52  super_admin | admin | business_owner        WRONG
 *   generate-reply     v50  super_admin | admin | business_owner        WRONG
 *   dedicated-ai-reply v50  super_admin | admin | business_owner        WRONG
 *
 * `business_owner` is NOT a staff role. bootstrap_user_account_for() grants it
 * to EVERY user on EVERY login — production has it on 5 of 5 accounts. Treating
 * it as a billing bypass means no account on the platform is ever limited.
 *
 * Because enforce-limits was fixed on 2026-09-14 but the three AI/subscription
 * paths were not, the fix was bypassable: calling generate-reply directly still
 * returned an unlimited quota. A shared constant makes that class of divergence
 * impossible rather than merely unlikely.
 *
 * ── Rule ─────────────────────────────────────────────────────────────────────
 * Never inline a role list. Import from here. A regression test asserts that no
 * function under supabase/functions/ contains `business_owner` in executable
 * code, and that every limit-enforcing function imports this module.
 */

/**
 * Roles that are genuine PLATFORM STAFF and may exceed customer plan limits.
 *
 * Deliberately excluded:
 *   business_owner  — granted to every user on login; means "owns a workspace"
 *   partner, freelancer, ambassador, white_label — customer-side commercial roles
 */
export const PLATFORM_STAFF_BYPASS_ROLES = ["super_admin", "admin"] as const;

export type PlatformStaffRole = (typeof PLATFORM_STAFF_BYPASS_ROLES)[number];

/** Reads the caller's roles. Returns [] rather than throwing on a read error. */
export async function loadCallerRoles(sb: any, userId: string): Promise<string[]> {
  const { data, error } = await sb.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`role lookup failed: ${error.message}`);
  return (data ?? []).map((row: { role: string }) => row.role);
}

/** The staff roles the caller actually holds — returned so a bypass is auditable. */
export function staffRolesOf(roles: string[]): string[] {
  return roles.filter((role) => (PLATFORM_STAFF_BYPASS_ROLES as readonly string[]).includes(role));
}

/** True only for genuine platform staff. */
export function isPlatformStaff(roles: string[]): boolean {
  return staffRolesOf(roles).length > 0;
}
