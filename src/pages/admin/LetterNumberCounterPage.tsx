import { useEffect, useMemo, useState } from "react";
import { Hash, Loader2, Plus, Save, Search, Trash2 } from "lucide-react";
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

type ScopeType = "pusat" | "cabang";

const currentYear = new Date().getFullYear();

const emptyForm = {
  id: "",
  scope_type: "pusat" as ScopeType,
  entity_id: "",
  dept_id: "",
  project_id: "",
  year: currentYear,
  start_from: 1,
  notes: "",
};

export default function LetterNumberCounterPage() {
  const { toast } = useToast();
  const appDialog = useAppDialog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [entities, setEntities] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    setLoading(true);
    try {
      const [entityRes, deptRes, projectRes, configRes] = await Promise.all([
        supabase.from("master_entities").select("id, code, name").order("code", { ascending: true }),
        supabase.from("master_departments").select("id, code, name, dept_index").order("dept_index", { ascending: true }),
        supabase
          .from("master_projects")
          .select("id, code, name, office_id, entity_id, master_offices(name, code)")
          .order("name", { ascending: true }),
        supabase
          .from("letter_number_counter_configs")
          .select(`
            *,
            master_entities(code, name),
            master_departments(code, name),
            master_projects(code, name, master_offices(name, code))
          `)
          .eq("is_active", true)
          .order("year", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      if (entityRes.error) throw entityRes.error;
      if (deptRes.error) throw deptRes.error;
      if (projectRes.error) throw projectRes.error;
      if (configRes.error) throw configRes.error;

      setEntities(entityRes.data || []);
      setDepartments(deptRes.data || []);
      setProjects(projectRes.data || []);
      setConfigs(configRes.data || []);
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
      config.notes,
    ].some((value) => String(value ?? "").toLowerCase().includes(q)));
  }, [configs, search]);

  const resetForm = () => setForm(emptyForm);

  const editConfig = (config: any) => {
    setForm({
      id: config.id,
      scope_type: config.scope_type,
      entity_id: config.entity_id || "",
      dept_id: config.dept_id || "",
      project_id: config.project_id || "",
      year: Number(config.year || currentYear),
      start_from: Number(config.start_from || 1),
      notes: config.notes || "",
    });
  };

  const saveConfig = async () => {
    if (!form.entity_id) return toast({ variant: "destructive", title: "Entitas wajib dipilih" });
    if (form.scope_type === "pusat" && !form.dept_id) return toast({ variant: "destructive", title: "Departemen wajib dipilih" });
    if (form.scope_type === "cabang" && !form.project_id) return toast({ variant: "destructive", title: "Proyek wajib dipilih" });
    if (!Number.isInteger(Number(form.year)) || Number(form.year) < 2000) return toast({ variant: "destructive", title: "Tahun tidak valid" });
    if (!Number.isInteger(Number(form.start_from)) || Number(form.start_from) < 1) return toast({ variant: "destructive", title: "Nomor awal minimal 1" });

    setSaving(true);
    try {
      const payload = {
        scope_type: form.scope_type,
        entity_id: form.entity_id,
        dept_id: form.scope_type === "pusat" ? form.dept_id : null,
        project_id: form.scope_type === "cabang" ? form.project_id : null,
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[430px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Hash className="h-5 w-5 text-primary" />
            Counter Awal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/30 p-1">
            {(["pusat", "cabang"] as ScopeType[]).map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, scope_type: scope, dept_id: "", project_id: "" }))}
                className={cn(
                  "h-10 rounded-lg text-xs font-black uppercase",
                  form.scope_type === scope ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-background"
                )}
              >
                {scope === "pusat" ? "Pusat" : "Cabang/Proyek"}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] font-black uppercase text-muted-foreground">Entitas</Label>
            <Select value={form.entity_id} onValueChange={(value) => setForm((prev) => ({ ...prev, entity_id: value, project_id: "" }))}>
              <SelectTrigger><SelectValue placeholder="Pilih entitas" /></SelectTrigger>
              <SelectContent>
                {entities.map((entity) => (
                  <SelectItem key={entity.id} value={entity.id}>{entity.code} - {entity.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.scope_type === "pusat" ? (
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
          ) : (
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

      <Card>
        <CardHeader className="space-y-4">
          <CardTitle className="text-base">Daftar Counter Aktif</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari entitas, departemen, proyek, tahun..."
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
            ) : filteredConfigs.map((config) => (
              <div key={config.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={config.scope_type === "pusat" ? "default" : "secondary"}>
                        {config.scope_type === "pusat" ? "Pusat" : "Cabang/Proyek"}
                      </Badge>
                      <span className="text-sm font-black">{config.master_entities?.code || "-"}</span>
                      <span className="text-xs font-semibold text-muted-foreground">Tahun {config.year}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">
                        {config.scope_type === "pusat"
                          ? `${config.master_departments?.code ? `${config.master_departments.code} - ` : ""}${config.master_departments?.name || "-"}`
                          : `${config.master_projects?.code ? `${config.master_projects.code} - ` : ""}${config.master_projects?.name || "-"}`}
                      </p>
                      {config.scope_type === "cabang" && config.master_projects?.master_offices?.name && (
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
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
