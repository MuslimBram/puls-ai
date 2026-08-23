import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IndustryPackOrbitSelector } from "./IndustryPackOrbitSelector";
import type { IndustryPack } from "@/hooks/useIndustryPacks";

const packs: IndustryPack[] = [
  {
    id: "pack-restaurant",
    slug: "restaurant",
    name: "Restaurant Starter",
    industry: "Restaurants & cafés",
    description: "Starter setup for restaurants.",
    icon: null,
    color: null,
    version: "1",
    install_count: 0,
    contents: {},
  },
  {
    id: "pack-clinic",
    slug: "clinic",
    name: "Clinic Starter",
    industry: "Healthcare & private practices",
    description: "Starter setup for clinics.",
    icon: null,
    color: null,
    version: "1",
    install_count: 0,
    contents: {},
  },
];

describe("IndustryPackOrbitSelector", () => {
  it("renders values from the supplied published-pack dataset", () => {
    render(<IndustryPackOrbitSelector packs={packs} onSelect={() => {}} />);
    expect(screen.getByRole("option", { name: "Restaurant Starter" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Clinic Starter" })).toBeInTheDocument();
  });

  it("returns the real pack only after explicit selection", () => {
    const onSelect = vi.fn();
    render(<IndustryPackOrbitSelector packs={packs} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("option", { name: "Clinic Starter" }));
    expect(onSelect).toHaveBeenCalledWith(packs[1]);
  });
});
