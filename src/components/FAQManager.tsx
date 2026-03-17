import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useKnowledgeSources, useKnowledgeChunks } from "@/hooks/useKnowledgeBase";
import {
  HelpCircle, Plus, Trash2, Edit2, Search, Sparkles, CheckCircle2,
  AlertTriangle, BookOpen, MessageSquare, Tag, Loader2, Brain,
  Shield, TrendingUp, Lightbulb,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  tags: string[];
  isActive: boolean;
  hitCount: number;
  lastUsed: string | null;
  confidence: number;
}

const DEFAULT_CATEGORIES = [
  "General", "Pricing", "Product", "Support", "Billing", "Account", "Technical", "Shipping", "Returns",
];

const SUGGESTED_FAQS = [
  { question: "What are your business hours?", answer: "Our team is available Monday to Friday, 9 AM to 6 PM EST.", category: "General" },
  { question: "How do I cancel my subscription?", answer: "You can cancel anytime from Settings > Subscription > Cancel Plan. Your access continues until the end of your billing period.", category: "Billing" },
  { question: "Do you offer refunds?", answer: "Yes, we offer a 30-day money-back guarantee. Contact support for a full refund within 30 days of purchase.", category: "Billing" },
  { question: "How do I reset my password?", answer: "Click 'Forgot Password' on the login page, enter your email, and follow the reset link sent to your inbox.", category: "Account" },
  { question: "What payment methods do you accept?", answer: "We accept all major credit cards (Visa, Mastercard, Amex), PayPal, and bank transfers for annual plans.", category: "Pricing" },
  { question: "Is there a free trial?", answer: "Yes! All paid plans include a 7-day free trial. No credit card required to start.", category: "Pricing" },
  { question: "How do I contact support?", answer: "You can reach us via live chat, email at support@example.com, or through the help center.", category: "Support" },
  { question: "Do you have an API?", answer: "Yes, we offer a full REST API. Check the API documentation in your dashboard under Settings > Public API.", category: "Technical" },
];

