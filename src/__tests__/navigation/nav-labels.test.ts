import { describe, expect, it } from "vitest";
import { getNavLabel } from "@/components/layout/nav-labels";

describe("navigation labels", () => {
  it("returns Albanian labels for supported navigation text", () => {
    expect(getNavLabel("Dashboard", "sq")).toBe("Paneli");
    expect(getNavLabel("Administration", "sq-AL")).toBe("Administrimi");
    expect(getNavLabel("Search menu", "sq")).toBe("Search menu");
  });

  it("keeps canonical English labels for English and unknown languages", () => {
    expect(getNavLabel("Dashboard", "en")).toBe("Dashboard");
    expect(getNavLabel("Dashboard", "de")).toBe("Dashboard");
  });
});
