import React, { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Check, X, Briefcase, User, Wifi, ArrowRight, ArrowUp, Shield, Zap, LogIn, ExternalLink,
} from "lucide-react";
import {
  type ConnectionMode, type ChannelCapability, type ChannelRegistryWithModes,
  getCapabilitiesForMode, supportsMode,
} from "@/hooks/useChannelCapabilities";
import { useChannels } from "@/hooks/useChannels";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ChannelConnectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: ChannelRegistryWithModes | null;
  existingChannelId?: string;
  existingMode?: ConnectionMode;
  onConnected?: () => void;
}

const CAPABILITY_LABELS: Record<ChannelCapability, { label: string; description: string }> = {
  auto_post: { label: "Auto Posting", description: "Publish content automatically" },
  manual_post: { label: "Manual Posting", description: "Post via notification reminder" },
  messaging: { label: "Direct Messaging", description: "Send & receive messages" },
  comments: { label: "Comment Management", description: "View & reply to comments" },
  analytics: { label: "Analytics", description: "Performance metrics & insights" },
  notifications: { label: "Notifications", description: "Receive alerts & reminders" },
  inbox: { label: "Unified Inbox", description: "Messages in central inbox" },
  scheduling: { label: "Scheduling", description: "Schedule posts ahead of time" },
  publishing: { label: "Publishing", description: "Publish directly from platform" },
};

const ALL_CAPABILITIES: ChannelCapability[] = [
  "auto_post", "manual_post", "messaging", "comments", "analytics",
  "notifications", "inbox", "scheduling", "publishing",
];

