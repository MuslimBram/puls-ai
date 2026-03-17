import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useStorageQuota } from "@/hooks/useStorageQuota";
import { Shield, ShieldCheck, ShieldAlert, HardDrive, Smartphone, Database } from "lucide-react";

interface SecurityPosturePanelProps {
  twoFactorEnabled: boolean;
  activeSessionCount: number;
}

const formatUsage = (used: number, max: number, suffix = "") => {
  if (max <= 0) return { label: `${used}${suffix} / ∞`, value: 0, percent: 0 };
  const percent = Math.min(100, Math.round((used / max) * 100));
  return {
    label: `${used}${suffix} / ${max}${suffix}`,
    value: used,
    percent,
  };
};

export const SecurityPosturePanel = ({ twoFactorEnabled, activeSessionCount }: SecurityPosturePanelProps) => {
  const { quota, isQuotaExceeded } = useStorageQuota();

  const postureChecks = [
    twoFactorEnabled,
    activeSessionCount <= 3,
    !isQuotaExceeded,
  ];

  const postureScore = Math.round((postureChecks.filter(Boolean).length / postureChecks.length) * 100);
  const messagesUsage = quota ? formatUsage(quota.messages_count ?? 0, quota.max_messages ?? 0) : null;
  const documentsUsage = quota ? formatUsage(quota.documents_count ?? 0, quota.max_documents ?? 0) : null;
  const mediaUsage = quota ? formatUsage(quota.media_size_mb ?? 0, quota.max_media_mb ?? 0, " MB") : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4 text-primary" />
                Security Posture
              </CardTitle>
              <CardDescription>
                Quick view of account hardening and storage protection.
              </CardDescription>
            </div>
            <Badge variant={postureScore >= 100 ? "default" : postureScore >= 67 ? "secondary" : "destructive"}>
              {postureScore}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={postureScore} className="h-2" />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
                {twoFactorEnabled ? <ShieldCheck className="h-4 w-4 text-primary" /> : <ShieldAlert className="h-4 w-4 text-destructive" />}
                Two-Factor Auth
              </div>
              <p className="text-xs text-muted-foreground">
                {twoFactorEnabled ? "Authenticator protection is enabled." : "Enable TOTP to strengthen sign-in security."}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
                <Smartphone className="h-4 w-4 text-primary" />
                Active Sessions
              </div>
              <p className="text-xs text-muted-foreground">
                {activeSessionCount} active session{activeSessionCount === 1 ? "" : "s"} detected.
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
                <HardDrive className="h-4 w-4 text-primary" />
                Workspace Quota
              </div>
              <p className="text-xs text-muted-foreground">
                {quota
                  ? isQuotaExceeded
                    ? "One or more storage limits are currently exceeded."
                    : "All workspace storage limits are within bounds."
                  : "No workspace quota data available yet."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-primary" />
            Storage Limits
          </CardTitle>
          <CardDescription>
            Hard-block protection for messages, documents, and media usage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!quota || !messagesUsage || !documentsUsage || !mediaUsage ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Workspace storage quota is not configured yet.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Messages</span>
                  <span className="font-medium text-foreground">{messagesUsage.label}</span>
                </div>
                <Progress value={messagesUsage.percent} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Documents</span>
                  <span className="font-medium text-foreground">{documentsUsage.label}</span>
                </div>
                <Progress value={documentsUsage.percent} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Media</span>
                  <span className="font-medium text-foreground">{mediaUsage.label}</span>
                </div>
                <Progress value={mediaUsage.percent} className="h-2" />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
