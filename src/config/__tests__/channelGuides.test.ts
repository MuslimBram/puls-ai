import { describe, expect, it } from "vitest";
import { CHANNEL_GUIDES, getChannelGuide, getGuideLocale } from "@/config/channelGuides";

const providerIds = [
  "whatsapp", "telegram", "email", "facebook", "sms",
  "voip", "tiktok", "google_sheets", "messagebird", "viber",
];

describe("canonical channel guides", () => {
  it("covers every self-service provider exactly once", () => {
    expect(CHANNEL_GUIDES.map((guide) => guide.id)).toEqual(providerIds);
    expect(new Set(CHANNEL_GUIDES.map((guide) => guide.id)).size).toBe(CHANNEL_GUIDES.length);
  });

  it("contains complete English and Albanian guidance", () => {
    for (const guide of CHANNEL_GUIDES) {
      for (const locale of ["en", "sq"] as const) {
        const copy = guide.copy[locale];
        expect(copy.summary.length).toBeGreaterThan(20);
        expect(copy.requirements.length).toBeGreaterThan(0);
        expect(copy.steps.length).toBeGreaterThan(2);
        expect(copy.errors.length).toBeGreaterThan(0);
        expect(copy.security.length).toBeGreaterThan(10);
      }
    }
  });

  it("keeps WhatsApp on direct Meta Cloud API and Twilio on SMS/Voice", () => {
    const whatsapp = getChannelGuide("whatsapp")!;
    expect(whatsapp.copy.en.summary).toContain("Meta WhatsApp Cloud API");
    expect(whatsapp.copy.en.summary).toContain("Twilio is not used");

    const sms = getChannelGuide("sms")!;
    expect(sms.copy.en.summary).toContain("Twilio");
    expect(sms.copy.en.summary).toContain("not WhatsApp");
  });

  it("selects Albanian only for sq locales", () => {
    expect(getGuideLocale("sq")).toBe("sq");
    expect(getGuideLocale("sq-AL")).toBe("sq");
    expect(getGuideLocale("en")).toBe("en");
    expect(getGuideLocale("de")).toBe("en");
  });
});
