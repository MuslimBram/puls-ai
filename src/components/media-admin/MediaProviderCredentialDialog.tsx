import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle2, KeyRound, ShieldCheck, Trash2 } from "lucide-react";

const credentialSchema = z.object({
  credentialLabel: z.string().trim().max(100, "Label must be under 100 characters").optional().or(z.literal("")),
  secret: z.string().trim().min(8, "Secret must be at least 8 characters").max(500, "Secret is too long"),
});

export interface MediaProviderCredentialSummary {
  providerKey: string;
  credentialType: string;
  credentialLabel: string | null;
  secretHint: string | null;
  isValid: boolean;
  lastValidatedAt: string | null;
  lastValidationError: string | null;
  updatedAt: string;
}

interface MediaProviderCredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: {
    provider_key: string;
    provider_name: string;
    api_secret_name?: string | null;
    is_mock?: boolean;
  };
  credential: MediaProviderCredentialSummary | null;
  onSave: (payload: { providerKey: string; secret: string; credentialLabel?: string }) => Promise<void>;
  onDelete: (providerKey: string) => Promise<void>;
  isSaving: boolean;
  isDeleting: boolean;
}

export const MediaProviderCredentialDialog = ({
  open,
  onOpenChange,
  provider,
  credential,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: MediaProviderCredentialDialogProps) => {
  const [secret, setSecret] = useState("");
  const [credentialLabel, setCredentialLabel] = useState(credential?.credentialLabel ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSecret("");
    setCredentialLabel(credential?.credentialLabel ?? "");
    setError(null);
    setConfirmDelete(false);
  }, [credential?.credentialLabel, open]);

  const statusTone = useMemo(() => {
    if (!credential) return "outline" as const;
    return credential.isValid ? ("default" as const) : ("secondary" as const);
  }, [credential]);

  const handleSave = async () => {
    const parsed = credentialSchema.safeParse({ credentialLabel, secret });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid credential");
      return;
    }

    setError(null);
    await onSave({
      providerKey: provider.provider_key,
      secret: parsed.data.secret,
      credentialLabel: parsed.data.credentialLabel || undefined,
    });

    setSecret("");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-primary" />
              Manage provider secret
            </DialogTitle>
            <DialogDescription>
              Store the private credential for <span className="font-medium text-foreground">{provider.provider_name}</span> securely in the backend. The raw value is never shown again after save.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{provider.provider_key}</Badge>
                {credential ? (
                  <Badge variant={statusTone}>
                    {credential.isValid ? <ShieldCheck className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}
                    {credential.isValid ? "Validated" : "Needs attention"}
                  </Badge>
                ) : (
                  <Badge variant="outline">No stored secret</Badge>
                )}
              </div>

              {credential ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">Saved secret:</span>{" "}
                    {credential.secretHint || "Stored securely"}
                  </p>
                  {credential.credentialLabel ? (
                    <p>
                      <span className="font-medium text-foreground">Label:</span> {credential.credentialLabel}
                    </p>
                  ) : null}
                  {credential.lastValidationError ? (
                    <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">
                      Last validation note: {credential.lastValidationError}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No secret is stored yet for this provider.
                </p>
              )}

              {provider.api_secret_name ? (
                <p className="mt-3 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  Legacy runtime env secret is also supported via <span className="font-medium text-foreground">{provider.api_secret_name}</span>.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider-credential-label">Credential label</Label>
              <Input
                id="provider-credential-label"
                value={credentialLabel}
                onChange={(event) => setCredentialLabel(event.target.value)}
                placeholder="Primary production token"
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider-credential-secret">Secret value</Label>
              <Input
                id="provider-credential-secret"
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder={credential ? "Paste a replacement secret" : "Paste provider API key / token"}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                This value is validated when the backend supports it and then stored encrypted for runtime job processing.
              </p>
            </div>

            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}

            {credential ? (
              <div className="rounded-lg border border-border p-3">
                <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={isDeleting}>
                  <Trash2 className="mr-2 h-4 w-4" /> Remove stored secret
                </Button>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving || !secret.trim()}>
              {isSaving ? "Saving..." : credential ? "Replace secret" : "Save secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove stored provider secret?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the encrypted credential for {provider.provider_name}. The provider can still use an env secret name if one is configured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                await onDelete(provider.provider_key);
                setConfirmDelete(false);
                onOpenChange(false);
              }}
            >
              {isDeleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
