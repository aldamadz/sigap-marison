import { useEffect, useMemo, useState } from "react";
import { Clock, Hash, Loader2, Plus, Save, Search, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAppDialog } from "@/components/app/AppDialogProvider";

type ScopeType = "pusat" | "cabang" | "cabang_000";
type ReuseUnit = "hours" | "days";

const currentYear = new Date().getFullYear();

const SCOPE_LABELS: Record<ScopeType, string> = {
  pusat: "Pusat (per departemen)",
  cabang: "Cabang / Proyek",
  cabang_000: "Cabang tanpa proyek",
};

const emptyForm = {
  id: "",
  scope_type: "pusat" as ScopeType,
  entity_id: "",
  dept_id: "",
  project_id: "",
  office_id: "",
  year: currentYear,
  start_from: 1,
  notes: "",
};

const scopeHint: Record<ScopeType, string> = {
  pusat: "Nomor urut per entitas, tahun, dan departemen.",
  cabang: "Nomor urut per entitas, tahun, dan proyek cabang.",
  cabang_000: "Nomor urut per entitas, tahun, dan kantor cabang tanpa proyek (mis. KEU 1 atau aset cabang).",
};

export default function LetterNumberCounterPage() {
  const { toast } = useToast();
  const appDialog = useAppDialog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [search, setSearch] = useState("");
  const [entities, setEntities] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [offices, setOffices] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [policy, setPolicy] = useState<{ id?: string; unit: ReuseUnit; value: number; notes: string; updated_at?: string }>({
    unit: "days",
    value: 1,
    notes: "",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [entityRes, deptRes, projectRes, officeRes, configRes, policyRes] = await Promise.all([
        supabase.from("master_entities").select("id, code, name").order("code", { ascending: true }),
        supabase.from("master_departments").select("id, code, name, dept_index").order("dept_index", { ascending: true }),
        supabase
          .from("master_projects")
          .select("id, code, name, office_id, entity_id, master_offices(name, code)")
          .order("name", { ascending: true }),
        supabase.from("master_offices").select("id, code, name, kedudukan").order("code", { ascending: true }),
        supabase
          .from("letter_number_counter_configs")
          .select(`
            *,
            master_entities(code, name),
            master_departments(code, name),
            master_projects(code, name, master_offices(name, code)),
            master_offices(code, name, kedudukan)
          `)
          .eq("is_active", true)
          .order("year", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("letter_number_reuse_policies")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (entityRes.error) throw entityRes.error;
      if (deptRes.error) throw deptRes.error;
      if (projectRes.error) throw projectRes.error;
      if (officeRes.error) throw officeRes.error;
      if (configRes.error) throw configRes.error;
      if (policyRes.error) throw policyRes.error;

      setEntities(entityRes.data || []);
      setDepartments(deptRes.data || []);
      setProjects(projectRes.data || []);
      setOffices(officeRes.data || []);
      setConfigs(configRes.data || []);
      if (policyRes.data) {
        setPolicy({
          id: policyRes.data.id,
          unit: policyRes.data.unit,
          value: Number(policyRes.data.value || 1),
          notes: policyRes.data.notes || "",
          updated_at: policyRes.data.updated_at,
        });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal memuat konfigurasi", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredProjects = useMemo(() => {
    if (!form.entity_id) return projects;
    return projects.filter((project) => project.entity_id === form.entity_id);
  }, [projects, form.entity_id]);

  const filteredOffices = useMemo(() => {
    return offices.filter((office) => office.kedudukan !== "Pusat");
  }, [offices]);

  const filteredConfigs = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return configs;
    return configs.filter((config) => [
      config.scope_type,
      config.year,
      config.start_from,
      config.master_entities?.code,
      config.master_entities?.name,
      config.master_departments?.code,
      config.master_departments?.name,
      config.master_projects?.code,
      config.master_projects?.name,
      config.master_projects?.master_offices?.name,
      config.master_offices?.code,
      config.master_offices?.name,
      config.notes,
    ].some((value) => String(value ?? "").toLowerCase().includes(q)));
  }, [configs, search]);

  const resetForm = () => setForm(emptyForm);

  const editConfig = (config: any) => {
    setForm({
      id: config.id,
      scope_type: config.scope_type as ScopeType,
      entity_id: config.entity_id || "",
      dept_id: config.dept_id || "",
      project_id: config.project_id || "",
      office_id: config.office_id || "",
      year: Number(config.year || currentYear),
      start_from: Number(config.start_from || 1),
      notes: config.notes || "",
    });
  };

  const scopeRequiresEntity = (scope: ScopeType, extra: any): string | null => {
    if (!extra.entity_id) return "Entitas wajib dipilih";
    if (scope === "pusat" && !extra.dept_id) return "Departemen wajib dipilih";
    if (scope === "cabang" && !extra.project_id) return "Proyek wajib dipilih";
    if (scope === "cabang_000" && !extra.office_id) return "Kantor cabang wajib dipilih";
    return null;
  };

  const saveConfig = async () => {
    const missing = scopeRequiresEntity(form.scope_type, form);
    if (missing) return toast({ variant: "destructive", title: missing });
    if (!Number.isInteger(Number(form.year)) || Number(form.year) < 2000) return toast({ variant: "destructive", title: "Tahun tidak valid" });
    if (!Number.isInteger(Number(form.start_from)) || Number(form.start_from) < 1) return toast({ variant: "destructive", title: "Nomor awal minimal 1" });

    // Perubahan counter awal berisiko: konfirmasi dampaknya.
    if (form.id) {
      const existing = configs.find((config) => config.id === form.id);
      if (existing && Number(existing.start_from) !== Number(form.start_from)) {
        const ok = await appDialog.confirm({
          title: "Ubah Nomor Awal?",
          description: "Nomor awal hanya memengaruhi penerbitan nomor baru dan pencarian nomor yang dapat dipakai ulang. Nomor yang sudah dipakai, masih dipesan, atau sudah hangus tidak akan diubah.",
          confirmText: "Ubah",
          variant: "destructive",
        });
        if (!ok) return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        scope_type: form.scope_type,
        entity_id: form.entity_id,
        dept_id: form.scope_type === "pusat" ? form.dept_id : null,
        project_id: form.scope_type === "cabang" ? form.project_id : null,
        office_id: form.scope_type === "cabang_000" ? form.office_id : null,
        year: Number(form.year),
        start_from: Number(form.start_from),
        notes: form.notes.trim() || null,
        is_active: true,
      };

      const response = form.id
        ? await supabase.from("letter_number_counter_configs").update(payload).eq("id", form.id)
        : await supabase.from("letter_number_counter_configs").insert(payload);
      if (response.error) throw response.error;

      toast({ title: "Counter awal tersimpan" });
      resetForm();
      await loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal menyimpan counter", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const savePolicy = async () => {
    if (!Number.isInteger(Number(policy.value)) || Number(policy.value) < 1 || Number(policy.value) > 3650) {
      return toast({ variant: "destructive", title: "Masa berlaku tidak valid", description: "Isi angka positif 1 sampai 3650." });
    }
    const ok = await appDialog.confirm({
      title: "Simpan masa berlaku?",
      description: "Pengaturan ini berlaku untuk draft yang dibatalkan mulai sekarang. Draft yang sudah dibatalkan sebelumnya tidak berubah.",
      confirmText: "Simpan",
    });
    if (!ok) return;

    setSavingPolicy(true);
    try {
      const payload = {
        unit: policy.unit,
        value: Number(policy.value),
        notes: policy.notes.trim() || null,
        is_active: true,
      };
      const response = policy.id
        ? await supabase.from("letter_number_reuse_policies").update(payload).eq("id", policy.id)
        : await supabase.from("letter_number_reuse_policies").insert(payload);
      if (response.error) throw response.error;
      toast({ title: "Masa berlaku tersimpan" });
      await loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal menyimpan masa berlaku", description: error.message });
    } finally {
      setSavingPolicy(false);
    }
  };

  const deactivateConfig = async (id: string) => {
    const confirmed = await appDialog.confirm({
      title: "Nonaktifkan Counter?",
      description: "Konfigurasi counter ini tidak akan dipakai lagi untuk nomor surat berikutnya.",
      confirmText: "Nonaktifkan",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      const { error } = await supabase
        .from("letter_number_counter_configs")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Konfigurasi dinonaktifkan" });
      await loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal menonaktifkan", description: error.message });
    }
  };

  const formatPolicyLabel = (unit: ReuseUnit, value: number) =>
    unit === "days" ? `${value} Hari` : `${value} Jam`;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[430px_1fr]">
      {/* ── Bagian 1: Counter awal ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Hash className="h-5 w-5 text-primary" />
            Counter Awal
          </CardTitle>
          <p className="text-xs text-muted-foreground">Nomor awal untuk setiap lingkup penomoran. Ubah hanya bila nomor lama sudah tidak dipakai.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/30 p-1">
            {(["pusat", "cabang", "cabang_000"] as ScopeType[]).map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, scope_type: scope, dept_id: "", project_id: "", office_id: "" }))}
                className={cn(
                  "rounded-lg px-1 py-2 text-[11px] font-bold uppercase leading-tight",
                  form.scope_type === scope ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-background"
                )}
              >
                {scope === "pusat" ? "Pusat" : scope === "cabang" ? "Cabang" : "Tanpa Proyek"}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{scopeHint[form.scope_type]}</p>

          <div className="space-y-2">
            <Label className="text-[11px] font-black uppercase text-muted-foreground">Entitas</Label>
            <Select value={form.entity_id} onValueChange={(value) => setForm((prev) => ({ ...prev, entity_id: value, project_id: "", office_id: "" }))}>
              <SelectTrigger><SelectValue placeholder="Pilih entitas" /></SelectTrigger>
              <SelectContent>
                {entities.map((entity) => (
                  <SelectItem key={entity.id} value={entity.id}>{entity.code} - {entity.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.scope_type === "pusat" && (
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase text-muted-foreground">Departemen</Label>
              <Select value={form.dept_id} onValueChange={(value) => setForm((prev) => ({ ...prev, dept_id: value }))}>
                <SelectTrigger><SelectValue placeholder="Pilih departemen" /></SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>{dept.code ? `${dept.code} - ` : ""}{dept.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.scope_type === "cabang" && (
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase text-muted-foreground">Proyek</Label>
              <Select value={form.project_id} onValueChange={(value) => setForm((prev) => ({ ...prev, project_id: value }))}>
                <SelectTrigger><SelectValue placeholder="Pilih proyek" /></SelectTrigger>
                <SelectContent>
                  {filteredProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.code ? `${project.code} - ` : ""}{project.name}
                      {project.master_offices?.name ? ` (${project.master_offices.name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.scope_type === "cabang_000" && (
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase text-muted-foreground">Kantor Cabang</Label>
              <Select value={form.office_id} onValueChange={(value) => setForm((prev) => ({ ...prev, office_id: value }))}>
                <SelectTrigger><SelectValue placeholder="Pilih kantor cabang" /></SelectTrigger>
                <SelectContent>
                  {filteredOffices.filter((office) => office.kedudukan !== "Pusat").map((office) => (
                    <SelectItem key={office.id} value={office.id}>{office.code} - {office.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase text-muted-foreground">Tahun</Label>
              <Input
                type="number"
                value={form.year}
                onChange={(e) => setForm((prev) => ({ ...prev, year: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase text-muted-foreground">Mulai Dari</Label>
              <Input
                type="number"
                min={1}
                value={form.start_from}
                onChange={(e) => setForm((prev) => ({ ...prev, start_from: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] font-black uppercase text-muted-foreground">Catatan</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Contoh: nomor lama terakhir 047, sistem mulai dari 048"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={saveConfig} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Simpan
            </Button>
            <Button type="button" variant="outline" onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              Baru
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Kolom kanan: daftar counter + masa berlaku ────────────── */}
      <div className="space-y-6">
        <Card>
          <CardHeader className="space-y-4">
            <CardTitle className="text-base">Daftar Counter Aktif</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari entitas, departemen, proyek, kantor, tahun..."
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredConfigs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Belum ada konfigurasi counter aktif.
                </div>
              ) : filteredConfigs.map((config) => {
                const scopeType = (config.scope_type || "pusat") as ScopeType;
                return (
                  <div key={config.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={scopeType === "pusat" ? "default" : "secondary"}>
                            {SCOPE_LABELS[scopeType] || scopeType}
                          </Badge>
                          <span className="text-sm font-black">{config.master_entities?.code || "-"}</span>
                          <span className="text-xs font-semibold text-muted-foreground">Tahun {config.year}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold">
                            {scopeType === "pusat"
                              ? `${config.master_departments?.code ? `${config.master_departments.code} - ` : ""}${config.master_departments?.name || "-"}`
                              : scopeType === "cabang"
                                ? `${config.master_projects?.code ? `${config.master_projects.code} - ` : ""}${config.master_projects?.name || "-"}`
                                : `${config.master_offices?.code ? `${config.master_offices.code} - ` : ""}${config.master_offices?.name || "-"}`}
                          </p>
                          {scopeType === "cabang" && config.master_projects?.master_offices?.name && (
                            <p className="text-xs text-muted-foreground">{config.master_projects.master_offices.name}</p>
                          )}
                          {config.notes && <p className="mt-1 text-xs text-muted-foreground">{config.notes}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="rounded-xl bg-primary/10 px-4 py-2 text-center">
                          <p className="text-[10px] font-black uppercase text-primary">Mulai</p>
                          <p className="font-mono text-lg font-black">{String(config.start_from).padStart(3, "0")}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => editConfig(config)}>Edit</Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deactivateConfig(config.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ── Bagian 2: Nomor draft dibatalkan ────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5 text-primary" />
              Nomor Draft Dibatalkan
            </CardTitle>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Saat draft bernomor dibatalkan, nomornya boleh dipakai ulang oleh pengajuan baru selama masa berlaku di bawah.
              Hitungan dimulai sejak draft dibatalkan. Setelah masa berlaku lewat tanpa nomor diambil, nomor hangus dan tidak
              dapat dipakai ulang. Nomor yang pernah terdaftar tidak pernah dapat dipakai ulang.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-32 space-y-2">
                <Label className="text-[11px] font-black uppercase text-muted-foreground">Masa Berlaku</Label>
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  aria-label="Masa Berlaku"
                  value={policy.value}
                  onChange={(e) => setPolicy((prev) => ({ ...prev, value: Number(e.target.value) }))}
                  aria-invalid={!Number.isInteger(Number(policy.value)) || Number(policy.value) < 1}
                />
              </div>
              <div className="w-36 space-y-2">
                <Label className="text-[11px] font-black uppercase text-muted-foreground">Satuan</Label>
                <Select value={policy.unit} onValueChange={(value) => setPolicy((prev) => ({ ...prev, unit: value as ReuseUnit }))}>
                  <SelectTrigger aria-label="Satuan"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hours">Jam</SelectItem>
                    <SelectItem value="days">Hari</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={savePolicy} disabled={savingPolicy}>
                {savingPolicy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Simpan
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
              <p><span className="font-semibold text-foreground">Saat ini:</span> {formatPolicyLabel(policy.unit, policy.value)} setelah pembatalan.</p>
              <p className="mt-1">
                Berlaku untuk draft yang dibatalkan <span className="font-semibold text-foreground">mulai sekarang</span>.
                {policy.updated_at ? ` Terakhir diubah: ${new Date(policy.updated_at).toLocaleString("id-ID")}.` : ""}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase text-muted-foreground">Catatan</Label>
              <Textarea
                value={policy.notes}
                onChange={(e) => setPolicy((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Contoh: beri waktu 3 hari bagi pemohon untuk mengambil kembali nomor."
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
