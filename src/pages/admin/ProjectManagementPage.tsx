import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter 
} from "@/components/ui/dialog";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Briefcase, Plus, Pencil, Trash2, Loader2, 
  Search, Building2, Calendar, MapPin, CheckCircle2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAppDialog } from "@/components/app/AppDialogProvider";
import { cn } from "@/lib/utils";
import {
  MasterReviewStatus,
  masterReviewRowClass,
} from "@/components/admin/MasterReviewStatus";
import { normalizeManualProjectMapping, planManualProjectMapping } from "@/lib/master-project-mapping";
import { MarisonPayloadMappingCell } from "@/components/admin/MarisonPayloadMappingCell";
import { marisonPayloadMappingService, type MarisonPayloadMapping } from "@/services/marison-payload-mapping.service";
import { matchesMarisonPayloadMappingFilter } from "@/lib/marison-payload-mapping";

export default function MasterProjectManagementPage() {
  const { toast } = useToast();
  const appDialog = useAppDialog();
  const [projects, setProjects] = useState<any[]>([]);
  const [offices, setOffices] = useState<any[]>([]);
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [overrides, setOverrides] = useState<MarisonPayloadMapping[]>([]);
  const [overrideFilter, setOverrideFilter] = useState("all");

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    office_id: "",
    entity_id: "",
    marison_project_id: "",
    marison_project_code: "",
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [offRes, entRes] = await Promise.all([
        supabase.from("master_offices").select("id, name, kedudukan, marison_branch_id, marison_synced_at, marison_review_required").order("name"),
        supabase.from("master_entities").select("id, name").order("name")
      ]);

      setOffices(offRes.data || []);
      setEntities(entRes.data || []);

      const { data, error } = await supabase
        .from("master_projects")
        .select(`
          *,
           master_offices ( id, name, kedudukan, marison_branch_id, marison_synced_at, marison_review_required ),
          master_entities ( name )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProjects(data || []);
      setOverrides(await marisonPayloadMappingService.list('project'));
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal Memuat", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleOpenModal = (item: any = null) => {
    if (item) {
      setSelectedItem(item);
      setFormData({
        name: item.name,
        code: item.code || "",
        office_id: item.office_id,
        entity_id: item.entity_id || "",
        marison_project_id: item.marison_project_id == null ? "" : String(item.marison_project_id),
        marison_project_code: item.marison_project_code || "",
      });
    } else {
      setSelectedItem(null);
      setFormData({
        name: "",
        code: "",
        office_id: offices[0]?.id || "",
        entity_id: "",
        marison_project_id: "",
        marison_project_code: "",
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.office_id) {
      toast({ variant: "destructive", title: "Error", description: "Nama dan Kantor wajib diisi" });
      return;
    }

    try {
      setLoading(true);
      const externalMapping = normalizeManualProjectMapping({
        projectId: formData.marison_project_id,
        projectCode: formData.marison_project_code,
      });
      let existingMarisonProject = null;
      if (externalMapping.marison_project_id != null) {
        let duplicateQuery = supabase
          .from("master_projects")
          .select("id,name,code,marison_project_code,marison_synced_at,marison_review_required,master_offices(marison_branch_id,marison_synced_at,marison_review_required)")
          .eq("marison_project_id", externalMapping.marison_project_id);
        if (selectedItem?.id) duplicateQuery = duplicateQuery.neq("id", selectedItem.id);
        const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle();
        if (duplicateError) throw duplicateError;
        existingMarisonProject = duplicate;
      }
      const mappingPlan = planManualProjectMapping(externalMapping, existingMarisonProject);
      if (mappingPlan.targetRecordId) {
        const candidates = await marisonPayloadMappingService.catalog(
          "project",
          existingMarisonProject.code || existingMarisonProject.name,
          null,
        );
        if (!candidates.some((candidate) => candidate.id === mappingPlan.targetRecordId && candidate.valid)) {
          throw new Error("ID ini belum tersedia sebagai proyek Marison tersinkronisasi pada mapping payload staging.");
        }
      }
      const payload = { 
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        office_id: formData.office_id,
        entity_id: formData.entity_id === "none" || !formData.entity_id ? null : formData.entity_id,
        ...mappingPlan.projectMapping,
      };

      const { data: savedProject, error } = selectedItem
        ? await supabase.from("master_projects").update(payload).eq("id", selectedItem.id).select("id").single()
        : await supabase.from("master_projects").insert([payload]).select("id").single();

      if (error) throw error;
      if (mappingPlan.targetRecordId) {
        setSelectedItem({ ...payload, id: savedProject.id });
        const existingMapping = overrides.find((item) => item.entity_type === "project" && item.record_id === savedProject.id);
        try {
          await marisonPayloadMappingService.save({
            entityType: "project",
            recordId: savedProject.id,
            targetRecordId: mappingPlan.targetRecordId,
            expectedUpdatedAt: existingMapping?.updated_at,
            reason: `Memakai bersama ID Proyek Marison ${externalMapping.marison_project_id} untuk ${payload.name} dari ${existingMarisonProject.name}.`,
          });
        } catch (mappingError) {
          void loadData();
          throw new Error(`Proyek tersimpan, tetapi pemetaan ID Marison gagal: ${mappingError instanceof Error ? mappingError.message : "coba lagi"}. Coba simpan kembali atau perbaiki pada kolom Mapping Payload Staging.`);
        }
      }
      toast({ title: "Berhasil", description: mappingPlan.targetRecordId ? "Proyek tersimpan dan memakai ID Marison yang sama melalui mapping staging." : "Data proyek telah disimpan" });
      setIsModalOpen(false);
      void loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal Simpan", description: error.message });
    } finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    const project = projects.find((item) => item.id === id);
    const confirmed = await appDialog.confirm({
      title: "Hapus Proyek?",
      description: `Proyek ${project?.name || "ini"} akan dihapus dari master.`,
      confirmText: "Hapus",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      setLoading(true);
      const { error } = await supabase.from("master_projects").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Terhapus", description: "Proyek berhasil dihapus" });
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal Hapus", description: error.message });
    } finally { setLoading(false); }
  };

  const getProjectNotes = (item: any) => {
    const reasons = Array.isArray(item.marison_review_reasons)
      ? item.marison_review_reasons.filter(Boolean)
      : [];
    return reasons.length > 0 ? reasons.join(" · ") : "Lengkap";
  };

  const filteredProjects = projects
    .filter((project) => {
      const override = overrides.find((item) => item.entity_type === "project" && item.record_id === project.id);
       const hasSource = Boolean(project.marison_project_id > 0 && project.marison_synced_at && project.master_offices?.marison_branch_id > 0 && project.master_offices?.marison_synced_at);
      return matchesMarisonPayloadMappingFilter(
        overrideFilter,
        project.marison_project_id,
        hasSource,
        override,
      );
    })
    .filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.master_offices?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getProjectNotes(p).toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (!!a.marison_review_required !== !!b.marison_review_required) {
        return a.marison_review_required ? -1 : 1;
      }
      return String(a.name || "").localeCompare(String(b.name || ""), "id-ID");
    });

  return (
    <div className="sigap-page animate-in fade-in duration-300">
      {/* Header Section */}
      <div className="sigap-panel sigap-panel-accent flex flex-col items-start justify-between gap-5 p-5 md:flex-row md:items-center sm:p-6">
        <div className="space-y-1">
          <h1 className="flex items-center gap-3 text-xl font-semibold sm:text-2xl">
            <Briefcase className="h-6 w-6 text-primary" />
            Master Proyek
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Kelola proyek dan pemetaan kantor cabang.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              className="h-11 w-full pl-10 text-sm"
              placeholder="Cari proyek atau kantor..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
           <Select value={overrideFilter} onValueChange={setOverrideFilter}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua</SelectItem><SelectItem value="external">Siap dari data external</SelectItem><SelectItem value="override">Memakai pemetaan manual</SelectItem><SelectItem value="unavailable">Belum dapat dikirim</SelectItem><SelectItem value="invalid">Perlu koreksi relasi</SelectItem></SelectContent></Select>
          <Button onClick={() => handleOpenModal()} className="h-11 px-5 text-sm font-semibold">
            <Plus className="mr-2 h-4 w-4" /> Tambah manual
          </Button>
        </div>
      </div>

      {/* Table Section */}
      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="py-4 pl-6 text-xs font-semibold">Kode</TableHead>
              <TableHead className="w-[450px] text-xs font-semibold">Detail proyek</TableHead>
              <TableHead className="text-xs font-semibold">Kantor cabang</TableHead>
              <TableHead className="text-xs font-semibold">External</TableHead>
              <TableHead className="min-w-[270px] text-xs font-semibold">Status Payload</TableHead>
              <TableHead className="text-xs font-semibold">Entitas</TableHead>
              <TableHead className="text-xs font-semibold">Keterangan</TableHead>
              <TableHead className="pr-8 text-right text-xs font-semibold">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-32"><Loader2 className="animate-spin mx-auto w-10 h-10 text-primary"/></TableCell></TableRow>
            ) : filteredProjects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-20 text-center text-sm text-muted-foreground">
                  Tidak ada proyek ditemukan.
                </TableCell>
              </TableRow>
            ) : filteredProjects.map((item) => (
              <TableRow
                key={item.id}
                className={cn(
                  "group border-b border-border/50 transition-colors hover:bg-muted/20",
                  item.marison_review_required && masterReviewRowClass,
                )}
              >
                <TableCell className="pl-6">
                  <span className="rounded bg-primary/5 px-2 py-1 font-mono text-xs font-semibold text-primary">
                    {item.code || "Belum ada"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground">{item.name}</span>
                    <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar size={10} /> {new Date(item.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-secondary/50 flex items-center justify-center text-primary shrink-0">
                      <MapPin size={14} />
                    </div>
                    {/* PENGGABUNGAN KC/KCP DAN NAMA KANTOR DISINI */}
                    <span className="text-xs font-medium">
                      {item.master_offices?.kedudukan} {item.master_offices?.name}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {item.marison_project_id ? (
                    <div className="space-y-1">
                      <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                        <CheckCircle2 className="h-3 w-3" />
                        ID {item.marison_project_id}
                      </span>
                      {item.marison_project_code && (
                        <div className="font-mono text-xs text-muted-foreground">
                          {item.marison_project_code}
                        </div>
                      )}
                    </div>
                  ) : overrides.find((entry) => entry.entity_type === "project" && entry.record_id === item.id && entry.mapping_valid) ? (
                    <span className="text-xs text-foreground">ID {overrides.find((entry) => entry.entity_type === "project" && entry.record_id === item.id)?.mapped_external_id} via mapping staging</span>
                  ) : <span className="text-xs text-muted-foreground">Manual SIGAP</span>}
                </TableCell>
                  <TableCell><MarisonPayloadMappingCell entityType="project" recordId={item.id} sigapLabel={`${item.name} / ${item.code || '-'}`} externalIdentity={item.marison_project_id > 0 && item.master_offices?.marison_branch_id > 0 ? `Project ${item.marison_project_id} / Branch ${item.master_offices.marison_branch_id}` : '-'} source={item.marison_project_id} sourceValid={Boolean(item.marison_project_id > 0 && item.marison_synced_at && item.master_offices?.marison_branch_id > 0 && item.master_offices?.marison_synced_at)} mappingValid={Boolean(overrides.find((entry) => entry.entity_type === "project" && entry.record_id === item.id)?.mapping_valid)} field="project" override={overrides.find((entry) => entry.entity_type === "project" && entry.record_id === item.id) || null} onChanged={(next) => setOverrides((current) => next ? [...current.filter((entry) => !(entry.entity_type === "project" && entry.record_id === item.id)), next] : current.filter((entry) => !(entry.entity_type === "project" && entry.record_id === item.id)))} /></TableCell>
                <TableCell>
                  <span className="rounded border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                    {item.master_entities?.name || "-"}
                  </span>
                </TableCell>
                <TableCell>
                  <MasterReviewStatus
                    required={item.marison_review_required}
                    reasons={item.marison_review_reasons}
                  />
                </TableCell>
                <TableCell className="text-right pr-8">
                  <div className="flex justify-end gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:bg-amber-50" onClick={() => handleOpenModal(item)}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/5" onClick={() => handleDelete(item.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Modal Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden p-0">
          <div className="border-b border-border bg-muted/30 p-6">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <Building2 className="w-5 h-5" />
              {selectedItem ? "Edit proyek" : "Tambah proyek"}
            </DialogTitle>
            <p className="mt-1 text-sm text-muted-foreground">Lengkapi data proyek dan kantor pengelolanya.</p>
          </div>
          
          <div className="space-y-5 overflow-y-auto p-6">
            <div className="space-y-1.5">
              <Label>Nama proyek</Label>
              <Input className="h-11" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Masukkan nama proyek" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Kode unit</Label>
                <Input className="h-11 font-mono uppercase" value={formData.code} onChange={(e) => setFormData({...formData, code: e.target.value})} placeholder="PRJ001" />
              </div>

              <div className="space-y-1.5">
                <Label>Kantor</Label>
                <Select value={formData.office_id} onValueChange={(v) => setFormData({...formData, office_id: v})}>
                  <SelectTrigger className="rounded-xl h-11 text-xs font-bold">
                    <SelectValue placeholder="Pilih Cabang" />
                  </SelectTrigger>
                  <SelectContent>
                    {offices.map(o => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.kedudukan} {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <Label>Entitas</Label>
              <Select value={formData.entity_id} onValueChange={(v) => setFormData({...formData, entity_id: v})}>
                <SelectTrigger className="rounded-xl h-11 text-xs font-bold bg-muted/30">
                  <SelectValue placeholder="Pilih Entitas (Opsional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa entitas</SelectItem>
                  {entities.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 rounded-md border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-semibold">Mapping Marison</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Kosongkan jika proyek hanya digunakan di SIGAP. Isi ID dari API Marison sesuai environment. Di staging, proyek lokal dapat memakai ID yang sama lewat mapping payload; branch outbound mengikuti proyek Marison tujuan.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="marison-project-id">ID Proyek Marison</Label>
                  <Input
                    id="marison-project-id"
                    inputMode="numeric"
                    className="h-11 font-mono"
                    value={formData.marison_project_id}
                    onChange={(event) => setFormData({
                      ...formData,
                      marison_project_id: event.target.value.replace(/[^\d]/g, ""),
                    })}
                    placeholder="Contoh: 19"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="marison-project-code">Kode Proyek Marison</Label>
                  <Input
                    id="marison-project-code"
                    className="h-11 font-mono uppercase"
                    value={formData.marison_project_code}
                    onChange={(event) => setFormData({
                      ...formData,
                      marison_project_code: event.target.value,
                    })}
                    placeholder="Contoh: PRJ01"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 bg-muted/20 flex gap-2">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={loading} className="px-8">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
