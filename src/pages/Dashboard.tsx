import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import { useLeads } from "@/hooks/useLeads";
import { useChannels } from "@/hooks/useChannels";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Send,
  Mail,
  Globe,
  Users,
  TrendingUp,
  Bell,
  Building2,
  Target,
} from "lucide-react";
import { format } from "date-fns";

const Dashboard = () => {
  const { profile, isLoading } = useBusinessProfile();
  const { leads } = useLeads();
  const { channels } = useChannels();

  const recentLeads = leads.slice(0, 5);
  const thisWeek = leads.filter((l) => {
    const d = new Date(l.message_date);
    const now = new Date();
    return now.getTime() - d.getTime() < 7 * 24 * 60 * 60 * 1000;
  }).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Setup prompt */}
        {!isLoading && !profile && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-center gap-4 py-4">
              <Building2 className="h-8 w-8 text-primary" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Complete your business profile</p>
                <p className="text-sm text-muted-foreground">Set up your profile to start discovering leads</p>
              </div>
              <Link to="/business-profile">
                <Button size="sm">Set up</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{leads.length}</p>
                <p className="text-xs text-muted-foreground">Total Leads</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                <TrendingUp className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{thisWeek}</p>
                <p className="text-xs text-muted-foreground">This Week</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <MessageSquare className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{channels.length}</p>
                <p className="text-xs text-muted-foreground">Channels</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                <Bell className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{recentLeads.length}</p>
                <p className="text-xs text-muted-foreground">Recent</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Connected Channels */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Connected Channels</CardTitle>
              <CardDescription>Manage your communication channels</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {channels.length === 0 ? (
                <div className="flex flex-col items-center py-4 text-center">
                  <p className="text-sm text-muted-foreground mb-2">No channels connected</p>
                  <Link to="/channels"><Button size="sm" variant="outline">Add Channel</Button></Link>
                </div>
              ) : (
                channels.slice(0, 5).map((ch) => (
                  <div key={ch.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground">{ch.channel_name}</span>
                    </div>
                    <Badge variant={ch.is_enabled ? "default" : "secondary"}>
                      {ch.is_enabled ? "Active" : "Disabled"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Recent Leads */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Leads</CardTitle>
              <CardDescription>Latest discovered leads</CardDescription>
            </CardHeader>
            <CardContent>
              {recentLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Target className="mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No leads yet</p>
                  <p className="text-xs text-muted-foreground">Add keywords to start discovering leads</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentLeads.map((l) => (
                    <div key={l.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-muted-foreground">{l.source_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(l.message_date), "MMM d")}
                        </span>
                      </div>
                      <p className="text-sm text-foreground line-clamp-1">{l.message_content}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