export const ChannelConnectionModal: React.FC<ChannelConnectionModalProps> = ({
  open, onOpenChange, channel, existingChannelId, existingMode, onConnected,
}) => {
  const isUpgrade = !!existingChannelId;
  const [step, setStep] = useState<"mode" | "credentials" | "limited_form" | "done">("mode");
  const [selectedMode, setSelectedMode] = useState<ConnectionMode>("professional");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  // Limited mode fields
  const [accountName, setAccountName] = useState("");
  const [accountUrl, setAccountUrl] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const { addChannel, updateChannel } = useChannels();
  const { workspace } = useWorkspace();

  useEffect(() => {
    if (open) {
      setStep(isUpgrade ? "credentials" : "mode");
      setSelectedMode(isUpgrade ? "professional" : "professional");
      setCredentials({});
      setAccountName("");
      setAccountUrl("");
      setLoginEmail("");
      setNotes("");
    }
  }, [open, isUpgrade]);

  if (!channel) return null;

  const hasBothModes = supportsMode(channel, "professional") && supportsMode(channel, "personal");
  const professionalCaps = getCapabilitiesForMode(channel, "professional");
  const personalCaps = getCapabilitiesForMode(channel, "personal");

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const capabilities = getCapabilitiesForMode(channel, selectedMode);
      const accountType = selectedMode === "professional" ? "business" : "personal";

      const providerMetadata: Record<string, unknown> = {};
      if (selectedMode === "personal") {
        providerMetadata.account_name = accountName;
        providerMetadata.account_url = accountUrl;
        providerMetadata.login_email = loginEmail;
        providerMetadata.notes = notes;
      }

      if (isUpgrade && existingChannelId) {
        await updateChannel.mutateAsync({
          id: existingChannelId,
          connection_mode: selectedMode,
          account_type: accountType,
          capabilities,
          provider_metadata: providerMetadata,
        });
      } else {
        await addChannel.mutateAsync({
          channel_type: channel.id,
          channel_name: selectedMode === "personal" ? (accountName || channel.name) : channel.name,
          connection_mode: selectedMode,
          account_type: accountType,
          capabilities,
          provider_metadata: providerMetadata,
          settings: selectedMode === "professional" ? credentials : {},
        });
      }
      setStep("done");
      onConnected?.();
    } catch {
      // error handled by mutation
    } finally {
      setIsConnecting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  // Channels that use OAuth flow instead of manual credentials
  const OAUTH_CHANNELS = ["instagram", "facebook"];

  const handleOAuthConnect = async () => {
    if (!channel) return;
    if (!workspace?.id) {
      toast.error("Select a workspace before connecting a social channel.");
      return;
    }
    setIsConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/oauth/callback`;
      const { data, error } = await supabase.functions.invoke("instagram-oauth-start", {
        body: {
          channel_type: channel.id,
          redirect_uri: redirectUri,
          workspace_id: workspace.id,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Failed to start OAuth");
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "OAuth failed");
      setIsConnecting(false);
    }
  };

  const handleContinue = () => {
    if (selectedMode === "personal") {
      setStep("limited_form");
    } else if (OAUTH_CHANNELS.includes(channel.id)) {
      // Trigger the provider-specific OAuth URL returned by the server.
      handleOAuthConnect();
    } else if (channel.credential_fields.length > 0) {
      setStep("credentials");
    } else {
      handleConnect();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {isUpgrade ? <ArrowUp className="h-5 w-5 text-primary" /> : <Wifi className="h-5 w-5 text-primary" />}
            {isUpgrade ? `Upgrade ${channel.name}` : `Connect ${channel.name}`}
          </DialogTitle>
          <DialogDescription>
            {step === "mode" && "Choose how you want to connect this channel."}
            {step === "credentials" && "Enter your API credentials for full integration."}
            {step === "limited_form" && "Enter your account details for notification-based connection."}
            {step === "done" && (isUpgrade ? "Channel upgraded!" : "Channel connected!")}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Mode Selection */}
        {step === "mode" && (
          <div className="space-y-6 pt-2">
            {hasBothModes ? (
              <RadioGroup
                value={selectedMode}
                onValueChange={(v) => setSelectedMode(v as ConnectionMode)}
                className="grid gap-4"
              >
                <label className={cn(
                  "flex cursor-pointer rounded-lg border-2 p-4 transition-all",
                  selectedMode === "professional" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                )}>
                  <RadioGroupItem value="professional" className="mt-1 mr-3" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-primary" />
                      <span className="font-semibold">Professional / Business</span>
                      <Badge variant="default" className="text-xs">Recommended</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Full API integration — automatic posting, analytics, inbox, and messaging.
                      Requires API credentials or OAuth connection.
                    </p>
                  </div>
                </label>

                <label className={cn(
                  "flex cursor-pointer rounded-lg border-2 p-4 transition-all",
                  selectedMode === "personal" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                )}>
                  <RadioGroupItem value="personal" className="mt-1 mr-3" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">Limited / Personal</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Notification-based — you'll receive reminders and complete actions manually in the native app.
                      No API credentials needed.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            ) : (
              <div className="rounded-lg border p-4 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="font-semibold">
                    {supportsMode(channel, "professional") ? "Professional" : "Limited"} Mode Only
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  This channel supports only {supportsMode(channel, "professional") ? "professional" : "limited"} connections.
                </p>
              </div>
            )}

            {/* Capability Comparison */}
            <div className="rounded-lg border overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 border-b">
                <span className="text-sm font-medium">Feature Comparison</span>
              </div>
              {hasBothModes && (
                <div className="flex items-center px-4 py-1.5 bg-muted/30 text-xs text-muted-foreground border-b">
                  <div className="flex-1" />
                  <div className="w-24 text-center font-medium">Professional</div>
                  <div className="w-24 text-center font-medium">Limited</div>
                </div>
              )}
              <div className="divide-y">
                {ALL_CAPABILITIES.map((cap) => {
                  const inPro = professionalCaps.includes(cap);
                  const inPersonal = personalCaps.includes(cap);
                  if (!inPro && !inPersonal) return null;
                  const info = CAPABILITY_LABELS[cap];
                  return (
                    <div key={cap} className="flex items-center px-4 py-2.5 text-sm">
                      <div className="flex-1">
                        <span className="font-medium">{info.label}</span>
                        <span className="text-muted-foreground ml-2 text-xs hidden sm:inline">{info.description}</span>
                      </div>
                      {hasBothModes ? (
                        <>
                          <div className="w-24 text-center">
                            {inPro ? <Check className="h-4 w-4 text-primary mx-auto" /> : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />}
                          </div>
                          <div className="w-24 text-center">
                            {inPersonal ? <Check className="h-4 w-4 text-primary mx-auto" /> : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />}
                          </div>
                        </>
                      ) : (
                        <div className="w-24 text-center">
                          {(supportsMode(channel, "professional") ? inPro : inPersonal)
                            ? <Check className="h-4 w-4 text-primary mx-auto" />
                            : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Button onClick={handleContinue} className="w-full" disabled={isConnecting}>
              {isConnecting ? "Connecting..." : (
                <>
                  Continue with {selectedMode === "professional" ? "Professional" : "Limited"} Mode
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        )}

        {/* Step 2a: Professional — API Credentials */}
        {step === "credentials" && (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border p-3 bg-primary/5 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm">
                <strong>Professional</strong> mode — {professionalCaps.length} features enabled via API
              </span>
            </div>

            {channel.credential_fields.map((field: any) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Input
                  id={field.key}
                  type={field.type === "password" ? "password" : "text"}
                  placeholder={field.placeholder}
                  value={credentials[field.key] || ""}
                  onChange={(e) => setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))}
                />
              </div>
            ))}

            {channel.help_url && (
              <a href={channel.help_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">
                Where do I find these credentials?
              </a>
            )}

            <div className="flex gap-3">
              {!isUpgrade && (
                <Button variant="outline" onClick={() => setStep("mode")} className="flex-1">Back</Button>
              )}
              <Button
                onClick={handleConnect}
                className="flex-1"
                disabled={isConnecting || channel.credential_fields.some((f: any) => f.required && !credentials[f.key])}
              >
                {isConnecting ? "Connecting..." : (
                  <>
                    <LogIn className="h-4 w-4 mr-2" />
                    {isUpgrade ? "Upgrade Channel" : "Connect Channel"}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2b: Limited — Account Info Form */}
        {step === "limited_form" && (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border p-3 bg-muted/30 flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                <strong>Limited</strong> mode — notification-based, no API credentials needed
              </span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="account_name">
                Account Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="account_name"
                placeholder="e.g. mso.re"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="account_url">Account URL</Label>
              <Input
                id="account_url"
                placeholder={`e.g. https://www.${channel.id}.com/yourpage`}
                value={accountUrl}
                onChange={(e) => setAccountUrl(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login_email">Login Email</Label>
              <Input
                id="login_email"
                type="email"
                placeholder="your@email.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("mode")} className="flex-1">Back</Button>
              <Button
                onClick={handleConnect}
                className="flex-1"
                disabled={isConnecting || !accountName.trim()}
              >
                {isConnecting ? "Connecting..." : (
                  <>
                    <LogIn className="h-4 w-4 mr-2" />
                    Connect Channel
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === "done" && (
          <div className="text-center py-6 space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Check className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                {channel.name} {isUpgrade ? "Upgraded" : "Connected"}!
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {isUpgrade ? "Upgraded to" : "Connected in"} <strong>{selectedMode}</strong> mode with{" "}
                {getCapabilitiesForMode(channel, selectedMode).length} features enabled.
              </p>
            </div>
            {selectedMode === "personal" && supportsMode(channel, "professional") && (
              <div className="rounded-lg border p-3 bg-muted/30 text-sm text-muted-foreground">
                💡 You can upgrade to Professional mode later for full automation and analytics.
              </div>
            )}
            <Button onClick={handleClose} className="w-full">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
