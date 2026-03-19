import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTelephonyAnalytics } from "@/hooks/useTelephonyAnalytics";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, CheckCircle } from "lucide-react";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(142 76% 36%)",
  "hsl(38 92% 50%)",
  "hsl(262 83% 58%)",
];

export const TelephonyAnalyticsPanel = () => {
  const { data: metrics, isLoading } = useTelephonyAnalytics(14);

  if (isLoading || !metrics) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}><CardContent className="h-20 animate-pulse bg-muted/30" /></Card>
        ))}
      </div>
    );
  }

  const statCards = [
    { label: "Total Calls", value: metrics.totalCalls, icon: Phone, color: "text-primary" },
    { label: "Inbound", value: metrics.inboundCalls, icon: PhoneIncoming, color: "text-primary" },
    { label: "Outbound", value: metrics.outboundCalls, icon: PhoneOutgoing, color: "text-accent-foreground" },
    { label: "Missed", value: metrics.missedCalls, icon: PhoneMissed, color: "text-destructive" },
    { label: "Completed", value: metrics.completedCalls, icon: CheckCircle, color: "text-green-600" },
    { label: "Avg Duration", value: `${Math.floor(metrics.avgDuration / 60)}m ${metrics.avgDuration % 60}s`, icon: Clock, color: "text-yellow-600" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-2 p-3">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <div>
                <p className="text-lg font-bold text-foreground">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Calls by Day */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Calls by Day</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={metrics.callsByDay}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="inbound" fill="hsl(var(--primary))" name="Inbound" radius={[2, 2, 0, 0]} />
                <Bar dataKey="outbound" fill="hsl(var(--muted-foreground))" name="Outbound" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Call Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.callsByStatus.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={160}>
                  <PieChart>
                    <Pie data={metrics.callsByStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={60} innerRadius={30}>
                      {metrics.callsByStatus.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1">
                  {metrics.callsByStatus.map((s, i) => (
                    <div key={s.status} className="flex items-center gap-2 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground capitalize">{s.status}</span>
                      <span className="font-medium text-foreground">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Callers */}
      {metrics.topCallers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top Callers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {metrics.topCallers.slice(0, 5).map((c) => (
                <div key={c.phone} className="flex items-center justify-between py-1 text-xs">
                  <div>
                    <span className="font-medium text-foreground">{c.name || c.phone}</span>
                    {c.name && <span className="text-muted-foreground ml-2">{c.phone}</span>}
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{c.count} calls</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
