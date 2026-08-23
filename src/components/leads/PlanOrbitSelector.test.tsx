import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlanOrbitSelector, type LeadPlanValue } from "./PlanOrbitSelector";

const labels: Record<LeadPlanValue, string> = {
  standard: "Standard",
  professional: "Professional",
  advanced: "Advanced",
  enterprise: "Enterprise",
};

describe("PlanOrbitSelector", () => {
  it("renders all existing public lead plan values", () => {
    render(<PlanOrbitSelector value="professional" labels={labels} onChange={() => {}} />);

    expect(screen.getByRole("option", { name: "Standard" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Professional" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Advanced" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Enterprise" })).toBeInTheDocument();
  });

  it("changes the interested plan only after explicit selection", () => {
    const onChange = vi.fn();
    render(<PlanOrbitSelector value="standard" labels={labels} onChange={onChange} />);

    fireEvent.click(screen.getByRole("option", { name: "Advanced" }));

    expect(onChange).toHaveBeenCalledWith("advanced");
  });
});
