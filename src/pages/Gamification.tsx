import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useGamification } from "@/hooks/useGamification";
import { Trophy, Star, Flame, Target, Plus, Medal } from "lucide-react";
import { useState } from "react";

const Gamification = () => {
  const { achievements, progress, createAchievement, isLoading } = useGamification();
  const [newTitle, setNewTitle] = useState("");

  const topPerformer = progress[0];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gamification Growth Engine</h1>
          <p className="text-muted-foreground">Badges, streaks, missions, and engagement rewards.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Card><CardContent className="pt-4 text-center">
            <Trophy className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{achievements.length}</p>
            <p className="text-xs text-muted-foreground">Achievements</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <Flame className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{topPerformer?.current_streak ?? 0}</p>
            <p className="text-xs text-muted-foreground">Top Streak</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <Star className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{topPerformer?.total_points ?? 0}</p>
            <p className="text-xs text-muted-foreground">Top Points</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <Target className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{progress.reduce((s, p) => s + (p.missions_completed ?? 0), 0)}</p>
            <p className="text-xs text-muted-foreground">Missions Done</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="achievements">
          <TabsList><TabsTrigger value="achievements">Achievements</TabsTrigger><TabsTrigger value="leaderboard">Leaderboard</TabsTrigger></TabsList>

          <TabsContent value="achievements" className="space-y-4">
            <div className="flex gap-2">
              <Input placeholder="New achievement title..." value={newTitle} onChange={e => setNewTitle(e.target.value)} className="max-w-xs" />
              <Button size="sm" onClick={() => { if (newTitle.trim()) { createAchievement.mutate({ title: newTitle, achievement_type: "milestone", points: 100 }); setNewTitle(""); } }}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
            {achievements.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No achievements configured yet.</CardContent></Card>
            ) : achievements.map(a => (
              <Card key={a.id}>
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Medal className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.description || a.achievement_type}</p>
                    </div>
                  </div>
                  <Badge variant="secondary">{a.points} pts</Badge>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="leaderboard" className="space-y-3">
            {progress.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No progress tracked yet.</CardContent></Card>
            ) : progress.map((p, i) => (
              <Card key={p.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-foreground">#{i + 1} · Level {p.level}</span>
                    <span className="text-sm text-primary font-bold">{p.total_points} pts</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>🔥 {p.current_streak} day streak</span>
                    <span>🏅 {p.missions_completed} missions</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Gamification;
