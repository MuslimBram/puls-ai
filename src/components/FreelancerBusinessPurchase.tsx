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
import { Briefcase, Plus, Wallet, AlertTriangle, CheckCircle, Clock, Trash2, Globe, DollarSign } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { PACKAGE_VARIANTS } from "@/config/plans";
import { cn } from "@/lib/utils";
import { useFreelancerPricing } from "@/hooks/useFreelancerPricing";
import { usePricingSettings } from "@/hooks/usePricingSettings";
import { formatCurrency, type SupportedCurrency } from "@/lib/currency";

const PLAN_LABELS: Record<string, string> = {
  standard: "Start",
  professional: "Growth",
  advanced: "Professional",
  enterprise: "Enterprise",
};

const FREELANCER_DISCOUNT = 40;

const CHANNEL_TYPES = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "twitter", label: "X (Twitter)" },
  { value: "youtube", label: "YouTube" },
  { value: "website", label: "Website" },
  { value: "whatsapp", label: "WhatsApp Business" },
  { value: "telegram", label: "Telegram" },
  { value: "email", label: "Email" },
];

interface ChannelEntry {
  type: string;
  identifier: string;
}

type PaymentMethod = "paypal" | "payoneer" | "wallet";

interface FreelancerBusinessPurchaseProps {
  isFreelancer: boolean;
}

