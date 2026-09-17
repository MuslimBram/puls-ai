import { useMemo, useState } from "react";

const actions = ["approve", "unapprove", "mark_spam", "move_trash"] as const;

type Visitor = {
  id: string;
  country: string;
  device: string;
  browser: string;
  source: string;
  duration: string;
  risk: number;
  state: "allowed" | "reviewing" | "blocked";
};

const demoVisitors: Visitor[] = [
  { id: "visitor-1", country: "AL", device: "Desktop", browser: "Chrome", source: "Google", duration: "03:42", risk: 12, state: "allowed" },
  { id: "visitor-2", country: "DE", device: "Mobile", browser: "Safari", source: "Instagram", duration: "01:18", risk: 34, state: "allowed" },
  { id: "visitor-3", country: "US", device: "Bot/Unknown", browser: "Headless", source: "Direct", duration: "00:09", risk: 91, state: "reviewing" },
];

export default function LeahSecurity() {
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const count = useMemo(() => demoVisitors.length, []);

  const bulk = (action: (typeof actions)[number]) => {
    if (!selected.length) return;
    const label = action === "mark_spam" ? "Mark as spam" : action === "move_trash" ? "Move to Trash" : action === "unapprove" ? "Unapprove" : "Approve";
    setNotice(`${label}: ${selected.length} visitor/event(s) queued for permission-checked moderation.`);
  };

  return (
    <section className="mx-auto max-w-7xl space-y-6 p-6">
      {notice && <div className="rounded-lg border p-3 text-sm">{notice}</div>}
      <header>
        <h1 className="text-2xl font-semibold">Pulse AI Security & Visitor Intelligence</h1>
        <p className="text-sm text-muted-foreground">Live visitor sessions, behavior signals and AI-assisted moderation for authorized Owner/Admin users.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border p-4"><span className="text-sm text-muted-foreground">Online now</span><div className="text-2xl font-bold">{count}</div></div>
        <div className="rounded-xl border p-4"><span className="text-sm text-muted-foreground">Reviewing</span><div className="text-2xl font-bold">1</div></div>
        <div className="rounded-xl border p-4"><span className="text-sm text-muted-foreground">High risk</span><div className="text-2xl font-bold">1</div></div>
        <div className="rounded-xl border p-4"><span className="text-sm text-muted-foreground">AI moderation</span><div className="text-2xl font-bold">Active</div></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => <button key={action} onClick={() => bulk(action)} disabled={!selected.length} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{action === "mark_spam" ? "Mark as spam" : action === "move_trash" ? "Move to Trash" : action === "unapprove" ? "Unapprove" : "Approve"}</button>)}
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3"></th><th className="p-3">Country</th><th className="p-3">Device / Browser</th><th className="p-3">Source</th><th className="p-3">Time</th><th className="p-3">AI Risk</th><th className="p-3">State</th></tr></thead>
          <tbody>{demoVisitors.map((v) => <tr key={v.id} className="border-b last:border-0"><td className="p-3"><input type="checkbox" checked={selected.includes(v.id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, v.id] : s.filter((id) => id !== v.id))} /></td><td className="p-3">{v.country}</td><td className="p-3">{v.device} / {v.browser}</td><td className="p-3">{v.source}</td><td className="p-3">{v.duration}</td><td className="p-3">{v.risk}/100</td><td className="p-3">{v.state === "reviewing" ? "Verifying" : v.state}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="rounded-xl border p-4 text-sm">High-risk activity is held temporarily for verification and must generate an Owner/Admin alert. The server must remain authoritative for risk scoring, permissions, blocking and audit history.</div>
    </section>
  );
}
