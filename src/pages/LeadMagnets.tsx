import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLeadMagnets } from "@/hooks/useLeadMagnets";
import { FileText, Eye, UserPlus, TrendingUp, Plus } from "lucide-react";
import { useState } from "react";

const LeadMagnets = () => {
  const { magnets, captures, createMagnet, totalCaptures, avgConversion, isLoading } = useLeadMagnets();
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("landing_page");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lead Magnet & Funnel Capture</h1>
          <p className="text-muted-foreground">AI landing pages, popups, quizzes, and lead nurturing funnels.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Card><CardContent className="pt-4 text-center">
            <FileText className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{magnets.length}</p>
            <p className="text-xs text-muted-foreground">Lead Magnets</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <Eye className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{magnets.reduce((s, m) => s + (m.views_count ?? 0), 0)}</p>
            <p className="text-xs text-muted-foreground">Total Views</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <UserPlus className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{totalCaptures}</p>
            <p className="text-xs text-muted-foreground">Leads Captured</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{avgConversion}%</p>
            <p className="text-xs text-muted-foreground">Avg Conversion</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="magnets">
          <TabsList><TabsTrigger value="magnets">Lead Magnets</TabsTrigger><TabsTrigger value="captures">Recent Captures</TabsTrigger></TabsList>

          <TabsContent value="magnets" className="space-y-4">
            <div className="flex gap-2 items-end">
              <Input placeholder="Magnet name..." value={newName} onChange={e => setNewName(e.target.value)} className="max-w-xs" />
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="landing_page">Landing Page</SelectItem>
                  <SelectItem value="popup">Popup</SelectItem>
                  <SelectItem value="quiz">Quiz/Assessment</SelectItem>
                  <SelectItem value="gated_content">Gated Content</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => { if (newName.trim()) { createMagnet.mutate({ name: newName, magnet_type: newType }); setNewName(""); } }}>
                <Plus className="h-4 w-4 mr-1" /> Create
              </Button>
            </div>
            {magnets.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No lead magnets yet.</CardContent></Card>
            ) : magnets.map(m => (
              <Card key={m.id}>
                <CardContent className="py-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.magnet_type} · {m.views_count} views · {m.captures_count} captures</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={m.status === "active" ? "default" : "secondary"}>{m.status}</Badge>
                    <span className="text-sm font-medium text-primary">{Number(m.conversion_rate).toFixed(1)}%</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="captures" className="space-y-3">
            {captures.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No captures yet.</CardContent></Card>
            ) : captures.slice(0, 20).map(c => (
              <Card key={c.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground text-sm">{JSON.stringify(c.contact_data)?.slice(0, 80)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(c.captured_at).toLocaleDateString()}</p>
                  </div>
                  <Badge variant="outline">{c.nurture_status}</Badge>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default LeadMagnets;
