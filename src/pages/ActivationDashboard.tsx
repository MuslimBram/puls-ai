import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActivationStatus, ModuleActivation, ModuleStatus } from "@/hooks/useActivationStatus";
import { useUnifiedConnections } from "@/hooks/useUnifiedConnections";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, XCircle, AlertTriangle, Settings, Zap, Activity,
  TestTube, Eye, Wrench, Send, ChevronRight, Flame, AlertOctagon,
  Inbox, CreditCard, Users, MessageSquare, Bot, Phone, Brain, Workflow,
} from "lucide-react";
import { format } from "date-fns";

const statusConfig: Record<ModuleStatus, { label: string; color: string; icon: any }> = {
  connected: { label: "Connected", color: "bg-primary/15 text-primary border-primary/30", icon: CheckCircle2 },
  missing: { label: "Missing", color: "bg-destructive/15 text-destructive border-destructive/30", icon: XCircle },
  error: { label: "Error", color: "bg-destructive/15 text-destructive border-destructive/30", icon: XCircle },
  needs_config: { label: "Needs Config", color: "bg-accent text-accent-foreground border-border", icon: Settings },
  connected_no_activity: { label: "No Activity", color: "bg-accent text-accent-foreground border-border", icon: AlertTriangle },
  not_tested: { label: "Not Tested", color: "bg-muted text-muted-foreground border-border", icon: TestTube },
};

const moduleIcons: Record<string, any> = {
  inbox: Inbox, billing: CreditCard, crm: Users, threads: MessageSquare,
  telegram: Bot, whatsapp: Phone, openai: Brain, n8n: Workflow,
};

