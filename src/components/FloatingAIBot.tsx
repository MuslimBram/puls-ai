import { useState, useRef, useEffect } from "react";
import { Bot, X, Send, ArrowRight, Loader2, MessageCircle } from "lucide-react";
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
  const [needsAdmin, setNeedsAdmin] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

      const reply = data?.reply || "Nuk munda të gjej një përgjigje. Provoni përsëri.";
      const escalate = data?.needs_admin === true;

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);

      if (escalate) {
        setNeedsAdmin(true);
      }
    } catch (err) {
      toast.error("Gabim gjatë komunikimit me AI.");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Ka ndodhur një gabim. Provoni përsëri më vonë." },
      ]);
    }

    setLoading(false);
  };

  const handleContactAdmin = async () => {
    try {
      await supabase.from("business_notifications" as any).insert({
        user_id: user?.id,
        title: "Kërkesë ndihme nga përdoruesi",
        message: `Përdoruesi kërkon ndihmë: ${messages.filter(m => m.role === "user").pop()?.content || "Pa mesazh"}`,
        notification_type: "system",
        category: "support",
        action_url: "/helpdesk",
      });
      toast.success("Kërkesa u dërgua te administratori!");
      setNeedsAdmin(false);
    } catch {
      toast.error("Nuk u dërgua. Provoni përsëri.");
    }
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
        aria-label="AI Ndihmë"
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
          <span className="text-sm font-medium text-foreground">AI Ndihmë</span>
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
              Përshëndetje! Si mund t'ju ndihmoj sot?
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
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

        {needsAdmin && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-2">
              Duket se kjo çështje kërkon ndihmë njerëzore.
            </p>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleContactAdmin}>
              Kontakto Administratorin
              <ArrowRight className="h-3 w-3" />
            </Button>
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
            placeholder="Shkruani pyetjen tuaj..."
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
