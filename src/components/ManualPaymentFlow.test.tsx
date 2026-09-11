import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManualPaymentFlow } from "./ManualPaymentFlow";

const getOptions = vi.fn();
const createPayment = vi.fn();
const submitConfirmation = vi.fn();

vi.mock("@/hooks/useManualPayment", () => ({
  useManualPayment: () => ({
    getOptions,
    createPayment,
    submitConfirmation,
    checkStatus: vi.fn(),
    loading: false,
    error: null,
  }),
}));

describe("ManualPaymentFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOptions.mockResolvedValue({
      available: [
        {
          method_type: "bank_transfer_ALL",
          display_name: "Verified ALL bank account",
          instructions: "Use the payment reference in the transfer description.",
          currency: "ALL",
          country_target: "AL",
        },
      ],
      recommended_order: ["bank_transfer_ALL"],
      supported_currencies: ["ALL", "EUR", "USD"],
      fx_rates: {},
    });
  });

  it("renders a selected verified bank method without reaching the page error boundary", async () => {
    render(
      <ManualPaymentFlow
        planKey="standard"
        planName="Standard"
        packageType="monthly"
        chargedCurrency="ALL"
        chargedAmount={9900}
      />,
    );

    expect(await screen.findByText("Verified ALL bank account")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Optional: your name or business name for the transfer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get bank details & reference ID" })).toBeEnabled();
  });
});
