import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useWorkforce, AgentShift } from "@/hooks/useWorkforce";
import { useSupervisorMonitor } from "@/hooks/useSupervisorMonitor";
import { Plus, Calendar, Clock, User, Trash2 } from "lucide-react";
import { format, parseISO, isToday, isFuture } from "date-fns";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-500/10 text-blue-600",
  active: "bg-green-500/10 text-green-600",
  completed: "bg-muted text-muted-foreground",
  absent: "bg-destructive/10 text-destructive",
};

export const WorkforcePanel = () => {
  const { shifts, isLoading, createShift, updateShift, deleteShift } = useWorkforce();
  const { agents } = useSupervisorMonitor();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    agentUserId: "",
    shiftDate: format(new Date(), "yyyy-MM-dd"),
    startTime: "09:00",
    endTime: "17:00",
    breakMinutes: "30",
  });

  const handleCreate = () => {
    if (!form.agentUserId || !form.shiftDate) return;
    createShift.mutate({
      agentUserId: form.agentUserId,
      shiftDate: form.shiftDate,
      startTime: form.startTime,
      endTime: form.endTime,
      breakMinutes: parseInt(form.breakMinutes) || 0,
    });
    setShowCreate(false);
  };

  const todayShifts = shifts.filter((s) => isToday(parseISO(s.shift_date)));
  const upcomingShifts = shifts.filter((s) => isFuture(parseISO(s.shift_date)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Workforce Scheduling</h3>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Add Shift
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule Shift</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Agent</Label>
                <Select value={form.agentUserId} onValueChange={(v) => setForm((f) => ({ ...f, agentUserId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select agent..." /></SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.user_id} value={a.user_id} className="text-xs">
                        {a.sip_extension || a.user_id.slice(0, 8)}
                      </SelectItem>
                    ))}
                    {agents.length === 0 && (
                      <SelectItem value="__none" disabled className="text-xs">No agents available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Date</Label><Input type="date" value={form.shiftDate} onChange={(e) => setForm((f) => ({ ...f, shiftDate: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Start</Label><Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} /></div>
                <div><Label>End</Label><Input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} /></div>
              </div>
              <div><Label>Break (min)</Label><Input type="number" value={form.breakMinutes} onChange={(e) => setForm((f) => ({ ...f, breakMinutes: e.target.value }))} /></div>
              <Button onClick={handleCreate} className="w-full">Schedule</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Today's Shifts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Today's Shifts ({todayShifts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todayShifts.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No shifts scheduled for today.</p>
          ) : (
            <div className="space-y-2">
              {todayShifts.map((shift) => (
                <ShiftRow key={shift.id} shift={shift} onUpdate={updateShift.mutate} onDelete={deleteShift.mutate} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming */}
      {upcomingShifts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Upcoming ({upcomingShifts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcomingShifts.slice(0, 10).map((shift) => (
                <ShiftRow key={shift.id} shift={shift} onUpdate={updateShift.mutate} onDelete={deleteShift.mutate} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const ShiftRow = ({ shift, onUpdate, onDelete }: {
  shift: AgentShift;
  onUpdate: (params: { id: string; status?: string }) => void;
  onDelete: (id: string) => void;
}) => (
  <div className="flex items-center gap-2 rounded-md border border-border p-2">
    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-foreground truncate">{shift.agent_user_id.slice(0, 8)}</p>
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <Clock className="h-2.5 w-2.5" />
        {shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}
        {shift.break_minutes > 0 && <span>· {shift.break_minutes}m break</span>}
      </p>
    </div>
    <p className="text-[10px] text-muted-foreground">{format(parseISO(shift.shift_date), "MMM d")}</p>
    <Select value={shift.status} onValueChange={(s) => onUpdate({ id: shift.id, status: s })}>
      <SelectTrigger className={cn("h-6 w-24 text-[10px]", STATUS_COLORS[shift.status])}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="scheduled" className="text-xs">Scheduled</SelectItem>
        <SelectItem value="active" className="text-xs">Active</SelectItem>
        <SelectItem value="completed" className="text-xs">Completed</SelectItem>
        <SelectItem value="absent" className="text-xs">Absent</SelectItem>
      </SelectContent>
    </Select>
    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0" onClick={() => onDelete(shift.id)}>
      <Trash2 className="h-3 w-3" />
    </Button>
  </div>
);
