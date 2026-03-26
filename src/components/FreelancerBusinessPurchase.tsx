import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserWallets } from "@/hooks/useUserWallet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Plus, Wallet, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { PACKAGE_VARIANTS } from "@/config/plans";

const BASE_PRICES: Record<string, number> = {
  standard: 49,
  professional: 99,
  advanced: 199,
  enterprise: 399,
};

const FREELANCER_DISCOUNT = 40; // 40% zbritje për freelancerë

interface FreelancerBusinessPurchaseProps {
  isFreelancer: boolean;
}

export const FreelancerBusinessPurchase = ({ isFreelancer }: FreelancerBusinessPurchaseProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const walletsQuery = useUserWallets();
  const wallets = walletsQuery.data ?? [];
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    business_name: "",
    short_description: "",
    industry: "",
    plan: "standard",
    duration: "monthly" as string,
    wallet_currency: "EUR",
  });

  // Get freelancer's existing businesses
  const businessesQuery = useQuery({
    queryKey: ["freelancer-businesses", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && isFreelancer,
  });

  // Get pending purchase requests
  const pendingPurchases = useQuery({
    queryKey: ["freelancer-business-purchases", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("user_id", user!.id)
        .in("status", ["pending_ai_review", "pending_admin_review"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((d: any) => (d.metadata as any)?.request_type === "business_purchase");
    },
    enabled: !!user?.id && isFreelancer,
  });

  const selectedVariant = PACKAGE_VARIANTS.find((v) => v.type === form.duration);
  const basePrice = BASE_PRICES[form.plan] || 49;
  const durationMonths = selectedVariant?.durationMonths || 1;
  const durationDiscount = selectedVariant?.discountPercent || 0;

  // Freelancer gets 40% discount on the monthly price, then duration discount applies
  const freelancerMonthlyPrice = basePrice * (1 - FREELANCER_DISCOUNT / 100);
  const finalMonthlyPrice = freelancerMonthlyPrice * (1 - durationDiscount / 100);
  const totalPrice = Number((finalMonthlyPrice * durationMonths).toFixed(2));

  const selectedWallet = wallets.find((w) => w.currency === form.wallet_currency);
  const hasEnoughBalance = (selectedWallet?.current_balance ?? 0) >= totalPrice;

  const purchaseBusiness = useMutation({
    mutationFn: async () => {
      if (!form.business_name.trim()) throw new Error("Emri i biznesit është i detyrueshëm");
      if (!selectedWallet) throw new Error("Zgjidhni një portofol me gjëndje të mjaftueshme");
      if (!hasEnoughBalance) throw new Error("Gjëndja e portofolit nuk mjafton");

      // Create withdrawal request for AI + Admin verification
      const { error } = await supabase
        .from("withdrawal_requests")
        .insert({
          user_id: user!.id,
          wallet_id: selectedWallet.id,
          amount: totalPrice,
          currency: form.wallet_currency,
          request_type: "business_purchase",
          status: "pending_ai_review",
          metadata: {
            business_name: form.business_name.trim(),
            short_description: form.short_description,
            industry: form.industry,
            plan: form.plan,
            duration: form.duration,
            duration_months: durationMonths,
            base_price: basePrice,
            freelancer_discount: FREELANCER_DISCOUNT,
            duration_discount: durationDiscount,
            monthly_price: finalMonthlyPrice,
            total_price: totalPrice,
          },
        } as any);
      if (error) throw error;

      // Trigger AI fraud check
      await supabase.functions.invoke("withdrawal-fraud-check", {
        body: {
          user_id: user!.id,
          amount: totalPrice,
          currency: form.wallet_currency,
          request_type: "business_purchase",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["freelancer-business-purchases"] });
      toast.success("Kërkesa u dërgua për verifikim (AI + Admin)");
      setOpen(false);
      setForm({
        business_name: "", short_description: "", industry: "",
        plan: "standard", duration: "monthly", wallet_currency: "EUR",
      });
    },
    onError: (e) => toast.error(e.message),
  });

  if (!isFreelancer) return null;

  const businesses = businessesQuery.data ?? [];
  const pending = pendingPurchases.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Briefcase className="h-4 w-4" />
          Bizneset e Mia ({businesses.length})
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-3 w-3 mr-1" /> Shto Biznes
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Shto Biznes të Ri (Freelancer)</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Emri i Biznesit *</Label>
                <Input
                  value={form.business_name}
                  onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                  placeholder="Emri i biznesit"
                />
              </div>
              <div>
                <Label>Përshkrim i Shkurtër</Label>
                <Textarea
                  value={form.short_description}
                  onChange={(e) => setForm((f) => ({ ...f, short_description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div>
                <Label>Industria</Label>
                <Input
                  value={form.industry}
                  onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                  placeholder="p.sh. Teknologji"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Paketa</Label>
                  <Select value={form.plan} onValueChange={(v) => setForm((f) => ({ ...f, plan: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Start - €{BASE_PRICES.standard}/muaj</SelectItem>
                      <SelectItem value="professional">Growth - €{BASE_PRICES.professional}/muaj</SelectItem>
                      <SelectItem value="advanced">Pro - €{BASE_PRICES.advanced}/muaj</SelectItem>
                      <SelectItem value="enterprise">Enterprise - €{BASE_PRICES.enterprise}/muaj</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Kohëzgjatja</Label>
                  <Select value={form.duration} onValueChange={(v) => setForm((f) => ({ ...f, duration: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PACKAGE_VARIANTS.map((v) => (
                        <SelectItem key={v.type} value={v.type}>
                          {v.label} {v.discountPercent > 0 ? `(-${v.discountPercent}%)` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Portofoli</Label>
                <Select value={form.wallet_currency} onValueChange={(v) => setForm((f) => ({ ...f, wallet_currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {wallets.map((w) => (
                      <SelectItem key={w.id} value={w.currency}>
                        <span className="flex items-center gap-2">
                          <Wallet className="h-3 w-3" />
                          {w.currency} — Gjëndja: €{Number(w.current_balance).toFixed(2)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Çmimi bazë:</span>
                  <span>€{basePrice}/muaj</span>
                </div>
                <div className="flex justify-between text-sm text-green-600">
                  <span>Zbritje Freelancer ({FREELANCER_DISCOUNT}%):</span>
                  <span>-€{(basePrice * FREELANCER_DISCOUNT / 100).toFixed(2)}</span>
                </div>
                {durationDiscount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Zbritje kohëzgjatje ({durationDiscount}%):</span>
                    <span>-€{(freelancerMonthlyPrice * durationDiscount / 100).toFixed(2)}/muaj</span>
                  </div>
                )}
                <div className="border-t border-border pt-1 flex justify-between font-semibold">
                  <span>Total ({durationMonths} muaj):</span>
                  <span>€{totalPrice.toFixed(2)}</span>
                </div>
                {!hasEnoughBalance && (
                  <div className="flex items-center gap-1 text-xs text-destructive mt-1">
                    <AlertTriangle className="h-3 w-3" />
                    Gjëndja nuk mjafton. Rimbushni portofolit.
                  </div>
                )}
              </div>

              <Button
                className="w-full"
                onClick={() => purchaseBusiness.mutate()}
                disabled={purchaseBusiness.isPending || !form.business_name.trim() || !hasEnoughBalance}
              >
                {purchaseBusiness.isPending ? "Duke dërguar..." : `Bli Biznes — €${totalPrice.toFixed(2)}`}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Pagesa verifikohet nga AI dhe aprovohet nga Admini
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Në pritje verifikimi:</p>
            {pending.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-950/20 p-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-yellow-600" />
                  <span className="text-sm">{(p.metadata as any)?.business_name}</span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {p.status === "pending_ai_review" ? "AI Review" : "Admin Review"}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {businesses.length === 0 && pending.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Shtoni biznesin tuaj të parë duke zgjedhur paketën përkatëse
          </p>
        ) : (
          <div className="space-y-2">
            {businesses.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                    <p className="text-sm font-medium text-foreground">{b.business_name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{b.industry || "Pa industri"}</p>
                </div>
                <Badge variant="outline" className="text-xs">Aktiv</Badge>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mt-2">
          <p className="text-xs font-medium text-primary">💰 Përqindja juaj</p>
          <p className="text-xs text-muted-foreground mt-1">
            Referim: 35% komision jetësor · Menaxhim: 40% tarifë për biznes
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
