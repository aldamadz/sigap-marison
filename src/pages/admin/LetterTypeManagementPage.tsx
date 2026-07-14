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
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Tag, Plus, Pencil, Trash2, Loader2, 
  Search, RefreshCw, Building2
} from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppDialog } from "@/components/app/AppDialogProvider";

const toast = ({ title, description, variant }: { title: string; description?: string; variant?: string }) =>
  variant === "destructive" ? sonnerToast.error(title, { description }) : sonnerToast(title, { description });

export default function LetterTypeManagementPage() {
  const appDialog = useAppDialog();
  const [types, setTypes] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    type_index: "",
    dept_ids: [] as string[],
    dept_indexes: {} as Record<string, string>,
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [typesRes, departmentsRes, mappingsRes] = await Promise.all([
        supabase.from("master_letter_types").select("*").order("type_index", { ascending: true }),
        supabase.from("master_departments").select("id, name, code, dept_index").order("dept_index", { ascending: true }).order("name", { ascending: true }),
        supabase.from("master_dept_letter_types").select("id, dept_id, letter_type_id, sort_index"),
      ]);

      if (typesRes.error) throw typesRes.error;
      if (departmentsRes.error) throw departmentsRes.error;
      if (mappingsRes.error) throw mappingsRes.error;
      setTypes(typesRes.data || []);
      setDepartments(departmentsRes.data || []);
      setMappings(mappingsRes.data || []);
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
      const typeMappings = mappings.filter((item) => item.letter_type_id === type.id);
      const deptIds = typeMappings.map((item) => item.dept_id);
      const deptIndexes = Object.fromEntries(typeMappings.map((item) => [item.dept_id, String(item.sort_index ?? type.type_index ?? "")]));
      setFormData({ 
        name: type.name, 
        code: type.code, 
        type_index: type.type_index?.toString() || "",
        dept_ids: deptIds,
        dept_indexes: deptIndexes,
      });
    } else {
      setSelectedType(null);
      setFormData({
        name: "",
        code: "",
        type_index: "",
        dept_ids: departments.map((dept) => dept.id),
        dept_indexes: {},
      });
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
      let savedTypeId = selectedType?.id || null;

      if (selectedType) {
        const { error } = await supabase
          .from("master_letter_types")
          .update(payload)
          .eq("id", selectedType.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("master_letter_types")
          .insert([payload])
          .select("id")
          .single();
        if (error) throw error;
        savedTypeId = data?.id || null;
      }

      if (savedTypeId) {
        const { error: deleteError } = await supabase
          .from("master_dept_letter_types")
          .delete()
          .eq("letter_type_id", savedTypeId);
        if (deleteError) throw deleteError;

        if (formData.dept_ids.length > 0) {
          const rows = formData.dept_ids.map((deptId) => ({
            dept_id: deptId,
            letter_type_id: savedTypeId,
            sort_index: formData.dept_indexes[deptId] ? parseInt(formData.dept_indexes[deptId], 10) : payload.type_index ?? 999,
          }));
          const { error: insertError } = await supabase
            .from("master_dept_letter_types")
            .insert(rows);
          if (insertError) throw insertError;
        }
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

  const getTypeDepartments = (typeId: string) => {
    const deptIds = new Set(mappings.filter((item) => item.letter_type_id === typeId).map((item) => item.dept_id));
    return departments.filter((dept) => deptIds.has(dept.id));
  };

  const toggleDepartment = (deptId: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      dept_ids: checked
        ? Array.from(new Set([...prev.dept_ids, deptId]))
        : prev.dept_ids.filter((id) => id !== deptId),
      dept_indexes: checked
        ? { ...prev.dept_indexes, [deptId]: prev.dept_indexes[deptId] || prev.type_index }
        : Object.fromEntries(Object.entries(prev.dept_indexes).filter(([id]) => id !== deptId)),
    }));
  };

  const setDepartmentIndex = (deptId: string, value: string) => {
    const numericValue = value.replace(/[^\d]/g, "");
    setFormData((prev) => ({
      ...prev,
      dept_indexes: { ...prev.dept_indexes, [deptId]: numericValue },
    }));
  };

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
              <TableHead className="font-bold">DEPARTEMEN</TableHead>
              <TableHead className="text-right font-bold">AKSI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && types.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-20"><Loader2 className="animate-spin mx-auto w-8 h-8 text-primary"/></TableCell></TableRow>
            ) : filteredTypes.map((type) => {
              const mappedDepartments = getTypeDepartments(type.id);
              return (
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
                  <TableCell>
                    <div className="flex max-w-md flex-wrap gap-1.5">
                      {mappedDepartments.length === departments.length ? (
                        <span className="rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                          Semua departemen
                        </span>
                      ) : mappedDepartments.length > 0 ? (
                        mappedDepartments.slice(0, 4).map((dept) => (
                          <span key={dept.id} className="rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-secondary-foreground">
                            {dept.name} #{mappings.find((item) => item.letter_type_id === type.id && item.dept_id === dept.id)?.sort_index ?? type.type_index ?? "-"}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs font-medium text-destructive">Belum dipakai departemen mana pun</span>
                      )}
                      {mappedDepartments.length > 4 && mappedDepartments.length !== departments.length && (
                        <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                          +{mappedDepartments.length - 4}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(type)}>
                      <Pencil className="w-4 h-4 text-amber-600" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(type.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
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
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Dipakai Departemen</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setFormData((prev) => ({
                      ...prev,
                      dept_ids: departments.map((dept) => dept.id),
                      dept_indexes: Object.fromEntries(departments.map((dept) => [dept.id, prev.dept_indexes[dept.id] || prev.type_index])),
                    }))}
                  >
                    Pilih semua
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setFormData((prev) => ({ ...prev, dept_ids: [] }))}
                  >
                    Kosongkan
                  </Button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-muted/20 p-2">
                {departments.map((dept) => {
                  const checked = formData.dept_ids.includes(dept.id);
                  return (
                    <div key={dept.id} className="grid grid-cols-[auto_1fr_88px] items-center gap-3 rounded-md px-3 py-2 hover:bg-background">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleDepartment(dept.id, value === true)}
                      />
                      <label className="flex min-w-0 cursor-pointer items-center gap-2" onClick={() => toggleDepartment(dept.id, !checked)}>
                        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">{dept.name}</span>
                        {dept.code && <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold">{dept.code}</span>}
                      </label>
                      <Input
                        disabled={!checked}
                        inputMode="numeric"
                        value={formData.dept_indexes[dept.id] || ""}
                        onChange={(event) => setDepartmentIndex(dept.id, event.target.value)}
                        placeholder="Index"
                        className="h-8 text-center text-xs"
                      />
                    </div>
                  );
                })}
              </div>
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
