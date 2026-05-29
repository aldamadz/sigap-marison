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
import { Plus, Pencil, Trash2, Loader2, Building2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function DepartmentManagementPage() {
  const { toast } = useToast();
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDept, setSelectedDept] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    dept_index: "",
    email: "",
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("master_departments")
        .select("*")
        .order("dept_index", { ascending: true });

      if (error) throw error;
      setDepartments(data || []);
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: "Gagal mengambil data dari database" 
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = (dept: any = null) => {
    if (dept) {
      setSelectedDept(dept);
      setFormData({ 
        name: dept.name, 
        code: dept.code || "", 
        dept_index: dept.dept_index.toString(),
        email: dept.email || "",
      });
    } else {
      setSelectedDept(null);
      setFormData({ name: "", code: "", dept_index: "", email: "" });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.dept_index) {
      toast({ variant: "destructive", title: "Peringatan", description: "Nama dan Index wajib diisi" });
      return;
    }

    try {
      setLoading(true);
      const payload = {
        name: formData.name,
        code: formData.code || null,
        dept_index: parseInt(formData.dept_index),
        email: formData.email.trim() || null,
      };

      if (selectedDept) {
        const { error } = await supabase
          .from("master_departments")
          .update(payload)
          .eq("id", selectedDept.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("master_departments")
          .insert([payload]);
        if (error) throw error;
      }

      toast({ title: "Berhasil", description: "Data telah disimpan." });
      setIsModalOpen(false);
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal menyimpan", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus departemen ini dari master?")) return;
    try {
      setLoading(true);
      const { error } = await supabase
        .from("master_departments")
        .delete()
        .eq("id", id);
      if (error) throw error;

      toast({ title: "Terhapus", description: "Data berhasil dihapus." });
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" /> Master Departemen
          </h1>
          <p className="text-sm text-muted-foreground">Pengaturan tabel master_departments</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={loadData} size="icon" title="Refresh Data">
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
            <Button onClick={() => handleOpenModal()} className="gap-2 font-bold text-xs uppercase tracking-wider">
                <Plus className="w-4 h-4" /> Tambah Dept
            </Button>
        </div>
      </div>

      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-20 font-bold">INDEX</TableHead>
              <TableHead className="font-bold">NAMA</TableHead>
              <TableHead className="font-bold">KODE</TableHead>
              <TableHead className="font-bold">EMAIL</TableHead>
              <TableHead className="text-right font-bold">AKSI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && departments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-20">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Memuat data...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : departments.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 text-muted-foreground">
                        Tidak ada data ditemukan.
                    </TableCell>
                </TableRow>
            ) : (
              departments.map((dept) => (
                <TableRow key={dept.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono">{dept.dept_index}</TableCell>
                  <TableCell className="font-medium">{dept.name}</TableCell>
                  <TableCell>
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-bold">
                        {dept.code || "-"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{dept.email || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(dept)}>
                        <Pencil className="w-4 h-4 text-amber-600" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(dept.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="font-bold">{selectedDept ? "Edit" : "Tambah"} Departemen Master</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Nama Departemen</Label>
              <Input 
                value={formData.name} 
                onChange={(e) => setFormData({...formData, name: e.target.value})} 
                placeholder="Contoh: Perencanaan"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kode</Label>
                <Input 
                  value={formData.code} 
                  onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})} 
                  placeholder="PRC"
                />
              </div>
              <div className="space-y-2">
                <Label>Index</Label>
                <Input 
                  type="number"
                  value={formData.dept_index} 
                  onChange={(e) => setFormData({...formData, dept_index: e.target.value})} 
                  placeholder="1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email Departemen</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                placeholder="departemen@marison.id"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
