import { useState } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, Sparkles, Lightbulb, Target, Search, BookOpen } from "lucide-react";
import type { FieldGuide } from "@/config/fieldGuides";

interface FieldGuideProps {
  guide: FieldGuide;
  onAiSuggest?: () => void;
  isAiLoading?: boolean;
}

export const FieldGuideIcon = ({ guide, onAiSuggest, isAiLoading }: FieldGuideProps) => {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center h-5 w-5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          aria-label={`Help for ${guide.title}`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-80 p-0">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">{guide.title}</h4>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{guide.explanation}</p>
        </div>

        <div className="p-3 space-y-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="h-3 w-3 text-primary" />
              <span className="text-xs font-medium text-foreground">Why it matters</span>
            </div>
            <p className="text-xs text-muted-foreground">{guide.importance}</p>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Search className="h-3 w-3 text-primary" />
              <span className="text-xs font-medium text-foreground">How to find this info</span>
            </div>
            <p className="text-xs text-muted-foreground">{guide.howToFind}</p>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Lightbulb className="h-3 w-3 text-yellow-500" />
              <span className="text-xs font-medium text-foreground">Examples</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {guide.examples.map((ex, i) => (
                <Badge key={i} variant="secondary" className="text-[10px] font-normal">
                  {ex}
                </Badge>
              ))}
            </div>
          </div>

          {guide.aiEnabled && onAiSuggest && (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs h-7 border-primary/30 text-primary hover:bg-primary/5"
              onClick={onAiSuggest}
              disabled={isAiLoading}
            >
              <Sparkles className="h-3 w-3 mr-1.5" />
              {isAiLoading ? "Generating..." : "Suggest with AI"}
            </Button>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

interface FieldLabelWithGuideProps {
  label: string;
  guide: FieldGuide;
  onAiSuggest?: () => void;
  isAiLoading?: boolean;
}

export const FieldLabelWithGuide = ({ label, guide, onAiSuggest, isAiLoading }: FieldLabelWithGuideProps) => {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        {label}
      </span>
      <FieldGuideIcon guide={guide} onAiSuggest={onAiSuggest} isAiLoading={isAiLoading} />
    </div>
  );
};
