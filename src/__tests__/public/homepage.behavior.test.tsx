import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "@/pages/Index";
import i18n from "@/i18n";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    session: null,
    user: null,
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {},
    functions: {
      invoke: vi.fn(),
    },
  },
}));

function renderHomepage(initialEntries: string[] = ["/"]) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Index />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

describe("Homepage behavior", () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders for logged-out visitors without crashing", () => {
    renderHomepage();

    expect(
      screen.getByRole("heading", { name: "The AI Business Operating System" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try Pulse AI" })).toBeInTheDocument();
  });

  it("renders the English homepage and keeps logged-out CTAs on the safe login flow", () => {
    renderHomepage();

    expect(
      screen.getByRole("heading", { name: "The AI Business Operating System" }),
    ).toBeInTheDocument();

    screen.getAllByRole("link", { name: "Get Started" }).forEach((link) => {
      expect(link).toHaveAttribute("href", "/login?next=%2Fdashboard");
    });
  });

  it("switches the homepage to Albanian after language change", async () => {
    renderHomepage();

    localStorage.setItem("pulse-language", "sq");
    await i18n.changeLanguage("sq");

    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: "Fillo Tani" })[0]).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Provo Pulse AI" })).toBeInTheDocument();
  });

  it("opens the existing floating AI bot when the public AI action is triggered", async () => {
    renderHomepage();

    expect(screen.queryByPlaceholderText("Type your question...")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try Pulse AI" }));

    expect(await screen.findByPlaceholderText("Type your question...")).toBeInTheDocument();
    expect(screen.getByText("Happy to help! What questions do you have?")).toBeInTheDocument();
  });

  it("scrolls to homepage sections for hash navigation links instead of only changing the URL", async () => {
    renderHomepage();

    const aiSection = document.getElementById("ai") as HTMLElement;
    const systemSection = document.getElementById("system") as HTMLElement;
    const journeySection = document.getElementById("journey") as HTMLElement;
    const aiScrollSpy = vi.fn();
    const systemScrollSpy = vi.fn();
    const journeyScrollSpy = vi.fn();

    aiSection.scrollIntoView = aiScrollSpy;
    systemSection.scrollIntoView = systemScrollSpy;
    journeySection.scrollIntoView = journeyScrollSpy;

    const footer = screen.getByRole("contentinfo");

    fireEvent.click(within(footer).getByRole("link", { name: "AI & Intelligence" }));
    await waitFor(() => expect(aiScrollSpy).toHaveBeenCalledTimes(1));

    fireEvent.click(within(footer).getByRole("link", { name: "Unified Inbox" }));
    await waitFor(() => expect(systemScrollSpy).toHaveBeenCalledTimes(1));

    fireEvent.click(within(footer).getByRole("link", { name: "CRM & Sales" }));
    await waitFor(() => expect(journeyScrollSpy).toHaveBeenCalledTimes(1));
  });
});
