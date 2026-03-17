import { useState, useRef } from "react";
import { FAQManager } from "@/components/FAQManager";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  useKnowledgeSources,
  useKnowledgeChunks,
  useIngestWebsite,
  useSearchKnowledge,
  useDeleteSource,
  useToggleSource,
  useUploadDocument,
  KnowledgeSource,
} from "@/hooks/useKnowledgeBase";
import {
  Globe,
  FileText,
  Trash2,
  RefreshCw,
  Search,
  Upload,
  Loader2,
  Database,
  BookOpen,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Hash,
} from "lucide-react";
import { format } from "date-fns";

const SOURCE_TYPE_ICONS: Record<string, React.ElementType> = {
  website: Globe,
  document: FileText,
  social: Hash,
};

const STATUS_STYLES: Record<string, { icon: React.ElementType; className: string }> = {
  active: { icon: CheckCircle, className: "text-green-600" },
  scanning: { icon: Loader2, className: "text-primary animate-spin" },
  pending: { icon: Clock, className: "text-muted-foreground" },
  error: { icon: AlertCircle, className: "text-destructive" },
};

const KnowledgeBase = () => {
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [crawlDepth, setCrawlDepth] = useState(5);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | undefined>();
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: sources, isLoading: sourcesLoading } = useKnowledgeSources();
  const { data: chunks } = useKnowledgeChunks(selectedSourceId);
  const ingestWebsite = useIngestWebsite();
  const searchKnowledge = useSearchKnowledge();
  const deleteSource = useDeleteSource();
  const toggleSource = useToggleSource();
  const uploadDocument = useUploadDocument();

  const handleIngestWebsite = () => {
    if (websiteUrl.trim()) {
      ingestWebsite.mutate({ url: websiteUrl.trim(), crawl_depth: crawlDepth });
      setWebsiteUrl("");
    }
  };

  const handleRescan = (source: KnowledgeSource) => {
    if (source.source_type === "website" && source.source_url) {
      ingestWebsite.mutate({ url: source.source_url, source_id: source.id, crawl_depth: crawlDepth });
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    const result = await searchKnowledge.mutateAsync({ query: searchQuery });
    setSearchResults(result.results || []);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadDocument.mutate(file);
      e.target.value = "";
    }
  };

  const totalChunks = sources?.reduce((acc, s) => acc + ((s.metadata as any)?.total_chunks || 0), 0) || 0;
  const activeSources = sources?.filter(s => s.status === "active").length || 0;
  const allTopics = [...new Set(
    sources?.flatMap(s => ((s.metadata as any)?.topics as string[]) || []) || []
  )];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Knowledge Base</h1>
            <p className="text-sm text-muted-foreground">
              Build your AI knowledge base from websites, documents, and social content
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Database className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{sources?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Total Sources</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <BookOpen className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{totalChunks}</p>
                <p className="text-xs text-muted-foreground">Knowledge Chunks</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-foreground">{activeSources}</p>
                <p className="text-xs text-muted-foreground">Active Sources</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="sources" className="space-y-4">
          <TabsList>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="faqs">FAQ Training</TabsTrigger>
            <TabsTrigger value="add">Add Source</TabsTrigger>
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="topics">Topics</TabsTrigger>
          </TabsList>

          <TabsContent value="faqs" className="space-y-4">
            <FAQManager />
          </TabsContent>

          {/* SOURCES TAB */}
          <TabsContent value="sources" className="space-y-4">
            {sourcesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !sources?.length ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No knowledge sources yet. Add a website or upload a document to get started.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {sources.map((source) => {
                  const SourceIcon = SOURCE_TYPE_ICONS[source.source_type] || FileText;
                  const statusInfo = STATUS_STYLES[source.status] || STATUS_STYLES.pending;
                  const StatusIcon = statusInfo.icon;
                  const meta = source.metadata as any;
                  const isExpanded = expandedSource === source.id;

                  return (
                    <Card key={source.id}>
                      <CardContent className="py-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <SourceIcon className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="font-medium text-foreground">{source.source_name}</p>
                              {source.source_url && (
                                <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                                  {source.source_url}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusIcon className={`h-4 w-4 ${statusInfo.className}`} />
                            <Badge variant="secondary" className="text-xs capitalize">{source.status}</Badge>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex gap-4">
                            <span>{meta?.total_chunks || 0} chunks</span>
                            {meta?.pages_crawled && <span>{meta.pages_crawled} pages</span>}
                            {source.last_scanned_at && (
                              <span>Scanned {format(new Date(source.last_scanned_at), "MMM d, yyyy HH:mm")}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={source.is_enabled}
                              onCheckedChange={(checked) => toggleSource.mutate({ id: source.id, is_enabled: checked })}
                            />
                            {source.source_type === "website" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRescan(source)}
                                disabled={ingestWebsite.isPending}
                              >
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setExpandedSource(isExpanded ? null : source.id)}
                            >
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => deleteSource.mutate(source.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        {/* Topics */}
                        {meta?.topics?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {(meta.topics as string[]).slice(0, 10).map((topic, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{topic}</Badge>
                            ))}
                          </div>
                        )}

                        {/* Expanded chunks view */}
                        {isExpanded && (
                          <ExpandedChunks sourceId={source.id} />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ADD SOURCE TAB */}
          <TabsContent value="add" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Website */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Globe className="h-4 w-4" /> Crawl Website
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="https://yourbusiness.com"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Crawl depth:</span>
                    <Select value={String(crawlDepth)} onValueChange={(v) => setCrawlDepth(Number(v))}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3</SelectItem>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">pages</span>
                  </div>
                  <Button
                    onClick={handleIngestWebsite}
                    disabled={ingestWebsite.isPending || !websiteUrl.trim()}
                    className="w-full"
                  >
                    {ingestWebsite.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Globe className="mr-2 h-4 w-4" />
                    )}
                    Crawl & Index
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Crawls multiple pages and extracts structured knowledge chunks with AI-detected topics.
                  </p>
                </CardContent>
              </Card>

              {/* Document Upload */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Upload className="h-4 w-4" /> Upload Document
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.csv,.json"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <div
                    className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8 cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium text-foreground">Click to upload</p>
                    <p className="text-xs text-muted-foreground mt-1">TXT, MD, CSV, JSON (max 20MB)</p>
                  </div>
                  {uploadDocument.isPending && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing document...
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* SEARCH TAB */}
          <TabsContent value="search" className="space-y-4">
            <Card>
              <CardContent className="py-4 space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search your knowledge base..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                  <Button onClick={handleSearch} disabled={searchKnowledge.isPending || !searchQuery.trim()}>
                    {searchKnowledge.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">{searchResults.length} results found</p>
                    {searchResults.map((result: any) => (
                      <Card key={result.id} className="bg-muted/50">
                        <CardContent className="py-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-foreground">
                              {result.page_title || result.knowledge_sources?.source_name || "Unknown"}
                            </p>
                            <Badge variant="secondary" className="text-xs">{result.content_type}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-3">{result.content}</p>
                          {result.topic_tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {result.topic_tags.map((tag: string, i: number) => (
                                <Badge key={i} variant="outline" className="text-[10px]">{tag}</Badge>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {searchResults.length === 0 && searchKnowledge.isSuccess && (
                  <p className="text-center text-sm text-muted-foreground py-8">No results found.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TOPICS TAB */}
          <TabsContent value="topics" className="space-y-4">
            {allTopics.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No topics detected yet. Add sources to build your topic index.
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Detected Topics ({allTopics.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {allTopics.map((topic, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="cursor-pointer hover:bg-primary/10 transition-colors"
                        onClick={() => {
                          setSearchQuery(topic);
                        }}
                      >
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

// Sub-component: expanded chunks view for a source
const ExpandedChunks = ({ sourceId }: { sourceId: string }) => {
  const { data: chunks, isLoading } = useKnowledgeChunks(sourceId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!chunks?.length) {
    return <p className="text-xs text-muted-foreground py-2">No chunks indexed yet.</p>;
  }

  return (
    <div className="space-y-2 mt-2 max-h-[300px] overflow-y-auto">
      {chunks.map((chunk) => (
        <div key={chunk.id} className="rounded border border-border bg-muted/50 p-2 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-foreground">
              {chunk.page_title || `Chunk ${chunk.chunk_index + 1}`}
            </span>
            <span className="text-muted-foreground">{chunk.word_count} words</span>
          </div>
          <p className="text-muted-foreground line-clamp-3">{chunk.content}</p>
          {chunk.topic_tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {chunk.topic_tags.map((tag, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">{tag}</Badge>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default KnowledgeBase;
