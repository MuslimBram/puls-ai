import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Mail } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export const LoginProvidersCard = () => {
  const { user } = useAuth();

  const providers = [
    {
      id: "email",
      name: "Email / Password",
      connected: true,
      identifier: user?.email || "",
      icon: Mail,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="h-5 w-5 text-primary" />
          Login Providers
        </CardTitle>
        <CardDescription>Manage how you sign in to your account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {providers.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-lg border border-border p-4"
          >
            <div className="flex items-center gap-3">
              <p.icon className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.identifier}</p>
              </div>
            </div>
            <Badge variant={p.connected ? "default" : "secondary"}>
              {p.connected ? "Connected" : "Not Connected"}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
