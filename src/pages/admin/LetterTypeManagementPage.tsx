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
import { 
  Tag, Plus, Pencil, Trash2, Loader2, 
  Search, RefreshCw, Hash 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAppDialog } from "@/components/app/AppDialogProvider";

export default function LetterTypeManagementPage() {
  const { toast } = useToast();
  const appDialog = useAppDialog();
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    type_index: ""
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("master_letter_types")
        .select("*")
        .order("type_index", { ascending: true });

      if (error) throw error;
      setTypes(data || []);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: "Gagal memuat jenis surat" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = (type: any = null) => {
    if (type) {
      setSelectedType(type);
      setFormData({ 
        name: type.name, 
        code: type.code, 
        type_index: type.type_index?.toString() || "" 
      });
    } else {
      setSelectedType(null);
      setFormData({ name: "", code: "", type_index: "" });
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
        code: formData.code.toUpperCase(),
        type_index: formData.type_index ? parseInt(formData.type_index) : null
      };

      if (selectedType) {
        const { error } = await supabase
          .from("master_letter_types")
          .update(payload)
          .eq("id", selectedType.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("master_letter_types")
          .insert([payload]);
        if (error) throw error;
      }

      toast({ title: "Berhasil", description: "Jenis surat telah diperbarui" });
      setIsModalOpen(false);
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const type = types.find((item) => item.id === id);
    const confirmed = await appDialog.confirm({
      title: "Hapus Jenis Surat?",
      description: `Jenis surat ${type?.name || "ini"} akan dihapus. Pastikan tidak ada surat yang sedang menggunakan tipe ini.`,
      confirmText: "Hapus",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      setLoading(true);
      const { error } = await supabase.from("master_letter_types").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Terhapus", description: "Jenis surat berhasil dihapus" });
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const filteredTypes = types.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tag className="w-6 h-6 text-primary" /> Master Jenis Surat
          </h1>
          <p className="text-sm text-muted-foreground">Kelola kode dan indeks klasifikasi dokumen</p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Cari jenis atau kode..." 
              className="pl-8" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={loadData} size="icon">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
          <Button onClick={() => handleOpenModal()} className="gap-2 font-bold text-xs uppercase">
            <Plus className="w-4 h-4" /> Tambah Jenis
          </Button>
        </div>
      </div>

      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[80px] font-bold text-center">INDEX</TableHead>
              <TableHead className="w-[120px] font-bold">KODE</TableHead>
              <TableHead className="font-bold">NAMA KLASIFIKASI</TableHead>
              <TableHead className="text-right font-bold">AKSI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && types.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-20"><Loader2 className="animate-spin mx-auto w-8 h-8 text-primary"/></TableCell></TableRow>
            ) : filteredTypes.map((type) => (
              <TableRow key={type.id} className="hover:bg-muted/30">
                <TableCell className="text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/5 text-primary text-xs font-bold border border-primary/10">
                    {type.type_index}
                  </span>
                </TableCell>
                <TableCell>
                  <code className="bg-secondary text-secondary-foreground px-2 py-1 rounded text-xs font-bold">
                    {type.code}
                  </code>
                </TableCell>
                <TableCell className="font-medium">{type.name}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button variant="ghost" size="icon" onClick={() => handleOpenModal(type)}>
                    <Pencil className="w-4 h-4 text-amber-600" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(type.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedType ? "Edit" : "Tambah"} Jenis Surat</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1 space-y-2">
                <Label>Index</Label>
                <Input 
                  type="number"
                  value={formData.type_index} 
                  onChange={(e) => setFormData({...formData, type_index: e.target.value})} 
                  placeholder="E.g. 1"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Kode Surat</Label>
                <Input 
                  value={formData.code} 
                  onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})} 
                  placeholder="E.g. BAST"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nama Jenis Surat</Label>
              <Input 
                value={formData.name} 
                onChange={(e) => setFormData({...formData, name: e.target.value})} 
                placeholder="E.g. Berita Acara Serah Terima"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Simpan Jenis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
