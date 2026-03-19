import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspaceBranding, WorkspaceBranding } from "@/hooks/useWorkspaceBranding";
import { Palette, Type, Image, MessageCircle, Mail, Shield, Upload, Eye } from "lucide-react";

const FONT_OPTIONS = [
  "Inter", "Plus Jakarta Sans", "DM Sans", "Outfit", "Space Grotesk",
  "Manrope", "Sora", "Satoshi", "General Sans", "Cabinet Grotesk",
];

const HSL_PRESETS = [
  { label: "Slate", value: "222 47% 11%" },
  { label: "Blue", value: "221 83% 53%" },
  { label: "Indigo", value: "239 84% 67%" },
  { label: "Violet", value: "263 70% 50%" },
  { label: "Rose", value: "347 77% 50%" },
  { label: "Orange", value: "25 95% 53%" },
  { label: "Emerald", value: "160 84% 39%" },
  { label: "Teal", value: "172 66% 50%" },
  { label: "Cyan", value: "189 94% 43%" },
];

export const BrandingSettingsPanel = () => {
  const { branding, isLoading, upsertBranding, uploadLogo } = useWorkspaceBranding();
  const [draft, setDraft] = useState<Partial<WorkspaceBranding>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<"logo" | "logo_dark" | "favicon" | "login_bg" | "chat_avatar">("logo");

  const val = (key: keyof WorkspaceBranding) =>
    (draft[key] ?? branding?.[key] ?? "") as string;

  const boolVal = (key: keyof WorkspaceBranding) =>
    draft[key] !== undefined ? draft[key] as boolean : (branding?.[key] ?? true) as boolean;

  const update = (key: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    upsertBranding.mutate(draft);
    setDraft({});
  };

  const handleFileUpload = (type: "logo" | "logo_dark" | "favicon" | "login_bg" | "chat_avatar") => {
    setUploadType(type);
    fileInputRef.current?.click();
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadLogo.mutate({ file, type: uploadType });
    }
    e.target.value = "";
  };

  const hasDraftChanges = Object.keys(draft).length > 0;

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading branding...</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Brand & White-Label</h2>
          <p className="text-xs text-muted-foreground">Personalizo pamjen e platformës për biznesin tënd</p>
        </div>
        {hasDraftChanges && (
          <Button size="sm" onClick={handleSave} disabled={upsertBranding.isPending}>
            {upsertBranding.isPending ? "Saving..." : "Save Changes"}
          </Button>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />

      <Tabs defaultValue="identity" className="space-y-3">
        <TabsList className="h-8 flex-wrap">
          <TabsTrigger value="identity" className="text-xs h-6"><Image className="h-3 w-3 mr-1" />Identiteti</TabsTrigger>
          <TabsTrigger value="colors" className="text-xs h-6"><Palette className="h-3 w-3 mr-1" />Ngjyrat</TabsTrigger>
          <TabsTrigger value="typography" className="text-xs h-6"><Type className="h-3 w-3 mr-1" />Tipografia</TabsTrigger>
          <TabsTrigger value="widget" className="text-xs h-6"><MessageCircle className="h-3 w-3 mr-1" />Chat Widget</TabsTrigger>
          <TabsTrigger value="email" className="text-xs h-6"><Mail className="h-3 w-3 mr-1" />Email</TabsTrigger>
          <TabsTrigger value="advanced" className="text-xs h-6"><Shield className="h-3 w-3 mr-1" />Avancuar</TabsTrigger>
          <TabsTrigger value="preview" className="text-xs h-6"><Eye className="h-3 w-3 mr-1" />Preview</TabsTrigger>
        </TabsList>

        {/* Identity */}
        <TabsContent value="identity">
          <Card>
            <CardHeader><CardTitle className="text-sm">Identiteti i Biznesit</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Emri i Biznesit</Label>
                  <Input value={val("business_name")} onChange={(e) => update("business_name", e.target.value)} placeholder="Emri i biznesit tënd" className="h-8 text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Tagline</Label>
                  <Input value={val("tagline")} onChange={(e) => update("tagline", e.target.value)} placeholder="Slogani i shkurtër" className="h-8 text-sm" />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-xs">Logo (Light Mode)</Label>
                  <div className="flex items-center gap-2">
                    {val("logo_url") && <img src={val("logo_url")} alt="Logo" className="h-8 w-8 object-contain rounded" />}
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleFileUpload("logo")}>
                      <Upload className="h-3 w-3 mr-1" /> Ngarko
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Logo (Dark Mode)</Label>
                  <div className="flex items-center gap-2">
                    {val("logo_dark_url") && <img src={val("logo_dark_url")} alt="Logo Dark" className="h-8 w-8 object-contain rounded" />}
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleFileUpload("logo_dark")}>
                      <Upload className="h-3 w-3 mr-1" /> Ngarko
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Favicon</Label>
                  <div className="flex items-center gap-2">
                    {val("favicon_url") && <img src={val("favicon_url")} alt="Favicon" className="h-6 w-6 object-contain rounded" />}
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleFileUpload("favicon")}>
                      <Upload className="h-3 w-3 mr-1" /> Ngarko
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Colors */}
        <TabsContent value="colors">
          <Card>
            <CardHeader><CardTitle className="text-sm">Skema e Ngjyrave</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Ngjyra Primare (HSL)</Label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {HSL_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => update("primary_color", p.value)}
                        className="h-6 w-6 rounded-full border-2 transition-all hover:scale-110"
                        style={{ backgroundColor: `hsl(${p.value})`, borderColor: val("primary_color") === p.value ? "hsl(var(--foreground))" : "transparent" }}
                        title={p.label}
                      />
                    ))}
                  </div>
                  <Input value={val("primary_color")} onChange={(e) => update("primary_color", e.target.value)} placeholder="222 47% 11%" className="h-8 text-xs font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Ngjyra Accent (HSL)</Label>
                  <Input value={val("accent_color")} onChange={(e) => update("accent_color", e.target.value)} placeholder="210 40% 96.1%" className="h-8 text-xs font-mono" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Gradient Fillim (HSL)</Label>
                  <Input value={val("brand_gradient_from")} onChange={(e) => update("brand_gradient_from", e.target.value)} placeholder="p.sh. 221 83% 53%" className="h-8 text-xs font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Gradient Mbarim (HSL)</Label>
                  <Input value={val("brand_gradient_to")} onChange={(e) => update("brand_gradient_to", e.target.value)} placeholder="p.sh. 263 70% 50%" className="h-8 text-xs font-mono" />
                </div>
              </div>

              {/* Live preview swatch */}
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: `hsl(${val("primary_color") || "222 47% 11%"})` }} />
                <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: `hsl(${val("accent_color") || "210 40% 96.1%"})` }} />
                {val("brand_gradient_from") && val("brand_gradient_to") && (
                  <div className="h-10 w-20 rounded-lg" style={{ background: `linear-gradient(135deg, hsl(${val("brand_gradient_from")}), hsl(${val("brand_gradient_to")}))` }} />
                )}
                <span className="text-xs text-muted-foreground">Preview i ngjyrave</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Typography */}
        <TabsContent value="typography">
          <Card>
            <CardHeader><CardTitle className="text-sm">Tipografia</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Fonti i Titujve</Label>
                  <Select value={val("heading_font") || "Inter"} onValueChange={(v) => update("heading_font", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((f) => (
                        <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Fonti i Tekstit</Label>
                  <Select value={val("body_font") || "Inter"} onValueChange={(v) => update("body_font", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((f) => (
                        <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <h3 className="text-lg font-bold" style={{ fontFamily: val("heading_font") || "Inter" }}>Preview Titulli</h3>
                <p className="text-sm text-muted-foreground mt-1" style={{ fontFamily: val("body_font") || "Inter" }}>
                  Ky është një paragraf shembull me fontin e zgjedhur të trupit.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chat Widget */}
        <TabsContent value="widget">
          <Card>
            <CardHeader><CardTitle className="text-sm">Chat Widget</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Mesazhi i Përshëndetjes</Label>
                <Textarea value={val("chat_widget_greeting")} onChange={(e) => update("chat_widget_greeting", e.target.value)} placeholder="Përshëndetje! Si mund t'ju ndihmojmë?" className="text-sm min-h-[60px]" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Pozicioni</Label>
                  <Select value={val("chat_widget_position") || "bottom-right"} onValueChange={(v) => update("chat_widget_position", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bottom-right" className="text-xs">Poshtë-Djathtas</SelectItem>
                      <SelectItem value="bottom-left" className="text-xs">Poshtë-Majtas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Ngjyra e Bubble</Label>
                  <Input value={val("chat_widget_bubble_color")} onChange={(e) => update("chat_widget_bubble_color", e.target.value)} placeholder="HSL p.sh. 221 83% 53%" className="h-8 text-xs font-mono" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Avatar i Chat Widget</Label>
                <div className="flex items-center gap-2">
                  {val("chat_widget_avatar_url") && <img src={val("chat_widget_avatar_url")} alt="Chat Avatar" className="h-8 w-8 rounded-full object-cover" />}
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleFileUpload("chat_avatar")}>
                    <Upload className="h-3 w-3 mr-1" /> Ngarko Avatar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email */}
        <TabsContent value="email">
          <Card>
            <CardHeader><CardTitle className="text-sm">Email Branding</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Emri i dërguesit</Label>
                <Input value={val("email_from_name")} onChange={(e) => update("email_from_name", e.target.value)} placeholder="Emri i biznesit" className="h-8 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Header HTML (Email)</Label>
                <Textarea value={val("email_header_html")} onChange={(e) => update("email_header_html", e.target.value)} placeholder="<div style='text-align:center'><img src='logo_url' height='40'/></div>" className="text-xs font-mono min-h-[80px]" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Footer HTML (Email)</Label>
                <Textarea value={val("email_footer_html")} onChange={(e) => update("email_footer_html", e.target.value)} placeholder="<p style='font-size:12px;color:#888'>© 2026 Biznesi Juaj</p>" className="text-xs font-mono min-h-[80px]" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced */}
        <TabsContent value="advanced">
          <Card>
            <CardHeader><CardTitle className="text-sm">Opsione të Avancuara</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">Trego "Powered by"</Label>
                  <p className="text-[10px] text-muted-foreground">Shfaq ose fshih etiketën "Powered by" në widget</p>
                </div>
                <Switch checked={boolVal("powered_by_visible")} onCheckedChange={(v) => update("powered_by_visible", v)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Teksti i Mirëseardhjes (Login)</Label>
                <Input value={val("login_welcome_text")} onChange={(e) => update("login_welcome_text", e.target.value)} placeholder="Mirësevini në platformën tonë" className="h-8 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Background i Login Page</Label>
                <div className="flex items-center gap-2">
                  {val("login_background_url") && <img src={val("login_background_url")} alt="Login BG" className="h-12 w-20 object-cover rounded" />}
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleFileUpload("login_bg")}>
                    <Upload className="h-3 w-3 mr-1" /> Ngarko
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">CSS Custom (Avancuar)</Label>
                <Textarea value={val("custom_css")} onChange={(e) => update("custom_css", e.target.value)} placeholder=":root { --radius: 0.75rem; }" className="text-xs font-mono min-h-[100px]" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preview */}
        <TabsContent value="preview">
          <Card>
            <CardHeader><CardTitle className="text-sm">Live Preview</CardTitle></CardHeader>
            <CardContent>
              <div
                className="rounded-xl border border-border p-6 space-y-4"
                style={{
                  fontFamily: val("body_font") || "Inter",
                  ["--preview-primary" as any]: val("primary_color") || "222 47% 11%",
                }}
              >
                <div className="flex items-center gap-3">
                  {val("logo_url") && <img src={val("logo_url")} alt="" className="h-8" />}
                  <div>
                    <h3 className="font-bold" style={{ fontFamily: val("heading_font") || "Inter", color: `hsl(${val("primary_color") || "222 47% 11%"})` }}>
                      {val("business_name") || "Emri i Biznesit"}
                    </h3>
                    {val("tagline") && <p className="text-xs text-muted-foreground">{val("tagline")}</p>}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    className="px-4 py-2 rounded-lg text-xs font-medium text-white"
                    style={{ backgroundColor: `hsl(${val("primary_color") || "222 47% 11%"})` }}
                  >
                    Buton Primar
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: `hsl(${val("accent_color") || "210 40% 96.1%"})`, color: `hsl(${val("accent_foreground") || "222.2 47.4% 11.2%"})` }}
                  >
                    Buton Sekondar
                  </button>
                </div>

                {val("brand_gradient_from") && val("brand_gradient_to") && (
                  <div
                    className="h-12 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: `linear-gradient(135deg, hsl(${val("brand_gradient_from")}), hsl(${val("brand_gradient_to")}))` }}
                  >
                    Gradient Banner
                  </div>
                )}

                {/* Mini chat widget preview */}
                <div className="flex justify-end">
                  <div className="w-64 rounded-xl shadow-lg border border-border overflow-hidden">
                    <div className="p-3 text-white text-xs font-medium" style={{ backgroundColor: `hsl(${val("chat_widget_bubble_color") || val("primary_color") || "222 47% 11%"})` }}>
                      <div className="flex items-center gap-2">
                        {val("chat_widget_avatar_url") && <img src={val("chat_widget_avatar_url")} className="h-6 w-6 rounded-full" alt="" />}
                        <span>{val("business_name") || "Support"}</span>
                      </div>
                    </div>
                    <div className="p-3 bg-background">
                      <p className="text-xs text-muted-foreground">{val("chat_widget_greeting") || "Përshëndetje!"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
