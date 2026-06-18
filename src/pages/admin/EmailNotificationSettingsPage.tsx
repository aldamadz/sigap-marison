import { useEffect, useState } from "react";
import { Loader2, Mail, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { defaultEmailSettings, emailSettingsService, normalizeEmailSettings, type EmailSettingsConfig } from "@/services/email-settings.service";

type Props = { embedded?: boolean };

export default function EmailNotificationSettingsPage({ embedded = false }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<EmailSettingsConfig>(defaultEmailSettings);

  useEffect(() => {
    let active = true;
    emailSettingsService.getGlobal()
      .then((data) => { if (active) setConfig(data); })
      .catch((error) => toast({ variant: "destructive", title: "Gagal memuat konfigurasi email", description: error.message }))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [toast]);

  const patch = (value: Partial<EmailSettingsConfig>) => setConfig((prev) => ({ ...prev, ...value }));
  const patchRecipients = (value: Partial<EmailSettingsConfig["recipients"]>) =>
    setConfig((prev) => ({ ...prev, recipients: { ...prev.recipients, ...value } }));
  const patchPrivacy = (value: Partial<EmailSettingsConfig["privacy"]>) =>
    setConfig((prev) => ({ ...prev, privacy: { ...prev.privacy, ...value } }));
  const patchFiles = (value: Partial<EmailSettingsConfig["files"]>) =>
    setConfig((prev) => ({ ...prev, files: { ...prev.files, ...value } }));

  const save = async () => {
    setSaving(true);
    try {
      await emailSettingsService.saveGlobal(normalizeEmailSettings(config));
      toast({ title: "Konfigurasi email tersimpan" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal menyimpan", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-56 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight">Email Notification</h1>
            <p className="text-sm text-muted-foreground">Atur detail email profesional, penerima, dan cara file dikirim.</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Alamat Sistem</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label className="text-[11px] font-black uppercase text-muted-foreground">URL SIGAP pada email</Label>
            <Input
              type="url"
              value={config.app_url}
              onChange={(e) => patch({ app_url: e.target.value })}
              placeholder="https://sigap.marison-testing.biz.id"
            />
            <p className="text-xs text-muted-foreground">
              Tombol pada email akan membuka alamat ini. Ubah saat domain production berpindah.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Penerima</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              ["user", "User tujuan"],
              ["department", "Email departemen"],
              ["office", "Email kantor/cabang"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 px-4 py-3">
                <span className="text-sm font-semibold">{label}</span>
                <Switch
                  checked={config.recipients[key as keyof typeof config.recipients]}
                  onCheckedChange={(checked) => patchRecipients({ [key]: checked } as any)}
                />
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Privasi & File</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 px-4 py-3">
              <span className="text-sm font-semibold">Tampilkan NIK di email</span>
              <Switch
                checked={config.privacy.include_nik}
                onCheckedChange={(checked) => patchPrivacy({ include_nik: checked })}
              />
            </label>

            {[
              ["main_pdf", "PDF utama"],
              ["initial_attachments", "Lampiran Pemohon"],
              ["approval_attachments", "Lampiran Proses Approval"],
            ].map(([key, label]) => (
              <div key={key} className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
                <Label className="text-[11px] font-black uppercase text-muted-foreground">{label}</Label>
                <Select
                  value={config.files[key as keyof typeof config.files] as string}
                  onValueChange={(value) => patchFiles({ [key]: value } as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="secure_link">Link aman</SelectItem>
                    <SelectItem value="attachment">Attachment email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}

            <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
              <Label className="text-[11px] font-black uppercase text-muted-foreground">Batas total attachment (MB)</Label>
              <Input
                type="number"
                min={1}
                value={config.files.max_total_attachment_mb}
                onChange={(e) => patchFiles({ max_total_attachment_mb: Number(e.target.value || 1) })}
              />
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
              <Label className="text-[11px] font-black uppercase text-muted-foreground">TTL link email (jam)</Label>
              <Input
                type="number"
                min={1}
                value={config.link_ttl_hours}
                onChange={(e) => patch({ link_ttl_hours: Number(e.target.value || 1) })}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Button onClick={save} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Simpan Konfigurasi
      </Button>
    </div>
  );
}
