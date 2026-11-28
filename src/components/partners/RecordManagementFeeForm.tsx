import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { COMMISSION_POLICY } from "@/config/commissionPolicy";

/**
 * Admin-only: records a management fee a freelancer's managed business has
 * ACTUALLY paid. Only rows with status "collected" earn the freelancer's
 * management-fee share; the commission itself is created by generate-commissions.
 */
export const RecordManagementFeeForm = () => {
  const queryClient = useQueryClient();
  const [partnerId, setPartnerId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ALL");
  const [reference, setReference] = useState("");

  const { data: partners = [] } = useQuery({
    queryKey: ["admin-freelancer-partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_accounts")
        .select("id, partner_name, status")
        .eq("status", "active")
        .order("partner_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const record = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!partnerId || !workspaceId.trim() || !(value > 0) || !reference.trim()) {
        throw new Error("Partner, workspace, a positive amount and a payment reference are required");
      }
      const { data: user } = await supabase.auth.getUser();
      const { error } = await (supabase.from as any)("partner_management_fees").insert({
        partner_id: partnerId,
        workspace_id: workspaceId.trim(),
        amount: value,
        currency: currency.trim().toUpperCase() || "ALL",
        status: "collected",
        collected_at: new Date().toISOString(),
        source_reference: reference.trim(),
        recorded_by: user.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Fee recorded. The freelancer's ${COMMISSION_POLICY.freelancer.managementFeeSharePercent}% share is created on the next commission run.`);
      setAmount("");
      setReference("");
      queryClient.invalidateQueries({ queryKey: ["admin-commissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Record a collected management fee</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-5">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="mf-partner">Freelancer</Label>
          <select
            id="mf-partner"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
          >
            <option value="">Select…</option>
            {partners.map((p: { id: string; partner_name: string }) => (
              <option key={p.id} value={p.id}>{p.partner_name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1 sm:col-span-3">
          <Label htmlFor="mf-workspace">Managed business workspace ID</Label>
          <Input id="mf-workspace" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mf-amount">Amount paid</Label>
          <Input id="mf-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mf-currency">Currency</Label>
          <Input id="mf-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="mf-ref">Payment reference (unique)</Label>
          <Input id="mf-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button className="w-full" onClick={() => record.mutate()} disabled={record.isPending}>Record</Button>
        </div>
      </CardContent>
    </Card>
  );
};
