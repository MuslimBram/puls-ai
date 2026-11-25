import { useTr } from "@/lib/uiSq";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePipelineStages, useDeals, usePipelineStats, useAllTasks, Deal } from "@/hooks/useCRM";
import { ContactHubContent } from "@/components/ContactHubContent";
import { CallHistoryContent } from "@/components/CallHistoryContent";
import { CrmStatsRow } from "@/components/crm/CrmStatsRow";
import { PipelineBoard } from "@/components/crm/PipelineBoard";
import { PipelineAnalytics } from "@/components/crm/PipelineAnalytics";
import { OpenTasksList } from "@/components/crm/OpenTasksList";
import { NewDealDialog } from "@/components/crm/NewDealDialog";
import { DealDetailDialog } from "@/components/crm/DealDetailDialog";
import { Users, Phone } from "lucide-react";
import { CoachTour } from "@/components/CoachTour";

const CRM = () => {
  const tr = useTr();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "pipeline";
  const { stages, isLoading: stagesLoading, initStages } = usePipelineStages();
  const { deals, isLoading: dealsLoading, addDeal, updateDeal, deleteDeal } = useDeals();
  const stats = usePipelineStats();
  const allTasksQuery = useAllTasks();
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);

  useEffect(() => {
    if (!stagesLoading && stages.length === 0) {
      initStages.mutate();
    }
  }, [stagesLoading, stages.length]);

  const handleAddDeal = (newDeal: { title: string; contact_name: string; contact_email: string; deal_value: number; priority: string; source_channel: string }) => {
    const firstStage = stages[0];
    addDeal.mutate({ ...newDeal, stage_id: firstStage?.id || null } as any);
  };

  const moveDeal = (deal: Deal, stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    const updates: any = { id: deal.id, stage_id: stageId };
    if (stage?.name === "Won") updates.won_at = new Date().toISOString();
    if (stage?.name === "Lost") updates.lost_at = new Date().toISOString();
    updateDeal.mutate(updates);
  };

  return (
    <DashboardLayout>
      <h1 className="sr-only">CRM — Pipeline, Tasks &amp; Contacts</h1>
      <div className="space-y-6">
        <CrmStatsRow
          totalDeals={stats.totalDeals}
          totalValue={stats.totalValue}
          winRate={stats.winRate}
          openTasks={allTasksQuery.data?.length ?? 0}
        />

        <Tabs defaultValue={defaultTab}>
          <TabsList data-tour="crm-tabs">
            <TabsTrigger value="pipeline">{tr("Pipeline")}</TabsTrigger>
            <TabsTrigger value="tasks">{tr("Tasks")}</TabsTrigger>
            <TabsTrigger value="analytics">{tr(tr("Analytics"))}</TabsTrigger>
            <TabsTrigger value="contacts"><Users className="h-3.5 w-3.5 mr-1" />{tr(tr("Contacts"))}</TabsTrigger>
            <TabsTrigger value="calls"><Phone className="h-3.5 w-3.5 mr-1" />{tr("Calls")}</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" data-tour="crm-pipeline">
            <PipelineBoard
              stages={stages}
              deals={deals}
              isLoading={stagesLoading || dealsLoading}
              onNewDeal={() => setShowNewDeal(true)}
              onSelectDeal={setSelectedDeal}
              onMoveDeal={moveDeal}
            />
          </TabsContent>

          <TabsContent value="tasks">
            <OpenTasksList tasks={allTasksQuery.data ?? []} />
          </TabsContent>

          <TabsContent value="analytics">
            <PipelineAnalytics
              stageStats={stats.stageStats}
              totalDeals={stats.totalDeals}
              wonDeals={stats.wonDeals}
              lostDeals={stats.lostDeals}
              winRate={stats.winRate}
            />
          </TabsContent>

          <TabsContent value="contacts">
            <ContactHubContent />
          </TabsContent>

          <TabsContent value="calls">
            <CallHistoryContent />
          </TabsContent>
        </Tabs>

        <NewDealDialog
          open={showNewDeal}
          onOpenChange={setShowNewDeal}
          onCreate={handleAddDeal}
          isPending={addDeal.isPending}
        />

        {selectedDeal && (
          <DealDetailDialog
            deal={selectedDeal}
            stages={stages}
            onClose={() => setSelectedDeal(null)}
            onMove={moveDeal}
            onUpdate={(updates) => updateDeal.mutate({ id: selectedDeal.id, ...updates })}
            onDelete={() => {
              deleteDeal.mutate(selectedDeal.id);
              setSelectedDeal(null);
            }}
          />
        )}
      </div>
      <CoachTour
        tourId="crm-v1"
        steps={[
          { selector: '[data-tour="crm-tabs"]', title: tr("Your CRM at a glance"), body: tr("Switch between pipeline, tasks, contacts and call history. Everything stays connected.") },
          { selector: '[data-tour="crm-pipeline"]', title: tr("Drag deals across stages"), body: tr("Move deals through your sales process. Stage changes trigger automations and notifications.") },
        ]}
      />
    </DashboardLayout>
  );
};

export default CRM;
