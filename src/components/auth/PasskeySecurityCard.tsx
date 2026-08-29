import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { usePasskeys } from "@/hooks/usePasskeys";

export const PasskeySecurityCard = () => {
  const { passkeys, isLoading, register, rename, remove } = usePasskeys();
  const [nameById, setNameById] = useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="h-5 w-5 text-primary" />
          Passkeys / FIDO2
        </CardTitle>
        <CardDescription>
          Add a device-bound sign-in key protected by Face ID, Touch ID, Windows Hello, a device PIN, or a security key.
          This is phishing-resistant authentication and is kept separate from the TOTP MFA factor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : passkeys.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No passkeys registered yet.
          </div>
        ) : (
          <div className="space-y-2">
            {passkeys.map((passkey) => (
              <div key={passkey.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{passkey.friendly_name || "Passkey"}</p>
                    <p className="text-xs text-muted-foreground">
                      Added {new Date(passkey.created_at).toLocaleDateString()}
                      {passkey.last_used_at ? ` • Last used ${new Date(passkey.last_used_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={nameById[passkey.id] ?? passkey.friendly_name ?? ""}
                    onChange={(event) => setNameById((current) => ({ ...current, [passkey.id]: event.target.value }))}
                    placeholder="Passkey name"
                    className="w-40"
                    maxLength={120}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const friendlyName = (nameById[passkey.id] ?? passkey.friendly_name ?? "").trim();
                      if (friendlyName) rename.mutate({ passkeyId: passkey.id, friendlyName });
                    }}
                    disabled={rename.isPending}
                  >
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => remove.mutate(passkey.id)}
                    disabled={remove.isPending}
                    aria-label="Remove passkey"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-start justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Register this device</p>
            <p className="text-xs text-muted-foreground">The private key stays with your device or password manager.</p>
          </div>
          <Button onClick={() => register.mutate()} disabled={register.isPending}>
            {register.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            Add passkey
          </Button>
        </div>

        <Badge variant="outline">Requires Supabase Passkeys/WebAuthn to be enabled for the project</Badge>
      </CardContent>
    </Card>
  );
};
