import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PricingDurationSelector } from "./PricingDurationSelector";

describe("PricingDurationSelector", () => {
  it("renders the canonical package terms and preserves the selected term", () => {
    render(<PricingDurationSelector value="6-month" onChange={() => {}} />);

    expect(screen.getByRole("option", { name: "Monthly" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "3 Months" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "6 Months" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Yearly" })).toBeInTheDocument();
  });

  it("changes the commitment term only after explicit user selection", () => {
    const onChange = vi.fn();
    render(<PricingDurationSelector value="monthly" onChange={onChange} />);

    fireEvent.click(screen.getByRole("option", { name: "3 Months" }));

    expect(onChange).toHaveBeenCalledWith("3-month");
  });

  it("shows a live local-time center instead of a static decorative image", () => {
    const { container } = render(<PricingDurationSelector value="monthly" onChange={() => {}} />);

    expect(screen.getByText("Local time")).toBeInTheDocument();
    expect(container.querySelector("time")).toBeInTheDocument();
  });
});
