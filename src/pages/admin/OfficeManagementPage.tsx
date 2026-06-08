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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { 
  MapPin, Plus, Pencil, Trash2, Loader2, 
  Search, RefreshCw, Building2 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function OfficeManagementPage() {
  const { toast } = useToast();
  const [offices, setOffices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOffice, setSelectedOffice] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Update state sesuai struktur database terbaru
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    kedudukan: "KC", // KC atau KCP
    email: "",
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("master_offices")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setOffices(data || []);
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: "Gagal memuat data kantor" 
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = (office: any = null) => {
    if (office) {
      setSelectedOffice(office);
      setFormData({ 
        name: office.name, 
        code: office.code, 
        kedudukan: office.kedudukan || "KC",
        email: office.email || "",
      });
    } else {
      setSelectedOffice(null);
      setFormData({ name: "", code: "", kedudukan: "KC", email: "" });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.code || !formData.kedudukan) {
      toast({ variant: "destructive", title: "Peringatan", description: "Semua kolom wajib diisi" });
      return;
    }

    try {
      setLoading(true);
      const payload = {
        name: formData.name,
        code: formData.code.toUpperCase(),
        kedudukan: formData.kedudukan,
        email: formData.email.trim() || null,
      };

      if (selectedOffice) {
        const { error } = await supabase
          .from("master_offices")
          .update(payload)
          .eq("id", selectedOffice.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("master_offices")
          .insert([payload]);
        if (error) throw error;
      }

      toast({ title: "Berhasil", description: `Kantor ${formData.name} telah disimpan` });
      setIsModalOpen(false);
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus kantor ini? Tindakan ini tidak dapat dibatalkan.")) return;
    try {
      setLoading(true);
      const { error } = await supabase.from("master_offices").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Terhapus", description: "Data kantor berhasil dihapus" });
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const filteredOffices = offices.filter(o => 
    o.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    o.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.kedudukan?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" /> Master Kantor Cabang
          </h1>
          <p className="text-sm text-muted-foreground">Manajemen lokasi kantor, kode area, dan kedudukan (KC/KCP)</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Cari kantor, kode, atau KC/KCP..." 
              className="pl-8" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={loadData} size="icon">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
          <Button onClick={() => handleOpenModal()} className="gap-2 font-bold text-xs uppercase">
            <Plus className="w-4 h-4" /> Tambah Kantor
          </Button>
        </div>
      </div>

      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[120px] font-bold">KODE</TableHead>
              <TableHead className="font-bold">NAMA KANTOR / CABANG</TableHead>
              <TableHead className="font-bold">EMAIL</TableHead>
              <TableHead className="w-[120px] font-bold">KEDUDUKAN</TableHead>
              <TableHead className="text-right font-bold">AKSI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && offices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-20">
                  <Loader2 className="animate-spin mx-auto w-8 h-8 text-primary"/>
                </TableCell>
              </TableRow>
            ) : filteredOffices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-20 text-muted-foreground">
                  Tidak ada data kantor ditemukan.
                </TableCell>
              </TableRow>
            ) : (
              filteredOffices.map((office) => (
                <TableRow key={office.id} className="hover:bg-muted/30">
                  <TableCell>
                    <code className="bg-primary/10 text-primary px-2 py-1 rounded text-xs font-bold">
                      {office.code}
                    </code>
                  </TableCell>
                  <TableCell className="font-medium">{office.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{office.email || "-"}</TableCell>
                  <TableCell>
                    <BadgeKedudukan status={office.kedudukan} />
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(office)}>
                      <Pencil className="w-4 h-4 text-amber-600" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(office.id)}>
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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{selectedOffice ? "Edit" : "Tambah"} Kantor Cabang</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Nama Kota/Kantor</Label>
              <Input 
                value={formData.name} 
                onChange={(e) => setFormData({...formData, name: e.target.value})} 
                placeholder="E.g. Magelang"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kode Kantor</Label>
                <Input 
                  value={formData.code} 
                  onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})} 
                  placeholder="E.g. MGG"
                  maxLength={4}
                />
              </div>
              <div className="space-y-2">
                <Label>Kedudukan</Label>
                <Select 
                  value={formData.kedudukan} 
                  onValueChange={(val) => setFormData({...formData, kedudukan: val})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KC">KC (Cabang)</SelectItem>
                    <SelectItem value="KCP">KCP (Pembantu)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email Kantor/Cabang</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                placeholder="cabang@marison.id"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={loading}>
              Simpan Kantor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Komponen Badge Kecil untuk Kedudukan
function BadgeKedudukan({ status }: { status: string }) {
  const isKC = status === "KC";
  return (
    <span className={cn(
      "px-2 py-0.5 rounded-full text-[10px] font-black tracking-tighter border",
      isKC 
        ? "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300" 
        : "border-border bg-muted text-muted-foreground"
    )}>
      {status}
    </span>
  );
}
