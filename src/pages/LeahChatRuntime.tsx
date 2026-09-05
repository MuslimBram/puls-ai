import { FormEvent, useCallback, useEffect, useState } from "react";
import { Bot, Loader2, Lock, Send, Sparkles } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";

type Message = { role: "user" | "assistant"; content: string };
type Session = { session_token?: string; role?: string; error?: string };

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open LEAH");
    } finally {
      setInitializing(false);
    }
  }, [workspace?.id, workspaceLoading]);

  useEffect(() => { void initialize(); }, [initialize]);

  const isAdmin = role === "admin" || role === "owner" || role === "super_admin";

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
        body: { user: text, conversation: next },
        headers: { "X-Leah-Session": session },
      });
      if (invokeError) throw new Error(await functionError(invokeError, "LEAH generation failed"));
      if (!data?.text) throw new Error(data?.error || "LEAH returned no result");
      setMessages((current) => [...current, { role: "assistant", content: data.text as string }]);
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
        <p className="mt-1 text-sm text-muted-foreground">Chat me LEAH. Pulse AI vendos vetë cili AI dhe model do të gjenerojë përgjigjen.</p>
      </div>
      {error && <Alert variant="destructive"><AlertTitle>LEAH</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!initializing && !isAdmin && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" />LEAH është e mbyllur</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Për përdoruesit normalë LEAH do të hapet vetëm me plan aktiv me pagesë. Rregullat dhe çmimi do të vendosen më vonë. Adminët dhe Owner-i kanë akses pa pagesë.</CardContent></Card>}
      {isAdmin && <Card className="flex min-h-[60vh] flex-col"><CardHeader className="border-b"><CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" />LEAH Chat</CardTitle><p className="text-xs text-muted-foreground">Ti shkruan kërkesën. Orchestrator-i i Pulse AI zgjedh provider-in dhe modelin në prapaskenë.</p></CardHeader><CardContent className="flex flex-1 flex-col gap-4 p-4"><div className="flex-1 space-y-4 overflow-y-auto rounded-lg border bg-muted/20 p-4">{messages.length === 0 && <div className="flex h-full min-h-40 items-center justify-center text-center text-sm text-muted-foreground">Shkruaj çfarë dëshiron të gjenerojë LEAH.</div>}{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm ${message.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card"}`}>{message.content}</div></div>)}{loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />LEAH po gjeneron…</div>}</div><form onSubmit={send} className="flex items-end gap-2"><Textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="P.sh. Krijo një postim Instagram për një restorant shqiptar…" className="min-h-20 resize-none" disabled={loading || initializing || !session}/><Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={loading || initializing || !input.trim() || !session}><Send className="h-4 w-4" /></Button></form></CardContent></Card>}
    </div>
  </DashboardLayout>;
}