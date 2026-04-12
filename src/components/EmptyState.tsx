import { LucideIcon, BarChart3, Inbox, FileText, MessageSquare } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState = ({ icon: Icon = BarChart3, title, description, action }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="rounded-full bg-muted p-4 mb-4">
      <Icon className="h-8 w-8 text-muted-foreground" />
    </div>
    <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
    <p className="text-sm text-muted-foreground max-w-md mb-4">{description}</p>
    {action && (
      <button
        onClick={action.onClick}
        className="text-sm font-medium text-primary hover:underline"
      >
        {action.label} →
      </button>
    )}
  </div>
);

export const AnalyticsEmptyState = () => (
  <EmptyState
    icon={BarChart3}
    title="No Analytics Data Yet"
    description="Analytics will populate automatically as leads, conversations, and deals flow through your pipeline. Start by connecting a channel or adding your first lead."
  />
);

export const InboxEmptyState = () => (
  <EmptyState
    icon={Inbox}
    title="No Conversations Yet"
    description="Your inbox will fill up once messages start arriving from connected channels like Telegram, Instagram, or Email. Connect a channel to get started."
  />
);

export const ContentEmptyState = () => (
  <EmptyState
    icon={FileText}
    title="No Content Created Yet"
    description="Use the AI content generator to create posts, articles, and marketing materials. Your content calendar will show scheduled and published content here."
  />
);

export const HelpdeskEmptyState = () => (
  <EmptyState
    icon={MessageSquare}
    title="No Support Tickets"
    description="Tickets will appear here when customers reach out through your connected channels. The helpdesk automatically organizes conversations with SLA tracking and agent assignment."
  />
);
