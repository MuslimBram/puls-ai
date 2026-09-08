import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from "react";
import { Bot, Globe2, Link2, Loader2, Lock, Paperclip, Send, Sparkles } from "lucide-react";
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
      {isAdmin && <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="text-sm font-medium">Kontrollet e LEAH</p>
            <p className="text-xs text-muted-foreground">Shfaqen vetëm katër veprime kryesore; detajet hapen vetëm pasi zgjedh një.</p>
          </div>
          <OrbitSelector<LeahControl>
            items={[
              { value: "provider", label: "AI", icon: <Sparkles className="h-5 w-5" />, description: "Auto ose zgjidh providerin" },
              { value: "upload", label: "Ngarko", icon: <Paperclip className="h-5 w-5" />, description: "Skedarë për këtë punë" },
              { value: "plugins", label: "Plugins", icon: <Link2 className="h-5 w-5" />, description: "Lidhje me mjetet e punës" },
              { value: "scan", label: "Skanim", icon: <Globe2 className="h-5 w-5" />, description: "Website dhe burimet e biznesit" },
            ] satisfies OrbitSelectorItem<LeahControl>[]}
            selectedValue={controlFocus}
            onSelect={setControlFocus}
            ariaLabel="LEAH work controls"
            autoRotate={false}
            maxVisibleItems={4}
            centralContent={(item) => (
              <div className="flex flex-col items-center gap-1 text-center">
                <Sparkles className="h-6 w-6 text-primary" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">LEAH</span>
                <span className="text-xs font-semibold">{item?.label || "AI"}</span>
              </div>
            )}
          />
          <div className="rounded-lg border bg-muted/20 p-4">
            {controlFocus === "provider" && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Auto ose zgjidh AI</p>
                <select value={selectedProvider} onChange={(event) => setSelectedProvider(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="auto">Auto — Pulse AI vendos</option>
                  {providers.map((provider) => <option key={provider.provider} value={provider.provider}>{provider.provider}{provider.model ? ` · ${provider.model}` : ""}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">Vetëm provider-at aktivë dhe të validuar shfaqen.</p>
              </div>
            )}
            {controlFocus === "upload" && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Ngarko material për LEAH</p>
                <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-muted">
                  <Paperclip className="h-4 w-4" /> Zgjidh PDF, tekst ose imazh
                  <input type="file" multiple accept=".pdf,.txt,.md,.json,image/png,image/jpeg,image/webp" className="sr-only" onChange={uploadAttachments} />
                </label>
                <p className="text-xs text-muted-foreground">Maksimumi 10 MB për skedar, i ruajtur vetëm në workspace.</p>
              </div>
            )}
            {controlFocus === "plugins" && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Plugins dhe lidhje</p>
                  <p className="text-xs text-muted-foreground">Pulse AI i përdor vetëm pasi lidhja dhe autorizimi i biznesit të jenë konfirmuar.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {LEAH_PLUGIN_OPTIONS.map((plugin) => (
                    <Link key={plugin.name} to={plugin.href} className="rounded-md border p-3 transition-colors hover:bg-muted">
                      <p className="text-sm font-medium">{plugin.name}</p>
                      <p className="text-xs text-muted-foreground">{plugin.detail}</p>
                    </Link>
                  ))}
                </div>
                <Button asChild variant="outline" size="sm"><Link to="/connections">Hap të gjitha lidhjet</Link></Button>
              </div>
            )}
            {controlFocus === "scan" && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Skanimi i biznesit</p>
                  <p className="text-xs text-muted-foreground">Nxjerr produkte, shërbime, postime, oferta, çmime, kontakte, FAQ, komente dhe sinjale shitjeje nga website-i dhe burimet e lidhura.</p>
                </div>
                <Button asChild variant="outline" size="sm"><Link to="/sources?type=website">Hap Business Scanner</Link></Button>
              </div>
            )}
          </div>
          {attachments.length > 0 && <div className="flex flex-wrap gap-2">{attachments.map((attachment) => <span key={attachment.path} className="rounded-full border px-3 py-1 text-xs text-muted-foreground">{attachment.name}</span>)}</div>}
        </CardContent>
      </Card>}
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