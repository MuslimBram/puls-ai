import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useBusinessRegistrations,
  useCreateBusinessRegistration,
  useSubmitForReview,
  useReviewRegistration,
  useDiscountAuditLog,
} from "@/hooks/useBusinessRegistrations";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import {
  Building2, CheckCircle, XCircle, AlertTriangle, Loader2, Send, Plus, FileText, Clock,
} from "lucide-react";
import { format } from "date-fns";

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted_for_review: "bg-yellow-500/10 text-yellow-700",
  approved: "bg-green-500/10 text-green-700",
  rejected: "bg-destructive/10 text-destructive",
  needs_changes: "bg-orange-500/10 text-orange-700",
};

export const BusinessReviewQueue = () => {
  const { permissions, isWorker, isAdmin, isController } = useRolePermissions();
  const canReview = permissions.canReviewBusinesses;
  const canRegister = permissions.canRegisterBusiness;

  const { data: allRegistrations = [], isLoading } = useBusinessRegistrations(
    canReview ? undefined : { creatorOnly: true }
  );
  const { data: auditLog = [] } = useDiscountAuditLog();
  const createReg = useCreateBusinessRegistration();
  const submitForReview = useSubmitForReview();
  const reviewReg = useReviewRegistration();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ business_name: "", industry: "", package_type: "monthly", discount_applied: 0, discount_reason: "", referral_code_used: "" });
  const [reviewNotes, setReviewNotes] = useState("");

  const pendingReview = allRegistrations.filter((r) => r.review_status === "submitted_for_review");
  const myDrafts = allRegistrations.filter((r) => r.review_status === "draft" || r.review_status === "needs_changes");

  const handleCreate = () => {
    createReg.mutate(formData);
    setFormData({ business_name: "", industry: "", package_type: "monthly", discount_applied: 0, discount_reason: "", referral_code_used: "" });
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue={canReview ? "review" : "my-registrations"}>
        <TabsList>
          {canReview && (
            <TabsTrigger value="review">
              <Clock className="h-3 w-3 mr-1" />
              Review Queue ({pendingReview.length})
            </TabsTrigger>
          )}
          {canRegister && (
            <TabsTrigger value="my-registrations">
              <Building2 className="h-3 w-3 mr-1" />
              My Registrations
            </TabsTrigger>
          )}
          {canReview && (
            <TabsTrigger value="audit">
              <FileText className="h-3 w-3 mr-1" />
              Audit Log
            </TabsTrigger>
          )}
          <TabsTrigger value="all">All ({allRegistrations.length})</TabsTrigger>
        </TabsList>

        {/* Review Queue */}
        {canReview && (
          <TabsContent value="review">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : pendingReview.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No registrations awaiting review</p>
            ) : (
              <div className="space-y-3">
                {pendingReview.map((reg) => (
                  <Card key={reg.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium text-foreground">{reg.business_name}</p>
                            <Badge className={statusColor[reg.review_status]}>{reg.review_status}</Badge>
                            <Badge variant="outline" className="text-xs">{reg.package_type}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {reg.industry || "No industry"} · Created {format(new Date(reg.created_at), "MMM d, yyyy")}
                          </p>
                          {reg.discount_applied > 0 && (
                            <p className="text-xs text-orange-600 mt-1">
                              ⚠ Discount applied: {reg.discount_applied}% — {reg.discount_reason || "No reason"}
                            </p>
                          )}
                          {reg.referral_code_used && (
                            <p className="text-xs text-blue-600">Referral: {reg.referral_code_used}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <Textarea
                            placeholder="Review notes..."
                            className="text-xs h-16 w-48"
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                          />
                          <div className="flex gap-1">
                            <Button size="sm" onClick={() => { reviewReg.mutate({ registrationId: reg.id, status: "approved", notes: reviewNotes }); setReviewNotes(""); }}>
                              <CheckCircle className="h-3 w-3 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { reviewReg.mutate({ registrationId: reg.id, status: "needs_changes", notes: reviewNotes }); setReviewNotes(""); }}>
                              <AlertTriangle className="h-3 w-3 mr-1" /> Changes
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => { reviewReg.mutate({ registrationId: reg.id, status: "rejected", notes: reviewNotes }); setReviewNotes(""); }}>
                              <XCircle className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* Worker's own registrations */}
        {canRegister && (
          <TabsContent value="my-registrations">
            <div className="space-y-4">
              {!showForm ? (
                <Button size="sm" onClick={() => setShowForm(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Register Business
                </Button>
              ) : (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">New Business Registration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input placeholder="Business Name" value={formData.business_name} onChange={(e) => setFormData({ ...formData, business_name: e.target.value })} />
                    <Input placeholder="Industry" value={formData.industry} onChange={(e) => setFormData({ ...formData, industry: e.target.value })} />
                    <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={formData.package_type} onChange={(e) => setFormData({ ...formData, package_type: e.target.value })}>
                      <option value="monthly">Monthly</option>
                      <option value="3-month">3-Month</option>
                      <option value="6-month">6-Month</option>
                      <option value="yearly">Yearly</option>
                    </select>
                    <div className="flex gap-2">
                      <Input type="number" placeholder="Discount %" className="w-24" value={formData.discount_applied || ""} onChange={(e) => setFormData({ ...formData, discount_applied: Number(e.target.value) })} />
                      <Input placeholder="Discount reason" value={formData.discount_reason} onChange={(e) => setFormData({ ...formData, discount_reason: e.target.value })} />
                    </div>
                    <Input placeholder="Referral code (optional)" value={formData.referral_code_used} onChange={(e) => setFormData({ ...formData, referral_code_used: e.target.value })} />
                    <div className="flex gap-2">
                      <Button onClick={handleCreate} disabled={!formData.business_name || createReg.isPending}>
                        {createReg.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                        Create Draft
                      </Button>
                      <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {myDrafts.map((reg) => (
                <div key={reg.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{reg.business_name}</p>
                      <Badge className={statusColor[reg.review_status]}>{reg.review_status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{reg.package_type} · {format(new Date(reg.created_at), "MMM d")}</p>
                    {reg.review_notes && <p className="text-xs text-orange-600 mt-1">Notes: {reg.review_notes}</p>}
                  </div>
                  {["draft", "needs_changes"].includes(reg.review_status) && (
                    <Button size="sm" onClick={() => submitForReview.mutate(reg.id)} disabled={submitForReview.isPending}>
                      <Send className="h-3 w-3 mr-1" /> Submit
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>
        )}

        {/* Audit Log */}
        {canReview && (
          <TabsContent value="audit">
            {auditLog.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No audit entries</p>
            ) : (
              <div className="space-y-2">
                {auditLog.map((entry: any) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{entry.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(entry.created_at), "MMM d, HH:mm")}
                        {entry.details && Object.keys(entry.details).length > 0 && (
                          <> · {JSON.stringify(entry.details)}</>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* All registrations */}
        <TabsContent value="all">
          {allRegistrations.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No registrations</p>
          ) : (
            <div className="space-y-2">
              {allRegistrations.map((reg) => (
                <div key={reg.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{reg.business_name}</p>
                      <Badge className={statusColor[reg.review_status]}>{reg.review_status}</Badge>
                      <Badge variant="outline" className="text-xs">{reg.package_type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(reg.created_at), "MMM d, yyyy")}
                      {reg.discount_applied > 0 && ` · ${reg.discount_applied}% discount`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
