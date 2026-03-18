import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  useDeleteMediaProviderCredential,
  useMediaAdminAnalytics,
  useMediaProviderCredentials,
  useMediaProviderSettings,
  useMediaUsagePolicies,
  useUpsertMediaProviderCredential,
  useUpsertMediaProviderSetting,
  useUpdateMediaUsagePolicy,
} from "@/hooks/useMediaAdmin";
import { Activity, KeyRound, Save, Server, ShieldCheck, Video, Wand2 } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "@/components/ui/sonner";
import {
  MediaProviderCredentialDialog,
  type MediaProviderCredentialSummary,
} from "@/components/media-admin/MediaProviderCredentialDialog";

type ProviderDraft = {
  provider_key: string;
  provider_name: string;
  media_types: string;
  api_secret_name: string;
  priority: string;
  is_enabled: boolean;
  is_mock: boolean;
  config: string;
};

type PolicyDraft = {
  daily_image_limit: string;
  daily_video_limit: string;
  max_video_seconds: string;
  media_generation_enabled: boolean;
};

const emptyProviderDraft: ProviderDraft = {
  provider_key: "",
  provider_name: "",
  media_types: "video",
  api_secret_name: "",
  priority: "100",
  is_enabled: false,
  is_mock: false,
  config: JSON.stringify(
    {
      adapter: "replicate",
      model: "minimax/video-01",
      prompt_field: "prompt",
      input_defaults: {},
      prediction_options: {},
    },
    null,
    2,
  ),
};

