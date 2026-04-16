import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Plug, Bot, MessageSquare, Gift, ArrowRight, BookOpen } from "lucide-react";

const STORAGE_KEY_PREFIX = "pulse_onboarding_seen_v1_";

const STEPS = [
  {
    icon: Plug,
    title: "Welcome to Pulse AI 👋",
    body: "Let's get you set up in 4 quick steps. You can revisit this anytime in the Help Center.",
  },
  {
    icon: Plug,
    title: "1. Connect a channel",
    body: "Link Telegram, WhatsApp or Email so your customers can message you. You'll always be able to edit or reconnect later.",
  },
  {
    icon: Bot,
    title: "2. Train your AI",
    body: "Add your FAQs and services in Knowledge Base. The AI will reply automatically using your tone and data.",
  },
  {
    icon: MessageSquare,
    title: "3. Use the unified inbox",
    body: "All conversations from every channel land in one inbox. Reply manually or let the AI handle them.",
  },
  {
    icon: Gift,
    title: "4. Earn from referrals",
    body: "Share your referral link (kohablerjeve.top/register?ref=...) and earn 15% on every package purchase by your referrals.",
  },
];

export const OnboardingWelcomeModal = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    const key = STORAGE_KEY_PREFIX + user.id;
    const seen = localStorage.getItem(key);
    if (!seen) setOpen(true);
  }, [user?.id]);

  const finish = () => {
    if (user?.id) localStorage.setItem(STORAGE_KEY_PREFIX + user.id, "1");
    setOpen(false);
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) finish(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-primary/10 p-2">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle>{current.title}</DialogTitle>
          </div>
          <DialogDescription className="pt-2">{current.body}</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-1 pt-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-6 rounded-full ${i === step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { finish(); navigate("/help-center"); }}
          >
            <BookOpen className="mr-1 h-4 w-4" /> Open Help Center
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={finish}>
                Get started <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                Next <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
