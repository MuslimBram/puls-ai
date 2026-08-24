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


  it.each([
    [],
    ["user"],
    ["controller"],
    ["worker"],
    ["moderator"],
    ["unknown_role"],
  ])("defaults unsupported roles to least-privilege navigation: %s", (roles) => {
    expect(getNavGroupsForRoles(roles)).toEqual([]);
  });

  it("composes multiple applicable roles without duplicate destinations", () => {
    const groups = getNavGroupsForRoles(["business_owner", "agent"]);
    const destinations = groups.flatMap((group) =>
      group.items.map((item) => item.href),
    );

    expect(destinations).toContain("/managed-businesses");
    expect(destinations).toContain("/helpdesk");
    expect(new Set(destinations).size).toBe(destinations.length);
  });

  it("keeps ordinary business navigation compact and predictable", () => {
    const groups = getNavGroupsForRoles(["business_owner"]);

    expect(groups.map((group) => group.label)).toEqual([
      "Core",
      "Growth",
      "Automation",
      "Business",
      "Settings",
    ]);

    const visibleDestinations = groups.flatMap((group) =>
      group.items.filter((item) => !item.searchOnly),
    );
    expect(visibleDestinations).toHaveLength(23);
  });

  it("preserves the Helpdesk automation permission gate", () => {
    const helpdesk = getNavGroupsForRoles(["business_owner"])
      .flatMap((group) => group.items)
      .find((item) => item.href === "/helpdesk");

    expect(helpdesk?.requiredPermission).toBe("canConfigureAutomations");
  });

  it("keeps advanced destinations searchable without crowding the sidebar", () => {
    const items = getNavGroupsForRoles(["business_owner"]).flatMap(
      (group) => group.items,
    );

    expect(items.find((item) => item.href === "/ai-marketplace")?.searchOnly).toBe(true);
    expect(items.find((item) => item.href === "/seo-audit")?.searchOnly).toBe(true);
    expect(items.find((item) => item.href === "/content-calendar")?.searchOnly).toBe(true);
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
