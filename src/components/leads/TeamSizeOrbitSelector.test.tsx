import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TeamSizeOrbitSelector } from "./TeamSizeOrbitSelector";

const labels = {
  "1": "1 person",
  "2-5": "2–5 people",
  "6-15": "6–15 people",
  "16-50": "16–50 people",
  "50+": "50+ people",
} as const;

describe("TeamSizeOrbitSelector", () => {
  it("renders all existing team-size values and preserves selection", () => {
    render(<TeamSizeOrbitSelector value="6-15" labels={labels} onChange={() => {}} />);

    expect(screen.getByRole("option", { name: "1 person" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2–5 people" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "6–15 people" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "16–50 people" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "50+ people" })).toBeInTheDocument();
  });

  it("changes the stored team size only after explicit selection", () => {
    const onChange = vi.fn();
    render(<TeamSizeOrbitSelector value="1" labels={labels} onChange={onChange} />);

    fireEvent.click(screen.getByRole("option", { name: "16–50 people" }));

    expect(onChange).toHaveBeenCalledWith("16-50");
  });
});
