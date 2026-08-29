import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, X, Send, CheckCircle2, Star, Minus, Plus, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

interface AIChatWidgetProps {
  userId?: string;
  businessId?: string;
  workspaceId?: string;
  businessName?: string;
}

interface AIChatOpenDetail {
  context?: string;
}

export const AIChatWidget = ({ userId, businessId, workspaceId, businessName }: AIChatWidgetProps = {}) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    const openFromContext = (event: Event) => {
      const detail = (event as CustomEvent<AIChatOpenDetail>).detail;
      if (detail?.context) setMessage(detail.context);
      setOpen(true);
    };
    window.addEventListener("pulse-ai:open-chat", openFromContext);
    return () => window.removeEventListener("pulse-ai:open-chat", openFromContext);
  }, []);

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("dedicated-ai-reply", {
        body: {
          user_id: userId,
          business_id: businessId,
          workspace_id: workspaceId,
          visitor_name: name || undefined,
          visitor_email: email || undefined,
          message: message.trim(),
          page_url: window.location.href,
        },
      });
      if (error) throw error;
      setReply(data.reply);
      setConversationId(data.conversation_id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send message");
    }
    setSending(false);
  };

  const handleFeedback = async () => {
    if (!conversationId || !rating) return;
    try {
      const { error } = await supabase.from("ai_feedback").insert({
        conversation_id: conversationId,
        user_id: userId,
        rating,
        comment: comment.trim() || null,
      });
      if (error) throw error;
      setFeedbackSent(true);
      toast.success("Thank you for your feedback!");
    } catch {
      toast.error("Failed to send feedback");
    }
  };

  const resetChat = () => {
    setReply(null);
    setConversationId(null);
    setFeedbackSent(false);
    setRating(0);
    setComment("");
    setMessage("");
  };

  if (!open) {
    return (
      <Button
        aria-label="Open Pulse AI assistant"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-1/2 z-50 h-14 w-14 -translate-x-1/2 rounded-full border border-primary/40 shadow-lg shadow-primary/20"
        size="icon"
      >
        <span className="relative flex items-center justify-center">
          <Radio className="h-7 w-7" />
          <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-background text-primary shadow-sm">
            <Plus className="h-3.5 w-3.5" />
          </span>
        </span>
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-5 left-1/2 z-50 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden shadow-xl max-h-[80vh] overflow-y-auto">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Radio className="h-4 w-4" />
            <Plus className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-background" />
          </span>
          {businessName || "Pulse AI Assistant"}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Minimize AI assistant" onClick={() => setOpen(false)}>
            <Minus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Close AI assistant" onClick={() => { resetChat(); setOpen(false); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {feedbackSent ? (
          <div className="flex flex-col items-center py-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-primary mb-2" />
            <p className="text-sm font-medium text-foreground">Thank you!</p>
            <p className="text-xs text-muted-foreground">Your feedback has been recorded.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={resetChat}>New Question</Button>
          </div>
        ) : reply ? (
          <div className="space-y-3">
            <div className="rounded bg-muted p-2"><p className="text-xs text-muted-foreground mb-0.5">You:</p><p className="text-sm text-foreground">{message}</p></div>
            <div className="rounded bg-primary/5 p-2">
              <p className="text-xs text-primary mb-0.5 flex items-center gap-1"><Bot className="h-3 w-3" /> AI Assistant:</p>
              <p className="text-sm text-foreground">{reply}</p>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-foreground mb-2">How satisfied are you with this reply?</p>
              <div className="flex gap-1 mb-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setRating(n)} className="p-1 transition-colors" aria-label={`Rate ${n} out of 5`}>
                    <Star className={`h-5 w-5 ${n <= rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                  </button>
                ))}
              </div>
              <Textarea placeholder="Write your comment (optional)..." value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="text-sm" />
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={handleFeedback} disabled={!rating}>Send Feedback</Button>
                <Button size="sm" variant="outline" onClick={resetChat}>New Question</Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">Hello! I'm your dedicated AI Assistant. Ask me about products, services, plans, or anything else.</p>
            <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Your email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Textarea placeholder="Write your question..." value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
            <Button onClick={handleSend} disabled={sending || !message.trim()} className="w-full"><Send className="h-4 w-4 mr-2" />{sending ? "Sending..." : "Send"}</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
