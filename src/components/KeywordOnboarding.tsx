import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useKeywords } from "@/hooks/useKeywords";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import { Key, Plus, Lightbulb } from "lucide-react";

const INDUSTRY_SUGGESTIONS: Record<string, string[]> = {
  technology: ["software development", "web design", "app developer", "IT support", "cloud services"],
  marketing: ["social media management", "SEO services", "brand strategy", "content marketing", "digital marketing"],
  consulting: ["business consultant", "strategy advisor", "management consulting", "financial advisor"],
  ecommerce: ["online store", "dropshipping", "product sourcing", "ecommerce platform"],
  default: ["looking for", "need help with", "recommend", "who can", "best service"],
};

export const KeywordOnboarding = () => {
  const [newKeyword, setNewKeyword] = useState("");
  const { keywords, addKeyword } = useKeywords();
  const { profile } = useBusinessProfile();

  const industry = profile?.industry?.toLowerCase() || "";
  const suggestions = INDUSTRY_SUGGESTIONS[industry] || INDUSTRY_SUGGESTIONS.default;
  const existingKws = new Set(keywords.map((k) => k.keyword));
  const availableSuggestions = suggestions.filter((s) => !existingKws.has(s));

  const handleAdd = (kw: string) => {
    if (!kw.trim()) return;
    addKeyword.mutate(kw);
    setNewKeyword("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Key className="h-5 w-5 text-primary" />
          Keywords ({keywords.length})
        </CardTitle>
        <CardDescription>
          Keywords determine which messages are detected as potential leads. The system scans incoming messages for these terms.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Add a keyword…"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd(newKeyword)}
          />
          <Button onClick={() => handleAdd(newKeyword)} disabled={addKeyword.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        {availableSuggestions.length > 0 && (
          <div>
            <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-2">
              <Lightbulb className="h-3 w-3" />
              Suggested keywords {profile?.industry ? `for ${profile.industry}` : ""}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {availableSuggestions.map((s) => (
                <Badge
                  key={s}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 transition-colors"
                  onClick={() => handleAdd(s)}
                >
                  + {s}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((k) => (
              <Badge key={k.id} variant={k.is_active ? "default" : "secondary"}>
                {k.keyword}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
