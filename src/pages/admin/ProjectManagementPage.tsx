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
  Search, RefreshCw, Building2, Fingerprint, Calendar, MapPin
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAppDialog } from "@/components/app/AppDialogProvider";

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

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    office_id: "",
    entity_id: ""
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [offRes, entRes] = await Promise.all([
        supabase.from("master_offices").select("id, name, kedudukan").order("name"),
        supabase.from("master_entities").select("id, name").order("name")
      ]);

      setOffices(offRes.data || []);
      setEntities(entRes.data || []);

      const { data, error } = await supabase
        .from("master_projects")
        .select(`
          *,
          master_offices ( name, kedudukan ),
          master_entities ( name )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProjects(data || []);
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
        entity_id: item.entity_id || ""
      });
    } else {
      setSelectedItem(null);
      setFormData({ name: "", code: "", office_id: offices[0]?.id || "", entity_id: "" });
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
      const payload = { 
        ...formData, 
        entity_id: formData.entity_id === "none" || !formData.entity_id ? null : formData.entity_id 
      };

      const { error } = selectedItem 
        ? await supabase.from("master_projects").update(payload).eq("id", selectedItem.id)
        : await supabase.from("master_projects").insert([payload]);

      if (error) throw error;
      toast({ title: "Berhasil", description: "Data proyek telah disimpan" });
      setIsModalOpen(false);
      loadData();
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

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.master_offices?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tighter uppercase flex items-center gap-3">
            <Briefcase className="w-8 h-8 text-primary" />
            Master <span className="text-primary/60 font-light">Proyek</span>
          </h1>
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.3em] ml-1">Project Directory & Branch Mapping</p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              className="h-11 w-full rounded-xl bg-muted/50 border-none pl-10 text-xs font-bold uppercase tracking-widest"
              placeholder="CARI PROYEK / CABANG..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button onClick={() => handleOpenModal()} className="h-11 px-6 rounded-xl font-black text-[10px] tracking-widest uppercase shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4 mr-2" /> TAMBAH
          </Button>
        </div>
      </div>

      {/* Table Section */}
      <div className="border rounded-2xl overflow-hidden bg-card shadow-sm">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="font-black text-[10px] tracking-widest uppercase pl-6 py-4">Unit Code</TableHead>
              <TableHead className="w-[450px] font-black text-[10px] tracking-widest uppercase">Project Details</TableHead>
              <TableHead className="font-black text-[10px] tracking-widest uppercase">Office / Branch Location</TableHead>
              <TableHead className="font-black text-[10px] tracking-widest uppercase">Entity</TableHead>
              <TableHead className="text-right font-black text-[10px] tracking-widest uppercase pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-32"><Loader2 className="animate-spin mx-auto w-10 h-10 text-primary"/></TableCell></TableRow>
            ) : filteredProjects.map((item) => (
              <TableRow key={item.id} className="group hover:bg-muted/20 transition-colors border-b border-border/50">
                <TableCell className="pl-6">
                  <span className="font-mono text-[11px] font-black text-primary bg-primary/5 px-2 py-1 rounded">
                    {item.code || "UNCAT"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm text-foreground uppercase tracking-tight">{item.name}</span>
                    <span className="text-[9px] text-muted-foreground font-semibold flex items-center gap-1 mt-1">
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
                    <span className="font-bold text-xs uppercase tracking-tight">
                      {item.master_offices?.kedudukan} {item.master_offices?.name}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-[10px] font-black text-muted-foreground uppercase bg-muted px-2 py-1 rounded border">
                    {item.master_entities?.name || "PERSONAL"}
                  </span>
                </TableCell>
                <TableCell className="text-right pr-8">
                  <div className="flex justify-end gap-1 opactiy-0 group-hover:opacity-100 transition-opacity">
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
        <DialogContent className="max-w-md rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-primary p-6 text-primary-foreground">
            <DialogTitle className="text-xl font-black uppercase tracking-tighter flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {selectedItem ? "Edit Project" : "New Project"}
            </DialogTitle>
            <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest mt-1">Input master data project unit</p>
          </div>
          
          <div className="p-8 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Project Name</Label>
              <Input className="rounded-xl h-11 font-bold text-xs" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Nama Proyek..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unit Code</Label>
                <Input className="rounded-xl h-11 font-mono uppercase text-xs font-bold" value={formData.code} onChange={(e) => setFormData({...formData, code: e.target.value})} placeholder="PRJ001" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Location</Label>
                <Select value={formData.office_id} onValueChange={(v) => setFormData({...formData, office_id: v})}>
                  <SelectTrigger className="rounded-xl h-11 text-xs font-bold">
                    <SelectValue placeholder="Pilih Cabang" />
                  </SelectTrigger>
                  <SelectContent>
                    {offices.map(o => (
                      <SelectItem key={o.id} value={o.id} className="text-xs font-bold uppercase">
                        {o.kedudukan} {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Entity Mapping</Label>
              <Select value={formData.entity_id} onValueChange={(v) => setFormData({...formData, entity_id: v})}>
                <SelectTrigger className="rounded-xl h-11 text-xs font-bold bg-muted/30">
                  <SelectValue placeholder="Pilih Entitas (Opsional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs font-bold uppercase">Tanpa Entitas</SelectItem>
                  {entities.map(e => (
                    <SelectItem key={e.id} value={e.id} className="text-xs font-bold uppercase">{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="p-6 bg-muted/20 flex gap-2">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="rounded-xl font-bold text-xs">CANCEL</Button>
            <Button onClick={handleSave} disabled={loading} className="rounded-xl px-10 font-bold text-xs">
              {loading ? <Loader2 className="animate-spin w-4 h-4" /> : "SAVE DATA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
