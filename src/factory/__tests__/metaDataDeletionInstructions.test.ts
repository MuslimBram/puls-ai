import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("public/data-deletion.html", "utf8");

describe("Meta data deletion instructions", () => {
  it("publishes clear deletion-request instructions without requiring login", () => {
    expect(page).toContain("Pulse AI — User Data Deletion");
    expect(page).toContain("Apps and websites");
    expect(page).toContain("Meta Data Deletion Request");
    expect(page).toContain("muslim.brami@gmail.com");
  });

  it("links to the canonical bilingual privacy policy", () => {
    expect(page).toContain("https://pulse-bos.com/en/privacy");
    expect(page).toContain("https://pulse-bos.com/sq/privacy");
  });

  it("states the retention exception and request timeframe", () => {
    expect(page).toContain("within 30 days");
    expect(page).toContain("legal, accounting, security, or fraud-prevention obligations");
  });
});
