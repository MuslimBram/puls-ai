import { type ChangeEvent, type FormEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Bold, Bot, ChevronDown, Download, FileUp, ImagePlus, LibraryBig, Loader2, Lock, PenLine, Plus, Search, Send, Share2, Smile, Sparkles, Strikethrough, Underline, Video } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Message = { role: "user" | "assistant"; content: string };
type LeahProvider = { provider: string; model: string | null; validation_status: string };
type LeahAttachment = { name: string; path: string; size: number };
type WorkHistoryItem = { id: string; user_message: string; assistant_message: string; created_at: string };
type Session = { session_token?: string; role?: string; error?: string; providers?: LeahProvider[] };
async function functionError(error: unknown, fallback: string) {
  const response = (error as { context?: Response } | null)?.context;
  if (response?.clone) {
    try {
      const body = (await response.clone().json()) as { error?: string };
      if (body.error) return body.error;
    } catch {}
  }
  return error instanceof Error ? error.message : fallback;
}

export default function LeahChatRuntime() {
  const { workspace, workspaces, loading: workspaceLoading, switchWorkspace } = useWorkspace();
  const { user, loading: authLoading } = useAuth();
  const [session, setSession] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [providers, setProviders] = useState<LeahProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("auto");
  const [attachments, setAttachments] = useState<LeahAttachment[]>([]);
  const [workHistory, setWorkHistory] = useState<WorkHistoryItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [emojiMenuOpen, setEmojiMenuOpen] = useState(false);

  const initialize = useCallback(async () => {
    if (authLoading || workspaceLoading) return;
    if (!user) {
      setInitializing(false);
      setError("Hyr në Pulse AI për të hapur LEAH.");
      return;
    }
    if (!workspace?.id) {
      setInitializing(false);
      setError(workspaces.length ? "Zgjidh një biznes për të hapur LEAH." : "Nuk ka ende biznes të lidhur me këtë llogari.");
      return;
    }
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<Session>("leah-session", {
        body: { workspace_id: workspace.id, mode: "direct" },
      });
      if (invokeError) throw new Error(await functionError(invokeError, "Could not open LEAH"));
      if (!data?.session_token) throw new Error(data?.error || "Could not open LEAH");
      setSession(data.session_token);
      setRole(data.role ?? null);
      setProviders(data.providers ?? []);
      const { data: history } = await supabase
        .from("leah_work_history")
        .select("id, user_message, assistant_message, created_at")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(8);
      setWorkHistory((history ?? []) as WorkHistoryItem[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open LEAH");
    } finally {
      setInitializing(false);
    }
  }, [authLoading, user, workspace?.id, workspaceLoading, workspaces.length]);

  useEffect(() => { void initialize(); }, [initialize]);

  const entitlementBlocked = Boolean(error && /entitlement|expired|not active/i.test(error));
  const canUseLeah = Boolean(session);

  const uploadAttachments = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!workspace?.id || !event.target.files?.length) return;
    setError(null);
    try {
      const uploaded: LeahAttachment[] = [];
      for (const file of Array.from(event.target.files)) {
        if (file.size > 10 * 1024 * 1024) throw new Error("Skedari është mbi kufirin 10 MB");
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${workspace.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("leah-attachments").upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
        if (uploadError) throw uploadError;
        uploaded.push({ name: file.name, path, size: file.size });
      }
      setAttachments((current) => [...current, ...uploaded]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ngarkimi dështoi");
    } finally {
      event.target.value = "";
    }
  };

  const wrapSelection = (prefix: string, suffix: string, fallback: string) => {
    const element = textareaRef.current;
    const start = element?.selectionStart ?? input.length;
    const end = element?.selectionEnd ?? input.length;
    const selected = input.slice(start, end) || fallback;
    const next = input.slice(0, start) + prefix + selected + suffix + input.slice(end);
    setInput(next);
    requestAnimationFrame(() => {
      element?.focus();
      const cursor = start + prefix.length + selected.length + suffix.length;
      element?.setSelectionRange(cursor, cursor);
    });
  };

  const insertEmoji = (emoji: string) => {
    const element = textareaRef.current;
    const cursor = element?.selectionStart ?? input.length;
    setInput(input.slice(0, cursor) + emoji + input.slice(cursor));
    setEmojiMenuOpen(false);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(cursor + emoji.length, cursor + emoji.length);
    });
  };

  const editHistory = (item: WorkHistoryItem) => {
    setInput(item.user_message);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const copyHistory = async (item: WorkHistoryItem) => {
    await navigator.clipboard.writeText(item.assistant_message);
  };

  const downloadHistory = (item: WorkHistoryItem) => {
    const blob = new Blob([`Kërkesa:\n${item.user_message}\n\nLEAH:\n${item.assistant_message}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `leah-${item.id}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const replyHistory = (item: WorkHistoryItem) => {
    setInput(`Re: ${item.user_message}`);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const shareHistory = async (item: WorkHistoryItem) => {
    const text = `${item.user_message}\n\n${item.assistant_message}`;
    if (navigator.share) {
      await navigator.share({ title: "LEAH", text });
    } else {
      await navigator.clipboard.writeText(text);
    }
  };

  const send = async (event: FormEvent | KeyboardEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading || !session || !canUseLeah) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<{ text?: string; error?: string }>("leah-chat", {
        body: {
          user: text,
          conversation: next,
          preferred_provider: selectedProvider === "auto" ? undefined : selectedProvider,
          attachments,
        },
        headers: { "X-Leah-Session": session },
      });
      if (invokeError) throw new Error(await functionError(invokeError, "LEAH generation failed"));
      if (!data?.text) throw new Error(data?.error || "LEAH returned no result");
      setMessages((current) => [...current, { role: "assistant", content: data.text as string }]);
      if (workspace?.id) {
        const { data: history } = await supabase
          .from("leah_work_history")
          .select("id, user_message, assistant_message, created_at")
          .eq("workspace_id", workspace.id)
          .order("created_at", { ascending: false })
          .limit(8);
        setWorkHistory((history ?? []) as WorkHistoryItem[]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "LEAH generation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
      event.preventDefault();
      void send(event);
    }
  };

  return <DashboardLayout>
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Sparkles className="h-6 w-6 text-primary" />LEAH</h1>
        <p className="mt-1 text-sm text-muted-foreground">LEAH orkestrohet nga AI kryesor i Pulse AI për lidhje, skedarë dhe gjenerim të kontrolluar.</p>
      </div>
      {workHistory.length > 0 && <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Historitë e punëve</CardTitle></CardHeader>
        <CardContent className="space-y-2 pt-0">
          {workHistory.map((item) => (
            <div key={item.id} className="rounded-md border p-3">
              <p className="line-clamp-2 text-xs font-medium text-foreground">{item.user_message}</p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.assistant_message}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => editHistory(item)}>Edit</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => void copyHistory(item)}>Copy</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => downloadHistory(item)}><Download className="mr-1 h-3.5 w-3.5" />Download</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => replyHistory(item)}>Reply</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => void shareHistory(item)}><Share2 className="mr-1 h-3.5 w-3.5" />Share</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>}
      {error && <Alert variant="destructive"><AlertTitle>LEAH</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!initializing && user && !workspace?.id && <Card>
        <CardHeader><CardTitle>Zgjidh biznesin</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {workspaces.length > 0 ? <select aria-label="Zgjidh biznesin aktiv" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue="" onChange={(event) => { if (event.target.value) switchWorkspace(event.target.value); }}>
            <option value="" disabled>Zgjidh biznesin</option>
            {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select> : <Link to="/managed-businesses" className="inline-flex rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Shto biznes</Link>}
        </CardContent>
      </Card>}
      {!initializing && user && workspace?.id && !canUseLeah && entitlementBlocked && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" />Aktivizo LEAH</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>LEAH kërkon një entitlement aktiv për këtë biznes.</p><Link to="/subscription" className="inline-flex rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Shiko planet dhe aktivizo pagesën</Link></CardContent></Card>}
      {canUseLeah && <Card className="flex min-h-[60vh] flex-col"><CardHeader className="border-b"><CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" />LEAH Chat</CardTitle><p className="text-xs text-muted-foreground">Ti shkruan kërkesën. Orchestrator-i i Pulse AI zgjedh provider-in dhe modelin në prapaskenë.</p></CardHeader><CardContent className="flex flex-1 flex-col gap-4 p-4"><div className="flex-1 space-y-4 overflow-y-auto rounded-lg border bg-muted/20 p-4">{messages.length === 0 && <div className="flex h-full min-h-40 items-center justify-center text-center text-sm text-muted-foreground">Shkruaj çfarë dëshiron të gjenerojë LEAH.</div>}{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm ${message.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card"}`}>{message.content}</div></div>)}{loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />LEAH po gjeneron…</div>}</div><form onSubmit={send} className="rounded-xl border bg-card p-2 shadow-sm">
              <div className="relative flex items-center gap-2 border-b px-1 pb-2">
                <button type="button" onClick={() => { setModelMenuOpen((open) => !open); setToolMenuOpen(false); setEmojiMenuOpen(false); }} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted" aria-expanded={modelMenuOpen}>
                  <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate"><span className="block font-medium">{selectedProvider === "auto" ? "Auto" : (providers.find((provider) => provider.provider === selectedProvider)?.model || selectedProvider)}</span><span className="block text-[10px] text-muted-foreground">{selectedProvider === "auto" ? "Recommended · Pulse AI chooses" : "Validated workspace model"}</span></span>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${modelMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {modelMenuOpen && <div className="absolute bottom-full left-0 z-30 mb-2 w-80 overflow-hidden rounded-xl border bg-card shadow-2xl">
                  <div className="border-b px-3 py-3 text-sm font-semibold">Select Model</div>
                  <div className="max-h-72 overflow-y-auto p-1">
                    <button type="button" onClick={() => { setSelectedProvider("auto"); setModelMenuOpen(false); }} className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left hover:bg-muted ${selectedProvider === "auto" ? "bg-primary/10" : ""}`}><Sparkles className="mt-0.5 h-4 w-4 text-primary" /><span><span className="flex items-center gap-2 text-sm font-medium">Auto <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">Recommended</span></span><span className="block text-xs text-muted-foreground">Always selects the best validated model</span></span></button>
                    {providers.map((provider) => <button key={provider.provider} type="button" onClick={() => { setSelectedProvider(provider.provider); setModelMenuOpen(false); }} className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left hover:bg-muted ${selectedProvider === provider.provider ? "bg-primary/10" : ""}`}><Sparkles className="mt-0.5 h-4 w-4 text-orange-400" /><span><span className="block text-sm font-medium">{provider.model || provider.provider}</span><span className="block text-xs text-muted-foreground">{provider.provider} · active and validated</span></span></button>)}
                    {providers.length === 0 && <Link to="/leah/providers" onClick={() => setModelMenuOpen(false)} className="block rounded-lg px-3 py-3 text-sm text-primary hover:bg-muted">Configure a validated provider first</Link>}
                  </div>
                </div>}
                <div className="ml-auto flex items-center gap-1">
                  <div className="relative">
                    <button type="button" onClick={() => { setToolMenuOpen((open) => !open); setModelMenuOpen(false); setEmojiMenuOpen(false); }} className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted ${toolMenuOpen ? "bg-muted" : ""}`} aria-label="Add tools" aria-expanded={toolMenuOpen}><Plus className={`h-5 w-5 transition-transform ${toolMenuOpen ? "rotate-45" : ""}`} /></button>
                    {toolMenuOpen && <div className="absolute bottom-full right-0 z-30 mb-2 w-80 overflow-hidden rounded-xl border bg-card shadow-2xl"><div className="space-y-1 p-2">
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><FileUp className="h-4 w-4" /><span><span className="block font-medium">Add photos & files</span><span className="block text-xs text-muted-foreground">Upload from computer</span></span><input ref={uploadInputRef} type="file" multiple accept=".pdf,.txt,.md,.json,image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { void uploadAttachments(event); setToolMenuOpen(false); }} /></label>
                      <Link to="/knowledge-base" onClick={() => setToolMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><LibraryBig className="h-4 w-4" /><span><span className="block font-medium">Add from library</span><span className="block text-xs text-muted-foreground">Browse workspace knowledge</span></span></Link>
                      <Link to="/media-studio" onClick={() => setToolMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><ImagePlus className="h-4 w-4" /><span><span className="block font-medium">Create image</span><span className="block text-xs text-muted-foreground">Visualize anything</span></span></Link>
                      <Link to="/sources?type=website" onClick={() => setToolMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><Search className="h-4 w-4" /><span><span className="block font-medium">Web search</span><span className="block text-xs text-muted-foreground">Find real-time business information</span></span></Link>
                      <Link to="/deep-analytics" onClick={() => setToolMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><BookOpen className="h-4 w-4" /><span><span className="block font-medium">Deep research</span><span className="block text-xs text-muted-foreground">Research with Pulse AI</span></span></Link>
                      <Link to="/media-studio" onClick={() => setToolMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><PenLine className="h-4 w-4" /><span><span className="block font-medium">Sketch</span><span className="block text-xs text-muted-foreground">Draw and attach an image</span></span></Link>
                      <Link to="/media-studio" onClick={() => setToolMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><Video className="h-4 w-4" /><span><span className="block font-medium">HeyGen</span><span className="block text-xs text-muted-foreground">Create AI videos and avatars</span></span></Link>
                      <Link to="/connections" onClick={() => setToolMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><Sparkles className="h-4 w-4 text-cyan-400" /><span><span className="block font-medium">Canva</span><span className="block text-xs text-muted-foreground">Create, review, edit designs</span></span></Link>
                      <Link to="/connections" onClick={() => setToolMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><Sparkles className="h-4 w-4 text-violet-400" /><span><span className="block font-medium">Plugins & Connections</span><span className="block text-xs text-muted-foreground">GitHub, Drive, Gmail, Slack and more</span></span></Link>
                    </div></div>}
                  </div>
                  <button type="button" onClick={() => setEmojiMenuOpen((open) => !open)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted" aria-label="Add emoji"><Smile className="h-4 w-4" /></button>
                  {emojiMenuOpen && <div className="absolute bottom-full right-12 z-30 mb-2 grid w-64 grid-cols-8 gap-1 rounded-xl border bg-card p-2 shadow-2xl">{["😀","😂","😍","🔥","✅","🎉","👍","🙏","💡","🚀","❤️","⭐","📈","💬","🎯","🤝","🤖","🧠","💻","🖥️","⚙️","🔧","🛠️","🔌","🌐","📱","📣","📊","📢","🛒","💳","🔒","🛡️","☁️","🧩","🎨","🎬","📷","🎥","✍️","📝","📌","📍","📈","💰","🏷️","👥","👤","🤝","📞","📧","💬","🟢","🟡","🔴","⚡","✨","🛰️","🧪","🧰","🔍","🗂️","📁","📎","📚","🧾","🌍"].map((emoji) => <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="rounded p-1.5 text-lg hover:bg-muted">{emoji}</button>)}</div>}
                </div>
              </div>
              <Textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder="Shkruaj kërkesën për LEAH…" className="min-h-20 resize-none border-0 px-2 py-3 shadow-none focus-visible:ring-0" disabled={loading || initializing || !session}/>
              <div className="flex items-center gap-1 border-t px-1 pt-2">
                <button type="button" onClick={() => wrapSelection("**", "**", "teksti")} className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Bold"><Bold className="h-4 w-4" /></button>
                <button type="button" onClick={() => wrapSelection("<u>", "</u>", "teksti")} className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Underline"><Underline className="h-4 w-4" /></button>
                <button type="button" onClick={() => wrapSelection("~~", "~~", "teksti")} className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Strikethrough"><Strikethrough className="h-4 w-4" /></button>
                <button type="button" onClick={() => wrapSelection("[", "](https://)", "teksti")} className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Insert link"><span className="text-sm">🔗</span></button>
                {attachments.length > 0 && <span className="ml-2 text-xs text-muted-foreground">{attachments.length} skedar{attachments.length === 1 ? "" : "ë"} gati</span>}
                <Button type="submit" size="icon" className="ml-auto h-10 w-10 shrink-0" disabled={loading || initializing || !input.trim() || !session}><Send className="h-4 w-4" /></Button>
              </div>
            </form></CardContent></Card>}
    </div>
  </DashboardLayout>;
}