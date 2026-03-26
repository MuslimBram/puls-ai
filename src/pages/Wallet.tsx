import { DashboardLayout } from "@/components/DashboardLayout";
import { UserWalletPanel } from "@/components/UserWalletPanel";

const WalletPage = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Portofoli</h1>
          <p className="text-muted-foreground">Menaxhoni balancën, rimbushjet dhe tërheqjet tuaja</p>
        </div>
        <UserWalletPanel />
      </div>
    </DashboardLayout>
  );
};

export default WalletPage;
