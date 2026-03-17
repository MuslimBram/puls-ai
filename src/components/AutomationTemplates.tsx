import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  useAutomationWorkflows,
  TRIGGER_TYPES,
  ACTION_TYPES,
  type AutomationAction,
} from "@/hooks/useAutomations";
import {
  Zap, Clock, UserPlus, Mail, MessageSquare, Target, ArrowRight,
  RotateCcw, Megaphone, Bot, Bell, Tag, Send, CheckSquare, Globe,
  Loader2, BookTemplate,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  trigger_type: string;
  actions: AutomationAction[];
  icon: string;
  popular?: boolean;
}

const TEMPLATES: AutomationTemplate[] = [
  {
    id: "follow-up-no-reply",
    name: "Follow-up After No Reply",
    description: "Automatically send a follow-up message when a lead hasn't responded within 24 hours.",
    category: "Lead Nurturing",
    trigger_type: "inactivity",
    icon: "Clock",
    popular: true,
    actions: [
      { id: "1", type: "send_message", config: { message: "Hi {{name}}, just checking in — did you get a chance to look at our offer?" }, delay_minutes: 1440 },
      { id: "2", type: "notify_internal", config: { message: "Lead {{name}} hasn't replied in 24h — follow-up sent" }, delay_minutes: 0 },
    ],
  },
  {
    id: "new-lead-welcome",
    name: "New Lead Welcome Flow",
    description: "Greet new leads instantly, assign an owner, and tag them for tracking.",
    category: "Lead Nurturing",
    trigger_type: "new_lead",
    icon: "UserPlus",
    popular: true,
    actions: [
      { id: "1", type: "send_message", config: { message: "Welcome {{name}}! Thanks for your interest. A team member will reach out shortly." }, delay_minutes: 0 },
      { id: "2", type: "assign_owner", config: { strategy: "round_robin" }, delay_minutes: 0 },
      { id: "3", type: "update_tags", config: { tags: ["new-lead", "auto-welcomed"] }, delay_minutes: 0 },
    ],
  },
  {
    id: "abandoned-deal-recovery",
    name: "Abandoned Deal Recovery",
    description: "Re-engage deals stuck in pipeline for more than 7 days with a personalized nudge.",
    category: "Sales Recovery",
    trigger_type: "inactivity",
    icon: "RotateCcw",
    popular: true,
    actions: [
      { id: "1", type: "send_message", config: { message: "Hi {{name}}, we noticed your proposal is still pending. Can we help answer any questions?" }, delay_minutes: 10080 },
      { id: "2", type: "create_task", config: { title: "Follow up on stalled deal: {{deal_name}}" }, delay_minutes: 0 },
      { id: "3", type: "notify_email", config: { subject: "Deal Recovery Alert" }, delay_minutes: 0 },
    ],
  },
  {
    id: "broadcast-funnel",
    name: "Broadcast Funnel Template",
    description: "Multi-step broadcast campaign: awareness → interest → conversion with timed delays.",
    category: "Campaigns",
    trigger_type: "campaign_response",
    icon: "Megaphone",
    actions: [
      { id: "1", type: "send_message", config: { message: "{{campaign_intro_message}}" }, delay_minutes: 0 },
      { id: "2", type: "send_message", config: { message: "{{campaign_value_prop}}" }, delay_minutes: 4320 },
      { id: "3", type: "send_message", config: { message: "{{campaign_cta}}" }, delay_minutes: 8640 },
      { id: "4", type: "update_tags", config: { tags: ["campaign-funnel-complete"] }, delay_minutes: 0 },
    ],
  },
  {
    id: "reactivation-campaign",
    name: "Reactivation Campaign",
    description: "Win back inactive contacts who haven't engaged in 30+ days.",
    category: "Re-engagement",
    trigger_type: "inactivity",
    icon: "RotateCcw",
    actions: [
      { id: "1", type: "send_message", config: { message: "We miss you, {{name}}! Here's a special offer to come back." }, delay_minutes: 43200 },
      { id: "2", type: "notify_internal", config: { message: "Reactivation message sent to {{name}}" }, delay_minutes: 0 },
      { id: "3", type: "update_tags", config: { tags: ["reactivation-sent"] }, delay_minutes: 0 },
    ],
  },
  {
    id: "chatbot-handoff",
    name: "Chatbot → Human Handoff",
    description: "When a chatbot flow completes, assign the conversation to a human agent and notify.",
    category: "Support",
    trigger_type: "chatbot_completed",
    icon: "Bot",
    actions: [
      { id: "1", type: "assign_owner", config: { strategy: "load_based" }, delay_minutes: 0 },
      { id: "2", type: "notify_internal", config: { message: "Chatbot completed — conversation assigned to agent" }, delay_minutes: 0 },
      { id: "3", type: "create_task", config: { title: "Review chatbot handoff: {{contact_name}}" }, delay_minutes: 0 },
    ],
  },
  {
    id: "pipeline-stage-alert",
    name: "Pipeline Stage Alert",
    description: "Get notified and update tags whenever a deal moves to a new pipeline stage.",
    category: "Sales",
    trigger_type: "pipeline_stage_change",
    icon: "ArrowRight",
    actions: [
      { id: "1", type: "notify_internal", config: { message: "Deal {{deal_name}} moved to {{new_stage}}" }, delay_minutes: 0 },
      { id: "2", type: "notify_email", config: { subject: "Pipeline Update: {{deal_name}}" }, delay_minutes: 0 },
      { id: "3", type: "update_tags", config: { tags: ["stage-{{new_stage}}"] }, delay_minutes: 0 },
    ],
  },
  {
    id: "new-message-auto-reply",
    name: "Auto-Reply to New Messages",
    description: "Instantly acknowledge new inbox messages and create a task for follow-up.",
    category: "Support",
    trigger_type: "new_message",
    icon: "MessageSquare",
    actions: [
      { id: "1", type: "send_message", config: { message: "Thanks for reaching out! We've received your message and will respond shortly." }, delay_minutes: 0 },
      { id: "2", type: "create_task", config: { title: "Reply to message from {{sender_name}}" }, delay_minutes: 0 },
    ],
  },
];

