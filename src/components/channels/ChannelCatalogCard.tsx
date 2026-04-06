import React from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Crown, Lock, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChannelRegistryWithModes, ConnectedChannel } from "@/hooks/useChannelCapabilities";
import {
  Globe, Mail, MessageSquare, Phone, Radio,
  type LucideIcon,
} from "lucide-react";

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  whatsapp: Phone, telegram: MessageSquare, email: Mail, facebook: Globe,
  instagram: Globe, tiktok: Globe, linkedin: Globe, youtube: Globe, twitter: Globe, custom: Radio,
};

interface ChannelCatalogCardProps {
  item: ChannelRegistryWithModes & { account_type_label?: string };
  existing?: ConnectedChannel;
  hasAccess: boolean;
  minPlanName: string;
  onConnect: () => void;
  onManage: () => void;
  onUpgrade: () => void;
}

export const ChannelCatalogCard: React.FC<ChannelCatalogCardProps> = ({
  item, existing, hasAccess, minPlanName, onConnect, onManage, onUpgrade,
}) => {
  const Icon = CHANNEL_ICONS[item.id] || Radio;
  const accountLabel = (item as any).account_type_label || "Profile";

  return (
    <div
      className={`group relative flex flex-col items-center rounded-xl border p-5 text-center transition-all cursor-pointer hover:shadow-md ${
        !hasAccess ? "border-border/50 opacity-70" : "border-border hover:border-primary/40"
      }`}
      onClick={() => {
        if (!hasAccess) onUpgrade();
        else if (existing) onManage();
        else onConnect();
      }}
      role="button"
      tabIndex={0}
      aria-label={existing ? `Manage ${item.name}` : `Connect ${item.name}`}
    >
      {/* Connected badge */}
      {existing && (
        <Badge variant="default" className="absolute top-2 right-2 text-[10px] gap-1 px-1.5 py-0.5">
          <CheckCircle2 className="h-3 w-3" /> Connected
        </Badge>
      )}

      {/* Plan lock badge */}
      {!hasAccess && (
        <Badge variant="outline" className="absolute top-2 right-2 text-[10px] gap-1 border-primary/30 text-primary px-1.5 py-0.5">
          <Crown className="h-3 w-3" /> {minPlanName}+
        </Badge>
      )}

      {/* Icon */}
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 mb-3">
        <Icon className="h-5 w-5 text-primary" />
      </div>

      {/* Name */}
      <h4 className="text-sm font-semibold text-foreground">{item.name}</h4>

      {/* Account type label */}
      <span className="text-xs text-muted-foreground mt-0.5">{accountLabel}</span>

      {/* Action area */}
      <div className="mt-3 w-full">
        {hasAccess && !existing && (
          <Button size="sm" variant="outline" className="text-xs w-full" onClick={(e) => { e.stopPropagation(); onConnect(); }}>
            <Plus className="h-3 w-3 mr-1" /> Connect
          </Button>
        )}
        {hasAccess && existing && (
          <Button size="sm" variant="ghost" className="text-xs w-full" onClick={(e) => { e.stopPropagation(); onManage(); }}>
            <Settings2 className="h-3 w-3 mr-1" /> Manage
          </Button>
        )}
        {!hasAccess && (
          <Button size="sm" variant="outline" className="text-xs w-full" onClick={(e) => { e.stopPropagation(); onUpgrade(); }}>
            <Lock className="h-3 w-3 mr-1" /> Upgrade
          </Button>
        )}
      </div>
    </div>
  );
};
