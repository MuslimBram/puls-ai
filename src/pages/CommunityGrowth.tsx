import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useCommunityGrowth } from "@/hooks/useCommunityGrowth";
import { Users, Trophy, Star, TrendingUp, Plus, MessageSquare } from "lucide-react";
import { useState } from "react";

const CommunityGrowth = () => {
  const { groups, members, analytics, createGroup, isLoading } = useCommunityGrowth();
  const [newName, setNewName] = useState("");

  const latestAnalytics = analytics[0];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Community Growth Engine</h1>
          <p className="text-muted-foreground">Build and manage customer communities, loyalty programs, and engagement.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Card><CardContent className="pt-4 text-center">
            <Users className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{latestAnalytics?.total_members ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total Members</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{latestAnalytics?.active_members ?? 0}</p>
            <p className="text-xs text-muted-foreground">Active Members</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <Star className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{latestAnalytics?.ambassador_count ?? 0}</p>
            <p className="text-xs text-muted-foreground">Ambassadors</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <Trophy className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{Number(latestAnalytics?.engagement_rate ?? 0).toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">Engagement Rate</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="groups">
          <TabsList><TabsTrigger value="groups">Groups</TabsTrigger><TabsTrigger value="leaderboard">Leaderboard</TabsTrigger><TabsTrigger value="analytics">Analytics</TabsTrigger></TabsList>

          <TabsContent value="groups" className="space-y-4">
            <div className="flex gap-2">
              <Input placeholder="New group name..." value={newName} onChange={e => setNewName(e.target.value)} className="max-w-xs" />
              <Button size="sm" onClick={() => { if (newName.trim()) { createGroup.mutate({ name: newName }); setNewName(""); } }} disabled={createGroup.isPending}>
                <Plus className="h-4 w-4 mr-1" /> Create Group
              </Button>
            </div>
            {groups.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No community groups yet. Create your first one above.</CardContent></Card>
            ) : groups.map(g => (
              <Card key={g.id}>
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">{g.name}</p>
                      <p className="text-xs text-muted-foreground">{g.description || g.group_type} · {g.member_count} members</p>
                    </div>
                  </div>
                  <Badge variant={g.is_active ? "default" : "secondary"}>{g.is_active ? "Active" : "Inactive"}</Badge>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="leaderboard" className="space-y-3">
            {members.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No community members yet.</CardContent></Card>
            ) : members.slice(0, 10).map((m, i) => (
              <Card key={m.id}>
                <CardContent className="py-3 flex items-center gap-3">
                  <span className="text-lg font-bold text-primary w-8 text-center">#{i + 1}</span>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{m.contact_name || m.contact_identifier}</p>
                    <p className="text-xs text-muted-foreground">{m.role}</p>
                  </div>
                  <Badge variant="secondary">{m.points} pts</Badge>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="analytics">
            <div className="grid gap-4 sm:grid-cols-2">
              {analytics.slice(0, 6).map(a => (
                <Card key={a.id}>
                  <CardContent className="py-4">
                    <p className="text-sm font-medium text-foreground">{a.metric_date}</p>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                      <div><p className="text-lg font-bold">{a.new_members}</p><p className="text-xs text-muted-foreground">New</p></div>
                      <div><p className="text-lg font-bold">{a.active_members}</p><p className="text-xs text-muted-foreground">Active</p></div>
                      <div><p className="text-lg font-bold">{Number(a.engagement_rate).toFixed(1)}%</p><p className="text-xs text-muted-foreground">Engagement</p></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default CommunityGrowth;
