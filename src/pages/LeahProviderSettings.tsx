import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";

type ProviderBinding = {
  provider: string;
  model: string;
  status: string;
  validation_status: string;
  validation_error_code: string | null;
  last_validated_at: string | null;
  credential_hint: string | null;
  credential_version: number | null;
  credential_status: string | null;
};

type LeahSessionResponse = {
  session_token?: string;
  role?: string;
  expires_at?: string;
  error?: string;
};

type ProviderListResponse = {
  providers?: ProviderBinding[];
};

type ProviderTestResponse = {
  ok: boolean;
  provider: string;
  model: string;
  latency_ms?: number;
};

const PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-4o-mini";

async function getFunctionError(error: unknown, fallback: string) {
  const context = (error as { context?: Response } | null)?.context;

  if (context && typeof context.clone === "function") {
    try {
      const payload = (await context.clone().json()) as { error?: string };
      if (payload.error) return payload.error;
    } catch {
      // Fall through to the safe client error.
    }
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

async function invokeLeahAccount<T>(
  sessionToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("leah-account", {
    body,
    headers: { "X-Leah-Session": sessionToken },
  });

  if (error) {
    throw new Error(await getFunctionError(error, "LEAH request failed"));
  }

  return data as T;
}

function formatValidatedAt(value: string | null) {
  if (!value) return "Not tested yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function validationBadge(binding: ProviderBinding | null) {
  if (!binding) return <Badge variant="secondary">Not configured</Badge>;
  if (binding.validation_status === "valid") {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Validated</Badge>;
  }
  if (binding.validation_status === "invalid") {
    return <Badge variant="destructive">Invalid</Badge>;
  }
  return <Badge variant="outline">{binding.validation_status || "Pending"}</Badge>;
}

export default function LeahProviderSettings() {
  const { workspace, loading: workspaceLoading } = useWorkspace();
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [leahSessionToken, setLeahSessionToken] = useState<string | null>(null);
  const [leahRole, setLeahRole] = useState<string | null>(null);
  const [binding, setBinding] = useState<ProviderBinding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);

  const readProvider = useCallback(async (sessionToken: string) => {
    const list = await invokeLeahAccount<ProviderListResponse>(sessionToken, {
      action: "provider.list",
    });
    const openAi = list.providers?.find((item) => item.provider === PROVIDER) ?? null;
    setBinding(openAi);
    if (openAi?.model) setModel(openAi.model);
  }, []);

  const initialize = useCallback(async () => {
    if (workspaceLoading) return;
    if (!workspace?.id) {
      setLoading(false);
      setErrorMessage("No active workspace is available.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.functions.invoke<LeahSessionResponse>(
        "leah-session",
        { body: { workspace_id: workspace.id, mode: "direct" } },
      );

      if (error) {
        throw new Error(await getFunctionError(error, "Could not open a secure LEAH session"));
      }
      if (!data?.session_token) {
        throw new Error(data?.error || "Could not open a secure LEAH session");
      }

      setLeahSessionToken(data.session_token);
      setLeahRole(data.role ?? null);
      await readProvider(data.session_token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load provider settings");
    } finally {
      setLoading(false);
    }
  }, [readProvider, workspace?.id, workspaceLoading]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const handleSaveAndTest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const apiKey = apiKeyRef.current?.value.trim() ?? "";

    if (!leahSessionToken) {
      setErrorMessage("The secure LEAH session is unavailable. Reload this page and try again.");
      return;
    }
    if (apiKey.length < 8) {
      setErrorMessage("Enter the OpenAI API key you copied from the provider dashboard.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setLastLatencyMs(null);
    let saved = false;

    try {
      await invokeLeahAccount(leahSessionToken, {
        action: "provider.save",
        provider: PROVIDER,
        model: model.trim() || DEFAULT_MODEL,
        api_key: apiKey,
      });
      saved = true;

      const test = await invokeLeahAccount<ProviderTestResponse>(leahSessionToken, {
        action: "provider.test",
        provider: PROVIDER,
      });
      setLastLatencyMs(test.latency_ms ?? null);
      await readProvider(leahSessionToken);
      setSuccessMessage("OpenAI was saved in Vault and the live connection test passed.");
    } catch (error) {
      if (saved) {
        await readProvider(leahSessionToken).catch(() => undefined);
      }
      const detail = error instanceof Error ? error.message : "Unknown provider error";
      setErrorMessage(
        saved
          ? `The key was saved, but the live connection test failed: ${detail}`
          : `The OpenAI key was not saved: ${detail}`,
      );
    } finally {
      if (apiKeyRef.current) apiKeyRef.current.value = "";
      setSaving(false);
    }
  };

  const handleRetest = async () => {
    if (!leahSessionToken || !binding) return;

    setTesting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setLastLatencyMs(null);

    try {
      const test = await invokeLeahAccount<ProviderTestResponse>(leahSessionToken, {
        action: "provider.test",
        provider: PROVIDER,
      });
      setLastLatencyMs(test.latency_ms ?? null);
      await readProvider(leahSessionToken);
      setSuccessMessage("The live OpenAI connection test passed.");
    } catch (error) {
      await readProvider(leahSessionToken).catch(() => undefined);
      setErrorMessage(
        `The live connection test failed: ${error instanceof Error ? error.message : "Unknown provider error"}`,
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">LEAH provider settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure the workspace-owned OpenAI connection for live LEAH inference.
          </p>
        </div>

        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Owner-controlled secret path</AlertTitle>
          <AlertDescription>
            The key is sent directly to the protected LEAH account function and stored in
            Supabase Vault. It is never shown again or persisted in browser storage.
          </AlertDescription>
        </Alert>

        {errorMessage && (
          <Alert variant="destructive" aria-live="assertive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Provider action failed</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert aria-live="polite" className="border-emerald-500/40">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertTitle>Connection verified</AlertTitle>
            <AlertDescription>
              {successMessage}
              {lastLatencyMs !== null ? ` Latency: ${lastLatencyMs} ms.` : ""}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5" />
                  OpenAI BYOK
                </CardTitle>
                <CardDescription className="mt-1">
                  Workspace: {workspace?.name ?? "Unavailable"}
                  {leahRole ? ` · LEAH role: ${leahRole}` : ""}
                </CardDescription>
              </div>
              {loading ? <Badge variant="outline">Loading…</Badge> : validationBadge(binding)}
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {binding && (
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Credential</p>
                  <p className="font-medium">{binding.credential_hint ?? "Stored securely"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Model</p>
                  <p className="font-medium">{binding.model}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last validation</p>
                  <p className="font-medium">{formatValidatedAt(binding.last_validated_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Credential version</p>
                  <p className="font-medium">{binding.credential_version ?? "—"}</p>
                </div>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSaveAndTest}>
              <div className="space-y-2">
                <Label htmlFor="leah-openai-model">OpenAI model</Label>
                <Input
                  id="leah-openai-model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  autoComplete="off"
                  disabled={loading || saving}
                />
                <p className="text-xs text-muted-foreground">
                  The certified default is {DEFAULT_MODEL}.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="leah-openai-api-key">
                  {binding ? "Replacement OpenAI API key" : "OpenAI API key"}
                </Label>
                <Input
                  ref={apiKeyRef}
                  id="leah-openai-api-key"
                  name="openai-api-key"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  spellCheck={false}
                  disabled={loading || saving}
                  placeholder="Paste the key only here"
                />
                <p className="text-xs text-muted-foreground">
                  Saving rotates the existing workspace credential. The live test makes a
                  minimal provider request and may incur a small OpenAI charge.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={loading || saving || !leahSessionToken}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {binding ? "Rotate key & test" : "Save in Vault & test"}
                </Button>
                {binding && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRetest}
                    disabled={loading || saving || testing || !leahSessionToken}
                  >
                    {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Test existing connection
                  </Button>
                )}
                {!loading && !leahSessionToken && (
                  <Button type="button" variant="outline" onClick={() => void initialize()}>
                    Reopen secure session
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
