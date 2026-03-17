import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Loader2, FileText, ExternalLink, DollarSign, Building2 } from "lucide-react";

interface LineItem {
  workspace_id: string;
  business_name: string;
  plan: string;
  amount: number;
}

interface BillingPreview {
  line_items: LineItem[];
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  final_total: number;
  business_count: number;
}

export const PartnerBulkBilling = ({ partnerId }: { partnerId: string }) => {
  const [preview, setPreview] = useState<BillingPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadPreview = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("partner-bulk-billing", {
        body: { partner_id: partnerId, action: "preview" },
      });
      if (error) throw error;
      setPreview(data);
    } catch (e: any) {
      toast.error(e.message || "Failed to load billing preview");
    } finally {
      setLoading(false);
    }
  };

  const generateInvoice = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("partner-bulk-billing", {
        body: { partner_id: partnerId, action: "generate_invoice" },
      });
      if (error) throw error;
      toast.success(`Invoice generated for ${data.business_count} businesses`);
      if (data.invoice_url) {
        window.open(data.invoice_url, "_blank");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to generate invoice");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Bulk Billing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Generate a single aggregated invoice for all managed businesses with your partner discount applied.
        </p>

        {!preview ? (
          <Button onClick={loadPreview} disabled={loading} variant="outline">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
            Preview Billing
          </Button>
        ) : (
          <div className="space-y-3">
            {preview.line_items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No active businesses to bill.</p>
            ) : (
              <>
                <div className="space-y-1">
                  {preview.line_items.map((item) => (
                    <div key={item.workspace_id} className="flex items-center justify-between rounded-lg border border-border p-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{item.business_name}</span>
                        <Badge variant="secondary" className="text-xs">{item.plan}</Badge>
                      </div>
                      <span className="text-sm font-medium">${item.amount}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg bg-muted p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>${preview.subtotal.toFixed(2)}</span>
                  </div>
                  {preview.discount_percent > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Partner Discount ({preview.discount_percent}%)</span>
                      <span>-${preview.discount_amount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold border-t border-border pt-1 mt-1">
                    <span>Total</span>
                    <span>${preview.final_total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={generateInvoice} disabled={generating || preview.line_items.length === 0}>
                    {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                    Generate Invoice
                  </Button>
                  <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
