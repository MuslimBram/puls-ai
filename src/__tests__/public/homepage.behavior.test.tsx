import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "@/pages/Index";
import { GlobalFooter } from "@/components/GlobalFooter";
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
        <GlobalFooter />
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
    const publicAiCta = i18n.t("homepage.hero.secondaryCta");

    expect(
      screen.getByRole("heading", { name: "The AI Business Operating System" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: publicAiCta })).toBeInTheDocument();
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
    const floatingBotTriggerLabel = i18n.t("homepage.aiSection.primaryCta");
    const publicAiCta = i18n.t("homepage.hero.secondaryCta");
    const closeLabel = i18n.t("common.close");
    expect(screen.getByLabelText(floatingBotTriggerLabel)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: publicAiCta }));

    await waitFor(() => {
      expect(screen.queryByLabelText(floatingBotTriggerLabel)).not.toBeInTheDocument();
    });
    expect(await screen.findByRole("button", { name: closeLabel })).toBeInTheDocument();
  });

  it("renders exactly one public header and one global footer", () => {
    renderHomepage();

    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);

    const lidhjet = screen.getAllByRole("link", { name: "Lidhjet" });
    expect(lidhjet.some((link) => link.getAttribute("href") === "/lidhjet-public")).toBe(true);
    expect(screen.queryByText(/coming soon|së shpejti/i)).not.toBeInTheDocument();
  });;
});
