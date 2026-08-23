import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  BUSINESS_AI_LANGUAGE_OPTIONS,
  BUSINESS_AI_TONE_OPTIONS,
  BusinessProfileAiOrbitSelectors,
} from "./BusinessProfileAiOrbitSelectors";

describe("BusinessProfileAiOrbitSelectors", () => {
  it("preserves the existing tone and language option values", () => {
    expect(BUSINESS_AI_TONE_OPTIONS.map((option) => option.value)).toEqual([
      "professional",
      "friendly",
      "casual",
      "formal",
      "persuasive",
    ]);
    expect(BUSINESS_AI_LANGUAGE_OPTIONS.map((option) => option.value)).toEqual([
      "en",
      "ar",
      "es",
      "fr",
      "de",
    ]);
  });

  it("only changes values after explicit user selection", () => {
    const onToneChange = vi.fn();
    const onLanguageChange = vi.fn();

    render(
      <BusinessProfileAiOrbitSelectors
        tone="professional"
        language="en"
        onToneChange={onToneChange}
        onLanguageChange={onLanguageChange}
      />,
    );

    expect(screen.getByRole("option", { name: "Professional" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "English" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("option", { name: "Friendly" }));
    fireEvent.click(screen.getByRole("option", { name: "French" }));

    expect(onToneChange).toHaveBeenCalledWith("friendly");
    expect(onLanguageChange).toHaveBeenCalledWith("fr");
  });
});
