import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpdeskConfigPanel } from "@/components/HelpdeskConfigPanel";
import {
  useConversationThreads,
  useHelpdeskStats,
  type HelpdeskFilters,
  type ConversationThread,
} from "@/hooks/useHelpdesk";
import { HelpdeskStatsRow } from "@/components/helpdesk/HelpdeskStatsRow";
import { HelpdeskFiltersBar } from "@/components/helpdesk/HelpdeskFiltersBar";
import { ThreadList } from "@/components/helpdesk/ThreadList";
import { ThreadDetailDialog } from "@/components/helpdesk/ThreadDetailDialog";
import { CreateThreadDialog } from "@/components/helpdesk/CreateThreadDialog";

const Helpdesk = () => {
  const [filters, setFilters] = useState<HelpdeskFilters>({});
  const [selectedThread, setSelectedThread] = useState<ConversationThread | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const { threads, total, isLoading, createThread, updateThread, page, pageSize, nextPage, prevPage, setPage } =
    useConversationThreads(filters);
  const { data: stats } = useHelpdeskStats();
  const totalPages = Math.ceil(total / pageSize);

  const handleFilterChange = (fn: (f: HelpdeskFilters) => HelpdeskFilters) => {
    setPage(0);
    setFilters(fn);
  };

  return (
    <DashboardLayout>
      <Tabs defaultValue="conversations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
          <TabsTrigger value="settings">⚙ Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="conversations">
          <div className="space-y-4">
            <HelpdeskStatsRow
              total={stats?.total ?? 0}
              overdue={stats?.overdue ?? 0}
              avgResponseTime={stats?.avgResponseTime ?? 0}
              inProgressCount={stats?.byStatus?.find((s) => s.value === "in_progress")?.count ?? 0}
            />

            <HelpdeskFiltersBar
              filters={filters}
              onFilterChange={handleFilterChange}
              onClear={() => { setPage(0); setFilters({}); }}
              onNew={() => setShowCreate(true)}
            />

            <ThreadList
              threads={threads}
              total={total}
              isLoading={isLoading}
              page={page}
              totalPages={totalPages}
              onSelect={setSelectedThread}
              onNextPage={nextPage}
              onPrevPage={prevPage}
            />

            {selectedThread && (
              <ThreadDetailDialog
                thread={selectedThread}
                onClose={() => setSelectedThread(null)}
                onUpdate={(updates) => {
                  updateThread.mutate({ id: selectedThread.id, ...updates });
                  setSelectedThread({ ...selectedThread, ...updates });
                }}
              />
            )}

            <CreateThreadDialog
              open={showCreate}
              onClose={() => setShowCreate(false)}
              onCreate={(data) => {
                createThread.mutate(data);
                setShowCreate(false);
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <HelpdeskConfigPanel />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default Helpdesk;
