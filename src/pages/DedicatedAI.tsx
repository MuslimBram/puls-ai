import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SafeRender } from "@/components/SafeRender";
import { toast } from "@/components/ui/sonner";
import { Bot, MessageSquare, ThumbsUp, ThumbsDown, Clock, CheckCircle2, AlertCircle, Send } from "lucide-react";
import { format } from "date-fns";

const DedicatedAI = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [aiEnabled, setAiEnabled] = useState(true);

  // Fetch AI conversations
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["ai-conversations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_conversations")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch feedback
  const { data: feedback = [] } = useQuery({
    queryKey: ["ai-feedback", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_feedback")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Approve draft reply
  const approveDraft = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_conversations")
        .update({ status: "sent", is_draft: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
      toast.success("Përgjigja u aprovua dhe u dërgua");
    },
  });

  const autoReplied = conversations.filter((c: any) => c.is_auto_reply);
  const drafts = conversations.filter((c: any) => c.is_draft && c.status === "draft");
  const avgRating = feedback.length > 0
    ? (feedback.reduce((sum: number, f: any) => sum + (f.rating || 0), 0) / feedback.filter((f: any) => f.rating).length).toFixed(1)
    : "—";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-5 w-5 text-primary" />
              AI i Dedikuar
            </CardTitle>
            <CardDescription>
              AI që skanon dhe i kthen përgjigje vizitorëve automatikisht bazuar në informacionet e biznesit tuaj.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
                <span className="text-sm font-medium text-foreground">
                  {aiEnabled ? "AI Aktive — Skanim 24/7" : "AI e çaktivizuar"}
                </span>
              </div>
              <Badge variant={aiEnabled ? "default" : "secondary"}>
                {aiEnabled ? "🟢 Online" : "⚪ Offline"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{conversations.length}</p>
                <p className="text-xs text-muted-foreground">Biseda Totale</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                <Send className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{autoReplied.length}</p>
                <p className="text-xs text-muted-foreground">Përgjigje Automatike</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <Clock className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{drafts.length}</p>
                <p className="text-xs text-muted-foreground">Draft për Aprovim</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <ThumbsUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{avgRating}</p>
                <p className="text-xs text-muted-foreground">Vlerësimi Mesatar</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="drafts">
          <TabsList>
            <TabsTrigger value="drafts" className="gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              Draft ({drafts.length})
            </TabsTrigger>
            <TabsTrigger value="auto" className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Automatike ({autoReplied.length})
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              Të gjitha
            </TabsTrigger>
            <TabsTrigger value="feedback" className="gap-1.5">
              <ThumbsUp className="h-3.5 w-3.5" />
              Vlerësimet ({feedback.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="drafts">
            <Card>
              <CardContent className="pt-6">
                {drafts.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nuk ka draft për aprovim. AI-ja i përgjigjet automatikisht pyetjeve të thjeshta.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {drafts.map((conv: any) => (
                      <ConversationCard key={conv.id} conv={conv} onApprove={() => approveDraft.mutate(conv.id)} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="auto">
            <Card>
              <CardContent className="pt-6">
                {autoReplied.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Asnjë përgjigje automatike ende.</p>
                ) : (
                  <div className="space-y-3">
                    {autoReplied.slice(0, 20).map((conv: any) => (
                      <ConversationCard key={conv.id} conv={conv} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all">
            <Card>
              <CardContent className="pt-6">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : conversations.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Asnjë bisedë ende.</p>
                ) : (
                  <div className="space-y-3">
                    {conversations.slice(0, 30).map((conv: any) => (
                      <ConversationCard key={conv.id} conv={conv} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feedback">
            <Card>
              <CardContent className="pt-6">
                {feedback.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Asnjë vlerësim ende.</p>
                ) : (
                  <div className="space-y-3">
                    {feedback.map((f: any) => (
                      <div key={f.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2 mb-1">
                          {f.rating && f.rating >= 4 ? (
                            <ThumbsUp className="h-4 w-4 text-primary" />
                          ) : (
                            <ThumbsDown className="h-4 w-4 text-destructive" />
                          )}
                          <span className="text-sm font-medium text-foreground">
                            Vlerësimi: {f.rating}/5
                          </span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {(() => { try { return format(new Date(f.created_at), "MMM d, HH:mm"); } catch { return "—"; } })()}
                          </span>
                        </div>
                        {f.comment && (
                          <p className="text-sm text-muted-foreground mt-1">{f.comment}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

const ConversationCard = ({ conv, onApprove }: { conv: any; onApprove?: () => void }) => (
  <div className="rounded-lg border border-border p-3">
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xs font-medium text-muted-foreground">
        {conv.visitor_name || "Vizitor"}
      </span>
      <Badge variant="secondary" className="text-xs">{conv.channel_type}</Badge>
      <Badge variant={conv.is_auto_reply ? "default" : "outline"} className="text-xs">
        {conv.is_auto_reply ? "Auto" : "Draft"}
      </Badge>
      <Badge variant={conv.complexity === "simple" ? "secondary" : "destructive"} className="text-xs">
        {conv.complexity === "simple" ? "E thjeshtë" : "Komplekse"}
      </Badge>
      <span className="text-xs text-muted-foreground ml-auto">
        {(() => { try { return format(new Date(conv.created_at), "MMM d, HH:mm"); } catch { return "—"; } })()}
      </span>
    </div>
    <div className="space-y-2">
      <div className="rounded bg-muted p-2">
        <p className="text-xs font-medium text-muted-foreground mb-0.5">Vizitori:</p>
        <p className="text-sm text-foreground">{conv.visitor_message}</p>
      </div>
      {conv.ai_reply && (
        <div className="rounded bg-primary/5 p-2">
          <p className="text-xs font-medium text-primary mb-0.5">AI:</p>
          <p className="text-sm text-foreground">{conv.ai_reply}</p>
        </div>
      )}
    </div>
    {onApprove && conv.is_draft && (
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={onApprove}>
          <CheckCircle2 className="h-3 w-3 mr-1" /> Aprovo & Dërgo
        </Button>
      </div>
    )}
  </div>
);

export default DedicatedAI;
