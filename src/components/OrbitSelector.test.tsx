import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrbitSelector, LiveDigitalClock } from "./OrbitSelector";

const items = [
  { value: "profile", label: "Business Profile" },
  { value: "connections", label: "Connections" },
  { value: "crm", label: "CRM" },
] as const;

describe("OrbitSelector", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders all options and preserves the controlled selected value", () => {
    render(
      <OrbitSelector
        items={[...items]}
        selectedValue="profile"
        onSelect={() => {}}
        ariaLabel="Setup steps"
        autoRotate={false}
      />,
    );

    expect(screen.getByRole("option", { name: "Business Profile" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Connections" })).toHaveAttribute("aria-selected", "false");
  });

  it("autoplay changes visual focus without changing the saved selection", () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();

    render(
      <OrbitSelector
        items={[...items]}
        selectedValue="profile"
        onSelect={onSelect}
        ariaLabel="Setup steps"
        rotationInterval={1000}
      />,
    );

    vi.advanceTimersByTime(1100);

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-activedescendant", "Setup-steps-connections");
    expect(screen.getByRole("option", { name: "Business Profile" })).toHaveAttribute("aria-selected", "true");
  });

  it("selects only when the user explicitly clicks an option", () => {
    const onSelect = vi.fn();

    render(
      <OrbitSelector
        items={[...items]}
        selectedValue="profile"
        onSelect={onSelect}
        ariaLabel="Setup steps"
        autoRotate={false}
      />,
    );

    fireEvent.click(screen.getByRole("option", { name: "CRM" }));
    expect(onSelect).toHaveBeenCalledWith("crm");
  });

  it("supports keyboard navigation and Enter selection", () => {
    const onSelect = vi.fn();

    render(
      <OrbitSelector
        items={[...items]}
        selectedValue="profile"
        onSelect={onSelect}
        ariaLabel="Setup steps"
        autoRotate={false}
      />,
    );

    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "ArrowRight" });
    fireEvent.keyDown(listbox, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith("connections");
  });
});

describe("LiveDigitalClock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates once per second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T12:00:00Z"));

    const { container } = render(<LiveDigitalClock />);
    const before = container.querySelector("time")?.getAttribute("datetime");

    vi.setSystemTime(new Date("2026-08-23T12:00:01Z"));
    vi.advanceTimersByTime(1000);

    const after = container.querySelector("time")?.getAttribute("datetime");
    expect(after).not.toBe(before);
  });
});
