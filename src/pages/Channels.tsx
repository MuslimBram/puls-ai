import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChannels } from "@/hooks/useChannels";
import { useChannelRegistryWithModes, useConnectedChannels, type ChannelRegistryWithModes, type ConnectedChannel } from "@/hooks/useChannelCapabilities";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useMonetizationCatalog } from "@/hooks/useMonetizationCatalog";
import { ChannelConnectionModal } from "@/components/channels/ChannelConnectionModal";
import { ConnectedChannelCard } from "@/components/channels/ConnectedChannelCard";
import type { PlanKey } from "@/types/monetization";
import {
  CheckCircle2, Crown, Globe, Lock, Mail, MessageSquare, Phone, Plus,
  Plug, Radio, Settings2, Webhook, type LucideIcon,
} from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  messaging: "Messaging", email: "Email", web: "Web", automation: "Automation",
};
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  messaging: MessageSquare, email: Mail, web: Globe, automation: Webhook,
};
const CHANNEL_ICONS: Record<string, LucideIcon> = {
  whatsapp: Phone, telegram: MessageSquare, email: Mail, facebook: Globe, sms: Phone,
  instagram: Globe, tiktok: Globe, linkedin: Globe, youtube: Globe, twitter: Globe,
};
const STATUS_CONFIG: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: LucideIcon }> = {
  live: { variant: "default", icon: CheckCircle2 },
  setup_ready: { variant: "secondary", icon: Settings2 },
  beta: { variant: "outline", icon: Settings2 },
};

