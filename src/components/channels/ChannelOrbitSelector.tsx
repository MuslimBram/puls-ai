import { OrbitSelector, type OrbitSelectorItem } from "@/components/OrbitSelector";
import { iconFor } from "@/components/accounts/channelIcons";
import type { ChannelRegistryWithModes, ConnectedChannel } from "@/hooks/useChannelCapabilities";

interface ChannelOrbitSelectorProps {
  items: ChannelRegistryWithModes[];
  connectedChannels: ConnectedChannel[];
  canAccess: (minPlan: string) => boolean;
  onChoose: (item: ChannelRegistryWithModes, existing?: ConnectedChannel) => void;
}

export function ChannelOrbitSelector({ items, connectedChannels, canAccess, onChoose }: ChannelOrbitSelectorProps) {
  const visible = items.filter((item) => item.is_available !== false);
  const byId = new Map(visible.map((item) => [item.id, item]));

  const orbitItems: OrbitSelectorItem<string>[] = visible.map((item) => {
    const Icon = iconFor(item.id || item.icon || "custom");
    const existing = connectedChannels.find((channel) => channel.channel_type === item.id);
    const allowed = canAccess(item.min_plan);
    const status = existing?.connection_status
      ? `Connection: ${existing.connection_status}`
      : allowed
        ? "Available to configure"
        : `Requires ${item.min_plan} plan`;

    return {
      value: item.id,
      label: item.name,
      icon: <Icon className="h-5 w-5" aria-hidden="true" />,
      description: `${item.description || item.category}. ${status}`,
      disabled: !allowed,
    };
  });

  if (orbitItems.length < 2) return null;

  return (
    <OrbitSelector
      items={orbitItems}
      onSelect={(value) => {
        const item = byId.get(value);
        if (!item) return;
        const existing = connectedChannels.find((channel) => channel.channel_type === item.id);
        onChoose(item, existing);
      }}
      ariaLabel="Communication channel catalog"
      rotationInterval={2500}
      centralContent={(focusedItem) => {
        if (!focusedItem) return null;
        const item = byId.get(focusedItem.value);
        const existing = connectedChannels.find((channel) => channel.channel_type === focusedItem.value);
        const Icon = iconFor(focusedItem.value);
        return (
          <div className="flex flex-col items-center gap-1 px-3 text-center">
            <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Channel</span>
            <span className="text-sm font-semibold text-foreground">{focusedItem.label}</span>
            <span className="text-[10px] text-muted-foreground">
              {existing?.connection_status ? existing.connection_status : item?.is_available === false ? "Unavailable" : "Not connected"}
            </span>
          </div>
        );
      }}
    />
  );
}
