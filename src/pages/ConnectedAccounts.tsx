import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { LoginProvidersCard } from "@/components/accounts/LoginProvidersCard";
import { ConnectedChannelsCard } from "@/components/accounts/ConnectedChannelsCard";
import { SessionInfoCard } from "@/components/accounts/SessionInfoCard";
import { ConnectChannelModal } from "@/components/accounts/ConnectChannelModal";

const ExternalIntegrationsContent = lazy(() => import("@/pages/ExternalIntegrations"));

const ConnectedAccounts = () => {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "accounts";
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <DashboardLayout>
      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="accounts">Connected Accounts</TabsTrigger>
          <TabsTrigger value="integrations">External Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <div className="space-y-6">
            <LoginProvidersCard />
            <ConnectedChannelsCard onConnectClick={() => setConnectOpen(true)} />
            <SessionInfoCard />
          </div>
        </TabsContent>

        <TabsContent value="integrations">
          <Suspense
            fallback={
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <ExternalIntegrationsContent />
          </Suspense>
        </TabsContent>
      </Tabs>

      <ConnectChannelModal open={connectOpen} onOpenChange={setConnectOpen} />
    </DashboardLayout>
  );
};

export default ConnectedAccounts;