const Channels = () => {
  const [connectModal, setConnectModal] = useState<{
    channel: ChannelRegistryWithModes | null;
    existingId?: string;
    existingMode?: "professional" | "personal";
  }>({ channel: null });

  const { toggleChannel, deleteChannel } = useChannels();
  const { data: connectedChannels, isLoading } = useConnectedChannels();
  const { data: registry } = useChannelRegistryWithModes();
  const { currentPlanKey } = useFeatureGating();
  const { plansByKey, planOrder } = useMonetizationCatalog();
  const { isSuperAdmin } = useRolePermissions();

  const channels = connectedChannels ?? [];
  const registryItems = registry ?? [];

  const canAccessChannel = (minPlan: string) => {
    if (isSuperAdmin) return true;
    const currentIdx = planOrder.indexOf(currentPlanKey);
    const requiredIdx = planOrder.indexOf(minPlan as PlanKey);
    return requiredIdx === -1 || (currentIdx !== -1 && currentIdx >= requiredIdx);
  };

  const getRegistryItem = (channelType: string) => registryItems.find((r) => r.id === channelType);

  const categories = registryItems.reduce<Record<string, ChannelRegistryWithModes[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "channels";

  const handleUpgrade = (ch: ConnectedChannel) => {
    const reg = getRegistryItem(ch.channel_type);
    if (reg) setConnectModal({ channel: reg, existingId: ch.id, existingMode: ch.connection_mode });
  };

  return (
    <DashboardLayout>
      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="channels">Channels</TabsTrigger>
        </TabsList>

        <TabsContent value="channels">
          <div className="space-y-4">
            {/* Connected Channels */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Radio className="h-5 w-5 text-primary" />
                    Connected Channels
                  </CardTitle>
                  <CardDescription>Manage your active communication channels and their connection modes.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-6">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : channels.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No channels connected. Use the catalog below to connect your first channel.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {channels.map((ch) => (
                      <ConnectedChannelCard
                        key={ch.id}
                        channel={ch}
                        registry={getRegistryItem(ch.channel_type)}
                        onToggle={(id, enabled) => toggleChannel.mutate({ id, is_enabled: enabled })}
                        onDelete={(id) => deleteChannel.mutate(id)}
                        onUpgrade={handleUpgrade}
                        onReconnect={handleUpgrade}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Channel Catalog */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Plug className="h-5 w-5 text-primary" />
                  Connect a Channel
                </CardTitle>
                <CardDescription>
                  Choose a channel and connection mode. Professional mode enables full automation; Limited mode uses notification-based manual posting.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue={Object.keys(categories)[0] || "messaging"}>
                  <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
                    {Object.keys(categories).map((cat) => {
                      const Icon = CATEGORY_ICONS[cat] || Radio;
                      return (
                        <TabsTrigger key={cat} value={cat} className="gap-1.5">
                          <Icon className="h-3.5 w-3.5" />
                          {CATEGORY_LABELS[cat] || cat}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                  {Object.entries(categories).map(([cat, items]) => (
                    <TabsContent key={cat} value={cat}>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {items.map((item) => {
                          const statusInfo = STATUS_CONFIG[item.integration_status as string] || STATUS_CONFIG.setup_ready;
                          const StatusIcon = statusInfo.icon;
                          const existing = channels.find((c) => c.channel_type === item.id);
                          const hasAccess = canAccessChannel(item.min_plan);
                          const minPlanName = plansByKey[item.min_plan as PlanKey]?.name || item.min_plan;
                          const Icon = CHANNEL_ICONS[item.id] || Radio;
                          const modes = item.supported_modes;
                          const hasBoth = modes.includes("professional") && modes.includes("personal");

                          return (
                            <div key={item.id} className={`rounded-lg border p-4 space-y-3 ${!hasAccess ? 'border-border/50 opacity-75' : 'border-border'}`}>
                              <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                                  <Icon className="h-4 w-4 text-primary" />
                                </div>
                                <div className="flex-1">
                                  <span className="text-sm font-medium text-foreground">{item.name}</span>
                                  {hasBoth && (
                                    <div className="flex gap-1 mt-0.5">
                                      <Badge variant="outline" className="text-[10px] px-1 py-0">Pro</Badge>
                                      <Badge variant="outline" className="text-[10px] px-1 py-0">Limited</Badge>
                                    </div>
                                  )}
                                </div>
                                {existing && (
                                  <Badge variant="default" className="text-xs gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Connected
                                  </Badge>
                                )}
                                {!hasAccess && (
                                  <Badge variant="outline" className="text-xs gap-1 border-primary/30 text-primary">
                                    <Crown className="h-3 w-3" /> {minPlanName}+
                                  </Badge>
                                )}
                              </div>

                              <p className="text-xs text-muted-foreground">{item.description}</p>

                              <div className="text-xs text-muted-foreground">
                                <strong>Professional:</strong> {item.professional_capabilities.length} features
                                {hasBoth && <> · <strong>Limited:</strong> {item.personal_capabilities.length} features</>}
                              </div>

                              <div className="flex gap-2">
                                {hasAccess && !existing && (
                                  <Button
                                    size="sm" variant="outline" className="text-xs flex-1"
                                    onClick={() => setConnectModal({ channel: item })}
                                  >
                                    <Plus className="h-3 w-3 mr-1" /> Connect
                                  </Button>
                                )}
                                {hasAccess && existing && (
                                  <Button
                                    size="sm" variant="ghost" className="text-xs flex-1"
                                    onClick={() => setConnectModal({ channel: item, existingId: existing.id, existingMode: existing.connection_mode })}
                                  >
                                    <Settings2 className="h-3 w-3 mr-1" /> Manage
                                  </Button>
                                )}
                                {!hasAccess && (
                                  <Button
                                    size="sm" variant="outline" className="text-xs flex-1"
                                    onClick={() => window.location.href = '/pricing'}
                                  >
                                    <Lock className="h-3 w-3 mr-1" /> Upgrade to {minPlanName}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Unified Connection Modal */}
      <ChannelConnectionModal
        open={!!connectModal.channel}
        onOpenChange={(open) => !open && setConnectModal({ channel: null })}
        channel={connectModal.channel}
        existingChannelId={connectModal.existingId}
        existingMode={connectModal.existingMode}
      />
    </DashboardLayout>
  );
};

export default Channels;
