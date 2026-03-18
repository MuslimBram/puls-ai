import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Mail, Phone, Users } from "lucide-react";
import { format } from "date-fns";

export const AdminEnterpriseLeadPanel = () => {
  const query = useQuery({
    queryKey: ["admin-enterprise-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enterprise_leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Enterprise Leads</CardTitle>
      </CardHeader>
      <CardContent>
        {query.data?.length ? (
          <div className="space-y-3">
            {query.data.map((lead) => (
              <div key={lead.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{lead.name || lead.email}</p>
                      <Badge variant="secondary" className="text-xs">{lead.status}</Badge>
                      {lead.company_name ? <Badge variant="outline" className="text-xs">{lead.company_name}</Badge> : null}
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {lead.email}</span>
                      {lead.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {lead.phone}</span> : null}
                      {lead.team_size ? <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {lead.team_size}</span> : null}
                      {lead.company_name ? <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> {lead.company_name}</span> : null}
                    </div>
                    {lead.message ? <p className="text-sm text-foreground">{lead.message}</p> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{format(new Date(lead.created_at), "MMM d, yyyy HH:mm")}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No enterprise leads yet.</p>
        )}
      </CardContent>
    </Card>
  );
};
