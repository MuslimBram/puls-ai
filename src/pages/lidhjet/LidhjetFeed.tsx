import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { CreatePostModal } from "@/components/lidhjet/CreatePostModal";
import { InterestModal } from "@/components/lidhjet/InterestModal";
import { ReportModal } from "@/components/lidhjet/ReportModal";
import { RateSellerModal } from "@/components/lidhjet/RateSellerModal";
import { PublicProfilesList } from "@/components/lidhjet/PublicProfilesList";
import { AiProfileAssessmentModal } from "@/components/lidhjet/AiProfileAssessmentModal";
import { AiImageScanButton } from "@/components/lidhjet/AiImageScanButton";
import {
  PlusCircle,
  Search,
  Building2,
  User,
  MapPin,
  Clock,
  HeartHandshake,
  MessageSquare,
  Star,
  ShieldAlert,
  Sparkles,
  Loader2,
} from "lucide-react";

interface AttachmentItem {
  id: string;
  storage_path: string;
  file_name: string;
  signed_url?: string | null;
}

interface PostItem {
  id: string;
  author_user_id: string;
  workspace_id?: string | null;
  title: string;
  content: string;
  category: string;
  price: number;
  currency?: string;
  location?: string | null;
  created_at: string;
  community_attachments?: AttachmentItem[];
}

interface CommentItem {
  id: string;
  post_id: string;
  author_user_id: string;
  content: string;
  created_at: string;
}