const CATEGORIES = [...new Set(TEMPLATES.map((t) => t.category))];

const iconMap: Record<string, React.ElementType> = {
  Clock, UserPlus, RotateCcw, Megaphone, Bot, ArrowRight, MessageSquare, Target,
};

export const AutomationTemplates = () => {
  const { createWorkflow } = useAutomationWorkflows();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [previewTemplate, setPreviewTemplate] = useState<AutomationTemplate | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  const filtered = selectedCategory === "all"
    ? TEMPLATES
    : TEMPLATES.filter((t) => t.category === selectedCategory);

  const handleInstall = async (template: AutomationTemplate) => {
    setInstalling(template.id);
    try {
      await createWorkflow.mutateAsync({
        name: template.name,
        description: template.description,
        trigger_type: template.trigger_type,
        actions: template.actions as any,
        is_active: false,
      });
      toast.success(`"${template.name}" installed! Enable it in your workflows.`);
      setPreviewTemplate(null);
    } catch {
      // error handled by hook
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={selectedCategory === "all" ? "default" : "outline"}
          onClick={() => setSelectedCategory("all")}
        >
          All Templates
        </Button>
        {CATEGORIES.map((cat) => (
          <Button
            key={cat}
            size="sm"
            variant={selectedCategory === cat ? "default" : "outline"}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </Button>
        ))}
      </div>

      {/* Template Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((template) => {
          const Icon = iconMap[template.icon] || Zap;
          const triggerLabel = TRIGGER_TYPES.find((t) => t.value === template.trigger_type)?.label || template.trigger_type;

          return (
            <Card
              key={template.id}
              className="cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => setPreviewTemplate(template)}
            >
              <CardContent className="pt-5 pb-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  {template.popular && (
                    <Badge variant="secondary" className="text-xs">Popular</Badge>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">{template.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{template.description}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs">{triggerLabel}</Badge>
                  <ArrowRight className="h-3 w-3" />
                  <span>{template.actions.length} actions</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Preview / Install Dialog */}
      {previewTemplate && (
        <Dialog open onOpenChange={(v) => !v && setPreviewTemplate(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookTemplate className="h-5 w-5 text-primary" />
                {previewTemplate.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{previewTemplate.description}</p>

              <div>
                <p className="text-xs font-medium text-foreground mb-2">Trigger</p>
                <Badge variant="outline">
                  {TRIGGER_TYPES.find((t) => t.value === previewTemplate.trigger_type)?.label || previewTemplate.trigger_type}
                </Badge>
              </div>

              <div>
                <p className="text-xs font-medium text-foreground mb-2">Actions ({previewTemplate.actions.length})</p>
                <div className="space-y-2">
                  {previewTemplate.actions.map((action, idx) => {
                    const actionInfo = ACTION_TYPES.find((a) => a.value === action.type);
                    return (
                      <div key={action.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
                        <span className="text-xs font-mono text-muted-foreground w-5">{idx + 1}.</span>
                        <span className="text-sm text-foreground flex-1">{actionInfo?.label || action.type}</span>
                        {action.delay_minutes ? (
                          <Badge variant="secondary" className="text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            {action.delay_minutes >= 1440
                              ? `${Math.round(action.delay_minutes / 1440)}d`
                              : action.delay_minutes >= 60
                              ? `${Math.round(action.delay_minutes / 60)}h`
                              : `${action.delay_minutes}m`}
                          </Badge>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">
                  Installing this template creates a new <strong>inactive</strong> workflow. You can customize triggers, actions, and timing before enabling it.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewTemplate(null)}>Cancel</Button>
              <Button
                onClick={() => handleInstall(previewTemplate)}
                disabled={installing === previewTemplate.id}
              >
                {installing === previewTemplate.id ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Install Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
