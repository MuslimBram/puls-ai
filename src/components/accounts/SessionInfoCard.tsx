import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

export const SessionInfoCard = () => {
  const { user } = useAuth();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Session Info</CardTitle>
        <CardDescription>Current login session details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Row label="Email" value={user?.email ?? "—"} />
        <Row
          label="Last sign-in"
          value={user?.last_sign_in_at ? format(new Date(user.last_sign_in_at), "PPpp") : "—"}
        />
        <Row
          label="Account created"
          value={user?.created_at ? format(new Date(user.created_at), "PPp") : "—"}
        />
      </CardContent>
    </Card>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-foreground">{value}</span>
  </div>
);
