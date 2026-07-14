import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Loader2, Building, RefreshCw, Search } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppDialog } from "@/components/app/AppDialogProvider";

const toast = ({ title, description, variant }: { title: string; description?: string; variant?: string }) =>
  variant === "destructive" ? sonnerToast.error(title, { description }) : sonnerToast(title, { description });

export default function EntityManagementPage() {
  const appDialog = useAppDialog();
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [formData, setFormData] = useState({
    name: "",
    code: ""
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("master_entities")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setEntities(data || []);
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: "Gagal mengambil data entitas" 
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = (entity: any = null) => {
    if (entity) {
      setSelectedEntity(entity);
      setFormData({ 
        name: entity.name, 
        code: entity.code || ""
      });
    } else {
      setSelectedEntity(null);
      setFormData({ name: "", code: "" });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.code) {
      toast({ variant: "destructive", title: "Peringatan", description: "Nama dan Kode wajib diisi" });
      return;
    }

    try {
      setLoading(true);
      const payload = {
        name: formData.name,
        code: formData.code.toUpperCase()
      };

      if (selectedEntity) {
        const { error } = await supabase
          .from("master_entities")
          .update(payload)
          .eq("id", selectedEntity.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("master_entities")
          .insert([payload]);
        if (error) throw error;
      }

      toast({ title: "Berhasil", description: "Data entitas telah diperbarui." });
      setIsModalOpen(false);
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const entity = entities.find((item) => item.id === id);
    const confirmed = await appDialog.confirm({
      title: "Hapus Entitas?",
      description: `Entitas ${entity?.name || "ini"} akan dihapus. Tindakan ini mungkin mempengaruhi data yang berelasi.`,
      confirmText: "Hapus",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      setLoading(true);
      const { error } = await supabase
        .from("master_entities")
        .delete()
        .eq("id", id);
      if (error) throw error;

      toast({ title: "Terhapus", description: "Entitas berhasil dihapus." });
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const filteredEntities = entities.filter(e => 
    e.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    e.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building className="w-6 h-6 text-primary" /> Master Entitas
          </h1>
          <p className="text-sm text-muted-foreground">Manajemen daftar perusahaan/entitas grup</p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Cari entitas..." 
              className="pl-8" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={loadData} size="icon">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
          <Button onClick={() => handleOpenModal()} className="gap-2 font-bold text-xs uppercase">
            <Plus className="w-4 h-4" /> Tambah Entitas
          </Button>
        </div>
      </div>

      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[150px] font-bold">KODE</TableHead>
              <TableHead className="font-bold">NAMA PERUSAHAAN</TableHead>
              <TableHead className="text-right font-bold">AKSI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && entities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : filteredEntities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-20 text-muted-foreground">
                  Tidak ada entitas yang ditemukan.
                </TableCell>
              </TableRow>
            ) : (
              filteredEntities.map((entity) => (
                <TableRow key={entity.id} className="hover:bg-muted/30">
                  <TableCell>
                    <span className="font-mono bg-secondary text-secondary-foreground px-2 py-1 rounded text-xs font-bold">
                      {entity.code}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium text-sm">{entity.name}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(entity)}>
                      <Pencil className="w-4 h-4 text-amber-600" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(entity.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* MODAL EDIT/TAMBAH */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedEntity ? "Edit" : "Tambah"} Entitas Perusahaan</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Nama Lengkap Perusahaan</Label>
              <Input 
                value={formData.name} 
                onChange={(e) => setFormData({...formData, name: e.target.value})} 
                placeholder="Contoh: PT. MARIS HANS TEKNOLOGI"
              />
            </div>
            <div className="space-y-2">
              <Label>Kode Entitas (Singkatan)</Label>
              <Input 
                value={formData.code} 
                onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})} 
                placeholder="MHT"
                maxLength={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Simpan Entitas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