const ActivationDashboard = () => {
  const { data, isLoading } = useActivationStatus();
  const { testConnection } = useUnifiedConnections();
  const navigate = useNavigate();
  const [wizardModule, setWizardModule] = useState<string | null>(null);

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Integration Activation</h1>
        <p className="text-muted-foreground">Loading activation status…</p>
      </div>
    );
  }

  const { modules, globalScore, blockers, warnings } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integration Activation Dashboard</h1>
        <p className="text-muted-foreground">Real-time health & readiness of all platform modules</p>
      </div>

      {/* Global Score + Priority Engine */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Global Activation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold text-foreground">{globalScore}%</div>
              <div className="flex-1">
                <Progress value={globalScore} className="h-3" />
                <p className="text-xs text-muted-foreground mt-1">
                  {modules.filter((m) => m.status === "connected").length}/{modules.length} modules active
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {blockers.length > 0 && (
          <Card className="border-destructive/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-destructive" /> Blockers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {blockers.map((b) => (
                <div key={b.key} className="flex items-center gap-2 text-sm">
                  <AlertOctagon className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <span className="text-foreground font-medium">{b.label}</span>
                  <span className="text-muted-foreground truncate text-xs">— {b.fixSuggestion}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {warnings.length > 0 && (
          <Card className="border-accent">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" /> Warnings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {warnings.map((w) => (
                <div key={w.key} className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-foreground font-medium">{w.label}</span>
                  <span className="text-muted-foreground truncate text-xs">— {w.fixSuggestion}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Module Tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Modules</TabsTrigger>
          <TabsTrigger value="core">Core</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
        </TabsList>

        {["all", "core", "channels", "ai", "automation"].map((tab) => (
          <TabsContent key={tab} value={tab} className="space-y-3">
            {modules
              .filter((m) => tab === "all" || m.category === tab)
              .map((mod) => (
                <ModuleCard
                  key={mod.key}
                  module={mod}
                  onTest={() => {/* test logic */}}
                  onWizard={() => setWizardModule(mod.key)}
                  onNavigate={navigate}
                />
              ))}
          </TabsContent>
        ))}
      </Tabs>

      {/* Activation Wizard */}
      {wizardModule && (
        <ActivationWizard
          moduleKey={wizardModule}
          module={modules.find((m) => m.key === wizardModule)!}
          onClose={() => setWizardModule(null)}
          onNavigate={navigate}
        />
      )}
    </div>
  );
};

const ModuleCard = ({
  module,
  onTest,
  onWizard,
  onNavigate,
}: {
  module: ModuleActivation;
  onTest: () => void;
  onWizard: () => void;
  onNavigate: (path: string) => void;
}) => {
  const cfg = statusConfig[module.status];
  const Icon = moduleIcons[module.key] || Zap;
  const StatusIcon = cfg.icon;

  const actionMap: Record<string, { label: string; path: string }> = {
    inbox: { label: "Go to Inbox", path: "/inbox" },
    billing: { label: "Manage Billing", path: "/subscription" },
    crm: { label: "Go to CRM", path: "/crm" },
    threads: { label: "View Helpdesk", path: "/helpdesk" },
    telegram: { label: "Configure", path: "/connections" },
    whatsapp: { label: "Configure", path: "/connections" },
    openai: { label: "Configure", path: "/admin/integration-hub" },
    n8n: { label: "Configure", path: "/admin/integration-hub" },
  };

  const nav = actionMap[module.key];

  return (
    <Card>
      <CardContent className="py-4 px-5">
        <div className="flex items-center gap-4">
          {/* Icon + Info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{module.label}</span>
                <Badge variant="outline" className={`text-xs ${cfg.color}`}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {cfg.label}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-1">
                {module.lastTest && (
                  <span className="text-xs text-muted-foreground">
                    Tested: {format(new Date(module.lastTest), "dd/MM HH:mm")}
                  </span>
                )}
                {module.lastActivity && (
                  <span className="text-xs text-muted-foreground">
                    Last activity: {format(new Date(module.lastActivity), "dd/MM HH:mm")}
                  </span>
                )}
                {module.errorMessage && (
                  <span className="text-xs text-destructive truncate max-w-[200px]">
                    {module.errorMessage}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Config Progress */}
          <div className="w-24 shrink-0 hidden sm:block">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Config</span>
              <span>{module.configCompletePct}%</span>
            </div>
            <Progress value={module.configCompletePct} className="h-1.5" />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {module.status !== "connected" && (
              <Button size="sm" variant="outline" onClick={onWizard}>
                <Wrench className="h-3.5 w-3.5 mr-1" /> Activate
              </Button>
            )}
            {nav && (
              <Button size="sm" variant="ghost" onClick={() => onNavigate(nav.path)}>
                {nav.label} <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
          </div>
        </div>

        {/* Fix Suggestion */}
        {module.fixSuggestion && module.status !== "connected" && (
          <div className="mt-3 p-2.5 rounded-md bg-muted/50 border border-border text-sm flex items-start gap-2">
            <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span className="text-muted-foreground">{module.fixSuggestion}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const WIZARD_STEPS = [
  { key: "connect", label: "Connect Channel", description: "Link provider credentials" },
  { key: "validate", label: "Validate Credentials", description: "Verify authentication works" },
  { key: "test_message", label: "Send Test Message", description: "Send a test event/webhook" },
  { key: "verify_db", label: "Verify Database", description: "Check inbox_messages & threads created" },
  { key: "ai_reply", label: "Enable AI Auto-Reply", description: "Test AI-powered auto-reply" },
];

const ActivationWizard = ({
  moduleKey,
  module,
  onClose,
  onNavigate,
}: {
  moduleKey: string;
  module: ModuleActivation;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) => {
  const [step, setStep] = useState(0);

  const currentStep = WIZARD_STEPS[step];

  const stepStatus = (idx: number) => {
    if (module.status === "connected" && idx <= 3) return "done";
    if (idx < step) return "done";
    if (idx === step) return "current";
    return "pending";
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Activation Wizard — {module.label}</CardTitle>
            <CardDescription>Step-by-step activation flow</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step indicators */}
        <div className="flex items-center gap-1">
          {WIZARD_STEPS.map((s, i) => {
            const st = stepStatus(i);
            return (
              <div key={s.key} className="flex items-center gap-1 flex-1">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                    st === "done"
                      ? "bg-emerald-500 text-white"
                      : st === "current"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {st === "done" ? "✓" : i + 1}
                </div>
                {i < WIZARD_STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 ${st === "done" ? "bg-emerald-500" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Current step content */}
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <h3 className="font-medium text-foreground">{currentStep.label}</h3>
            <p className="text-sm text-muted-foreground mt-1">{currentStep.description}</p>

            <div className="mt-4 space-y-2">
              {step === 0 && (
                <Button size="sm" onClick={() => onNavigate("/connections")}>
                  <Settings className="h-4 w-4 mr-1" /> Go to Connections Hub
                </Button>
              )}
              {step === 1 && (
                <Button size="sm" onClick={() => setStep(2)}>
                  <TestTube className="h-4 w-4 mr-1" /> Test Credentials
                </Button>
              )}
              {step === 2 && (
                <Button size="sm" onClick={() => setStep(3)}>
                  <Send className="h-4 w-4 mr-1" /> Send Test Event
                </Button>
              )}
              {step === 3 && (
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    <span>inbox_messages created</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    <span>conversation_threads created</span>
                  </div>
                </div>
              )}
              {step === 4 && (
                <Button size="sm" onClick={() => onNavigate("/knowledge-base")}>
                  <Brain className="h-4 w-4 mr-1" /> Configure AI Auto-Reply
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button variant="outline" size="sm" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Previous
          </Button>
          <Button
            size="sm"
            disabled={step === WIZARD_STEPS.length - 1}
            onClick={() => setStep(step + 1)}
          >
            Next Step <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ActivationDashboard;
