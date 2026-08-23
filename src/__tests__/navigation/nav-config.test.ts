import { describe, expect, it } from "vitest";
import { getNavGroupsForRoles } from "@/components/layout/nav-config";

const roleSets = [
  ["super_admin"],
  ["admin"],
  ["business_owner"],
  ["freelancer"],
  ["agent"],
  ["business_manager"],
  ["ambassador"],
] as const;

describe("role-aware navigation", () => {
  it.each(roleSets)("does not repeat destinations for %s", (...roles) => {
    const destinations = getNavGroupsForRoles([...roles]).flatMap((group) =>
      group.items.map((item) => item.href),
    );

    expect(new Set(destinations).size).toBe(destinations.length);
  });

  it("keeps owner destinations out of ordinary business navigation", () => {
    const destinations = getNavGroupsForRoles(["business_owner"]).flatMap(
      (group) => group.items.map((item) => item.href),
    );

    expect(destinations).not.toContain("/admin");
    expect(destinations).not.toContain("/admin/lidhjet");
    expect(destinations).not.toContain("/admin/activation");
    expect(destinations).not.toContain("/admin/integration-hub");
  });

  it("preserves owner access to administration destinations", () => {
    const destinations = getNavGroupsForRoles(["super_admin"]).flatMap(
      (group) => group.items.map((item) => item.href),
    );

    expect(destinations).toContain("/admin");
    expect(destinations).toContain("/admin/lidhjet");
    expect(destinations).toContain("/admin/activation");
    expect(destinations).toContain("/admin/integration-hub");
  });
});
