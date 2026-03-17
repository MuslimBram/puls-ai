import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CustomerIntelligenceProfile } from "@/components/CustomerIntelligenceProfile";
import { useContactTags, useContactTimeline } from "@/hooks/useContactTimeline";
import {
  Users, Plus, Tag, X, MessageSquare, Target, Briefcase, Phone, Send, FileText,
  Search,
} from "lucide-react";
import { format, parseISO } from "date-fns";

const typeIcons: Record<string, any> = {
  message: MessageSquare,
  lead: Target,
  deal: Briefcase,
  call: Phone,
  broadcast: Send,
  note: FileText,
};

const typeColors: Record<string, string> = {
  message: "bg-primary/10 text-primary",
  lead: "bg-yellow-500/10 text-yellow-700",
  deal: "bg-green-500/10 text-green-700",
  call: "bg-accent/10 text-accent-foreground",
  broadcast: "bg-secondary text-secondary-foreground",
  note: "bg-muted text-muted-foreground",
};

const ContactHub = () => {
  const { tags, addTag, removeTag } = useContactTags();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTag, setNewTag] = useState({ contact_identifier: "", contact_name: "", tag_type: "project", tag_value: "" });

  const timeline = useContactTimeline(selectedContact);

  // Unique contacts from tags
  const contacts = Array.from(new Map(tags.map((t) => [t.contact_identifier, t])).values())
    .filter((t) => !searchQuery || t.contact_identifier.toLowerCase().includes(searchQuery.toLowerCase()) || t.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()));

  const filteredTimeline = (timeline.data ?? []).filter((e) => filterType === "all" || e.type === filterType);

  const handleAddTag = () => {
    if (!newTag.contact_identifier || !newTag.tag_value) return;
    addTag.mutate(newTag);
    setShowAddTag(false);
    setNewTag({ contact_identifier: "", contact_name: "", tag_type: "project", tag_value: "" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Contact Hub</h1>
          <Dialog open={showAddTag} onOpenChange={setShowAddTag}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Tag Contact</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Tag a Contact</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Contact Identifier (email/phone)</Label><Input value={newTag.contact_identifier} onChange={(e) => setNewTag({ ...newTag, contact_identifier: e.target.value })} /></div>
                <div><Label>Contact Name</Label><Input value={newTag.contact_name} onChange={(e) => setNewTag({ ...newTag, contact_name: e.target.value })} /></div>
                <div>
                  <Label>Tag Type</Label>
                  <Select value={newTag.tag_type} onValueChange={(v) => setNewTag({ ...newTag, tag_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="project">Project</SelectItem>
                      <SelectItem value="service">Service</SelectItem>
                      <SelectItem value="channel">Channel</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Tag Value</Label><Input value={newTag.tag_value} onChange={(e) => setNewTag({ ...newTag, tag_value: e.target.value })} /></div>
                <Button onClick={handleAddTag} className="w-full">Add Tag</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Contact List */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search contacts..." className="pl-8 h-8 text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {contacts.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No tagged contacts yet</p>
              ) : (
                contacts.map((c) => {
                  const contactTags = tags.filter((t) => t.contact_identifier === c.contact_identifier);
                  return (
                    <Card
                      key={c.contact_identifier}
                      className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedContact === c.contact_identifier ? "ring-1 ring-primary" : ""}`}
                      onClick={() => setSelectedContact(c.contact_identifier)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground">{c.contact_name || c.contact_identifier}</p>
                            <p className="text-xs text-muted-foreground">{c.contact_identifier}</p>
                          </div>
                          <Users className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {contactTags.map((t) => (
                            <Badge key={t.id} variant="secondary" className="text-xs gap-1">
                              <Tag className="h-2.5 w-2.5" />
                              {t.tag_value}
                              <button onClick={(e) => { e.stopPropagation(); removeTag.mutate(t.id); }}>
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="lg:col-span-2">
            {selectedContact ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Timeline — {selectedContact}</CardTitle>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="message">Messages</SelectItem>
                        <SelectItem value="lead">Leads</SelectItem>
                        <SelectItem value="deal">Deals</SelectItem>
                        <SelectItem value="call">Calls</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  {timeline.isLoading ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Loading timeline...</p>
                  ) : filteredTimeline.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No timeline events found</p>
                  ) : (
                    <div className="relative space-y-0">
                      <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                      {filteredTimeline.map((event) => {
                        const Icon = typeIcons[event.type] || FileText;
                        return (
                          <div key={event.id} className="relative flex gap-3 py-3 pl-2">
                            <div className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${typeColors[event.type] || "bg-muted"}`}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-foreground">{event.title}</p>
                                <span className="text-xs text-muted-foreground">{format(parseISO(event.created_at), "MMM d, HH:mm")}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Select a contact to view their unified timeline</CardContent></Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ContactHub;
