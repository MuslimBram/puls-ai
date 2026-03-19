import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useTelephony } from "@/hooks/useTelephony";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import { Plus, Users, Clock, Settings2 } from "lucide-react";

export const CallQueueManager = () => {
  const { queues, activeCalls } = useTelephony();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newQueue, setNewQueue] = useState({
    name: "",
    strategy: "round_robin",
    max_wait_seconds: 300,
    wrap_up_seconds: 30,
  });

  const handleAddQueue = async () => {
    if (!newQueue.name.trim() || !workspace) return;
    const { error } = await supabase.from("call_queues").insert({
      workspace_id: workspace.id,
      name: newQueue.name,
      strategy: newQueue.strategy,
      max_wait_seconds: newQueue.max_wait_seconds,
      wrap_up_seconds: newQueue.wrap_up_seconds,
    } as any);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Queue created");
    qc.invalidateQueries({ queryKey: ["call-queues"] });
    setShowAdd(false);
    setNewQueue({ name: "", strategy: "round_robin", max_wait_seconds: 300, wrap_up_seconds: 30 });
  };

  const getQueueCallCount = (queueId: string) =>
    activeCalls.filter((c) => c.queue_id === queueId && c.status === "queued").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Settings2 className="h-4 w-4" /> Call Queues
        </CardTitle>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Add Queue
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Call Queue</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Queue Name</Label>
                <Input value={newQueue.name} onChange={(e) => setNewQueue({ ...newQueue, name: e.target.value })} placeholder="e.g. Sales, Support" />
              </div>
              <div>
                <Label>Routing Strategy</Label>
                <Select value={newQueue.strategy} onValueChange={(v) => setNewQueue({ ...newQueue, strategy: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="round_robin">Round Robin</SelectItem>
                    <SelectItem value="longest_idle">Longest Idle</SelectItem>
                    <SelectItem value="skills_based">Skills Based</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Max Wait (sec)</Label>
                  <Input type="number" value={newQueue.max_wait_seconds} onChange={(e) => setNewQueue({ ...newQueue, max_wait_seconds: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Wrap Up (sec)</Label>
                  <Input type="number" value={newQueue.wrap_up_seconds} onChange={(e) => setNewQueue({ ...newQueue, wrap_up_seconds: Number(e.target.value) })} />
                </div>
              </div>
              <Button onClick={handleAddQueue} className="w-full">Create Queue</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-2">
        {queues.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No queues configured. Create one to start routing calls.</p>
        ) : (
          queues.map((q) => {
            const waiting = getQueueCallCount(q.id);
            return (
              <div key={q.id} className="flex items-center justify-between rounded-md border border-border p-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{q.name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{q.strategy.replace("_", " ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  {waiting > 0 && (
                    <Badge variant="outline" className="text-[10px] border-yellow-500/50 text-yellow-600">
                      <Clock className="h-3 w-3 mr-0.5" /> {waiting}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px]">
                    <Users className="h-3 w-3 mr-0.5" /> 0
                  </Badge>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};