export const AdminMediaStudioPanel = () => {
  const { data: providers = [] } = useMediaProviderSettings();
  const { data: providerCredentials = [] } = useMediaProviderCredentials();
  const { data: policies = [] } = useMediaUsagePolicies();
  const analytics = useMediaAdminAnalytics();
  const upsertProvider = useUpsertMediaProviderSetting();
  const upsertCredential = useUpsertMediaProviderCredential();
  const deleteCredential = useDeleteMediaProviderCredential();
  const updatePolicy = useUpdateMediaUsagePolicy();

  const [newProvider, setNewProvider] = useState<ProviderDraft>(emptyProviderDraft);
  const [providerDrafts, setProviderDrafts] = useState<Record<string, ProviderDraft>>({});
  const [policyDrafts, setPolicyDrafts] = useState<Record<string, PolicyDraft>>({});
  const [credentialProviderKey, setCredentialProviderKey] = useState<string | null>(null);

  const credentialMap = useMemo(
    () =>
      providerCredentials.reduce<Record<string, MediaProviderCredentialSummary>>((acc, credential) => {
        acc[credential.providerKey] = credential;
        return acc;
      }, {}),
    [providerCredentials],
  );

  const providerRows = useMemo(
    () =>
      providers.map((provider) => ({
        provider,
        credential: credentialMap[provider.provider_key] ?? null,
        draft: providerDrafts[provider.id] ?? {
          provider_key: provider.provider_key,
          provider_name: provider.provider_name,
          media_types: provider.media_types.join(", "),
          api_secret_name: provider.api_secret_name ?? "",
          priority: String(provider.priority),
          is_enabled: provider.is_enabled,
          is_mock: provider.is_mock,
          config: JSON.stringify(provider.config ?? {}, null, 2),
        },
      })),
    [credentialMap, providerDrafts, providers],
  );

  const activeCredentialProvider = credentialProviderKey
    ? providers.find((provider) => provider.provider_key === credentialProviderKey) ?? null
    : null;

  const handleSaveProvider = async (draft: ProviderDraft) => {
    let parsedConfig: Record<string, unknown> = {};

    try {
      parsedConfig = draft.config.trim() ? JSON.parse(draft.config) : {};
    } catch {
      toast.error("Provider config must be valid JSON");
      return;
    }

    upsertProvider.mutate({
      provider_key: draft.provider_key.trim(),
      provider_name: draft.provider_name.trim(),
      media_types: draft.media_types
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      api_secret_name: draft.api_secret_name.trim() || null,
      priority: Number(draft.priority) || 100,
      is_enabled: draft.is_enabled,
      is_mock: draft.is_mock,
      config: parsedConfig,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Activity className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-semibold text-foreground">{analytics.totalRequests}</p>
              <p className="text-xs text-muted-foreground">Requests in 30d</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Video className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-semibold text-foreground">{analytics.activeCount}</p>
              <p className="text-xs text-muted-foreground">Active media jobs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Wand2 className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-semibold text-foreground">{analytics.totalCompleted}</p>
              <p className="text-xs text-muted-foreground">Completed in 30d</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Server className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-semibold text-foreground">{analytics.totalFailed}</p>
              <p className="text-xs text-muted-foreground">Failures in 30d</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            Provider registry
          </CardTitle>
          <CardDescription>
            Define future providers, adapters, and runtime secret handling once — then swap providers later without rebuilding the module.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-lg border border-border p-4 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Provider key</Label>
              <Input
                value={newProvider.provider_key}
                onChange={(e) => setNewProvider((prev) => ({ ...prev, provider_key: e.target.value }))}
                placeholder="replicate-video"
              />
            </div>
            <div className="space-y-2">
              <Label>Provider name</Label>
              <Input
                value={newProvider.provider_name}
                onChange={(e) => setNewProvider((prev) => ({ ...prev, provider_name: e.target.value }))}
                placeholder="Replicate Video"
              />
            </div>
            <div className="space-y-2">
              <Label>Media types</Label>
              <Input
                value={newProvider.media_types}
                onChange={(e) => setNewProvider((prev) => ({ ...prev, media_types: e.target.value }))}
                placeholder="video, image"
              />
            </div>
            <div className="space-y-2">
              <Label>Env secret name (optional)</Label>
              <Input
                value={newProvider.api_secret_name}
                onChange={(e) => setNewProvider((prev) => ({ ...prev, api_secret_name: e.target.value }))}
                placeholder="REPLICATE_API_KEY"
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Input type="number" value={newProvider.priority} onChange={(e) => setNewProvider((prev) => ({ ...prev, priority: e.target.value }))} />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>Provider config (JSON)</Label>
              <Textarea value={newProvider.config} onChange={(e) => setNewProvider((prev) => ({ ...prev, config: e.target.value }))} rows={6} />
            </div>
            <div className="flex flex-col justify-end gap-3">
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span className="text-sm text-foreground">Enabled</span>
                <Switch checked={newProvider.is_enabled} onCheckedChange={(checked) => setNewProvider((prev) => ({ ...prev, is_enabled: checked }))} />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span className="text-sm text-foreground">Mock provider</span>
                <Switch checked={newProvider.is_mock} onCheckedChange={(checked) => setNewProvider((prev) => ({ ...prev, is_mock: checked }))} />
              </div>
              <Button
                onClick={async () => {
                  await handleSaveProvider(newProvider);
                  setNewProvider(emptyProviderDraft);
                }}
                disabled={!newProvider.provider_key.trim() || !newProvider.provider_name.trim() || upsertProvider.isPending}
              >
                <Save className="mr-2 h-4 w-4" /> Add provider
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {providerRows.map(({ provider, credential, draft }) => (
              <div key={provider.id} className="rounded-lg border border-border p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-medium text-foreground">{provider.provider_name}</h4>
                  <Badge variant="outline">{provider.provider_key}</Badge>
                  {provider.is_mock ? <Badge variant="secondary">Mock</Badge> : null}
                  {provider.is_enabled ? <Badge>Enabled</Badge> : <Badge variant="outline">Disabled</Badge>}
                  {credential ? (
                    <Badge variant={credential.isValid ? "default" : "secondary"}>
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      {credential.isValid ? "Secret validated" : "Secret stored"}
                    </Badge>
                  ) : null}
                </div>
                <div className="grid gap-3 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={draft.provider_name} onChange={(e) => setProviderDrafts((prev) => ({ ...prev, [provider.id]: { ...draft, provider_name: e.target.value } }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Media types</Label>
                    <Input value={draft.media_types} onChange={(e) => setProviderDrafts((prev) => ({ ...prev, [provider.id]: { ...draft, media_types: e.target.value } }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Env secret name</Label>
                    <Input value={draft.api_secret_name} onChange={(e) => setProviderDrafts((prev) => ({ ...prev, [provider.id]: { ...draft, api_secret_name: e.target.value } }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Input type="number" value={draft.priority} onChange={(e) => setProviderDrafts((prev) => ({ ...prev, [provider.id]: { ...draft, priority: e.target.value } }))} />
                  </div>
                  <div className="space-y-2 lg:col-span-2">
                    <Label>Config JSON</Label>
                    <Textarea value={draft.config} onChange={(e) => setProviderDrafts((prev) => ({ ...prev, [provider.id]: { ...draft, config: e.target.value } }))} rows={6} />
                  </div>
                  <div className="flex flex-col justify-end gap-3">
                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <span className="text-sm text-foreground">Enabled</span>
                      <Switch checked={draft.is_enabled} onCheckedChange={(checked) => setProviderDrafts((prev) => ({ ...prev, [provider.id]: { ...draft, is_enabled: checked } }))} />
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <span className="text-sm text-foreground">Mock provider</span>
                      <Switch checked={draft.is_mock} onCheckedChange={(checked) => setProviderDrafts((prev) => ({ ...prev, [provider.id]: { ...draft, is_mock: checked } }))} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => handleSaveProvider(draft)} disabled={upsertProvider.isPending} className="w-full">
                      <Save className="mr-2 h-4 w-4" /> Save provider
                    </Button>
                    {!provider.is_mock ? (
                      <Button variant="outline" onClick={() => setCredentialProviderKey(provider.provider_key)} className="w-full">
                        <KeyRound className="mr-2 h-4 w-4" /> Manage secret
                      </Button>
                    ) : null}
                  </div>
                </div>
                {credential ? (
                  <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Stored secret:</span> {credential.secretHint || "Stored securely"}
                    {credential.lastValidatedAt ? (
                      <span> · validated {formatDistanceToNowStrict(new Date(credential.lastValidatedAt), { addSuffix: true })}</span>
                    ) : null}
                    {credential.lastValidationError ? <div className="mt-1">{credential.lastValidationError}</div> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catalog-driven media entitlements</CardTitle>
          <CardDescription>Daily limits and media access are now managed only from the unified pricing catalog.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {policies.map((policy) => {
            const draft = policyDrafts[policy.id] ?? {
              daily_image_limit: String(policy.daily_image_limit),
              daily_video_limit: String(policy.daily_video_limit),
              max_video_seconds: String(policy.max_video_seconds),
              media_generation_enabled: policy.media_generation_enabled,
            };

            return (
              <div key={policy.id} className="grid gap-3 rounded-lg border border-border p-4 lg:grid-cols-5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium capitalize text-foreground">{policy.plan_key}</p>
                    {draft.media_generation_enabled ? <Badge>Enabled</Badge> : <Badge variant="outline">Disabled</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">Unified pricing catalog controls daily credits and max video duration.</p>
                </div>
                <div className="space-y-2">
                  <Label>Images / day</Label>
                  <Input type="number" value={draft.daily_image_limit} onChange={(e) => setPolicyDrafts((prev) => ({ ...prev, [policy.id]: { ...draft, daily_image_limit: e.target.value } }))} />
                </div>
                <div className="space-y-2">
                  <Label>Videos / day</Label>
                  <Input type="number" value={draft.daily_video_limit} onChange={(e) => setPolicyDrafts((prev) => ({ ...prev, [policy.id]: { ...draft, daily_video_limit: e.target.value } }))} />
                </div>
                <div className="space-y-2">
                  <Label>Max seconds</Label>
                  <Input type="number" value={draft.max_video_seconds} onChange={(e) => setPolicyDrafts((prev) => ({ ...prev, [policy.id]: { ...draft, max_video_seconds: e.target.value } }))} />
                </div>
                <div className="flex flex-col justify-between gap-3">
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span className="text-sm text-foreground">Media generation</span>
                    <Switch checked={draft.media_generation_enabled} onCheckedChange={(checked) => setPolicyDrafts((prev) => ({ ...prev, [policy.id]: { ...draft, media_generation_enabled: checked } }))} />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() =>
                      updatePolicy.mutate({
                        id: policy.id,
                        daily_image_limit: Number(draft.daily_image_limit),
                        daily_video_limit: Number(draft.daily_video_limit),
                        max_video_seconds: Number(draft.max_video_seconds),
                        media_generation_enabled: draft.media_generation_enabled,
                      })
                    }
                    disabled={updatePolicy.isPending}
                  >
                    <Save className="mr-2 h-4 w-4" /> Save catalog policy
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage analytics per user</CardTitle>
            <CardDescription>Last 30 days of permanent media usage history.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.perUser.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No media usage yet</p>
              ) : (
                analytics.perUser.map((user) => (
                  <div key={user.userId} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{user.userId.slice(0, 8)}…</p>
                      <p className="text-xs text-muted-foreground">
                        {user.images} images · {user.videos} videos · {user.failed} failed
                      </p>
                    </div>
                    <Badge variant="outline">{user.total} events</Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent provider errors</CardTitle>
            <CardDescription>Permanent error log for failed generations.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.errors.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No recent media errors</p>
              ) : (
                analytics.errors.map((error) => (
                  <div key={error.id} className="rounded-lg border border-border p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="destructive">{error.error_stage}</Badge>
                      {error.provider_key ? <Badge variant="outline">{error.provider_key}</Badge> : null}
                    </div>
                    <p className="text-sm text-foreground">{error.error_message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {error.media_type || "media"} · {formatDistanceToNowStrict(new Date(error.created_at), { addSuffix: true })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {activeCredentialProvider ? (
        <MediaProviderCredentialDialog
          open={!!activeCredentialProvider}
          onOpenChange={(open) => {
            if (!open) setCredentialProviderKey(null);
          }}
          provider={activeCredentialProvider}
          credential={credentialMap[activeCredentialProvider.provider_key] ?? null}
          onSave={async ({ providerKey, secret, credentialLabel }) => {
            await upsertCredential.mutateAsync({ providerKey, secret, credentialLabel });
          }}
          onDelete={async (providerKey) => {
            await deleteCredential.mutateAsync(providerKey);
          }}
          isSaving={upsertCredential.isPending}
          isDeleting={deleteCredential.isPending}
        />
      ) : null}
    </div>
  );
};
