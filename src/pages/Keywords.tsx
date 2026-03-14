import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useKeywords } from "@/hooks/useKeywords";
import { Plus, Trash2, Key } from "lucide-react";
import { keywordFieldGuides, getFieldGuide } from "@/config/fieldGuides";
import { FieldLabelWithGuide } from "@/components/FieldGuide";

const Keywords = () => {
  const [newKeyword, setNewKeyword] = useState("");
  const { keywords, isLoading, addKeyword, toggleKeyword, deleteKeyword } = useKeywords();

  const handleAdd = () => {
    if (!newKeyword.trim()) return;
    addKeyword.mutate(newKeyword);
    setNewKeyword("");
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key className="h-5 w-5 text-primary" />
              Keywords
            </CardTitle>
            <CardDescription>Define keywords to monitor in Telegram groups for lead discovery.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-4">
              <div className="flex-1">
                <FieldLabelWithGuide label="Add Keyword" guide={getFieldGuide(keywordFieldGuides, "keyword")!} />
                <Input
                  className="mt-1.5"
                  placeholder="e.g. looking for web developer"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
              </div>
              <Button className="mt-auto" onClick={handleAdd} disabled={addKeyword.isPending}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : keywords.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No keywords yet. Add keywords to start discovering leads.
              </p>
            ) : (
              <div className="space-y-2">
                {keywords.map((k) => (
                  <div key={k.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm font-medium text-foreground">{k.keyword}</span>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={k.is_active}
                        onCheckedChange={(checked) => toggleKeyword.mutate({ id: k.id, is_active: checked })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => deleteKeyword.mutate(k.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Keywords;
