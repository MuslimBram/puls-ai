import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface OpenTasksListProps {
  tasks: any[];
}

export const OpenTasksList = ({ tasks }: OpenTasksListProps) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-lg">Open Tasks</CardTitle>
      <CardDescription>Follow-ups and reminders across all deals.</CardDescription>
    </CardHeader>
    <CardContent>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No open tasks.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task: any) => (
            <div key={task.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{task.title}</p>
                <p className="text-xs text-muted-foreground">{task.deals?.title || "No deal"}</p>
              </div>
              <div className="flex items-center gap-2">
                {task.due_date && (
                  <Badge variant={new Date(task.due_date) < new Date() ? "destructive" : "outline"} className="text-xs">
                    {format(new Date(task.due_date), "MMM d")}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs">{task.priority}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);