export const FreelancerBusinessPurchase = ({ isFreelancer }: FreelancerBusinessPurchaseProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const walletsQuery = useUserWallets();
  const wallets = walletsQuery.data ?? [];
  const [open, setOpen] = useState(false);
  const freelancerPricing = useFreelancerPricing();
  const pricingSettings = usePricingSettings();

  const [form, setForm] = useState({
    business_name: "",
    short_description: "",
    industry: "",
    plan: "standard",
    duration: "monthly" as string,
    wallet_currency: "EUR",
  });

  const [channels, setChannels] = useState<ChannelEntry[]>([
    { type: "instagram", identifier: "" },
    { type: "linkedin", identifier: "" },
  ]);

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);

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

  const selectedCurrency = form.wallet_currency as SupportedCurrency;
  const getConfiguredMonthlyPrice = (planKey: string): number | null => {
    const plan = pricingSettings.plans.find((item) => item.plan_key === planKey);
    if (!plan) return null;

    const rawPrice = selectedCurrency === "ALL"
      ? plan.monthly_price_all
      : selectedCurrency === "USD"
        ? plan.monthly_price_usd
        : plan.monthly_price_eur;
    if (rawPrice === null || rawPrice === undefined) return null;

    const numericPrice = Number(rawPrice);
    return Number.isFinite(numericPrice) ? numericPrice : null;
  };

  const selectedVariant = PACKAGE_VARIANTS.find((v) => v.type === form.duration);
  const basePrice = getConfiguredMonthlyPrice(form.plan);
  const hasConfiguredPrice = basePrice !== null;
  const basePriceValue = basePrice ?? 0;
  const durationMonths = selectedVariant?.durationMonths || 1;
  const durationDiscount = selectedVariant?.discountPercent || 0;

  // Apply 40% discount ONLY if freelancer has 3+ active paid referrals.
  const effectiveFreelancerDiscount = freelancerPricing.isEligibleForDiscount ? FREELANCER_DISCOUNT : 0;
  const freelancerMonthlyPrice = basePriceValue * (1 - effectiveFreelancerDiscount / 100);
  const finalMonthlyPrice = freelancerMonthlyPrice * (1 - durationDiscount / 100);
  const totalPrice = Number((finalMonthlyPrice * durationMonths).toFixed(2));

  const selectedWallet = wallets.find((w) => w.currency === form.wallet_currency);
  const hasEnoughBalance = (selectedWallet?.current_balance ?? 0) >= totalPrice;

  const validChannels = channels.filter((c) => c.identifier.trim());
  const hasMinChannels = validChannels.length >= 2;

  const addChannel = () => {
    const usedTypes = channels.map((c) => c.type);
    const nextType = CHANNEL_TYPES.find((ct) => !usedTypes.includes(ct.value))?.value || "website";
    setChannels([...channels, { type: nextType, identifier: "" }]);
  };

  const removeChannel = (idx: number) => {
    if (channels.length <= 2) return;
    setChannels(channels.filter((_, i) => i !== idx));
  };

  const updateChannel = (idx: number, field: keyof ChannelEntry, value: string) => {
    setChannels(channels.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  };

  const purchaseBusiness = useMutation({
    mutationFn: async () => {
      if (!form.business_name.trim()) throw new Error("Business name is required");
      if (!hasMinChannels) throw new Error("At least 2 channels must be filled");
      if (!selectedPaymentMethod) throw new Error("Select a payment method");
      if (pricingSettings.isLoading || !hasConfiguredPrice) {
        throw new Error(`Price is not configured for ${form.plan} in ${selectedCurrency}`);
      }

      if (selectedPaymentMethod === "wallet") {
        if (!selectedWallet) throw new Error("Select a wallet");
        if (!hasEnoughBalance) throw new Error("Wallet balance insufficient");
      }

      const { error } = await supabase
        .from("withdrawal_requests")
        .insert({
          user_id: user!.id,
          wallet_id: selectedWallet?.id || null,
          amount: totalPrice,
          currency: selectedCurrency,
          request_type: "business_purchase",
          status: "pending_ai_review",
          metadata: {
            business_name: form.business_name.trim(),
            short_description: form.short_description,
            industry: form.industry,
            plan: form.plan,
            duration: form.duration,
            duration_months: durationMonths,
            base_price: basePriceValue,
            freelancer_discount: FREELANCER_DISCOUNT,
            duration_discount: durationDiscount,
            monthly_price: finalMonthlyPrice,
            total_price: totalPrice,
            payment_method: selectedPaymentMethod,
            channels: validChannels,
          },
        } as any);
      if (error) throw error;

      await supabase.functions.invoke("withdrawal-fraud-check", {
        body: {
          user_id: user!.id,
          amount: totalPrice,
          currency: selectedCurrency,
          request_type: "business_purchase",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["freelancer-business-purchases"] });
      toast.success("Request sent for verification (AI + Admin)");
      setOpen(false);
      setForm({
        business_name: "", short_description: "", industry: "",
        plan: "standard", duration: "monthly", wallet_currency: "EUR",
      });
      setChannels([
        { type: "instagram", identifier: "" },
        { type: "linkedin", identifier: "" },
      ]);
      setSelectedPaymentMethod(null);
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
          My Businesses ({businesses.length})
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-3 w-3 mr-1" /> Add Business
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Business (Freelancer)</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Business Name *</Label>
                <Input
                  value={form.business_name}
                  onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                  placeholder="Business name"
                />
              </div>
              <div>
                <Label>Short Description</Label>
                <Textarea
                  value={form.short_description}
                  onChange={(e) => setForm((f) => ({ ...f, short_description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div>
                <Label>Industry</Label>
                <Input
                  value={form.industry}
                  onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                  placeholder="e.g. Technology"
                />
              </div>

              {/* Channels - min 2 required */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Connected Channels (min. 2) *</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addChannel}>
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
                {channels.map((ch, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Select
                      value={ch.type}
                      onValueChange={(v) => updateChannel(idx, "type", v)}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHANNEL_TYPES.map((ct) => (
                          <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={ch.identifier}
                      onChange={(e) => updateChannel(idx, "identifier", e.target.value)}
                      placeholder={ch.type === "website" ? "https://..." : "@username or URL"}
                      className="flex-1"
                    />
                    {channels.length > 2 && (
                      <Button aria-label="Delete"
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => removeChannel(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
                {!hasMinChannels && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Fill at least 2 channels to continue
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Plan</Label>
                  <Select value={form.plan} onValueChange={(v) => setForm((f) => ({ ...f, plan: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLAN_LABELS).map(([planKey, label]) => {
                        const configuredPrice = getConfiguredMonthlyPrice(planKey);
                        return (
                          <SelectItem key={planKey} value={planKey}>
                            {label} - {configuredPrice === null
                              ? "Price unavailable"
                              : `${formatCurrency(configuredPrice, selectedCurrency)}/mo`}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Duration</Label>
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

              {!hasConfiguredPrice && !pricingSettings.isLoading && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  This plan has no configured {selectedCurrency} price and cannot be purchased.
                </p>
              )}

              {/* Eligibility warning */}
              {!freelancerPricing.isEligibleForDiscount && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    40% Discount Not Active
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {freelancerPricing.eligibilityMessage || `You need ${freelancerPricing.requiredReferrals} active paid referral businesses. You currently have ${freelancerPricing.activePaidReferrals}.`}
                  </p>
                </div>
              )}

              {/* Price summary */}
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Base price:</span>
                  <span>{hasConfiguredPrice ? `${formatCurrency(basePriceValue, selectedCurrency)}/mo` : "Not configured"}</span>
                </div>
                {effectiveFreelancerDiscount > 0 ? (
                  <div className="flex justify-between text-sm text-primary">
                    <span>Freelancer discount ({effectiveFreelancerDiscount}%):</span>
                    <span>-{formatCurrency((basePriceValue * effectiveFreelancerDiscount / 100), selectedCurrency)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Freelancer discount:</span>
                    <span>0% (requires 3 active referrals)</span>
                  </div>
                )}
                {durationDiscount > 0 && (
                  <div className="flex justify-between text-sm text-primary">
                    <span>Duration discount ({durationDiscount}%):</span>
                    <span>-{formatCurrency((freelancerMonthlyPrice * durationDiscount / 100), selectedCurrency)}/mo</span>
                  </div>
                )}
                <div className="border-t border-border pt-1 flex justify-between font-semibold">
                  <span>Total ({durationMonths} months):</span>
                  <span>{formatCurrency(totalPrice, selectedCurrency)}</span>
                </div>
              </div>

              {/* Payment method selection */}
              <div className="space-y-2">
                <Label>Payment Method *</Label>

                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod("paypal")}
                  className={cn(
                    "flex items-center gap-3 w-full rounded-lg border-2 px-3 py-2.5 transition-all text-left",
                    selectedPaymentMethod === "paypal"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full border-2",
                    selectedPaymentMethod === "paypal" ? "border-primary bg-primary" : "border-muted-foreground/40"
                  )}>
                    {selectedPaymentMethod === "paypal" && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <Globe className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">PayPal</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod("payoneer")}
                  className={cn(
                    "flex items-center gap-3 w-full rounded-lg border-2 px-3 py-2.5 transition-all text-left",
                    selectedPaymentMethod === "payoneer"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full border-2",
                    selectedPaymentMethod === "payoneer" ? "border-primary bg-primary" : "border-muted-foreground/40"
                  )}>
                    {selectedPaymentMethod === "payoneer" && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <DollarSign className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Payoneer</span>
                </button>

                {wallets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod("wallet")}
                    disabled={!hasEnoughBalance || !hasConfiguredPrice}
                    className={cn(
                      "flex items-center gap-3 w-full rounded-lg border-2 px-3 py-2.5 transition-all text-left",
                      selectedPaymentMethod === "wallet"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50",
                      (!hasEnoughBalance || !hasConfiguredPrice) && "opacity-50"
                    )}
                  >
                    <div className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full border-2",
                      selectedPaymentMethod === "wallet" ? "border-primary bg-primary" : "border-muted-foreground/40"
                    )}>
                      {selectedPaymentMethod === "wallet" && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <Wallet className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Wallet</span>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {formatCurrency((selectedWallet?.current_balance ?? 0), selectedCurrency)}
                    </Badge>
                  </button>
                )}

                {selectedPaymentMethod === "wallet" && !hasEnoughBalance && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Balance insufficient
                  </p>
                )}
              </div>

              <Button
                className="w-full"
                onClick={() => purchaseBusiness.mutate()}
                disabled={
                  purchaseBusiness.isPending ||
                  pricingSettings.isLoading ||
                  !hasConfiguredPrice ||
                  !form.business_name.trim() ||
                  !hasMinChannels ||
                  !selectedPaymentMethod ||
                  (selectedPaymentMethod === "wallet" && !hasEnoughBalance)
                }
              >
                {purchaseBusiness.isPending
                  ? "Submitting..."
                  : !hasConfiguredPrice
                    ? "Price not configured"
                    : `Purchase Business — ${formatCurrency(totalPrice, selectedCurrency)}`}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Payment is verified by AI and approved by Admin
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Pending verification:</p>
            {pending.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-accent bg-accent/30 p-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-accent-foreground" />
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
            Add your first business by selecting the appropriate plan
          </p>
        ) : (
          <div className="space-y-2">
            {businesses.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-primary" />
                    <p className="text-sm font-medium text-foreground">{b.business_name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{b.industry || "No industry"}</p>
                </div>
                <Badge variant="outline" className="text-xs">Active</Badge>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mt-2">
          <p className="text-xs font-medium text-primary">💰 Your earnings</p>
          <p className="text-xs text-muted-foreground mt-1">
            Referral commissions follow active partner terms and eligible first-payment records. Management earnings follow approved relation terms.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
