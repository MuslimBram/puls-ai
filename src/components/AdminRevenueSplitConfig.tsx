import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRevenueSplitConfig, useUpdateRevenueSplit, useAllRevenueTransactions } from "@/hooks/useRevenueWallet";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Settings, Save, Loader2, DollarSign, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { format } from "date-fns";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))"];

const walletTypeLabel: Record<string, string> = {
  platform: "Platform",
  owner: "Owner",
  freelancer: "Freelancer",
  business: "Business",
};

export const AdminRevenueSplitConfig = () => {
  const { data: config, isLoading } = useRevenueSplitConfig();
  const updateSplit = useUpdateRevenueSplit();
  const { data: transactions = [] } = useAllRevenueTransactions();

  const [platform, setPlatform] = useState(30);
  const [owner, setOwner] = useState(50);
  const [freelancer, setFreelancer] = useState(20);

  useEffect(() => {
    if (config) {
      setPlatform(Number(config.platform_percent));
      setOwner(Number(config.owner_percent));
      setFreelancer(Number(config.freelancer_percent));
    }
  }, [config]);

  const total = platform + owner + freelancer;
  const isValid = Math.abs(total - 100) < 0.01;

  const chartData = [
    { name: "Platform", value: platform },
    { name: "Owner", value: owner },
    { name: "Freelancer", value: freelancer },
  ];

  const handleSave = () => {
    updateSplit.mutate({ platform_percent: platform, owner_percent: owner, freelancer_percent: freelancer });
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">
            <Settings className="h-3 w-3 mr-1" /> Split Config
          </TabsTrigger>
          <TabsTrigger value="transactions">
            <DollarSign className="h-3 w-3 mr-1" /> All Transactions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Revenue Split Percentages
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Platform Share (%)</Label>
                  <Input type="number" min={0} max={100} step={0.5} value={platform} onChange={e => setPlatform(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Owner Share (%)</Label>
                  <Input type="number" min={0} max={100} step={0.5} value={owner} onChange={e => setOwner(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Freelancer Share (%)</Label>
                  <Input type="number" min={0} max={100} step={0.5} value={freelancer} onChange={e => setFreelancer(Number(e.target.value))} />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Badge variant={isValid ? "default" : "destructive"}>
                    Total: {total.toFixed(1)}%
                  </Badge>
                  <Button size="sm" onClick={handleSave} disabled={!isValid || updateSplit.isPending}>
                    {updateSplit.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribution Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value" label={({ name, value }) => `${name}: ${value}%`}>
                      {chartData.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-2">
                  {chartData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                      {d.name}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardContent className="py-4">
              {transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No revenue transactions yet</p>
              ) : (
                <div className="space-y-2">
                  {transactions.map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-2">
                        {Number(t.amount) >= 0 ? (
                          <ArrowUpCircle className="h-4 w-4 text-primary" />
                        ) : (
                          <ArrowDownCircle className="h-4 w-4 text-destructive" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-foreground">{t.description || t.transaction_type}</p>
                          <p className="text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-[10px] mr-1">{walletTypeLabel[t.wallet_type] || t.wallet_type}</Badge>
                            {t.commission_percent && `${t.commission_percent}% of $${Number(t.source_payment_amount).toFixed(2)}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${Number(t.amount) >= 0 ? "text-primary" : "text-destructive"}`}>
                          {Number(t.amount) >= 0 ? "+" : ""}${Number(t.amount).toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">{format(new Date(t.created_at), "MMM d, yyyy")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
