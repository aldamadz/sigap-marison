import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Loader2, Plus, Save, Search, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type OverrideRow = {
  id: string;
  source_job_title: string;
  display_label: string;
  is_active: boolean;
  notes?: string | null;
};

const emptyForm = {
  id: "",
  source_job_title: "",
  display_label: "",
  is_active: true,
  notes: "",
};

export default function JobTitleDisplayOverridesPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<OverrideRow[]>([]);
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    setLoading(true);
    try {
      const [overrideRes, profileRes] = await Promise.all([
        supabase
          .from("job_title_display_overrides")
          .select("*")
          .order("source_job_title", { ascending: true }),
        supabase
          .from("profiles")
          .select("job_title")
          .not("job_title", "is", null)
          .order("job_title", { ascending: true }),
      ]);
      if (overrideRes.error) throw overrideRes.error;
      if (profileRes.error) throw profileRes.error;
      setRows((overrideRes.data || []) as OverrideRow[]);
      setJobTitles([...new Set((profileRes.data || [])
        .map((row: { job_title?: string | null }) => String(row.job_title || "").trim())
        .filter(Boolean))]);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Gagal memuat alias jabatan",
        description: error instanceof Error ? error.message : "Konfigurasi tidak dapat dimuat.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((row) =>
      `${row.source_job_title} ${row.display_label} ${row.notes || ""}`.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const reset = () => setForm(emptyForm);

  const edit = (row: OverrideRow) => {
    setForm({
      id: row.id,
      source_job_title: row.source_job_title,
      display_label: row.display_label,
      is_active: row.is_active,
      notes: row.notes || "",
    });
  };

  const save = async () => {
    const source = form.source_job_title.trim();
    const label = form.display_label.trim();
    if (!source || !label) {
      toast({
        variant: "destructive",
        title: "Data belum lengkap",
        description: "Isi jabatan asli dan label dokumen.",
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        source_job_title: source,
        display_label: label,
        is_active: form.is_active,
        notes: form.notes.trim() || null,
      };
      const query = form.id
        ? supabase.from("job_title_display_overrides").update(payload).eq("id", form.id)
        : supabase.from("job_title_display_overrides").insert(payload);
      const { error } = await query;
      if (error) throw error;
      toast({ title: "Alias jabatan tersimpan" });
      reset();
      await loadData();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Gagal menyimpan",
        description: error instanceof Error ? error.message : "Alias jabatan tidak dapat disimpan.",
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("job_title_display_overrides").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Alias jabatan dihapus" });
      if (form.id === id) reset();
      await loadData();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Gagal menghapus",
        description: error instanceof Error ? error.message : "Alias jabatan tidak dapat dihapus.",
      });
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
    <div className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BriefcaseBusiness className="h-4 w-4 text-primary" />
            Label Jabatan Dokumen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-[11px] font-black uppercase text-muted-foreground">Jabatan asli</Label>
            <Input
              list="job-title-options"
              value={form.source_job_title}
              onChange={(event) => setForm((prev) => ({ ...prev, source_job_title: event.target.value }))}
              placeholder="Manager Pengembangan Bisnis"
            />
            <datalist id="job-title-options">
              {jobTitles.map((title) => <option key={title} value={title} />)}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] font-black uppercase text-muted-foreground">Label di dokumen</Label>
            <Input
              value={form.display_label}
              onChange={(event) => setForm((prev) => ({ ...prev, display_label: event.target.value }))}
              placeholder="Mgr. PO"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] font-black uppercase text-muted-foreground">Catatan</Label>
            <Textarea
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Opsional, misalnya dipakai untuk form order bangun."
            />
          </div>

          <label className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 px-4 py-3">
            <span className="text-sm font-semibold">Aktif</span>
            <Switch
              checked={form.is_active}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_active: checked }))}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Simpan
            </Button>
            <Button variant="outline" onClick={reset} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              Baru
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Daftar Alias</CardTitle>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari jabatan atau label..."
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Belum ada alias jabatan.
            </div>
          ) : filteredRows.map((row) => (
            <div key={row.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{row.source_job_title}</p>
                    <Badge variant={row.is_active ? "default" : "secondary"}>
                      {row.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Ditampilkan sebagai <span className="font-semibold text-foreground">{row.display_label}</span>
                  </p>
                  {row.notes && <p className="text-xs text-muted-foreground">{row.notes}</p>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => edit(row)}>Edit</Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(row.id)} disabled={saving}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
