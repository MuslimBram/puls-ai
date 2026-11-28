import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  COMMISSION_POLICY,
  COMMISSION_POLICY_RULES,
  COMMISSION_POLICY_VERSION,
  POLICY_EFFECTIVE_FROM,
} from "../../../supabase/functions/_shared/commission-policy";

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === "node_modules" || name === "__tests__" || name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !full.endsWith("integrations/supabase/types.ts")) out.push(full);
  }
  return out;
}

const migration = read("supabase/migrations/20261128120000_partner_referral_policy_owner_v1.sql");

describe("policy is identical in code and database seed", () => {
  it("seeds every rule with the same percent", () => {
    for (const rule of COMMISSION_POLICY_RULES) {
      const row = `'${COMMISSION_POLICY_VERSION}','${rule.program}',`;
      const line = migration.split("\n").find((l) => l.includes(row) && l.includes(`'${rule.commissionType}'`));
      expect(line, `${rule.program}/${rule.commissionType}`).toBeTruthy();
      expect(line).toMatch(new RegExp(`'${rule.commissionType}',\\s*${rule.percent},\\s*'${rule.appliesTo}'`));
      expect(line).toContain(POLICY_EFFECTIVE_FROM);
    }
  });

  it("the migration never deletes commission, wallet or payout history", () => {
    expect(migration).not.toMatch(/delete\s+from\s+public\.(partner_commissions|partner_wallets|partner_wallet_transactions|payout_requests|referral_rewards|user_wallet_transactions)/i);
    expect(migration).not.toMatch(/update\s+public\.partner_commissions\s+set\s+commission_amount/i);
    expect(migration).not.toMatch(/truncate/i);
  });
});

describe("no outdated commission statements anywhere", () => {
  const files = [...walk(resolve(root, "src")), ...walk(resolve(root, "supabase/functions"))];
  const outdated = [
    /35\s*%\s*(komision|commission|lifetime|jet[eë]sor|nga referimet|referral)/i,
    /40\s*%\s*(nga menaxhimi|management|menaxhim)/i,
    /earn 15% of everything they spend/i,
    /only on the first paid invoice/i,
    /does not promise a fixed public percentage or lifetime commission/i,
    /do not publish a fixed public commission percentage/i,
    /relation_type === "referral" \? 35 : 40/,
  ];
  it.each(outdated.map((r) => [r.source, r]))("%s", (_src, pattern) => {
    const hits = files.filter((f) => (pattern as RegExp).test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});

describe("every language states the same numbers", () => {
  for (const lang of ["sq", "en"]) {
    it(`${lang}.ts FAQ uses the approved percentages`, () => {
      const text = read(`src/i18n/${lang}.ts`);
      const block = text.slice(text.indexOf("referralEarnings: {"), text.indexOf("installMobile: {"));
      expect(block).toContain(`${COMMISSION_POLICY.referral.firstPaymentPercent}%`);
      expect(block).toContain(`${COMMISSION_POLICY.freelancer.managementFeeSharePercent}%`);
      expect(block).toContain(`30%`);
      expect(block).not.toMatch(/35%|40%/);
    });
  }
});
