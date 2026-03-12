import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useChannels } from "@/hooks/useChannels";
import { toast } from "@/components/ui/sonner";
import { CheckCircle2, AlertCircle, Settings2, ExternalLink } from "lucide-react";

interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
  required?: boolean;
}

interface ChannelCredentialSetupProps {
  channelId: string;
  channelName: string;
  setupInstructions: string | null;
  credentialFields: CredentialField[];
  integrationStatus: string;
  onClose: () => void;
  open: boolean;
}

export const ChannelCredentialSetup = ({
  channelId,
  channelName,
  setupInstructions,
  credentialFields,
  integrationStatus,
  onClose,
  open,
}: ChannelCredentialSetupProps) => {
  const { channels, addChannel } = useChannels();
  const existingChannel = channels.find((c) => c.channel_type === channelId);
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const settings = (existingChannel?.settings as Record<string, string>) || {};
    return credentialFields.reduce((acc, f) => {
      acc[f.key] = settings[f.key] || "";
      return acc;
    }, {} as Record<string, string>);
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const missingRequired = credentialFields.filter(
      (f) => f.required && !fields[f.key]?.trim()
    );
    if (missingRequired.length > 0) {
      toast.error(`Please fill in: ${missingRequired.map((f) => f.label).join(", ")}`);
      return;
    }

    setSaving(true);
    try {
      await addChannel.mutateAsync({
        channel_type: channelId,
        channel_name: channelName,
        settings: fields,
      });
      toast.success(`${channelName} credentials saved`);
      onClose();
    } catch {
      // error handled by mutation
    } finally {
      setSaving(false);
    }
  };

  const hasCredentials = existingChannel && Object.keys((existingChannel.settings as Record<string, unknown>) || {}).length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Setup {channelName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {setupInstructions && (
            <p className="text-sm text-muted-foreground">{setupInstructions}</p>
          )}

          {integrationStatus === "setup_ready" && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
              <p className="text-xs text-warning flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                Requires external API credentials. Backend processing will be enabled once full integration is deployed.
              </p>
            </div>
          )}

          {existingChannel && hasCredentials && (
            <div className="rounded-lg border border-success/30 bg-success/5 p-3">
              <p className="text-xs text-success flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Credentials already saved. You can update them below.
              </p>
            </div>
          )}

          {credentialFields.length > 0 ? (
            <div className="space-y-3">
              {credentialFields.map((field) => (
                <div key={field.key}>
                  <label className="text-sm font-medium text-foreground">
                    {field.label}
                    {field.required && <span className="text-destructive ml-0.5">*</span>}
                  </label>
                  <Input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={fields[field.key] || ""}
                    onChange={(e) =>
                      setFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="mt-1"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No additional credentials needed. Add this channel directly from the channels list.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {credentialFields.length > 0 && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : existingChannel ? "Update Credentials" : "Save & Connect"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
