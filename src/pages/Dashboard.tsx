import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import { useLeads } from "@/hooks/useLeads";
import { useChannels } from "@/hooks/useChannels";
import { useKeywords } from "@/hooks/useKeywords";
import { useInbox } from "@/hooks/useInbox";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useConversionTracking } from "@/hooks/useConversionTracking";
import { UsageIndicator } from "@/components/UsageIndicator";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { GrowthAssistant } from "@/components/GrowthAssistant";
import { SetupChecklist } from "@/components/SetupChecklist";
import { PlanStatusCard } from "@/components/PlanStatusCard";
import { RetentionHealthCard } from "@/components/RetentionHealthCard";
import { RevenueOpportunities } from "@/components/RevenueOpportunities";
import { GrowthProgressIndicator } from "@/components/GrowthProgressIndicator";
import { SafeRender } from "@/components/SafeRender";
import { RoleDashboardWidgets } from "@/components/RoleDashboardWidgets";
import { WithdrawalRequestPanel } from "@/components/WithdrawalRequestPanel";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Users,
  TrendingUp,
  Inbox,
  Target,
  Zap,
} from "lucide-react";
import { format } from "date-fns";
import { useEffect } from "react";

const Dashboard = () => {
  const { profile, isLoading } = useBusinessProfile();
  const { leads } = useLeads();
  const { channels } = useChannels();
  const { keywords } = useKeywords();
  const { messages } = useInbox();
  const { plan, checkLimit, subscription } = useFeatureGating();
  const { track } = useConversionTracking();

  useEffect(() => {
    track("plan_page_view", { page: "dashboard" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const recentLeads = leads?.slice(0, 5) ?? [];
  const thisWeek = (leads ?? []).filter((l) => {
    try {
      const d = new Date(l.message_date);
      return Date.now() - d.getTime() < 7 * 24 * 60 * 60 * 1000;
    } catch { return false; }
  }).length;
  const unreadCount = (messages ?? []).filter((m) => m.is_unread).length;
  const hasTelegram = (channels ?? []).some((c) => c.channel_type === "telegram" && c.is_enabled);

  const leadsUsage = checkLimit("leadsPerMonth", subscription?.leads_used ?? (leads ?? []).length);
  const channelsUsage = checkLimit("channels", (channels ?? []).length);
  const keywordsUsage = checkLimit("keywords", (keywords ?? []).length);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {!isLoading && (
          <>
            <SafeRender label="Setup Checklist">
              <SetupChecklist
                hasProfile={!!profile}
                hasKeywords={(keywords ?? []).length > 0}
                hasTelegram={hasTelegram}
                hasLeads={(leads ?? []).length > 0}
                hasChannel={(channels ?? []).length > 0}
                hasKnowledge={false}
                hasAutomation={false}
                hasInbox={(messages ?? []).length > 0}
              />
            </SafeRender>
            <SafeRender label="Onboarding Wizard">
              <OnboardingWizard />
            </SafeRender>
          </>
        )}

        <SafeRender label="Growth Assistant">
          <GrowthAssistant />
        </SafeRender>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{(leads ?? []).length}</p>
                <p className="text-xs text-muted-foreground">Total Leads</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                <TrendingUp className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{thisWeek}</p>
                <p className="text-xs text-muted-foreground">This Week</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <Inbox className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{unreadCount}</p>
                <p className="text-xs text-muted-foreground">Unread</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                <MessageSquare className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{(channels ?? []).length}</p>
                <p className="text-xs text-muted-foreground">Channels</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Plan Status + Health + Growth Progress */}
        <div className="grid gap-4 lg:grid-cols-3">
          <SafeRender label="Plan Status">
            <PlanStatusCard />
          </SafeRender>
          <SafeRender label="Retention Health">
            <RetentionHealthCard />
          </SafeRender>
          <SafeRender label="Growth Progress">
            <GrowthProgressIndicator />
          </SafeRender>
        </div>

        {/* Role-specific widgets */}
        <SafeRender label="Role Dashboard">
          <RoleDashboardWidgets />
        </SafeRender>

        {/* Portfolio & Withdrawal */}
        <SafeRender label="Withdrawal Panel">
          <WithdrawalRequestPanel />
        </SafeRender>

        {/* Revenue Opportunities */}
        <SafeRender label="Revenue Opportunities">
          <RevenueOpportunities />
        </SafeRender>

        {/* Usage & Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Plan Usage — {plan?.name ?? "Loading..."}
            </CardTitle>
            <CardDescription>
              Your current usage against plan limits.
              <Link to="/pricing" className="ml-2 text-primary hover:underline text-xs">View Plans</Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <UsageIndicator label="Leads" current={leadsUsage.current} limit={leadsUsage.limit} />
              <UsageIndicator label="Channels" current={channelsUsage.current} limit={channelsUsage.limit} />
              <UsageIndicator label="Keywords" current={keywordsUsage.current} limit={keywordsUsage.limit} />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <SafeRender label="Connected Channels">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Connected Channels</CardTitle>
                <CardDescription>Manage your communication channels</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(channels ?? []).length === 0 ? (
                  <div className="flex flex-col items-center py-4 text-center">
                    <p className="text-sm text-muted-foreground mb-2">No channels connected</p>
                    <Link to="/connections"><Button size="sm" variant="outline">Add Channel</Button></Link>
                  </div>
                ) : (
                  (channels ?? []).slice(0, 5).map((ch) => (
                    <div key={ch.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-foreground">{ch.channel_name}</span>
                        <Badge variant="secondary" className="text-xs">{ch.channel_type}</Badge>
                      </div>
                      <Badge variant={ch.is_enabled ? "default" : "secondary"}>
                        {ch.is_enabled ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </SafeRender>

          <SafeRender label="Recent Leads">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Leads</CardTitle>
                <CardDescription>Latest discovered leads</CardDescription>
              </CardHeader>
              <CardContent>
                {recentLeads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Target className="mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No leads yet</p>
                    <p className="text-xs text-muted-foreground">Add keywords to start discovering leads</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentLeads.map((l) => (
                      <div key={l.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-muted-foreground">{l.source_name}</span>
                          <Badge variant="secondary" className="text-xs">{l.source_type}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {(() => { try { return format(new Date(l.message_date), "MMM d"); } catch { return "—"; } })()}
                          </span>
                          {l.intent_score != null && (
                            <Badge variant="outline" className="text-xs ml-auto">
                              {Math.round(Number(l.intent_score) * 100)}%
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-foreground line-clamp-1">{l.message_content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </SafeRender>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
