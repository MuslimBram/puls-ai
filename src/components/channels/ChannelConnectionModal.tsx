import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Check,
  X,
  Briefcase,
  User,
  Wifi,
  ArrowRight,
  Shield,
  Zap,
} from "lucide-react";
import {
  type ConnectionMode,
  type ChannelCapability,
  type ChannelRegistryWithModes,
  getCapabilitiesForMode,
  supportsMode,
} from "@/hooks/useChannelCapabilities";
import { useChannels } from "@/hooks/useChannels";
import { cn } from "@/lib/utils";

interface ChannelConnectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: ChannelRegistryWithModes | null;
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
};

const ALL_CAPABILITIES: ChannelCapability[] = [
  "auto_post",
  "manual_post",
  "messaging",
  "comments",
  "analytics",
  "notifications",
  "inbox",
];

export const ChannelConnectionModal: React.FC<ChannelConnectionModalProps> = ({
  open,
  onOpenChange,
  channel,
  onConnected,
}) => {
  const [step, setStep] = useState<"mode" | "credentials" | "done">("mode");
  const [selectedMode, setSelectedMode] = useState<ConnectionMode>("professional");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const { addChannel } = useChannels();

  if (!channel) return null;

  const hasBothModes =
    supportsMode(channel, "professional") && supportsMode(channel, "personal");
  const professionalCaps = getCapabilitiesForMode(channel, "professional");
  const personalCaps = getCapabilitiesForMode(channel, "personal");

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const capabilities = getCapabilitiesForMode(channel, selectedMode);
      await addChannel.mutateAsync({
        channel_type: channel.id,
        channel_name: channel.name,
        settings: {
          connection_mode: selectedMode,
          account_type: selectedMode === "professional" ? "business" : "personal",
          capabilities,
          credentials,
          provider_metadata: {},
        },
      });
      setStep("done");
      onConnected?.();
    } catch {
      // error handled by mutation
    } finally {
      setIsConnecting(false);
    }
  };

  const handleClose = () => {
    setStep("mode");
    setSelectedMode("professional");
    setCredentials({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Wifi className="h-5 w-5 text-primary" />
            Connect {channel.name}
          </DialogTitle>
          <DialogDescription>
            {step === "mode" && "Choose how you want to connect this channel."}
            {step === "credentials" && "Enter your credentials to complete the connection."}
            {step === "done" && "Channel connected successfully!"}
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
                {/* Professional Mode Card */}
                <label
                  className={cn(
                    "flex cursor-pointer rounded-lg border-2 p-4 transition-all",
                    selectedMode === "professional"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  )}
                >
                  <RadioGroupItem value="professional" className="mt-1 mr-3" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-primary" />
                      <span className="font-semibold">Professional / Business</span>
                      <Badge variant="default" className="text-xs">Recommended</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Full integration with automatic posting, analytics, inbox, and messaging where supported.
                    </p>
                  </div>
                </label>

                {/* Personal Mode Card */}
                <label
                  className={cn(
                    "flex cursor-pointer rounded-lg border-2 p-4 transition-all",
                    selectedMode === "personal"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  )}
                >
                  <RadioGroupItem value="personal" className="mt-1 mr-3" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">Personal / Notification-Only</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Notification reminders with manual posting in the native app. Limited capabilities.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            ) : (
              <div className="rounded-lg border p-4 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="font-semibold">
                    {supportsMode(channel, "professional") ? "Professional" : "Personal"} Mode Only
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  This channel supports only {supportsMode(channel, "professional") ? "professional" : "personal"} connections.
                </p>
              </div>
            )}

            {/* Capability Comparison Table */}
            <div className="rounded-lg border overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 border-b">
                <span className="text-sm font-medium">Feature Comparison</span>
              </div>
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
                        <span className="text-muted-foreground ml-2 text-xs hidden sm:inline">
                          {info.description}
                        </span>
                      </div>
                      {hasBothModes && (
                        <>
                          <div className="w-24 text-center">
                            {inPro ? (
                              <Check className="h-4 w-4 text-green-500 mx-auto" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                            )}
                          </div>
                          <div className="w-24 text-center">
                            {inPersonal ? (
                              <Check className="h-4 w-4 text-green-500 mx-auto" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                            )}
                          </div>
                        </>
                      )}
                      {!hasBothModes && (
                        <div className="w-24 text-center">
                          {(supportsMode(channel, "professional") ? inPro : inPersonal) ? (
                            <Check className="h-4 w-4 text-green-500 mx-auto" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {hasBothModes && (
                <div className="flex items-center px-4 py-1.5 bg-muted/30 text-xs text-muted-foreground border-t">
                  <div className="flex-1" />
                  <div className="w-24 text-center font-medium">Professional</div>
                  <div className="w-24 text-center font-medium">Personal</div>
                </div>
              )}
            </div>

            <Button
              onClick={() => {
                if (channel.credential_fields.length > 0 && selectedMode === "professional") {
                  setStep("credentials");
                } else {
                  handleConnect();
                }
              }}
              className="w-full"
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting..." : (
                <>
                  Continue with {selectedMode === "professional" ? "Professional" : "Personal"} Mode
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        )}

        {/* Step 2: Credentials */}
        {step === "credentials" && (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border p-3 bg-muted/30 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm">
                Connecting as <strong>{selectedMode}</strong> — {getCapabilitiesForMode(channel, selectedMode).length} features enabled
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
                  onChange={(e) =>
                    setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                />
              </div>
            ))}

            {channel.help_url && (
              <a
                href={channel.help_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline"
              >
                Where do I find these credentials?
              </a>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("mode")} className="flex-1">
                Back
              </Button>
              <Button
                onClick={handleConnect}
                className="flex-1"
                disabled={isConnecting || channel.credential_fields.some(
                  (f: any) => f.required && !credentials[f.key]
                )}
              >
                {isConnecting ? "Connecting..." : "Connect Channel"}
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
              <h3 className="font-semibold text-lg">{channel.name} Connected!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Connected in <strong>{selectedMode}</strong> mode with{" "}
                {getCapabilitiesForMode(channel, selectedMode).length} features enabled.
              </p>
            </div>
            {selectedMode === "personal" && supportsMode(channel, "professional") && (
              <div className="rounded-lg border p-3 bg-muted/30 text-sm text-muted-foreground">
                💡 You can upgrade to Professional mode later for full automation and analytics.
              </div>
            )}
            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