export const FAQManager = () => {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FAQ | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: sources } = useKnowledgeSources();

  // Calculate training quality score
  const qualityScore = (() => {
    let score = 0;
    const totalFaqs = faqs.length;
    const activeFaqs = faqs.filter((f) => f.isActive).length;
    const categorized = new Set(faqs.map((f) => f.category)).size;
    const avgAnswerLength = totalFaqs > 0 ? faqs.reduce((s, f) => s + f.answer.length, 0) / totalFaqs : 0;
    const sourcesCount = sources?.filter((s) => s.status === "active").length || 0;

    if (totalFaqs >= 5) score += 15;
    if (totalFaqs >= 15) score += 10;
    if (totalFaqs >= 30) score += 5;
    if (activeFaqs >= 5) score += 10;
    if (categorized >= 3) score += 10;
    if (categorized >= 5) score += 5;
    if (avgAnswerLength >= 50) score += 10;
    if (avgAnswerLength >= 100) score += 5;
    if (sourcesCount >= 1) score += 15;
    if (sourcesCount >= 3) score += 10;
    // Base score for having anything
    if (totalFaqs > 0 || sourcesCount > 0) score += 5;

    return Math.min(score, 100);
  })();

  const qualityLabel = qualityScore >= 80 ? "Excellent" : qualityScore >= 60 ? "Good" : qualityScore >= 40 ? "Fair" : "Needs Work";
  const qualityColor = qualityScore >= 80 ? "text-emerald-600" : qualityScore >= 60 ? "text-primary" : qualityScore >= 40 ? "text-amber-600" : "text-destructive";

  const addFaq = (faq: Omit<FAQ, "id" | "hitCount" | "lastUsed" | "confidence">) => {
    setFaqs((prev) => [
      ...prev,
      {
        ...faq,
        id: `faq_${Date.now()}`,
        hitCount: 0,
        lastUsed: null,
        confidence: Math.min(100, Math.round(50 + faq.answer.length / 3)),
      },
    ]);
    toast.success("FAQ added");
  };

  const updateFaq = (id: string, updates: Partial<FAQ>) => {
    setFaqs((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
    toast.success("FAQ updated");
  };

  const deleteFaq = (id: string) => {
    setFaqs((prev) => prev.filter((f) => f.id !== id));
    toast.success("FAQ removed");
  };

  const addSuggested = (s: typeof SUGGESTED_FAQS[0]) => {
    addFaq({ question: s.question, answer: s.answer, category: s.category, tags: [], isActive: true });
  };

  const filteredFaqs = faqs.filter((f) => {
    const matchesSearch = !searchFilter ||
      f.question.toLowerCase().includes(searchFilter.toLowerCase()) ||
      f.answer.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesCategory = categoryFilter === "all" || f.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const usedCategories = [...new Set(faqs.map((f) => f.category))];

  return (
    <div className="space-y-4">
      {/* Training Quality Score */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 shrink-0">
              <Brain className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">AI Training Quality</p>
                <p className={`text-xs font-medium ${qualityColor}`}>{qualityLabel} — {qualityScore}%</p>
              </div>
            </div>
            <Progress value={qualityScore} className="flex-1" />
            <div className="text-xs text-muted-foreground shrink-0 hidden sm:block">
              {faqs.length} FAQs · {sources?.filter((s) => s.status === "active").length || 0} sources
            </div>
          </div>

          {qualityScore < 60 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 p-2">
              <Lightbulb className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 dark:text-amber-300">
                <strong>Tips to improve:</strong>
                {faqs.length < 10 && " Add more FAQ entries (aim for 15+)."}
                {usedCategories.length < 3 && " Use at least 3 different categories."}
                {(sources?.filter((s) => s.status === "active").length || 0) < 1 && " Add website or document sources."}
                {faqs.some((f) => f.answer.length < 50) && " Write more detailed answers (50+ characters)."}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* FAQ Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search FAQs..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {DEFAULT_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3 w-3 mr-1" /> Add FAQ
        </Button>
      </div>

      {/* FAQ List */}
      {filteredFaqs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <HelpCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              {faqs.length === 0
                ? "No FAQs yet. Add custom Q&A pairs to train your AI."
                : "No FAQs match your filter."}
            </p>
            {faqs.length === 0 && (
              <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
                <Plus className="h-3 w-3 mr-1" /> Add First FAQ
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredFaqs.map((faq) => (
            <Card key={faq.id}>
              <CardContent className="py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="h-3 w-3 text-primary shrink-0" />
                      <p className="text-sm font-medium text-foreground">{faq.question}</p>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 ml-5">{faq.answer}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch
                      checked={faq.isActive}
                      onCheckedChange={(v) => updateFaq(faq.id, { isActive: v })}
                    />
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingFaq(faq)}>
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteFaq(faq.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-5">
                  <Badge variant="outline" className="text-[10px]">
                    <Tag className="h-2.5 w-2.5 mr-0.5" /> {faq.category}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {faq.confidence}% confidence
                  </Badge>
                  {faq.hitCount > 0 && (
                    <span className="text-[10px] text-muted-foreground">{faq.hitCount} hits</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Suggested FAQs */}
      {faqs.length < 10 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Suggested FAQs
            </CardTitle>
            <CardDescription className="text-xs">Common questions every business should have ready</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTED_FAQS.filter(
                (s) => !faqs.some((f) => f.question.toLowerCase() === s.question.toLowerCase())
              ).slice(0, 6).map((s, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border p-2 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => addSuggested(s)}
                >
                  <p className="text-xs font-medium text-foreground truncate">{s.question}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-1">{s.answer}</p>
                  <Badge variant="outline" className="text-[9px] mt-1">{s.category}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      {(showAdd || editingFaq) && (
        <FAQDialog
          faq={editingFaq}
          onClose={() => { setShowAdd(false); setEditingFaq(null); }}
          onSave={(data) => {
            if (editingFaq) {
              updateFaq(editingFaq.id, data);
            } else {
              addFaq({ ...data, isActive: true });
            }
            setShowAdd(false);
            setEditingFaq(null);
          }}
        />
      )}
    </div>
  );
};

const FAQDialog = ({
  faq,
  onClose,
  onSave,
}: {
  faq: FAQ | null;
  onClose: () => void;
  onSave: (data: { question: string; answer: string; category: string; tags: string[] }) => void;
}) => {
  const [question, setQuestion] = useState(faq?.question || "");
  const [answer, setAnswer] = useState(faq?.answer || "");
  const [category, setCategory] = useState(faq?.category || "General");
  const [tagsInput, setTagsInput] = useState((faq?.tags || []).join(", "));

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{faq ? "Edit FAQ" : "Add FAQ"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Question</Label>
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What do customers ask?" />
          </div>
          <div>
            <Label>Answer</Label>
            <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} placeholder="The AI will use this response when matching questions..." />
            {answer.length > 0 && answer.length < 50 && (
              <p className="text-xs text-amber-600 mt-1">
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                Short answers reduce AI confidence. Aim for 50+ characters.
              </p>
            )}
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEFAULT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tags (comma-separated)</Label>
            <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="pricing, plans, trial" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!question.trim() || !answer.trim()} onClick={() => onSave({
            question, answer, category,
            tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
          })}>
            {faq ? "Update" : "Add"} FAQ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
