import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBillingHistory, usePaymentNotifications } from "@/hooks/useBillingHistory";
import { useSubscription } from "@/hooks/useSubscription";
import { Receipt, ExternalLink, AlertTriangle, FileText, Download, CreditCard, Loader2 } from "lucide-react";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  paid: "bg-green-500/10 text-green-700",
  open: "bg-yellow-500/10 text-yellow-700",
  void: "bg-muted text-muted-foreground",
  uncollectible: "bg-destructive/10 text-destructive",
  draft: "bg-muted text-muted-foreground",
};

export const BillingHistoryPanel = () => {
  const { data: history, isLoading } = useBillingHistory();
  const { data: alerts } = usePaymentNotifications();
  const { stripeData } = useSubscription();

  const activeAlerts = alerts?.filter((a) => !a.is_read) || [];

  return (
    <div className="space-y-4">
      {/* Payment Alerts */}
      {activeAlerts.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4 space-y-2">
            {activeAlerts.map((alert) => (
              <div key={alert.id} className="flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">{alert.title}</p>
                  <p className="text-xs text-muted-foreground">{alert.message}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Upcoming Renewal */}
      {stripeData?.subscribed && stripeData.subscription_end && (
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">Next Renewal</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(stripeData.subscription_end), "MMMM d, yyyy")}
                  {stripeData.cancel_at_period_end && " (canceling)"}
                </p>
              </div>
            </div>
            <Badge variant={stripeData.cancel_at_period_end ? "destructive" : "default"}>
              {stripeData.cancel_at_period_end ? "Canceling" : stripeData.status}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Invoice History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Invoice History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : history && history.length > 0 ? (
            <div className="space-y-2">
              {history.map((record) => (
                <div key={record.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        ${Number(record.amount).toFixed(2)} {record.currency.toUpperCase()}
                        {record.discount_amount > 0 && (
                          <span className="text-xs text-green-600 ml-2">
                            -${Number(record.discount_amount).toFixed(2)} discount
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {record.description || record.plan_name || "Subscription"}
                        {record.period_start && ` · ${format(new Date(record.period_start), "MMM d")} – ${record.period_end ? format(new Date(record.period_end), "MMM d, yyyy") : ""}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {record.refund_amount > 0 && (
                      <Badge variant="outline" className="text-xs">
                        Refunded ${Number(record.refund_amount).toFixed(2)}
                      </Badge>
                    )}
                    <Badge className={statusColors[record.status] || ""}>{record.status}</Badge>
                    {record.invoice_url && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                        <a href={record.invoice_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    )}
                    {record.invoice_pdf && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                        <a href={record.invoice_pdf} target="_blank" rel="noopener noreferrer">
                          <Download className="h-3 w-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No billing history yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
