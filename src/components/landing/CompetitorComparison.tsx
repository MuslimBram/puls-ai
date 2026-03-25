import { Badge } from "@/components/ui/badge";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

type CellStatus = "yes" | "partial" | "no" | "text";

interface ComparisonRow {
  category: string;
  crisp: { status: CellStatus; text: string };
  respondio: { status: CellStatus; text: string };
  hubspot: { status: CellStatus; text: string };
  pulse: { status: CellStatus; text: string };
}

const ROWS: ComparisonRow[] = [
  {
    category: "Fokus Kryesor",
    crisp: { status: "text", text: "Customer support chat" },
    respondio: { status: "text", text: "Omnichannel messaging & automation" },
    hubspot: { status: "text", text: "CRM & marketing suite" },
    pulse: { status: "text", text: "Business Operating System AI" },
  },
  {
    category: "Lead Generation",
    crisp: { status: "no", text: "Shumë bazik" },
    respondio: { status: "partial", text: "Manual / automation" },
    hubspot: { status: "yes", text: "Marketing tools" },
    pulse: { status: "yes", text: "AI scan + market intel + keyword engine" },
  },
  {
    category: "Unified Inbox",
    crisp: { status: "yes", text: "I fortë" },
    respondio: { status: "yes", text: "I fortë" },
    hubspot: { status: "partial", text: "Mesatar" },
    pulse: { status: "yes", text: "Omnichannel + AI classification" },
  },
  {
    category: "CRM",
    crisp: { status: "partial", text: "Bazik" },
    respondio: { status: "partial", text: "Mesatar" },
    hubspot: { status: "yes", text: "Shumë i fortë" },
    pulse: { status: "yes", text: "AI-driven CRM + sales probability" },
  },
  {
    category: "Marketing Automation",
    crisp: { status: "partial", text: "Bazik" },
    respondio: { status: "yes", text: "I fortë" },
    hubspot: { status: "yes", text: "Enterprise level" },
    pulse: { status: "yes", text: "AI growth + campaign engine" },
  },
  {
    category: "Call Center",
    crisp: { status: "no", text: "Jo" },
    respondio: { status: "partial", text: "Integrations" },
    hubspot: { status: "partial", text: "Integrations" },
    pulse: { status: "yes", text: "Dialer + IVR + agent monitoring" },
  },
  {
    category: "AI Strategy",
    crisp: { status: "no", text: "Jo" },
    respondio: { status: "no", text: "Shumë pak" },
    hubspot: { status: "partial", text: "Predictive analytics" },
    pulse: { status: "yes", text: "AI vendime biznesi" },
  },
  {
    category: "Revenue Optimization",
    crisp: { status: "no", text: "Jo" },
    respondio: { status: "no", text: "Jo" },
    hubspot: { status: "partial", text: "Reports" },
    pulse: { status: "yes", text: "Revenue Engine + pricing AI" },
  },
  {
    category: "Automation OS",
    crisp: { status: "partial", text: "Chatbot workflows" },
    respondio: { status: "yes", text: "Workflow engine" },
    hubspot: { status: "partial", text: "Marketing workflows" },
    pulse: { status: "yes", text: "Autonomous Business OS" },
  },
  {
    category: "Growth Strategy",
    crisp: { status: "no", text: "Jo" },
    respondio: { status: "no", text: "Jo" },
    hubspot: { status: "partial", text: "Consulting needed" },
    pulse: { status: "yes", text: "AI sugjeron strategji" },
  },
  {
    category: "Partner / Reseller",
    crisp: { status: "no", text: "Shumë limit" },
    respondio: { status: "partial", text: "Limit" },
    hubspot: { status: "partial", text: "Enterprise" },
    pulse: { status: "yes", text: "Affiliate + reseller built-in" },
  },
  {
    category: "Çmimi",
    crisp: { status: "text", text: "€45–295" },
    respondio: { status: "text", text: "$79–279" },
    hubspot: { status: "text", text: "€800–3000+" },
    pulse: { status: "text", text: "€49–699+" },
  },
];

const StatusIcon = ({ status }: { status: CellStatus }) => {
  if (status === "yes") return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
  if (status === "no") return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  if (status === "partial") return <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />;
  return null;
};

export const CompetitorComparison = () => {
  const scrollRef = useScrollAnimation();
  return (
    <section className="border-t border-border bg-muted/20" ref={scrollRef}>
      <div className="container mx-auto px-4 py-16">
        <div className="mb-10 text-center animate-on-scroll">
          <Badge variant="secondary" className="mb-3">Krahasimi</Badge>
          <h2 className="mb-2 text-3xl font-bold text-foreground">
            Pulse AI vs Konkurentët
          </h2>
          <p className="mx-auto max-w-lg text-muted-foreground">
            Shiko pse bizneset zgjedhin Pulse AI mbi platformat e tjera.
          </p>
        </div>

        <div className="mx-auto max-w-6xl overflow-x-auto animate-on-scroll" style={{ transitionDelay: "150ms" }}>
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 px-4 text-left font-semibold text-foreground w-[160px]">Kategoria</th>
                <th className="py-3 px-4 text-left font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1.5">💬 Crisp</span>
                </th>
                <th className="py-3 px-4 text-left font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1.5">📱 Respond.io</span>
                </th>
                <th className="py-3 px-4 text-left font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1.5">🟠 HubSpot</span>
                </th>
                <th className="py-3 px-4 text-left font-semibold text-primary">
                  <span className="flex items-center gap-1.5">⚡ Pulse AI</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr key={row.category} className={`border-b border-border/50 ${i % 2 === 0 ? "bg-muted/10" : ""}`}>
                  <td className="py-3 px-4 font-medium text-foreground">{row.category}</td>
                  {(["crisp", "respondio", "hubspot", "pulse"] as const).map((col) => (
                    <td key={col} className={`py-3 px-4 ${col === "pulse" ? "bg-primary/5" : ""}`}>
                      <div className="flex items-center gap-2">
                        <StatusIcon status={row[col].status} />
                        <span className={`text-xs ${col === "pulse" ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                          {row[col].text}
                        </span>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
