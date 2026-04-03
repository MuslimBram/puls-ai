import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  ArrowUp, Briefcase, CheckCircle2, AlertTriangle, RefreshCw, Trash2, User,
} from "lucide-react";
import type { ConnectedChannel, ChannelRegistryWithModes } from "@/hooks/useChannelCapabilities";
import { canUpgrade } from "@/hooks/useChannelCapabilities";

interface ConnectedChannelCardProps {
  channel: ConnectedChannel;
  registry?: ChannelRegistryWithModes;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onUpgrade: (channel: ConnectedChannel) => void;
  onReconnect: (channel: ConnectedChannel) => void;
}

export const ConnectedChannelCard: React.FC<ConnectedChannelCardProps> = ({
  channel, registry, onToggle, onDelete, onUpgrade, onReconnect,
}) => {
  const isPro = channel.connection_mode === "professional";
  const capCount = channel.capabilities?.length || 0;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-border p-3 gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-foreground">{channel.channel_name}</span>
        <Badge variant="secondary" className="text-xs">{channel.channel_type}</Badge>
        <Badge
          variant={isPro ? "default" : "outline"}
          className="text-xs gap-1"
        >
          {isPro ? <Briefcase className="h-3 w-3" /> : <User className="h-3 w-3" />}
          {isPro ? "Professional" : "Limited"}
        </Badge>
        {channel.reconnect_required && (
          <Badge variant="destructive" className="text-xs gap-1">
            <AlertTriangle className="h-3 w-3" /> Reconnect Required
          </Badge>
        )}
        {!channel.reconnect_required && channel.is_enabled && (
          <Badge variant="outline" className="text-xs gap-1">
            <CheckCircle2 className="h-3 w-3" /> {capCount} features
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {channel.reconnect_required && (
          <Button variant="outline" size="sm" className="text-xs" onClick={() => onReconnect(channel)}>
            <RefreshCw className="h-3 w-3 mr-1" /> Reconnect
          </Button>
        )}
        {canUpgrade(channel, registry) && (
          <Button variant="outline" size="sm" className="text-xs" onClick={() => onUpgrade(channel)}>
            <ArrowUp className="h-3 w-3 mr-1" /> Upgrade
          </Button>
        )}
        <Switch
          checked={channel.is_enabled}
          onCheckedChange={(checked) => onToggle(channel.id, checked)}
        />
        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onDelete(channel.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
