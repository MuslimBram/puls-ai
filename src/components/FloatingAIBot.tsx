import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bot, X, Send, Loader2, MessageCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePublicLocale } from "@/hooks/usePublicLocale";
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
  const [showLeadCapture, setShowLeadCapture] = useState(false);
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [leadError, setLeadError] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [lead, setLead] = useState({
    name: "",
    email: "",
    business_name: "",
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const leadRequestIdRef = useRef("");
  const { user } = useAuth();
  const { t } = useTranslation();
  const { localizedPath } = usePublicLocale();
  const isPublicVisitor = !user?.id;

  if (!leadRequestIdRef.current) {
    leadRequestIdRef.current =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `live-demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, showLeadCapture, leadSubmitted]);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener("pulse-ai-open-bot", handleOpen as EventListener);
    return () => window.removeEventListener("pulse-ai-open-bot", handleOpen as EventListener);
  }, []);

  const notifyAdmin = async (reason: string) => {
    if (adminNotified || !user?.id) return false;
    try {
      const { error } = await supabase.functions.invoke("submit-ticket", {
        body: {
          subject: "AI Help escalation",
          description: `User requested specialist help via AI Help Bot.\n\nAI response context:\n${reason}`,
          category: "ai_escalation",
          priority: "normal",
        },
      });
      if (error) return false;
      setAdminNotified(true);
      return true;
    } catch {
      // silent fail — don't interrupt chat
      return false;
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
        let escalationNote =
          "For account-specific or unresolved issues, please sign in and open Helpdesk so our team can assist you.";

        if (user?.id) {
          const notified = await notifyAdmin(reply);
          escalationNote = notified
            ? "A specialist has been notified and will connect with you shortly. Feel free to keep chatting in the meantime."
            : "I couldn't notify a specialist automatically. Please open Helpdesk from your workspace while we continue here.";
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `${reply}\n\n${escalationNote}`,
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      }
    } catch {
      toast.error(t("common.error"));
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "An error occurred. Please try again later." },
      ]);
    }

    setLoading(false);
  };

  const handleLeadSubmit = async () => {
    setLeadError("");

    if (!lead.name.trim() || !lead.email.trim()) {
      setLeadError(t("leadForm.errors.required"));
      return;
    }

    if (!privacyConsent) {
      setLeadError(t("leadForm.legalPrefix"));
      return;
    }

    const conversationContext = messages
      .slice(-8)
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n")
      .slice(0, 3_500);

    setLeadLoading(true);

    try {
      const { error } = await supabase.functions.invoke("public-lead-capture", {
        body: {
          name: lead.name.trim(),
          email: lead.email.trim(),
          business_name: lead.business_name.trim() || undefined,
          message: conversationContext || undefined,
          source: "live_demo",
          privacy_consent: true,
          idempotency_key: leadRequestIdRef.current,
          page_url: window.location.href,
          utm_source: new URLSearchParams(window.location.search).get("utm_source"),
          utm_medium: new URLSearchParams(window.location.search).get("utm_medium"),
          utm_campaign: new URLSearchParams(window.location.search).get("utm_campaign"),
        },
      });

      if (error) throw error;

      setLeadSubmitted(true);
      setShowLeadCapture(false);
    } catch {
      setLeadError(t("leadForm.errors.generic"));
    } finally {
      setLeadLoading(false);
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
        aria-label={isPublicVisitor ? t("homepage.aiSection.primaryCta") : "AI Help"}
      >
        <Bot className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[360px] max-w-[calc(100vw-2rem)] max-h-[76vh] flex flex-col rounded-xl border border-border bg-card shadow-xl animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <Bot className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <span className="block text-sm font-medium text-foreground">
              {isPublicVisitor ? t("homepage.hero.brand") : "AI Help"}
            </span>
            {isPublicVisitor && (
              <span className="block text-[11px] text-muted-foreground">
                {t("homepage.aiSection.eyebrow")}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[220px] max-h-[440px]">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageCircle className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="max-w-[280px] text-xs leading-5 text-muted-foreground">
              {isPublicVisitor
                ? t("homepage.aiSection.description")
                : "Happy to help! What questions do you have?"}
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

        {isPublicVisitor && messages.length > 0 && !leadSubmitted && !showLeadCapture && (
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="mb-2 text-xs leading-5 text-muted-foreground">
              {t("homepage.finalCta.description")}
            </p>
            <Button size="sm" variant="outline" className="w-full" onClick={() => setShowLeadCapture(true)}>
              {t("leadForm.submit")}
            </Button>
          </div>
        )}

        {isPublicVisitor && showLeadCapture && !leadSubmitted && (
          <div className="space-y-3 rounded-lg border border-border bg-background p-3">
            <div>
              <p className="text-sm font-medium text-foreground">{t("homepage.leadForm.title")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("homepage.leadForm.subtitle")}</p>
            </div>

            <Input
              value={lead.name}
              onChange={(event) => setLead((current) => ({ ...current, name: event.target.value }))}
              placeholder={t("leadForm.placeholders.fullName")}
              aria-label={t("leadForm.fields.fullName")}
            />
            <Input
              type="email"
              value={lead.email}
              onChange={(event) => setLead((current) => ({ ...current, email: event.target.value }))}
              placeholder={t("leadForm.placeholders.email")}
              aria-label={t("leadForm.fields.email")}
            />
            <Input
              value={lead.business_name}
              onChange={(event) => setLead((current) => ({ ...current, business_name: event.target.value }))}
              placeholder={t("leadForm.placeholders.businessName")}
              aria-label={t("leadForm.fields.businessName")}
            />

            <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <input
                type="checkbox"
                checked={privacyConsent}
                onChange={(event) => setPrivacyConsent(event.target.checked)}
                className="mt-1"
              />
              <span>
                {t("leadForm.legalPrefix")}{" "}
                <Link to={localizedPath("/privacy")} className="underline">
                  {t("leadForm.privacyPolicy")}
                </Link>
                .
              </span>
            </label>

            {leadError && <p className="text-xs text-destructive">{leadError}</p>}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="flex-1"
                onClick={() => setShowLeadCapture(false)}
                disabled={leadLoading}
              >
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleLeadSubmit}
                disabled={leadLoading || !privacyConsent}
              >
                {leadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("leadForm.submit")}
              </Button>
            </div>
          </div>
        )}

        {isPublicVisitor && leadSubmitted && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-background p-3">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">{t("leadForm.success.title")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("leadForm.success.description")}</p>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isPublicVisitor ? t("leadForm.placeholders.message") : "Type your question..."}
            rows={1}
            className="min-h-[36px] max-h-[80px] resize-none text-sm"
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            aria-label={t("common.submit")}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
