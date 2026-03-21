import { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const FloatingAIBot = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminNotified, setAdminNotified] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const notifyAdmin = async (reason: string) => {
    if (adminNotified) return;
    try {
      await supabase.from("business_notifications" as any).insert({
        user_id: user?.id,
        title: "Support request from user",
        message: `User needs specialist help: ${reason}`,
        notification_type: "system",
        category: "support",
        action_url: "/helpdesk",
      });
      setAdminNotified(true);
    } catch {
      // silent fail — don't interrupt chat
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("ai-help-bot", {
        body: {
          messages: newMessages,
          user_id: user?.id,
        },
      });

      if (error) throw error;

      const reply = data?.reply || "I couldn't find an answer. Please try again.";
      const escalate = data?.needs_admin === true;

      if (escalate) {
        // Notify admin silently in the background, but keep chatting
        notifyAdmin(reply);
        // Show the AI reply + a note that a specialist will connect
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `${reply}\n\nA specialist has been notified and will connect with you shortly. Feel free to keep chatting in the meantime.`,
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      }
    } catch {
      toast.error("Error communicating with AI.");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "An error occurred. Please try again later." },
      ]);
    }

    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-105 active:scale-95 animate-bounce-gentle"
        aria-label="AI Help"
      >
        <Bot className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[340px] max-h-[70vh] flex flex-col rounded-xl border border-border bg-card shadow-xl animate-in slide-in-from-bottom-4 fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <Bot className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-sm font-medium text-foreground">AI Help</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[400px]">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageCircle className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">
              Happy to help! What questions do you have?
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-line ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your question..."
            rows={1}
            className="min-h-[36px] max-h-[80px] resize-none text-sm"
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleSend}
            disabled={!input.trim() || loading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
