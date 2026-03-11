import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, X, Send, CheckCircle2, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

interface AIChatWidgetProps {
  userId: string;
  businessName?: string;
}

export const AIChatWidget = ({ userId, businessName }: AIChatWidgetProps) => {
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

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("dedicated-ai-reply", {
        body: {
          user_id: userId,
          visitor_name: name || undefined,
          visitor_email: email || undefined,
          message: message.trim(),
          page_url: window.location.href,
        },
      });
      if (error) throw error;
      setReply(data.reply);
      setConversationId(data.conversation_id);
    } catch {
      toast.error("Nuk u dërgua mesazhi");
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
      toast.success("Faleminderit për vlerësimin!");
    } catch {
      toast.error("Gabim gjatë dërgimit");
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
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
        size="icon"
      >
        <Bot className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 z-50 w-80 shadow-xl max-h-[80vh] overflow-y-auto">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Bot className="h-4 w-4 text-primary" />
          {businessName || "AI Assistant"}
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {feedbackSent ? (
          <div className="flex flex-col items-center py-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-primary mb-2" />
            <p className="text-sm font-medium text-foreground">Faleminderit!</p>
            <p className="text-xs text-muted-foreground">Vlerësimi juaj u regjistrua.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={resetChat}>
              Pyetje e re
            </Button>
          </div>
        ) : reply ? (
          <div className="space-y-3">
            {/* Visitor message */}
            <div className="rounded bg-muted p-2">
              <p className="text-xs text-muted-foreground mb-0.5">Ju:</p>
              <p className="text-sm text-foreground">{message}</p>
            </div>
            {/* AI reply */}
            <div className="rounded bg-primary/5 p-2">
              <p className="text-xs text-primary mb-0.5 flex items-center gap-1">
                <Bot className="h-3 w-3" /> AI Assistant:
              </p>
              <p className="text-sm text-foreground">{reply}</p>
            </div>
            {/* Feedback */}
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-foreground mb-2">Sa u kënaqët me përgjigjen?</p>
              <div className="flex gap-1 mb-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRating(n)}
                    className="p-1 transition-colors"
                  >
                    <Star
                      className={`h-5 w-5 ${n <= rating ? "fill-primary text-primary" : "text-muted-foreground"}`}
                    />
                  </button>
                ))}
              </div>
              <Textarea
                placeholder="Shkruani komentin tuaj (opsionale)..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={handleFeedback} disabled={!rating}>
                  Dërgo Vlerësimin
                </Button>
                <Button size="sm" variant="outline" onClick={resetChat}>
                  Pyetje e re
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Përshëndetje! Unë jam AI Asistenti i dedikuar. Më pyesni për produktet, shërbimet ose çdo gjë tjetër.
            </p>
            <Input placeholder="Emri juaj" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Email juaj" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Textarea placeholder="Shkruani pyetjen tuaj..." value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
            <Button onClick={handleSend} disabled={sending || !message.trim()} className="w-full">
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Duke dërguar..." : "Dërgo"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
