import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, ShieldAlert, MessageSquare } from "lucide-react";

interface InterestChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interestId: string;
}

interface ChatMessage {
  id: string;
  interest_id: string;
  sender_user_id: string;
  message: string;
  is_system: boolean;
  created_at: string;
}

export function InterestChatModal({ open, onOpenChange, interestId }: InterestChatModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [contactViolationError, setContactViolationError] = useState<string | null>(null);
  const pendingEventId = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !interestId) return;

    async function fetchMessages() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("community_interest_messages")
          .select("*")
          .eq("interest_id", interestId)
          .order("created_at", { ascending: true });

        if (error) {
          console.error("Error fetching chat messages:", error.message);
        } else {
          setMessages((data as ChatMessage[]) || []);
        }
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchMessages();
  }, [open, interestId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    setSending(true);
    setContactViolationError(null);

    const eventId = pendingEventId.current ?? `community_msg_${crypto.randomUUID()}`;
    pendingEventId.current = eventId;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const res = await fetch(`${supabaseUrl}/functions/v1/community-message-create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          interest_id: interestId,
          message: newMessage,
          event_id: eventId,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        if (resData.code === "CONTACT_INFO_VIOLATION") {
          setContactViolationError(resData.error || "Sharing direct contact information is forbidden.");
          toast({
            title: "Contact Policy Violation",
            description: "Sharing direct contact info (phone, email, social links) is forbidden.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(resData.error || resData.message || "Failed to send message");
      }

      setMessages((prev) => (
        prev.some((item) => item.id === resData.message.id)
          ? prev
          : [...prev, resData.message]
      ));
      setNewMessage("");
      pendingEventId.current = null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      toast({
        title: "Message Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col h-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Lidhjet Community Chat
          </DialogTitle>
          <DialogDescription className="text-xs">
            Service Tax Paid • Active Community Thread
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 p-3 rounded-lg bg-muted/40 border border-border">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-xs text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2 stroke-1" />
              <p>No messages in this thread yet. Send a message to start chatting.</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_user_id === user?.id;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-xl px-3.5 py-2 text-xs leading-relaxed ${
                      isMine
                        ? "bg-primary text-primary-foreground rounded-br-none"
                        : "bg-card border border-border text-foreground rounded-bl-none"
                    }`}
                  >
                    {msg.message}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {contactViolationError && (
          <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{contactViolationError}</span>
          </div>
        )}

        <form onSubmit={handleSendMessage} className="flex gap-2 pt-2">
          <Input
            placeholder="Type your message..."
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              pendingEventId.current = null;
              if (contactViolationError) setContactViolationError(null);
            }}
            className="flex-1 text-xs"
          />
          <Button type="submit" disabled={sending || !newMessage.trim()} size="sm" className="gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
