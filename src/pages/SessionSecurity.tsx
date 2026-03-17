import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserSessions, useRevokeSession } from "@/hooks/useUserSessions";
import { useTOTP } from "@/hooks/useTOTP";
import { useAuth } from "@/contexts/AuthContext";
import { AuditLogViewer } from "@/components/AuditLogViewer";
import { SecurityPosturePanel } from "@/components/SecurityPosturePanel";
import {
  Shield, Smartphone, Monitor, Loader2, LogOut, Clock, Globe,
  ShieldCheck, ShieldOff, KeyRound, QrCode, Copy, Check, ScrollText,
} from "lucide-react";
import { format } from "date-fns";

const parseDevice = (ua: string | null) => {
  if (!ua) return { type: "unknown", name: "Unknown Device" };
  const isMobile = /Mobile|Android|iPhone/i.test(ua);
  let browser = "Browser";
  if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari")) browser = "Safari";
  else if (ua.includes("Edge")) browser = "Edge";

  let os = "Unknown OS";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  return { type: isMobile ? "mobile" : "desktop", name: `${browser} on ${os}` };
};

const SessionSecurity = () => {
  const { user } = useAuth();
  const { data: sessions, isLoading } = useUserSessions();
  const revokeMutation = useRevokeSession();
  const totp = useTOTP();
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [secretCopied, setSecretCopied] = useState(false);

  const copySecret = () => {
    if (totp.enrollData?.secret) {
      navigator.clipboard.writeText(totp.enrollData.secret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Security & Sessions</h1>

        <Tabs defaultValue="2fa" className="space-y-4">
          <TabsList>
            <TabsTrigger value="2fa">Two-Factor Auth</TabsTrigger>
            <TabsTrigger value="sessions">Sessions ({sessions?.length || 0})</TabsTrigger>
            <TabsTrigger value="audit">
              <ScrollText className="h-3.5 w-3.5 mr-1" /> Audit Log
            </TabsTrigger>
            <TabsTrigger value="security">Settings</TabsTrigger>
          </TabsList>

          {/* 2FA Tab */}
          <TabsContent value="2fa" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <KeyRound className="h-5 w-5 text-primary" />
                  Two-Factor Authentication (TOTP)
                </CardTitle>
                <CardDescription>
                  Secure your account with a time-based one-time password from an authenticator app like Google Authenticator or Authy.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {totp.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : totp.status?.verified ? (
                  /* 2FA is enabled */
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                      <ShieldCheck className="h-8 w-8 text-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">2FA is enabled</p>
                        <p className="text-xs text-muted-foreground">
                          Your account is protected with TOTP authentication.
                          {totp.status.enrolledAt && ` Enabled ${format(new Date(totp.status.enrolledAt), "MMM d, yyyy")}`}
                        </p>
                      </div>
                      <Badge className="ml-auto bg-primary/10 text-primary">Active</Badge>
                    </div>

                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm font-medium text-foreground mb-2">Disable 2FA</p>
                      <p className="text-xs text-muted-foreground mb-3">Enter your current authenticator code to disable 2FA.</p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter 6-digit code"
                          value={disableCode}
                          onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          maxLength={6}
                          className="w-40 font-mono tracking-widest"
                        />
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => { totp.disable.mutate(disableCode); setDisableCode(""); }}
                          disabled={disableCode.length !== 6 || totp.disable.isPending}
                        >
                          {totp.disable.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShieldOff className="h-4 w-4 mr-1" />}
                          Disable
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : totp.enrollData ? (
                  /* Enrollment in progress */
                  <div className="space-y-4">
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
                      <QrCode className="h-6 w-6 text-primary mx-auto mb-2" />
                      <p className="text-sm font-medium text-foreground mb-2">Scan this QR code</p>
                      <div className="mx-auto w-fit rounded-lg bg-background p-3 border border-border">
                        {/* QR code as URI for manual entry */}
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totp.enrollData.otpauthUrl)}`}
                          alt="TOTP QR Code"
                          className="h-48 w-48"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">Or manually enter this secret key:</p>
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <code className="rounded bg-muted px-2 py-1 text-xs font-mono tracking-wider text-foreground">
                          {totp.enrollData.secret}
                        </code>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={copySecret}>
                          {secretCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm font-medium text-foreground mb-2">Verify setup</p>
                      <p className="text-xs text-muted-foreground mb-3">
                        Enter the 6-digit code from your authenticator app to complete setup.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="000000"
                          value={verifyCode}
                          onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          maxLength={6}
                          className="w-40 font-mono tracking-widest text-center text-lg"
                        />
                        <Button
                          onClick={() => { totp.verify.mutate(verifyCode); setVerifyCode(""); }}
                          disabled={verifyCode.length !== 6 || totp.verify.isPending}
                        >
                          {totp.verify.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
                          Verify & Enable
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Not enrolled */
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-lg border border-border p-4">
                      <ShieldOff className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">2FA is not enabled</p>
                        <p className="text-xs text-muted-foreground">
                          Add an extra layer of security to your account with a TOTP authenticator app.
                        </p>
                      </div>
                      <Badge variant="secondary" className="ml-auto">Disabled</Badge>
                    </div>
                    <Button onClick={() => totp.enroll.mutate()} disabled={totp.enroll.isPending}>
                      {totp.enroll.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <KeyRound className="h-4 w-4 mr-1" />}
                      Set up 2FA
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sessions Tab */}
          <TabsContent value="sessions" className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : !sessions?.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No active sessions found.</CardContent></Card>
            ) : (
              sessions.map((session) => {
                const device = parseDevice(session.user_agent);
                const DeviceIcon = device.type === "mobile" ? Smartphone : Monitor;
                return (
                  <Card key={session.id}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        <DeviceIcon className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{device.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {session.ip_address && (
                              <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{session.ip_address}</span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Last active {format(new Date(session.last_active_at), "MMM d, HH:mm")}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {session.is_active ? "Active" : "Expired"}
                        </Badge>
                        <Button
                          size="sm" variant="ghost" className="text-destructive"
                          onClick={() => revokeMutation.mutate(session.id)}
                          disabled={revokeMutation.isPending}
                        >
                          <LogOut className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* Audit Log Tab */}
          <TabsContent value="audit" className="space-y-4">
            <AuditLogViewer />
          </TabsContent>

          {/* Security Settings Tab */}
          <TabsContent value="security" className="space-y-4">
            <SecurityPosturePanel
              twoFactorEnabled={!!totp.status?.verified}
              activeSessionCount={sessions?.length ?? 0}
            />

            <Card>
              <CardHeader><CardTitle className="text-base">Session Settings</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Inactivity Timeout</p>
                    <p className="text-xs text-muted-foreground">Auto logout after 30 minutes of inactivity</p>
                  </div>
                  <Badge>30 min</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Session Expiry</p>
                    <p className="text-xs text-muted-foreground">Sessions expire after 24 hours</p>
                  </div>
                  <Badge>24 hours</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Step-up Authentication</p>
                    <p className="text-xs text-muted-foreground">Required for billing changes, channel connections, and team management</p>
                  </div>
                  <Badge variant="secondary">Enabled</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Account Security</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <Badge variant="outline">Verified</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Password</p>
                    <p className="text-xs text-muted-foreground">Last changed: Unknown</p>
                  </div>
                  <Button size="sm" variant="outline">Change</Button>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Two-Factor Authentication</p>
                    <p className="text-xs text-muted-foreground">
                      {totp.status?.verified ? "TOTP authenticator is active" : "Not enabled"}
                    </p>
                  </div>
                  <Badge variant={totp.status?.verified ? "default" : "secondary"}>
                    {totp.status?.verified ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default SessionSecurity;
