import { useState, useEffect } from "react";
import { X, Gift, ArrowRight, Copy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessReferralCode } from "@/hooks/useBusinessReferral";
import { Link } from "react-router-dom";

export const ReferralIncentivePopup = () => {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();
  const { data: referralCode } = useBusinessReferralCode();

  useEffect(() => {
    if (!user) return;
    const key = `referral_popup_dismissed_${user.id}`;
    const lastDismissed = localStorage.getItem(key);
    if (lastDismissed) {
      const hours = (Date.now() - parseInt(lastDismissed)) / (1000 * 60 * 60);
      if (hours < 24) return;
    }
    const timer = setTimeout(() => setVisible(true), 45000);
    return () => clearTimeout(timer);
  }, [user]);

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
    if (user) {
      localStorage.setItem(`referral_popup_dismissed_${user.id}`, Date.now().toString());
    }
  };

  const handleCopy = () => {
    if (referralCode?.referral_code) {
      navigator.clipboard.writeText(referralCode.referral_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!visible || dismissed) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right-5 fade-in duration-500">
      <div className="relative w-80 rounded-xl border border-primary/20 bg-card shadow-lg shadow-primary/5 overflow-hidden">
        {/* Decorative top bar */}
        <div className="h-1 bg-gradient-to-r from-primary via-primary/60 to-primary/20" />

        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="p-4 pt-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Gift className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight">
                Earn 15% on every referral!
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Refer other businesses and earn 15% of everything they spend — forever.
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {referralCode?.referral_code ? (
              <>
                <div className="flex-1 rounded-md bg-muted px-3 py-1.5 text-xs font-mono text-foreground truncate">
                  {referralCode.referral_code}
                </div>
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleCopy}>
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </>
            ) : (
              <Link to="/referral-program" className="w-full">
                <Button size="sm" className="w-full h-8 text-xs gap-1.5">
                  Start earning
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
