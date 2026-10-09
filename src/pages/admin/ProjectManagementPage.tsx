import { useState } from "react";
import { Briefcase, CheckCircle2, Loader2, Pencil, RefreshCw, Search, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useMasterRealtimeReload } from "@/hooks/use-master-realtime-reload";
import { useToast } from "@/hooks/use-toast";
import { useAppDialog } from "@/components/app/AppDialogProvider";
import { marisonIntegrationService } from "@/services/marison-integration.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MasterReviewStatus, masterReviewRowClass } from "@/components/admin/MasterReviewStatus";
import { cn } from "@/lib/utils";

type Project = {
  id: string; name: string; code: string | null; entity_id: string | null;
  marison_project_id: number; marison_project_code: string | null; marison_synced_at: string;
  marison_review_required: boolean; marison_review_reasons: string[];
  master_offices: { name: string; kedudukan: string; marison_branch_id: number | null; marison_synced_at: string | null } | null;
  master_entities: { name: string } | null;
};
type Entity = { id: string; name: string };

export default function MasterProjectManagementPage() {
  const { toast } = useToast();
  const appDialog = useAppDialog();
  const [projects, setProjects] = useState<Project[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Project | null>(null);
  const [entityId, setEntityId] = useState("none");

  const fetchData = async (background: boolean) => {
    try {
      if (!background) setLoading(true);
      const entityResult = await supabase.from("master_entities").select("id,name").order("name");
      if (entityResult.error) throw entityResult.error;
      const rows: Project[] = [];
      for (let page = 0; page < 100; page++) {
        const result = await supabase.from("master_projects")
          .select("*,master_offices(name,kedudukan,marison_branch_id,marison_synced_at),master_entities(name)")
          .gt("marison_project_id", 0).not("marison_synced_at", "is", null).is("local_retired_at", null)
          .order("name").order("id").range(page * 500, page * 500 + 499);
        if (result.error) throw result.error;
        const batch = result.data || [];
        rows.push(...batch);
        if (batch.length < 500) {
          setProjects(rows);
          setEntities(entityResult.data || []);
          return;
        }
      }
      throw new Error("Daftar proyek melebihi batas pemuatan. Coba kembali setelah sinkronisasi.");
    } catch (error: unknown) {
      toast({ variant: "destructive", title: "Gagal Memuat", description: error instanceof Error ? error.message : "Proyek external tidak dapat dimuat." });
    } finally {
      if (!background) setLoading(false);
    }
  };
  const reload = useMasterRealtimeReload("master-projects-live", ["master_projects", "master_offices", "marison_sync_issues"], fetchData);

  const sync = async () => {
    if (syncing || !await appDialog.confirm({ title: "Sinkronkan proyek external?", description: "Nama, kode, dan kantor proyek mengikuti API external. Surat lama tidak diubah.", confirmText: "Sinkronkan" })) return;
    setSyncing(true);
    try {
      const result = await marisonIntegrationService.syncProjects();
      toast({ title: result.failed ? "Sinkronisasi perlu diperiksa" : "Sinkronisasi selesai", description: `${result.created} proyek baru, ${result.updated} diperbarui, ${result.failed} gagal.` });
      reload();
    } catch (error: unknown) {
      toast({ variant: "destructive", title: "Sinkronisasi gagal", description: error instanceof Error ? error.message : "API external tidak dapat dihubungi." });
    } finally { setSyncing(false); }
  };
  const saveEntity = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const result = await supabase.from("master_projects").update({ entity_id: entityId === "none" ? null : entityId }).eq("id", selected.id);
      if (result.error) throw result.error;
      setSelected(null);
      reload();
      toast({ title: "Entitas proyek disimpan" });
    } catch (error: unknown) {
      toast({ variant: "destructive", title: "Gagal menyimpan", description: error instanceof Error ? error.message : "Entitas proyek tidak dapat disimpan." });
    } finally { setSaving(false); }
  };
  const filtered = projects.filter(project => [project.name, project.code, project.master_offices?.name]
    .some(value => String(value || "").toLocaleLowerCase("id-ID").includes(search.toLocaleLowerCase("id-ID"))));

  return <div className="sigap-page">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
      <div><h1 className="flex items-center gap-2 text-xl font-semibold"><Briefcase className="h-5 w-5 text-primary" />Master Proyek</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sumber proyek: API external Marison.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="h-11 pl-9" placeholder="Cari proyek atau kantor..." value={search} onChange={event => setSearch(event.target.value)} /></div>
        <Button className="h-11" disabled={syncing} onClick={() => void sync()}><RefreshCw className={cn("mr-2 h-4 w-4", syncing && "animate-spin")} />Sinkronkan</Button>
      </div>
    </header>
    <div className="overflow-x-auto border rounded-md">
      <Table><TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Proyek</TableHead><TableHead>Kantor</TableHead>
        <TableHead>ID external</TableHead><TableHead>Relasi kantor</TableHead><TableHead>Entitas</TableHead><TableHead>Keterangan</TableHead><TableHead>Aksi</TableHead>
      </TableRow></TableHeader><TableBody>
        {loading ? <TableRow><TableCell colSpan={8} className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
          : filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">Belum ada proyek external untuk ditampilkan.</TableCell></TableRow>
          : filtered.map(project => {
            const ready = Boolean(project.master_offices?.marison_branch_id && project.master_offices.marison_synced_at
              && !project.marison_review_reasons?.includes("Branch proyek external belum tersedia"));
            return <TableRow key={project.id} className={cn(project.marison_review_required && masterReviewRowClass)}>
              <TableCell className="font-mono">{project.marison_project_code || project.code || "-"}</TableCell><TableCell>{project.name}</TableCell>
              <TableCell>{project.master_offices?.name || "-"}</TableCell><TableCell>{project.marison_project_id}</TableCell>
              <TableCell>{ready ? <CheckCircle2 aria-label="Relasi kantor tersedia" className="h-4 w-4 text-emerald-600" /> : <XCircle aria-label="Relasi kantor belum tersedia" className="h-4 w-4 text-destructive" />}</TableCell>
              <TableCell>{project.master_entities?.name || "Belum dipilih"}</TableCell>
              <TableCell><MasterReviewStatus required={project.marison_review_required} reasons={project.marison_review_reasons} /></TableCell>
              <TableCell><Button size="icon" variant="ghost" aria-label={`Atur entitas ${project.name}`} title="Atur entitas" onClick={() => { setSelected(project); setEntityId(project.entity_id || "none"); }}><Pencil className="h-4 w-4" /></Button></TableCell>
            </TableRow>;
          })}
      </TableBody></Table>
    </div>
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open && !saving) setSelected(null); }}>
      <DialogContent><DialogHeader><DialogTitle>Entitas Proyek</DialogTitle></DialogHeader>
        <p className="text-sm">{selected?.name}</p><Label htmlFor="project-entity">Entitas (PT)</Label>
        <Select value={entityId} onValueChange={setEntityId} disabled={saving}><SelectTrigger id="project-entity"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="none">Tanpa entitas</SelectItem>{entities.map(entity => <SelectItem key={entity.id} value={entity.id}>{entity.name}</SelectItem>)}
        </SelectContent></Select>
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setSelected(null)}>Batal</Button><Button disabled={saving} onClick={() => void saveEntity()}>{saving ? "Menyimpan..." : "Simpan"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
