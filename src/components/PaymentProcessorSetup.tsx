import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useWorkspacePayment, PaymentAccount, PaymentProcessorType } from "@/hooks/useWorkspacePayment";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  CreditCard, Plus, Trash2, Star, Globe, CheckCircle2,
  Wallet, Building2, Smartphone, Pencil,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";

const PROCESSORS: {
  type: PaymentProcessorType;
  name: string;
  icon: typeof CreditCard;
  description: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
  regions: string;
}[] = [
  {
    type: "stripe",
    name: "Stripe",
    icon: CreditCard,
    description: "Accept cards, wallets & bank debits in 46+ countries",
    fields: [
      { key: "account_id", label: "Stripe Account ID", placeholder: "acct_..." },
      { key: "email", label: "Stripe Email", placeholder: "you@business.com" },
    ],
    regions: "Global (46+ countries)",
  },
  {
    type: "paypal",
    name: "PayPal",
    icon: Wallet,
    description: "Send & receive payments in 200+ markets worldwide",
    fields: [
      { key: "email", label: "PayPal Email", placeholder: "you@business.com" },
      { key: "merchant_id", label: "Merchant ID (optional)", placeholder: "ABC123..." },
    ],
    regions: "Global (200+ markets)",
  },
  {
    type: "wise",
    name: "Wise (TransferWise)",
    icon: Globe,
    description: "Low-fee international transfers in 80+ currencies",
    fields: [
      { key: "email", label: "Wise Email", placeholder: "you@business.com" },
      { key: "account_holder", label: "Account Holder Name", placeholder: "Business Name" },
      { key: "currency", label: "Primary Currency", placeholder: "USD, EUR, GBP..." },
    ],
    regions: "Global (80+ currencies)",
  },
  {
    type: "payoneer",
    name: "Payoneer",
    icon: Building2,
    description: "Cross-border payments for freelancers & businesses",
    fields: [
      { key: "email", label: "Payoneer Email", placeholder: "you@business.com" },
      { key: "account_id", label: "Payoneer Account ID", placeholder: "12345678" },
    ],
    regions: "Global (190+ countries)",
  },
  {
    type: "square",
    name: "Square",
    icon: CreditCard,
    description: "POS & online payments for US, Canada, UK, Australia, Japan",
    fields: [
      { key: "merchant_id", label: "Square Merchant ID", placeholder: "MLxxxxxxxxx" },
      { key: "location_id", label: "Location ID", placeholder: "Lxxxxxxxxx" },
    ],
    regions: "US, CA, UK, AU, JP",
  },
  {
    type: "razorpay",
    name: "Razorpay",
    icon: Smartphone,
    description: "India's leading payment gateway — UPI, cards, wallets",
    fields: [
      { key: "merchant_id", label: "Razorpay Merchant ID", placeholder: "MID..." },
      { key: "email", label: "Business Email", placeholder: "you@business.com" },
    ],
    regions: "India",
  },
  {
    type: "mpesa",
    name: "M-Pesa",
    icon: Smartphone,
    description: "Mobile money for Africa — Kenya, Tanzania, DRC & more",
    fields: [
      { key: "business_number", label: "M-Pesa Business Number", placeholder: "123456" },
      { key: "phone", label: "Registered Phone", placeholder: "+254..." },
    ],
    regions: "Africa (Kenya, Tanzania, DRC, Ghana...)",
  },
  {
    type: "bank_transfer",
    name: "Bank Transfer (IBAN/SWIFT)",
    icon: Building2,
    description: "Direct bank transfer — works everywhere with IBAN or SWIFT",
    fields: [
      { key: "account_holder", label: "Account Holder Name", placeholder: "Business Name" },
      { key: "iban", label: "IBAN / Account Number", placeholder: "XX00 0000 0000 0000 0000 00" },
      { key: "swift", label: "SWIFT / BIC Code", placeholder: "BANKXXXX" },
      { key: "bank_name", label: "Bank Name", placeholder: "Bank of..." },
      { key: "country", label: "Country", placeholder: "Country" },
    ],
    regions: "Worldwide",
  },
];