export default function LidhjetFeed() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [selectedPostForInterest, setSelectedPostForInterest] = useState<PostItem | null>(null);
  const [selectedPostForReport, setSelectedPostForReport] = useState<PostItem | null>(null);
  const [selectedTargetUserForRating, setSelectedTargetUserForRating] = useState<string | null>(null);
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [aiAssessmentOpen, setAiAssessmentOpen] = useState(false);

  // Comment state
  const [commentsMap, setCommentsMap] = useState<Record<string, CommentItem[]>>({});
  const [newCommentText, setNewCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      let url = `${supabaseUrl}/functions/v1/community-feed?limit=30&offset=0`;
      if (categoryFilter && categoryFilter !== "all") {
        url += `&category=${categoryFilter}`;
      }
      if (searchQuery) {
        url += `&search=${encodeURIComponent(searchQuery)}`;
      }

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || resData.message || "Failed to fetch community feed");
      }

      setPosts((resData.posts as PostItem[]) || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load posts";
      toast({
        title: "Feed Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, searchQuery, toast]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFeed();
  };

  const loadComments = async (postId: string) => {
    try {
      const { data, error } = await supabase
        .from("community_comments")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setCommentsMap((prev) => ({ ...prev, [postId]: data as CommentItem[] }));
      }
    } catch (err) {
      console.error("Error loading comments:", err);
    }
  };

  const toggleComments = (postId: string) => {
    if (activeCommentPostId === postId) {
      setActiveCommentPostId(null);
    } else {
      setActiveCommentPostId(postId);
      loadComments(postId);
    }
  };

  const handleAddComment = async (postId: string) => {
    if (!newCommentText.trim() || !user) return;
    setSubmittingComment(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const res = await fetch(`${supabaseUrl}/functions/v1/community-comment-create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          post_id: postId,
          content: newCommentText,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || resData.message || "Failed to submit comment");
      }

      toast({
        title: "Comment Added",
        description: "Your comment was published.",
      });

      setNewCommentText("");
      loadComments(postId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to post comment";
      toast({
        title: "Comment Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6 py-4">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Lidhjet Community Feed</h1>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold text-xs">
                FREE
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Discover job offers, professional services, trade listings, and community opportunities.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAiAssessmentOpen(true)} className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              AI Trust Check
            </Button>

            <Button onClick={() => setCreatePostOpen(true)} className="gap-1.5">
              <PlusCircle className="h-4 w-4" />
              Publish Post
            </Button>
          </div>
        </div>

        {/* Search & Category Filter */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search posts by title or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs"
            />
          </form>

          <Tabs value={categoryFilter} onValueChange={setCategoryFilter} className="w-full sm:w-auto">
            <TabsList className="grid grid-cols-5 text-xs">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pune">Punë</TabsTrigger>
              <TabsTrigger value="sherbim">Shërbim</TabsTrigger>
              <TabsTrigger value="tregti">Tregti</TabsTrigger>
              <TabsTrigger value="tjeter">Tjetër</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Public Members Directory */}
        <PublicProfilesList />

        {/* Posts Feed */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : posts.length === 0 ? (
          <Card className="text-center py-12 p-6 space-y-3">
            <CardTitle className="text-base text-muted-foreground">No community posts found</CardTitle>
            <CardDescription className="text-xs">
              Be the first to publish an offer or service listing in this category.
            </CardDescription>
            <Button size="sm" onClick={() => setCreatePostOpen(true)} className="gap-1.5">
              <PlusCircle className="h-4 w-4" />
              Publish First Post
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const isBusiness = post.workspace_id !== null;
              const isMine = post.author_user_id === user?.id;

              return (
                <Card key={post.id} className="hover:border-primary/30 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      {/* Identity header */}
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-border">
                          <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                            {isBusiness ? "BIZ" : "USR"}
                          </AvatarFallback>
                        </Avatar>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">
                              {isBusiness ? "Business Identity" : "Personal Identity"}
                            </span>
                            {isBusiness ? (
                              <Badge variant="secondary" className="text-[9px] gap-1 py-0 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                                <Building2 className="h-2.5 w-2.5" />
                                Business
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] gap-1 py-0">
                                <User className="h-2.5 w-2.5" />
                                Personal
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                            <span className="capitalize font-medium">{post.category}</span>
                            <span>•</span>
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />
                              {new Date(post.created_at).toLocaleDateString()}
                            </span>
                            {post.location && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-0.5">
                                  <MapPin className="h-3 w-3" />
                                  {post.location}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Price Badge */}
                      <div className="text-right">
                        <span className="text-base font-bold text-primary">
                          {Number(post.price).toLocaleString()} {post.currency || "ALL"}
                        </span>
                      </div>
                    </div>

                    <CardTitle className="text-lg font-semibold pt-2">{post.title}</CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4 text-xs text-foreground/90 leading-relaxed">
                    <p className="whitespace-pre-wrap">{post.content}</p>

                    {/* Attachment Signed Images */}
                    {post.community_attachments && post.community_attachments.length > 0 && (
                      <div className="flex flex-wrap gap-3 pt-2">
                        {post.community_attachments.map((att) => (
                          <div key={att.id} className="relative group space-y-1">
                            {att.signed_url ? (
                              <img
                                src={att.signed_url}
                                alt={att.file_name}
                                className="h-24 w-32 object-cover rounded-lg border border-border"
                              />
                            ) : (
                              <div className="h-24 w-32 bg-muted flex items-center justify-center text-muted-foreground rounded-lg border border-border">
                                {att.file_name}
                              </div>
                            )}

                            {/* AI Image Safety Scan Button */}
                            {att.signed_url && (
                              <div className="pt-0.5">
                                <AiImageScanButton imageUrl={att.signed_url} postId={post.id} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="pt-2 border-t border-border/50 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {!isMine && (
                        <Button
                          size="sm"
                          onClick={() => setSelectedPostForInterest(post)}
                          className="gap-1.5 text-xs h-8"
                        >
                          <HeartHandshake className="h-3.5 w-3.5" />
                          Submit Offer
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleComments(post.id)}
                        className="gap-1.5 text-xs h-8"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Comments
                      </Button>

                      {!isMine && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedTargetUserForRating(post.author_user_id)}
                          className="gap-1 text-xs h-8 text-muted-foreground hover:text-amber-500"
                        >
                          <Star className="h-3.5 w-3.5" />
                          Rate Seller
                        </Button>
                      )}
                    </div>

                    {!isMine && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedPostForReport(post)}
                        className="gap-1 text-[11px] h-8 text-muted-foreground hover:text-destructive"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Report Allegation
                      </Button>
                    )}
                  </CardFooter>

                  {/* Comments Section */}
                  {activeCommentPostId === post.id && (
                    <div className="p-4 bg-muted/30 border-t border-border space-y-3">
                      <h4 className="text-xs font-semibold text-foreground">Comments</h4>

                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {(commentsMap[post.id] || []).length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">No comments yet. Leave a comment below.</p>
                        ) : (
                          commentsMap[post.id].map((c) => (
                            <div key={c.id} className="p-2 rounded bg-card border border-border text-xs space-y-1">
                              <p className="text-foreground">{c.content}</p>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(c.created_at).toLocaleString()}
                              </span>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Add Comment Form */}
                      <div className="flex gap-2 pt-1">
                        <Input
                          placeholder="Write a public comment..."
                          value={newCommentText}
                          onChange={(e) => setNewCommentText(e.target.value)}
                          className="text-xs"
                        />
                        <Button aria-label="Loading"
                          size="sm"
                          onClick={() => handleAddComment(post.id)}
                          disabled={submittingComment || !newCommentText.trim()}
                        >
                          {submittingComment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Post"}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Modals */}
        <CreatePostModal
          open={createPostOpen}
          onOpenChange={setCreatePostOpen}
          onSuccess={fetchFeed}
        />

        {selectedPostForInterest && (
          <InterestModal
            open={!!selectedPostForInterest}
            onOpenChange={(open) => !open && setSelectedPostForInterest(null)}
            post={selectedPostForInterest}
            onSuccess={fetchFeed}
          />
        )}

        {selectedPostForReport && (
          <ReportModal
            open={!!selectedPostForReport}
            onOpenChange={(open) => !open && setSelectedPostForReport(null)}
            targetType="post"
            targetId={selectedPostForReport.id}
          />
        )}

        {selectedTargetUserForRating && (
          <RateSellerModal
            open={!!selectedTargetUserForRating}
            onOpenChange={(open) => !open && setSelectedTargetUserForRating(null)}
            targetUserId={selectedTargetUserForRating}
            onSuccess={() => {}}
          />
        )}

        <AiProfileAssessmentModal
          open={aiAssessmentOpen}
          onOpenChange={setAiAssessmentOpen}
        />
      </div>
    </DashboardLayout>
  );
}
