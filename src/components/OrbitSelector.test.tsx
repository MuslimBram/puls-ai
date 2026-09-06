import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrbitSelector, LiveDigitalClock } from "./OrbitSelector";

const items = [
  { value: "profile", label: "Business Profile" },
  { value: "connections", label: "Connections" },
  { value: "crm", label: "CRM" },
] as const;

const defaultMatchMedia = window.matchMedia;

describe("OrbitSelector", () => {
  afterEach(() => {
    vi.useRealTimers();
    window.matchMedia = defaultMatchMedia;
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

  it("uses a valid active-descendant ID that resolves to the focused option", () => {
    render(
      <OrbitSelector
        items={[...items]}
        selectedValue="profile"
        onSelect={() => {}}
        ariaLabel="Setup steps with spaces"
        autoRotate={false}
      />,
    );

    const activeId = screen.getByRole("listbox").getAttribute("aria-activedescendant");
    expect(activeId).toBeTruthy();
    expect(activeId).not.toMatch(/\s/);
    expect(document.getElementById(activeId!)).toBe(screen.getByRole("option", { name: "Business Profile" }));
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

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    const activeId = screen.getByRole("listbox").getAttribute("aria-activedescendant");
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.getElementById(activeId!)).toBe(screen.getByRole("option", { name: "Connections" }));
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

  it("reverses the visual and keyboard movement when requested", () => {
    const onSelect = vi.fn();

    render(
      <OrbitSelector
        items={[...items]}
        selectedValue="profile"
        onSelect={onSelect}
        ariaLabel="Reverse setup steps"
        autoRotate={false}
        direction="reverse"
      />,
    );

    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "ArrowRight" });
    fireEvent.keyDown(listbox, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith("CRM");
  });

  it("syncs visual focus when the controlled selected value changes", () => {
    const { rerender } = render(
      <OrbitSelector
        items={[...items]}
        selectedValue="profile"
        onSelect={() => {}}
        ariaLabel="Setup steps"
        autoRotate={false}
      />,
    );

    rerender(
      <OrbitSelector
        items={[...items]}
        selectedValue="crm"
        onSelect={() => {}}
        ariaLabel="Setup steps"
        autoRotate={false}
      />,
    );

    const activeId = screen.getByRole("listbox").getAttribute("aria-activedescendant");
    expect(document.getElementById(activeId!)).toBe(screen.getByRole("option", { name: "CRM" }));
  });

  it("supports horizontal swipe navigation without silently selecting", () => {
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
    fireEvent.touchStart(listbox, { touches: [{ clientX: 220 }] });
    fireEvent.touchEnd(listbox, { changedTouches: [{ clientX: 120 }] });

    const activeId = listbox.getAttribute("aria-activedescendant");
    expect(document.getElementById(activeId!)).toBe(screen.getByRole("option", { name: "Connections" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not autoplay when reduced motion is requested", () => {
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));

    render(
      <OrbitSelector
        items={[...items]}
        selectedValue="profile"
        onSelect={() => {}}
        ariaLabel="Setup steps"
        rotationInterval={500}
      />,
    );

    const before = screen.getByRole("listbox").getAttribute("aria-activedescendant");
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-activedescendant", before);
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

    act(() => {
      vi.setSystemTime(new Date("2026-08-23T12:00:01Z"));
      vi.advanceTimersByTime(1000);
    });

    const after = container.querySelector("time")?.getAttribute("datetime");
    expect(after).not.toBe(before);
  });
});