export const PaymentProcessorSetup = () => {
  const { workspace: currentWorkspace } = useWorkspace();
  const { data, isLoading, updatePaymentAccounts } = useWorkspacePayment(currentWorkspace?.id ?? null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProcessor, setSelectedProcessor] = useState<PaymentProcessorType | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const accounts: PaymentAccount[] = (data?.payment_accounts as PaymentAccount[]) || [];
  const processor = PROCESSORS.find((p) => p.type === selectedProcessor);

  const isEditing = editingIndex !== null;

  const handleAdd = () => {
    if (!processor) return;
    const label = formData.email || formData.account_id || formData.iban || formData.business_number || processor.name;
    const value = JSON.stringify(formData);

    if (isEditing) {
      const updated = accounts.map((acc, i) =>
        i === editingIndex
          ? { ...acc, label: `${processor.name} — ${label}`, value, status: acc.status }
          : acc
      );
      updatePaymentAccounts.mutate({ accounts: updated });
      toast.success(`${processor.name} account updated`);
    } else {
      const newAccount: PaymentAccount = {
        type: processor.type,
        label: `${processor.name} — ${label}`,
        value,
        is_primary: accounts.length === 0,
        status: "pending",
      };
      updatePaymentAccounts.mutate({ accounts: [...accounts, newAccount] });
      toast.success(`${processor.name} account added`);
    }

    setDialogOpen(false);
    setSelectedProcessor(null);
    setFormData({});
    setEditingIndex(null);
  };

  const handleEdit = (index: number) => {
    const acc = accounts[index];
    const proc = PROCESSORS.find((p) => p.type === acc.type);
    if (!proc) return;
    try {
      const parsed = JSON.parse(acc.value);
      setFormData(parsed);
    } catch {
      setFormData({});
    }
    setSelectedProcessor(acc.type);
    setEditingIndex(index);
    setDialogOpen(true);
  };

  const handleRemove = (index: number) => {
    const updated = accounts.filter((_, i) => i !== index);
    if (updated.length > 0 && !updated.some((a) => a.is_primary)) {
      updated[0].is_primary = true;
    }
    updatePaymentAccounts.mutate({ accounts: updated });
    toast.success("Account removed");
  };

  const handleSetPrimary = (index: number) => {
    const updated = accounts.map((a, i) => ({ ...a, is_primary: i === index }));
    updatePaymentAccounts.mutate({ accounts: updated });
    toast.success("Primary account updated");
  };

  if (isLoading) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Payment Accounts</h3>
          <p className="text-sm text-muted-foreground">
            Connect your bank or payment processor to receive payments from anywhere in the world.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) { setSelectedProcessor(null); setFormData({}); setEditingIndex(null); }
        }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => { setSelectedProcessor(null); setFormData({}); setEditingIndex(null); }}>
              <Plus className="mr-1 h-4 w-4" /> Add Account
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {isEditing ? `Edit ${processor?.name}` : selectedProcessor ? `Connect ${processor?.name}` : "Choose Payment Processor"}
              </DialogTitle>
            </DialogHeader>

            {!selectedProcessor && !isEditing ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {PROCESSORS.map((p) => (
                  <button
                    key={p.type}
                    onClick={() => setSelectedProcessor(p.type)}
                    className="flex items-start gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <p.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                      <Badge variant="outline" className="mt-1 text-[10px]">{p.regions}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                  {processor && <processor.icon className="h-5 w-5 text-primary" />}
                  <div>
                    <p className="text-sm font-medium">{processor?.name}</p>
                    <p className="text-xs text-muted-foreground">{processor?.regions}</p>
                  </div>
                </div>

                {processor?.fields.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <Label className="text-sm">{field.label}</Label>
                    <Input
                      type={field.type || "text"}
                      placeholder={field.placeholder}
                      value={formData[field.key] || ""}
                      onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    />
                  </div>
                ))}

                <div className="flex gap-2 pt-2">
                  {!isEditing && (
                    <Button variant="outline" onClick={() => setSelectedProcessor(null)}>
                      Back
                    </Button>
                  )}
                  <Button
                    onClick={handleAdd}
                    disabled={!processor?.fields.some((f) => formData[f.key]?.trim())}
                  >
                    {isEditing ? `Save Changes` : `Connect ${processor?.name}`}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {accounts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CreditCard className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No payment accounts connected</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add Stripe, PayPal, Wise, Razorpay, M-Pesa, or a bank transfer to start receiving payments.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.map((acc, i) => {
            const proc = PROCESSORS.find((p) => p.type === acc.type);
            const Icon = proc?.icon || CreditCard;
            return (
              <Card key={i} className={acc.is_primary ? "border-primary/40 ring-1 ring-primary/20" : ""}>
                <CardContent className="flex items-start gap-3 pt-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{acc.label}</p>
                      {acc.is_primary && (
                        <Badge className="shrink-0 text-[10px]">Primary</Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{proc?.name || acc.type}</Badge>
                      <Badge
                        variant="outline"
                        className={
                          acc.status === "verified"
                            ? "bg-green-500/10 text-green-700 text-[10px]"
                            : "bg-yellow-500/10 text-yellow-700 text-[10px]"
                        }
                      >
                        {acc.status || "pending"}
                      </Badge>
                    </div>
                    <div className="mt-2 flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleEdit(i)}
                      >
                        <Pencil className="mr-1 h-3 w-3" /> Edit
                      </Button>
                      {!acc.is_primary && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleSetPrimary(i)}
                        >
                          <Star className="mr-1 h-3 w-3" /> Set Primary
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive"
                        onClick={() => handleRemove(i)}
                      >
                        <Trash2 className="mr-1 h-3 w-3" /> Remove
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
