import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import type { Competitor, CompetitorAlert } from "@/hooks/useCompetitors";

interface CompetitorExportProps {
  competitors: Competitor[] | undefined;
  alerts: CompetitorAlert[] | undefined;
}

export const CompetitorExport = ({ competitors, alerts }: CompetitorExportProps) => {
  const [exporting, setExporting] = useState(false);

  const exportCSV = () => {
    if (!competitors?.length) { toast.error("No competitors to export"); return; }
    setExporting(true);
    try {
      const headers = ["Name", "Category", "Website", "Last Scanned", "Scan Frequency", "AI Summary", "Positioning", "Pricing", "Opportunities"];
      const rows = competitors.map((c) => [
        c.name,
        c.category,
        c.website_url || "",
        c.last_scanned_at ? new Date(c.last_scanned_at).toLocaleDateString() : "Never",
        c.scan_frequency,
        (c.ai_summary || "").replace(/"/g, '""'),
        (c.ai_positioning || "").replace(/"/g, '""'),
        c.pricing_snapshot?.pricing_summary || "",
        c.ai_opportunities?.map((o) => o.opportunity).join("; ") || "",
      ]);
      const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
      downloadFile(csv, "competitor-intelligence-report.csv", "text/csv");
      toast.success("CSV exported");
    } finally {
      setExporting(false);
    }
  };

  const exportJSON = () => {
    if (!competitors?.length) { toast.error("No competitors to export"); return; }
    setExporting(true);
    try {
      const report = {
        generated_at: new Date().toISOString(),
        total_competitors: competitors.length,
        competitors: competitors.map((c) => ({
          name: c.name,
          category: c.category,
          website: c.website_url,
          last_scanned: c.last_scanned_at,
          summary: c.ai_summary,
          positioning: c.ai_positioning,
          content_themes: c.ai_content_themes,
          opportunities: c.ai_opportunities,
          pricing: c.pricing_snapshot,
          engagement_style: c.ai_engagement_style,
        })),
        alerts: (alerts || []).map((a) => ({
          competitor_id: a.competitor_id,
          type: a.alert_type,
          title: a.title,
          description: a.description,
          severity: a.severity,
          created_at: a.created_at,
        })),
      };
      downloadFile(JSON.stringify(report, null, 2), "competitor-intelligence-report.json", "application/json");
      toast.success("JSON report exported");
    } finally {
      setExporting(false);
    }
  };

  const exportMarkdown = () => {
    if (!competitors?.length) { toast.error("No competitors to export"); return; }
    setExporting(true);
    try {
      let md = `# Competitor Intelligence Report\n\n`;
      md += `**Generated:** ${new Date().toLocaleString()}\n`;
      md += `**Total Competitors:** ${competitors.length}\n\n---\n\n`;

      for (const c of competitors) {
        md += `## ${c.name}\n\n`;
        md += `- **Category:** ${c.category}\n`;
        md += `- **Website:** ${c.website_url || "N/A"}\n`;
        md += `- **Last Scanned:** ${c.last_scanned_at ? new Date(c.last_scanned_at).toLocaleDateString() : "Never"}\n\n`;

        if (c.ai_summary) md += `### Summary\n${c.ai_summary}\n\n`;
        if (c.ai_positioning) md += `### Positioning\n${c.ai_positioning}\n\n`;

        if (c.pricing_snapshot?.pricing_summary) {
          md += `### Pricing\n${c.pricing_snapshot.pricing_summary}\n`;
          if (c.pricing_snapshot.price_points?.length) {
            md += c.pricing_snapshot.price_points.map((p) => `- ${p}`).join("\n") + "\n";
          }
          md += "\n";
        }

        if (c.ai_opportunities?.length) {
          md += `### Opportunities\n`;
          md += c.ai_opportunities.map((o) => `- **${o.opportunity}**: ${o.rationale}`).join("\n") + "\n\n";
        }
        md += "---\n\n";
      }

      if (alerts?.length) {
        md += `## Recent Alerts\n\n`;
        for (const a of alerts.slice(0, 20)) {
          md += `- [${a.severity.toUpperCase()}] **${a.title}**: ${a.description || ""}\n`;
        }
      }

      downloadFile(md, "competitor-intelligence-report.md", "text/markdown");
      toast.success("Markdown report exported");
    } finally {
      setExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
          Export Report
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportCSV}>
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportJSON}>
          <FileText className="h-4 w-4 mr-2" /> Export JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportMarkdown}>
          <FileText className="h-4 w-4 mr-2" /> Export Markdown
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
