import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { InterestChatModal } from "@/components/lidhjet/InterestChatModal";
import { CreditCard, MessageSquare, Clock, Loader2 } from "lucide-react";

interface PostRelation {
  title: string;
  price: number;
  currency?: string;
}

interface InterestRecord {
  id: string;
  post_id: string;
  buyer_user_id: string;
  seller_user_id: string;
  offer_amount: number;
  message?: string | null;
  status: string;
  tax_paid: boolean;
  expires_at: string;
  created_at: string;
  community_posts?: PostRelation;
}

export default function LidhjetInterests() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"created" | "received">("created");
  const [createdInterests, setCreatedInterests] = useState<InterestRecord[]>([]);
  const [receivedInterests, setReceivedInterests] = useState<InterestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingTaxId, setPayingTaxId] = useState<string | null>(null);

  // Chat Modal State
  const [chatInterestId, setChatInterestId] = useState<string | null>(null);

  const fetchInterests = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Fetch Interests Created (Buyer)
      const { data: created, error: createdErr } = await supabase
        .from("community_interests")
        .select("*, community_posts(title, price, currency)")
        .eq("buyer_user_id", user.id)
        .order("created_at", { ascending: false });

      if (createdErr) console.error("Error fetching created interests:", createdErr.message);

      // 2. Fetch Interests Received (Seller)
      const { data: received, error: receivedErr } = await supabase
        .from("community_interests")
        .select("*, community_posts(title, price, currency)")
        .eq("seller_user_id", user.id)
        .order("created_at", { ascending: false });

      if (receivedErr) console.error("Error fetching received interests:", receivedErr.message);

      setCreatedInterests((created as InterestRecord[]) || []);
      setReceivedInterests((received as InterestRecord[]) || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load interests";
      toast({
        title: "Fetch Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchInterests();
  }, [fetchInterests]);

  const handlePayTax = async (interestId: string) => {
    setPayingTaxId(interestId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const res = await fetch(`${supabaseUrl}/functions/v1/community-tax-pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          interest_id: interestId,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        if (resData.code === "fx_not_configured") {
          toast({
            title: "Service Tax Configuration Pending",
            description: "Exchange rate (lek_per_eur) is currently being configured by administrators. Please try again shortly.",
            variant: "destructive",
          });
          return;
        }
        if (resData.code === "insufficient_funds") {
          toast({
            title: "Insufficient EUR Wallet Balance",
            description: "Please top up your EUR wallet balance under Billing/Wallet.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(resData.error || resData.message || "Tax payment failed");
      }

      toast({
        title: "Service Tax Paid!",
        description: `Successfully debited ${resData.payment?.tax_eur} EUR (200 ALL equivalent). Interest chat is now unlocked.`,
      });

      fetchInterests();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Tax payment failed";
      toast({
        title: "Payment Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setPayingTaxId(null);
    }
  };

  const renderInterestCard = (item: InterestRecord, isSeller: boolean) => {
    const isTaxPaid = item.tax_paid || item.status === "tax_paid";
    const isExpired = new Date(item.expires_at) < new Date();
    const canChat = isTaxPaid && !isExpired;

    return (
      <Card key={item.id} className="hover:border-primary/30 transition-colors">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold">
                {item.community_posts?.title || "Community Post Offer"}
              </CardTitle>
              <CardDescription className="text-xs">
                Offered: <span className="font-bold text-foreground">{item.offer_amount?.toLocaleString()} ALL</span>
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant={
                  isTaxPaid ? "default" : isExpired ? "destructive" : "secondary"
                }
                className="uppercase text-[10px]"
              >
                {isTaxPaid ? "Tax Paid • Chat Active" : isExpired ? "Expired" : item.status}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 text-xs">
          {item.message && (
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50 text-foreground">
              <p className="font-medium text-muted-foreground text-[11px] mb-0.5">Offer Intro Message:</p>
              <p>{item.message}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-muted-foreground text-[11px]">
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span>
                Expires: {new Date(item.expires_at).toLocaleString()}
              </span>
            </div>

            <span>
              Submitted: {new Date(item.created_at).toLocaleDateString()}
            </span>
          </div>

          {/* Seller Action & Chat Trigger */}
          <div className="pt-2 border-t border-border flex items-center justify-end gap-2">
            {isSeller && !isTaxPaid && !isExpired && (
              <Button
                size="sm"
                onClick={() => handlePayTax(item.id)}
                disabled={payingTaxId === item.id}
                className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {payingTaxId === item.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CreditCard className="h-3.5 w-3.5" />
                )}
                Pay Service Tax (200 ALL)
              </Button>
            )}

            <Button
              variant={canChat ? "default" : "outline"}
              size="sm"
              disabled={!canChat}
              onClick={() => setChatInterestId(item.id)}
              className="gap-1.5 text-xs"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {canChat ? "Open Community Chat" : "Chat Requires Paid Tax"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">My Lidhjet Interests & Offers</h1>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold text-xs">
                FREE MODULE
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage offers submitted on posts and received on your community listings.
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "created" | "received")}>
          <TabsList className="grid grid-cols-2 max-w-xs">
            <TabsTrigger value="created">Offers Created ({createdInterests.length})</TabsTrigger>
            <TabsTrigger value="received">Offers Received ({receivedInterests.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="created" className="space-y-4 pt-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : createdInterests.length === 0 ? (
              <Card className="text-center py-10 p-4 text-xs text-muted-foreground">
                You have not submitted any offers yet. Browse the community feed to discover opportunities.
              </Card>
            ) : (
              createdInterests.map((item) => renderInterestCard(item, false))
            )}
          </TabsContent>

          <TabsContent value="received" className="space-y-4 pt-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : receivedInterests.length === 0 ? (
              <Card className="text-center py-10 p-4 text-xs text-muted-foreground">
                No offers received on your community posts yet.
              </Card>
            ) : (
              receivedInterests.map((item) => renderInterestCard(item, true))
            )}
          </TabsContent>
        </Tabs>

        {/* Interest Chat Modal */}
        {chatInterestId && (
          <InterestChatModal
            open={!!chatInterestId}
            onOpenChange={(open) => !open && setChatInterestId(null)}
            interestId={chatInterestId}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
