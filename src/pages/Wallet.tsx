import { useTr } from "@/lib/uiSq";
import { DashboardLayout } from "@/components/DashboardLayout";
import { UserWalletPanel } from "@/components/UserWalletPanel";

const WalletPage = () => {
  const tr = useTr();
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{tr("Wallet")}</h1>
          <p className="text-muted-foreground">{tr("Manage your balance, top-ups and withdrawals")}</p>
        </div>
        <UserWalletPanel />
      </div>
    </DashboardLayout>
  );
};

export default WalletPage;
