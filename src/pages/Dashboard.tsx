import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import { useLeads } from "@/hooks/useLeads";
import { useChannels } from "@/hooks/useChannels";
import { useKeywords } from "@/hooks/useKeywords";
import { useInbox } from "@/hooks/useInbox";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useAdminData } from "@/hooks/useAdmin";
import { useConversionTracking } from "@/hooks/useConversionTracking";
import { UsageIndicator } from "@/components/UsageIndicator";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { GrowthAssistant } from "@/components/GrowthAssistant";
import { ActivationChecklist } from "@/components/ActivationChecklist";
import { TrialExtendedBanner } from "@/components/TrialExtendedBanner";
import { WalkthroughVideo } from "@/components/WalkthroughVideo";
import { PlanStatusCard } from "@/components/PlanStatusCard";
import { RetentionHealthCard } from "@/components/RetentionHealthCard";
import { RevenueOpportunities } from "@/components/RevenueOpportunities";
import { GrowthProgressIndicator } from "@/components/GrowthProgressIndicator";
import { SafeRender } from "@/components/SafeRender";
import { RoleDashboardWidgets } from "@/components/RoleDashboardWidgets";
import { IndustryPackWidgets } from "@/components/dashboard/IndustryPackWidgets";
import { AdsSpendWidget } from "@/components/dashboard/AdsSpendWidget";
import { WithdrawalRequestPanel } from "@/components/WithdrawalRequestPanel";
import { TrialExpiredGate } from "@/components/TrialExpiredGate";
import { GuidedTour } from "@/components/GuidedTour";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Users,
  Building2,
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
  const { roles } = useRolePermissions();
  const { businesses: platformBusinesses, isLoading: businessesLoading } = useAdminData();
  const isPlatformAdmin = roles.includes("admin") || roles.includes("super_admin");

  const { data: knowledgeCount } = useQuery({
    queryKey: ["knowledge-count", profile?.user_id],
    queryFn: async () => {
      const { count } = await supabase
        .from("knowledge_chunks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile!.user_id);
      return count ?? 0;
    },
    enabled: !!profile?.user_id,
  });

  const { data: automationCount } = useQuery({
    queryKey: ["automation-count", profile?.user_id],
    queryFn: async () => {
      const { count } = await supabase
        .from("automation_workflows")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile!.user_id);
      return count ?? 0;
    },
    enabled: !!profile?.user_id,
  });

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

  if (isPlatformAdmin) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              Businesses
            </h1>
            <p className="text-sm text-muted-foreground">
              Select a business workspace to review, support, and monitor. This is the platform administration view—not your personal business profile.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {businessesLoading ? (
              <Card><CardContent className="pt-6 text-sm text-muted-foreground">Loading businesses…</CardContent></Card>
            ) : platformBusinesses.length === 0 ? (
              <Card className="sm:col-span-2 lg:col-span-3">
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <Building2 className="h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No business workspaces are available yet.</p>
                  <Button asChild variant="outline"><Link to="/admin">Open Admin Panel</Link></Button>
                </CardContent>
              </Card>
            ) : (
              platformBusinesses.map((business: any) => (
                <Card key={business.id}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      {business.business_name || business.name || "Business workspace"}
                    </CardTitle>
                    <CardDescription>{business.industry || "Industry not configured"}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">Workspace support and monitoring</span>
                    <Button asChild size="sm">
                      <Link to={`/admin/businesses/${business.id}/scan-insights`}>Open</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal role</CardTitle>
              <CardDescription>
                Your platform role is separate from a business profile. You can assist authorized businesses as a worker, influencer, collaborator, or caretaker.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><Link to="/managed-businesses">Managed Businesses</Link></Button>
              <Button asChild variant="outline"><Link to="/admin">Administration</Link></Button>
              <Button asChild variant="outline"><Link to="/support">Notifications & Support</Link></Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const leadsUsage = checkLimit("leadsPerMonth", subscription?.leads_used ?? (leads ?? []).length);
  const channelsUsage = checkLimit("channels", (channels ?? []).length);
  const keywordsUsage = checkLimit("keywords", (keywords ?? []).length);

  return (
    <DashboardLayout>
      <GuidedTour />
      <TrialExpiredGate>
      <h1 className="sr-only">Dashboard — Pulse AI</h1>
      <div className="space-y-6">
        {!isLoading && (
          <>
            <SafeRender label="Trial Extended Banner">
              <TrialExtendedBanner />
            </SafeRender>
            <SafeRender label="Activation Checklist">
              <ActivationChecklist />
            </SafeRender>
            <SafeRender label="Walkthrough Video">
              <WalkthroughVideo />
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

        {/* Industry Pack Widgets */}
        <SafeRender label="Industry Pack Widgets">
          <IndustryPackWidgets />
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

        {/* Ad Spend — Meta + Google */}
        <SafeRender label="Ad Spend">
          <AdsSpendWidget />
        </SafeRender>

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
      </TrialExpiredGate>
    </DashboardLayout>
  );
};

export default Dashboard;
