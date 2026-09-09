import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";

export default function CreateBusiness() {
  const navigate = useNavigate();
  const { roles } = useRolePermissions();
  const { switchWorkspace } = useWorkspace();
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = roles.includes("admin") || roles.includes("super_admin");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate) return;
    setSaving(true);
    setError(null);

    const { data, error: createError } = await supabase.rpc("create_business_workspace" as never, {
      _business_name: businessName.trim(),
      _industry: industry.trim() || null,
      _short_description: description.trim() || null,
    } as never);

    if (createError) {
      setError(createError.message);
      setSaving(false);
      return;
    }

    const created = Array.isArray(data) ? data[0] : data;
    if (!created?.workspace_id || !created?.business_id) {
      setError("Biznesi nuk u krijua me rezultat të vlefshëm.");
      setSaving(false);
      return;
    }

    switchWorkspace(created.workspace_id);
    navigate("/business-profile");
  };

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" />Shto biznes</CardTitle>
            <CardDescription>Krijo një workspace të ri. Profili, branding-u, kanalet, CRM-ja dhe LEAH do të ruhen veçmas për këtë biznes.</CardDescription>
          </CardHeader>
          <CardContent>
            {!canCreate ? (
              <Alert variant="destructive"><AlertTitle>Pa autorizim</AlertTitle><AlertDescription>Vetëm Owner/Admin mund të shtojë biznes.</AlertDescription></Alert>
            ) : (
              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="business-name">Emri i biznesit *</Label>
                  <Input id="business-name" value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="p.sh. Acme Albania" required minLength={2} maxLength={120} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industria</Label>
                  <Input id="industry" value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="p.sh. Restorant, Klinikë, E-commerce" maxLength={100} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Përshkrim i shkurtër</Label>
                  <Textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Çfarë ofron biznesi?" maxLength={500} rows={4} />
                </div>
                {error && <Alert variant="destructive"><AlertTitle>Krijimi dështoi</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => navigate("/dashboard")}>Anulo</Button>
                  <Button type="submit" disabled={saving || businessName.trim().length < 2}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {saving ? "Po krijohet…" : "Krijo biznesin"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
