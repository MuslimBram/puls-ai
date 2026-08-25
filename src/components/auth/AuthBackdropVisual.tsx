import { Bot, MessageSquare, Sparkles, Workflow } from "lucide-react";

export function AuthBackdropVisual() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-primary/[0.06] to-background" />
      <div className="absolute left-6 right-6 top-5 flex items-center justify-between rounded-2xl border border-border/50 bg-card/45 px-5 py-3 opacity-80 backdrop-blur-sm sm:left-10 sm:right-10">
        <div className="text-base font-bold text-foreground">Pulse <span className="text-primary">AI</span></div>
        <div className="hidden items-center gap-5 text-xs text-muted-foreground sm:flex">
          <span>Platform</span><span>Lidhjet</span><span>Pricing</span><span>Security</span>
        </div>
      </div>
      <div className="absolute left-[5%] top-[25%] hidden max-w-xs space-y-4 opacity-65 lg:block">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/55 px-3 py-1 text-xs text-primary">
          <Sparkles className="h-3.5 w-3.5" /> The AI Business Operating System
        </div>
        <div className="text-4xl font-bold leading-tight text-foreground/80">Run your business from one connected system.</div>
        <div className="text-sm leading-6 text-muted-foreground">Conversations, customers, follow-ups and AI working together.</div>
      </div>
      <div className="absolute right-[5%] top-[24%] hidden w-72 space-y-3 opacity-60 xl:block">
        {[{ icon: MessageSquare, label: "Unified Inbox" }, { icon: Bot, label: "AI Assistant" }, { icon: Workflow, label: "Automated Follow-up" }].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/55 p-4 backdrop-blur-sm">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary"><Icon className="h-4 w-4" /></span>
            <span className="text-sm font-medium text-foreground/80">{label}</span>
          </div>
        ))}
      </div>
      <div className="absolute -bottom-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute inset-0 bg-background/20 backdrop-blur-[1px]" />
    </div>
  );
}
