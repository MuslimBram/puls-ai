import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Bot, ChevronDown, FileUp, Globe2, ImagePlus, Link2, LibraryBig, Loader2, Lock, PenLine, Plus, Search, Send, Sparkles, Video } from "lucide-react";
import { OrbitSelector, type OrbitSelectorItem } from "@/components/OrbitSelector";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";

type Message = { role: "user" | "assistant"; content: string };
type LeahProvider = { provider: string; model: string | null; validation_status: string };
type LeahAttachment = { name: string; path: string; size: number };
type WorkHistoryItem = { id: string; user_message: string; assistant_message: string; created_at: string };
type Session = { session_token?: string; role?: string; error?: string; providers?: LeahProvider[] };
type LeahControl = "provider" | "upload" | "plugins" | "scan";

const LEAH_PLUGIN_OPTIONS = [
  { name: "GitHub", detail: "Kod, issues dhe CI", href: "/connections" },
  { name: "Supabase", detail: "Database dhe Edge Functions", href: "/connections" },
  { name: "Vercel", detail: "Deploy dhe hosting", href: "/connections" },
  { name: "Canva", detail: "Dizajne dhe përmbajtje", href: "/connections" },
  { name: "Gmail", detail: "Email dhe komunikim", href: "/connections" },
  { name: "Google Drive / Sheets", detail: "Skedarë dhe të dhëna", href: "/connections" },
  { name: "Slack / Teams", detail: "Njoftime dhe bashkëpunim", href: "/connections" },
  { name: "WhatsApp / Telegram", detail: "Biseda dhe Inbox", href: "/connections" },
] as const;

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
  const { workspace, loading: workspaceLoading } = useWorkspace();
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
  const [controlFocus, setControlFocus] = useState<LeahControl>("provider");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const initialize = useCallback(async () => {
    if (workspaceLoading) return;
    if (!workspace?.id) {
      setInitializing(false);
      setError("No active workspace is available.");
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
  }, [workspace?.id, workspaceLoading]);

  useEffect(() => { void initialize(); }, [initialize]);

  const isAdmin = role === "admin" || role === "owner" || role === "super_admin";

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

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading || !session || !isAdmin) return;
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

  return <DashboardLayout>
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Sparkles className="h-6 w-6 text-primary" />LEAH</h1>
        <p className="mt-1 text-sm text-muted-foreground">LEAH orkestrohet nga AI kryesor i Pulse AI për lidhje, skedarë dhe gjenerim të kontrolluar.</p>
      </div>
      {isAdmin && <div className="relative z-20 flex items-center justify-between gap-3">
        <div className="relative">
          <button type="button" onClick={() => { setModelMenuOpen((open) => !open); setToolMenuOpen(false); }} className="flex min-w-56 items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2 text-left shadow-sm hover:bg-muted" aria-expanded={modelMenuOpen}>
            <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><span><span className="block text-sm font-medium">{selectedProvider === "auto" ? "Auto" : (providers.find((provider) => provider.provider === selectedProvider)?.model || selectedProvider)}</span><span className="block text-[11px] text-muted-foreground">{selectedProvider === "auto" ? "Recommended · Pulse AI chooses" : "Validated workspace model"}</span></span></span>
            <ChevronDown className={`h-4 w-4 transition-transform ${modelMenuOpen ? "rotate-180" : ""}`} />
          </button>
          {modelMenuOpen && <div className="absolute left-0 top-full mt-2 w-80 overflow-hidden rounded-xl border bg-card shadow-2xl">
            <div className="flex items-center gap-2 border-b px-3 py-3 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />Select Model</div>
            <div className="max-h-72 overflow-y-auto p-1">
              <button type="button" onClick={() => { setSelectedProvider("auto"); setModelMenuOpen(false); }} className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left hover:bg-muted ${selectedProvider === "auto" ? "bg-primary/10" : ""}`}>
                <Sparkles className="mt-0.5 h-4 w-4 text-primary" /><span><span className="flex items-center gap-2 text-sm font-medium">Auto <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">Recommended</span></span><span className="block text-xs text-muted-foreground">Always selects the best validated model</span></span>
              </button>
              {providers.map((provider) => <button key={provider.provider} type="button" onClick={() => { setSelectedProvider(provider.provider); setModelMenuOpen(false); }} className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left hover:bg-muted ${selectedProvider === provider.provider ? "bg-primary/10" : ""}`}>
                <Sparkles className="mt-0.5 h-4 w-4 text-orange-400" /><span><span className="block text-sm font-medium">{provider.model || provider.provider}</span><span className="block text-xs text-muted-foreground">{provider.provider} · active and validated</span></span>
              </button>)}
              {providers.length === 0 && <Link to="/leah/providers" onClick={() => setModelMenuOpen(false)} className="block rounded-lg px-3 py-3 text-sm text-primary hover:bg-muted">Configure a validated provider first</Link>}
            </div>
          </div>}
        </div>
        <div className="relative">
          <button type="button" onClick={() => { setToolMenuOpen((open) => !open); setModelMenuOpen(false); }} className="flex h-11 w-11 items-center justify-center rounded-xl border bg-card shadow-sm hover:bg-muted" aria-label="Open LEAH tools" aria-expanded={toolMenuOpen}><Plus className={`h-5 w-5 transition-transform ${toolMenuOpen ? "rotate-45" : ""}`} /></button>
          {toolMenuOpen && <div className="absolute right-0 top-full mt-2 w-80 overflow-hidden rounded-xl border bg-card shadow-2xl">
            <div className="space-y-1 p-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><FileUp className="h-4 w-4" /><span><span className="block font-medium">Add photos & files</span><span className="block text-xs text-muted-foreground">Upload from computer</span></span><input ref={uploadInputRef} type="file" multiple accept=".pdf,.txt,.md,.json,image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { void uploadAttachments(event); setToolMenuOpen(false); }} /></label>
              <Link to="/knowledge-base" onClick={() => setToolMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><LibraryBig className="h-4 w-4" /><span><span className="block font-medium">Add from library</span><span className="block text-xs text-muted-foreground">Browse workspace knowledge</span></span></Link>
              <Link to="/media-studio" onClick={() => setToolMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><ImagePlus className="h-4 w-4" /><span><span className="block font-medium">Create image</span><span className="block text-xs text-muted-foreground">Visualize anything</span></span></Link>
              <Link to="/sources?type=website" onClick={() => setToolMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><Search className="h-4 w-4" /><span><span className="block font-medium">Web search</span><span className="block text-xs text-muted-foreground">Find real-time business information</span></span></Link>
              <Link to="/deep-analytics" onClick={() => setToolMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><BookOpen className="h-4 w-4" /><span><span className="block font-medium">Deep research</span><span className="block text-xs text-muted-foreground">Research with Pulse AI</span></span></Link>
              <Link to="/media-studio" onClick={() => setToolMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><PenLine className="h-4 w-4" /><span><span className="block font-medium">Sketch</span><span className="block text-xs text-muted-foreground">Draw and attach an image</span></span></Link>
              <Link to="/media-studio" onClick={() => setToolMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><Video className="h-4 w-4" /><span><span className="block font-medium">HeyGen</span><span className="block text-xs text-muted-foreground">Create AI videos and avatars</span></span></Link>
              <Link to="/connections" onClick={() => setToolMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><Sparkles className="h-4 w-4 text-cyan-400" /><span><span className="block font-medium">Canva</span><span className="block text-xs text-muted-foreground">Create, review, edit designs</span></span></Link>
              <Link to="/connections" onClick={() => setToolMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><Link2 className="h-4 w-4 text-emerald-400" /><span><span className="block font-medium">Supabase</span><span className="block text-xs text-muted-foreground">Manage and query databases</span></span></Link>
            </div>
          </div>}
        </div>
      </div>
      {workHistory.length > 0 && <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Historitë e punëve</CardTitle></CardHeader>
        <CardContent className="space-y-2 pt-0">
          {workHistory.map((item) => (
            <div key={item.id} className="rounded-md border p-3">
              <p className="line-clamp-2 text-xs font-medium text-foreground">{item.user_message}</p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.assistant_message}</p>
            </div>
          ))}
        </CardContent>
      </Card>}
      {error && <Alert variant="destructive"><AlertTitle>LEAH</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!initializing && !isAdmin && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" />LEAH është e mbyllur</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Për përdoruesit normalë LEAH do të hapet vetëm me plan aktiv me pagesë. Rregullat dhe çmimi do të vendosen më vonë. Adminët dhe Owner-i kanë akses pa pagesë.</CardContent></Card>}
      {isAdmin && <Card className="flex min-h-[60vh] flex-col"><CardHeader className="border-b"><CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" />LEAH Chat</CardTitle><p className="text-xs text-muted-foreground">Ti shkruan kërkesën. Orchestrator-i i Pulse AI zgjedh provider-in dhe modelin në prapaskenë.</p></CardHeader><CardContent className="flex flex-1 flex-col gap-4 p-4"><div className="flex-1 space-y-4 overflow-y-auto rounded-lg border bg-muted/20 p-4">{messages.length === 0 && <div className="flex h-full min-h-40 items-center justify-center text-center text-sm text-muted-foreground">Shkruaj çfarë dëshiron të gjenerojë LEAH.</div>}{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm ${message.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card"}`}>{message.content}</div></div>)}{loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />LEAH po gjeneron…</div>}</div><form onSubmit={send} className="flex items-end gap-2"><Textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="P.sh. Krijo një postim Instagram për një restorant shqiptar…" className="min-h-20 resize-none" disabled={loading || initializing || !session}/><Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={loading || initializing || !input.trim() || !session}><Send className="h-4 w-4" /></Button></form></CardContent></Card>}
    </div>
  </DashboardLayout>;
}