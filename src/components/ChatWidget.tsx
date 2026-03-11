import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, X, Send, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

interface ChatWidgetProps {
  userId: string;
  channelId?: string;
  businessName?: string;
}

export const ChatWidget = ({ userId, channelId, businessName }: ChatWidgetProps) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("webchat-ingest", {
        body: {
          user_id: userId,
          visitor_name: name || undefined,
          visitor_email: email || undefined,
          message: message.trim(),
          page_url: window.location.href,
          channel_id: channelId,
        },
      });
      if (error) throw error;
      setSent(true);
      setMessage("");
    } catch (e) {
      toast.error("Failed to send message");
    }
    setSending(false);
  };

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
        size="icon"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 z-50 w-80 shadow-xl">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">{businessName || "Chat with us"}</CardTitle>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {sent ? (
          <div className="flex flex-col items-center py-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-[hsl(var(--success))] mb-2" />
            <p className="text-sm font-medium text-foreground">Message sent!</p>
            <p className="text-xs text-muted-foreground">We'll get back to you soon.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setSent(false)}>
              Send another
            </Button>
          </div>
        ) : (
          <>
            <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Your email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Textarea placeholder="Your message..." value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
            <Button onClick={handleSend} disabled={sending || !message.trim()} className="w-full">
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Sending..." : "Send Message"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
