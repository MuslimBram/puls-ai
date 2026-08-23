import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChannelOrbitSelector } from "./ChannelOrbitSelector";
import type { ChannelRegistryWithModes, ConnectedChannel } from "@/hooks/useChannelCapabilities";

const registry: ChannelRegistryWithModes[] = [
  {
    id: "whatsapp",
    name: "WhatsApp",
    category: "messaging",
    description: "Messaging channel",
    is_available: true,
    icon: "whatsapp",
    supported_modes: ["professional"],
    professional_capabilities: [],
    personal_capabilities: [],
    credential_fields: [],
    min_plan: "standard",
    help_url: null,
    integration_status: "available",
    setup_instructions: null,
    account_type_label: "Business",
  },
  {
    id: "telegram",
    name: "Telegram",
    category: "messaging",
    description: "Telegram channel",
    is_available: true,
    icon: "telegram",
    supported_modes: ["professional"],
    professional_capabilities: [],
    personal_capabilities: [],
    credential_fields: [],
    min_plan: "standard",
    help_url: null,
    integration_status: "available",
    setup_instructions: null,
    account_type_label: "Bot",
  },
];

const connected: ConnectedChannel[] = [{
  id: "connected-1",
  channel_type: "whatsapp",
  channel_name: "WhatsApp Business",
  connection_mode: "professional",
  account_type: "business",
  capabilities: [],
  connection_status: "connected",
  is_enabled: true,
  is_primary: false,
  reconnect_required: false,
  provider_metadata: {},
}];

describe("ChannelOrbitSelector", () => {
  it("renders registry-supplied channels and preserves connection status", () => {
    render(
      <ChannelOrbitSelector
        items={registry}
        connectedChannels={connected}
        canAccess={() => true}
        onChoose={vi.fn()}
      />,
    );

    expect(screen.getByRole("option", { name: /WhatsApp/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Telegram/i })).toBeInTheDocument();
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("opens the existing channel flow only after explicit selection", () => {
    const onChoose = vi.fn();
    render(
      <ChannelOrbitSelector
        items={registry}
        connectedChannels={connected}
        canAccess={() => true}
        onChoose={onChoose}
      />,
    );

    expect(onChoose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("option", { name: /Telegram/i }));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose.mock.calls[0][0].id).toBe("telegram");
  });

  it("disables channels the current plan cannot access", () => {
    render(
      <ChannelOrbitSelector
        items={registry}
        connectedChannels={[]}
        canAccess={() => false}
        onChoose={vi.fn()}
      />,
    );

    expect(screen.getByRole("option", { name: /WhatsApp/i })).toBeDisabled();
  });
});
