import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountTypeOrbitSelector } from "./AccountTypeOrbitSelector";

describe("AccountTypeOrbitSelector", () => {
  it("renders the four existing account types", () => {
    render(<AccountTypeOrbitSelector value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: /Business/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Freelancer/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Ambassador/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /White-Label/i })).toBeInTheDocument();
  });

  it("changes account type only after explicit selection", () => {
    const onChange = vi.fn();
    render(<AccountTypeOrbitSelector value={null} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("option", { name: /Freelancer/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("freelancer");
  });

  it("reflects the selected account type", () => {
    render(<AccountTypeOrbitSelector value="ambassador" onChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: /Ambassador/i })).toHaveAttribute("aria-selected", "true");
  });
});
