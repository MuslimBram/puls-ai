import { Badge } from "@/components/ui/badge";
import {
  Video, Mic, Image, Sparkles, Film, MonitorPlay,
  Wand2, PenTool, Megaphone, Scissors, LayoutGrid, Code,
} from "lucide-react";

const AI_TOOLS = [
  { icon: Video, label: "AI UGC Generator" },
  { icon: Image, label: "AI Avatars" },
  { icon: Mic, label: "Text to Speech" },
  { icon: Megaphone, label: "AI Facebook Ad Generator" },
  { icon: MonitorPlay, label: "AI TikTok Ad Generator" },
  { icon: Wand2, label: "AI Lip-Sync" },
  { icon: Film, label: "AI Product Video Generator" },
  { icon: Sparkles, label: "AI Actors" },
  { icon: PenTool, label: "AI Ad Video Generator" },
  { icon: Scissors, label: "AI Shorts Generator" },
  { icon: LayoutGrid, label: "AI Content Generator" },
  { icon: Code, label: "AI Video API" },
];

const FREE_TOOLS = [
  "AI Hook Generator",
  "AI YouTube Video Generator",
  "AI TikTok Video Generator",
  "AI Facebook Video Ad Generator",
  "Facebook Ad Creative Testing",
];

export const AIToolsSection = () => (
  <section className="border-t border-border bg-muted/20">
    <div className="container mx-auto px-4 py-16">
      <div className="mb-10 text-center animate-on-scroll">
        <Badge variant="secondary" className="mb-3">AI-Powered</Badge>
        <h2 className="mb-2 text-3xl font-bold text-foreground">AI Creative Suite</h2>
        <p className="mx-auto max-w-lg text-muted-foreground">
          Generate professional ads, videos, and content with AI — no editing skills required.
        </p>
      </div>

      <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 stagger-children">
        {AI_TOOLS.map((tool) => (
          <div key={tool.label} className="flex items-center gap-3 rounded-xl border border-border p-4 hover-lift card-glow">
            <tool.icon className="h-6 w-6 shrink-0 text-primary" />
            <span className="text-sm font-medium text-foreground">{tool.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-10 text-center animate-on-scroll">
        <h3 className="mb-4 text-lg font-semibold text-foreground">Free Tools</h3>
        <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2">
          {FREE_TOOLS.map((tool) => (
            <Badge key={tool} variant="outline" className="text-xs">
              {tool}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  </section>
);
