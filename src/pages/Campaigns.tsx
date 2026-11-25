import { useTr } from "@/lib/uiSq";
import { useState, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";

const ContentCalendarContent = lazy(() => import("@/pages/ContentCalendar"));
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoCampaignBuilder, type AutoCampaignBlueprint } from "@/components/AutoCampaignBuilder";
import {
  useCampaigns,
  useCreateCampaign,
  useGenerateCampaignStrategy,
  useDeleteCampaign,
  useLaunchCampaignBroadcast,
  Campaign,
} from "@/hooks/useCampaigns";
import { CampaignCard } from "@/components/campaigns/CampaignCard";
import { CreateCampaignDialog } from "@/components/campaigns/CreateCampaignDialog";
import { CampaignDetailDialog } from "@/components/campaigns/CampaignDetailDialog";
import { Megaphone, Plus, Loader2, Shield } from "lucide-react";
import { useWorkspaceMembership } from "@/hooks/useWorkspaceMembership";

const Campaigns = () => {
  const tr = useTr();
  const { data: campaigns, isLoading } = useCampaigns();
  const createMutation = useCreateCampaign();
  const generateMutation = useGenerateCampaignStrategy();
  const deleteMutation = useDeleteCampaign();
  const launchMutation = useLaunchCampaignBroadcast();
  const { canWrite: workspaceCanWrite } = useWorkspaceMembership();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  const handleCreate = async (data: Partial<Campaign>) => {
    const campaign = await createMutation.mutateAsync(data);
    if (campaign) {
      generateMutation.mutate({ campaignId: campaign.id, campaignData: campaign });
    }
  };

  const handleAutoBuild = async (blueprint: AutoCampaignBlueprint) => {
    const start = new Date();
    const end = new Date(start);
    end.setDate(start.getDate() + blueprint.durationDays);

    const campaign = await createMutation.mutateAsync({
      name: blueprint.name,
      objective: blueprint.objective,
      target_audience: blueprint.audience,
      budget_min: blueprint.budgetMin,
      budget_max: blueprint.budgetMax,
      duration_start: start.toISOString(),
      duration_end: end.toISOString(),
      preferred_channels: blueprint.channels,
    });

    if (campaign) {
      setSelectedCampaign(campaign);
      generateMutation.mutate({ campaignId: campaign.id, campaignData: campaign });
    }
  };

  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "campaigns";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {!workspaceCanWrite && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-center gap-3 py-4">
              <Shield className="h-5 w-5 text-primary" />
              <p className="text-sm text-foreground">{tr(tr("Read-only workspace view. Campaign creation and changes require workspace membership."))}</p>
            </CardContent>
          </Card>
        )}
        <Tabs defaultValue={initialTab} className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="campaigns">{tr(tr("Campaigns"))}</TabsTrigger>
              <TabsTrigger value="calendar">{tr(tr("Content Calendar"))}</TabsTrigger>
            </TabsList>
            {initialTab === "campaigns" && workspaceCanWrite && (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" /> {tr(tr("New Campaign"))}
              </Button>
            )}
          </div>

          <TabsContent value="campaigns" className="space-y-4">
            <AutoCampaignBuilder
              isBuilding={createMutation.isPending || generateMutation.isPending}
              canBuild={workspaceCanWrite}
              onBuild={handleAutoBuild}
              onOpenManual={() => workspaceCanWrite && setShowCreate(true)}
            />

            {generateMutation.isPending && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="flex items-center gap-3 py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{tr(tr("AI is generating campaign strategy..."))}</p>
                    <p className="text-xs text-muted-foreground">{tr(tr("This includes positioning, funnel stages, personas, and content suggestions"))}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !campaigns?.length ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Megaphone className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-lg font-medium text-foreground mb-2">{tr(tr("No campaigns yet"))}</p>
                  <p className="text-sm text-muted-foreground mb-4">{tr(tr("Create your first AI-powered marketing campaign"))}</p>
                  {workspaceCanWrite && <Button onClick={() => setShowCreate(true)}>
                    <Plus className="mr-2 h-4 w-4" /> {tr(tr("Create Campaign"))}
                  </Button>}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {campaigns.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    onView={() => setSelectedCampaign(campaign)}
                    onDelete={() => deleteMutation.mutate(campaign.id)}
                    onRegenerate={() => generateMutation.mutate({ campaignId: campaign.id, campaignData: campaign })}
                    onLaunch={() => launchMutation.mutate({ campaignId: campaign.id, workspaceId: campaign.workspace_id })}
                    isRegenerating={generateMutation.isPending}
                    isLaunching={launchMutation.isPending}
                  />
                ))}
              </div>
            )}

            <CreateCampaignDialog
              open={showCreate}
              onOpenChange={setShowCreate}
              onCreate={handleCreate}
              isPending={createMutation.isPending}
            />

            {selectedCampaign && (
              <CampaignDetailDialog
                campaign={selectedCampaign}
                onClose={() => setSelectedCampaign(null)}
              />
            )}
          </TabsContent>

          <TabsContent value="calendar">
            <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
              <ContentCalendarContent />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Campaigns;
