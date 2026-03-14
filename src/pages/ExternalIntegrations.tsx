import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useExternalIntegrations, useIntegrationEventLogs } from "@/hooks/useExternalIntegrations";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useIsAdmin } from "@/hooks/useAdmin";
import { EXTERNAL_INTEGRATIONS, CATEGORY_LABELS } from "@/integrations/external/registry";
import { IntegrationDefinition } from "@/integrations/external/types";
import { PLAN_ORDER, PlanKey, PLANS } from "@/config/plans";
import {
  BarChart3, Search, MessageSquare, Phone, Calendar, Layers,
  Share2, Bot, Eye, Settings2, Lock, Crown, CheckCircle2,
  AlertCircle, Clock, Plug, Activity, FileText,
} from "lucide-react";

const ICON_MAP: Record<string, any> = {
  BarChart3, Search, MessageSquare, Phone, Calendar, Layers,
  Share2, Bot, Eye,
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  planned: { label: "Planned", variant: "outline" },
  connected: { label: "Connected", variant: "default" },
  error: { label: "Error", variant: "destructive" },
  disabled: { label: "Disabled", variant: "secondary" },
};

const ExternalIntegrations = () => {
  const { integrations, isLoading, upsertIntegration, toggleIntegration, deleteIntegration } = useExternalIntegrations();
  const { currentPlanKey } = useFeatureGating();
  const { isAdmin } = useIsAdmin();
  const [setupDef, setSetupDef] = useState<IntegrationDefinition | null>(null);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [logsId, setLogsId] = useState<string | null>(null);
  const { data: eventLogs } = useIntegrationEventLogs(logsId);

  const canAccess = (minPlan: string) => {
    if (isAdmin) return true;
    const cur = PLAN_ORDER.indexOf(currentPlanKey);
    const req = PLAN_ORDER.indexOf(minPlan as PlanKey);
    return req === -1 || cur >= req;
  };

  const categories = Object.entries(
    EXTERNAL_INTEGRATIONS.reduce<Record<string, IntegrationDefinition[]>>((acc, def) => {
      if (!acc[def.category]) acc[def.category] = [];
      acc[def.category].push(def);
      return acc;
    }, {})
  );

  const openSetup = (def: IntegrationDefinition) => {
    const existing = integrations.find((i) => i.integration_key === def.key);
    setCreds(existing?.credentials ?? {});
    setSetupDef(def);
  };

  const handleSave = () => {
    if (!setupDef) return;
    upsertIntegration.mutate(
      {
        integration_key: setupDef.key,
        integration_name: setupDef.name,
        category: setupDef.category,
        description: setupDef.description,
        credentials: creds,
        config: setupDef.defaultConfig,
        status: "connected",
        is_enabled: true,
        rate_limit_per_hour: setupDef.rateLimitPerHour,
        min_scan_interval_minutes: setupDef.minScanIntervalMinutes,
      },
      { onSuccess: () => { setSetupDef(null); setCreds({}); } }
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plug className="h-5 w-5 text-primary" />
              External Integrations
            </CardTitle>
            <CardDescription>
              Connect analytics, publishing, automation and monitoring tools. Only architecture & placeholders — no production logic yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Connected integrations */}
            {integrations.length > 0 && (
              <div className="mb-6 space-y-2">
                <h3 className="text-sm font-medium text-foreground mb-2">Active Integrations</h3>
                {integrations.map((int) => {
                  const badge = STATUS_BADGE[int.status] || STATUS_BADGE.planned;
                  return (
                    <div key={int.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-foreground">{int.integration_name}</span>
                        <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                        <Badge variant="outline" className="text-xs gap-1">
                          <Activity className="h-3 w-3" /> {int.usage_count} calls
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setLogsId(int.id)}>
                          <FileText className="h-3 w-3 mr-1" /> Logs
                        </Button>
                        <Switch
                          checked={int.is_enabled}
                          onCheckedChange={(checked) => toggleIntegration.mutate({ id: int.id, is_enabled: checked })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Registry by category */}
            <Tabs defaultValue={categories[0]?.[0] || "analytics_monitoring"}>
              <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
                {categories.map(([cat]) => (
                  <TabsTrigger key={cat} value={cat} className="text-xs">
                    {CATEGORY_LABELS[cat] || cat}
                  </TabsTrigger>
                ))}
              </TabsList>

              {categories.map(([cat, defs]) => (
                <TabsContent key={cat} value={cat}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {defs.map((def) => {
                      const Icon = ICON_MAP[def.icon] || Plug;
                      const hasAccess = canAccess(def.minPlan);
                      const existing = integrations.find((i) => i.integration_key === def.key);
                      const minPlanName = PLANS[def.minPlan as PlanKey]?.name || def.minPlan;

                      return (
                        <div
                          key={def.key}
                          className={`rounded-lg border p-3 ${!hasAccess ? "border-border/50 opacity-75" : "border-border"}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium text-foreground">{def.name}</span>
                            </div>
                            {!hasAccess && (
                              <Badge variant="outline" className="text-xs gap-1 border-primary/30 text-primary">
                                <Crown className="h-3 w-3" /> {minPlanName}+
                              </Badge>
                            )}
                            {existing && (
                              <Badge variant="default" className="text-xs gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Connected
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{def.description}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" /> {def.minScanIntervalMinutes}min interval
                              <span>•</span>
                              {def.rateLimitPerHour}/hr limit
                            </div>
                            {hasAccess && (
                              <Button
                                size="sm"
                                variant={existing ? "ghost" : "outline"}
                                className="text-xs h-7"
                                onClick={() => openSetup(def)}
                              >
                                <Settings2 className="h-3 w-3 mr-1" />
                                {existing ? "Update" : "Configure"}
                              </Button>
                            )}
                            {!hasAccess && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                onClick={() => (window.location.href = "/pricing")}
                              >
                                <Lock className="h-3 w-3 mr-1" /> Upgrade
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

        {/* Setup Dialog */}
        {setupDef && (
          <Dialog open={!!setupDef} onOpenChange={() => { setSetupDef(null); setCreds({}); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Configure {setupDef.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{setupDef.description}</p>

                {setupDef.helpUrl && (
                  <a
                    href={setupDef.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Activity className="h-4 w-4 shrink-0" />
                    <span className="font-medium">{setupDef.helpLabel || "Get your credentials here →"}</span>
                    <span className="text-xs text-muted-foreground ml-auto truncate max-w-[200px]">
                      {new URL(setupDef.helpUrl).hostname}
                    </span>
                  </a>
                )}

                {setupDef.credentialFields.length === 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded p-3">
                    <AlertCircle className="h-4 w-4" />
                    No credentials required. This integration uses internal configuration only.
                  </div>
                )}
                {setupDef.credentialFields.map((field) => (
                  <div key={field.key}>
                    <label className="text-sm font-medium text-foreground">{field.label}</label>
                    <Input
                      type={field.type === "password" ? "password" : "text"}
                      placeholder={field.placeholder || field.label}
                      value={creds[field.key] || ""}
                      onChange={(e) => setCreds((p) => ({ ...p, [field.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                  Rate limit: {setupDef.rateLimitPerHour}/hr • Min scan interval: {setupDef.minScanIntervalMinutes} min • Keyword threshold: 0.6
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setSetupDef(null); setCreds({}); }}>Cancel</Button>
                <Button onClick={handleSave} disabled={upsertIntegration.isPending}>Save & Connect</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Event Logs Dialog */}
        {logsId && (
          <Dialog open={!!logsId} onOpenChange={() => setLogsId(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Event Logs</DialogTitle>
              </DialogHeader>
              <ScrollArea className="h-64">
                {(!eventLogs || eventLogs.length === 0) ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No events logged yet.</p>
                ) : (
                  <div className="space-y-2">
                    {eventLogs.map((log) => (
                      <div key={log.id} className="text-xs border rounded p-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">{log.event_type}</Badge>
                          <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                        <p className="mt-1 text-foreground">{log.event_message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ExternalIntegrations;
