import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CloudDownload, Loader2, Search, RefreshCw, Building2, Plus, Pencil, AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAppDialog } from "@/components/app/AppDialogProvider";
import { marisonIntegrationService } from "@/services/marison-integration.service";

type MasterOfficeRow = {
  id: string;
  code: string;
  name: string;
  kedudukan: string | null;
  marison_branch_id: number | null;
  marison_branch_code: string | null;
  marison_synced_at: string | null;
  parent_id: string | null;
  email: string | null;
  marison_review_required: boolean;
  marison_review_reasons: string[];
};

const emptyForm = {
  code: "",
  name: "",
  email: "",
  kedudukan: "KC",
  parent_id: "none",
  marison_branch_id: "",
};

export default function OfficeManagementPage() {
  const { toast } = useToast();
  const appDialog = useAppDialog();
  const [offices, setOffices] = useState<MasterOfficeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editing, setEditing] = useState<MasterOfficeRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [syncIssueCount, setSyncIssueCount] = useState(0);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("master_offices")
        .select("id,code,name,email,kedudukan,parent_id,marison_branch_id,marison_branch_code,marison_synced_at,marison_review_required,marison_review_reasons")
        .order("name", { ascending: true });

      if (error) throw error;
      setOffices((data || []) as MasterOfficeRow[]);
      const { count } = await supabase
        .from("marison_sync_issues")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", "branch")
        .eq("status", "open");
      setSyncIssueCount(count || 0);
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

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (office: MasterOfficeRow) => {
    setEditing(office);
    setForm({
      code: office.code || "",
      name: office.name || "",
      email: office.email || "",
      kedudukan: office.kedudukan || "KC",
      parent_id: office.parent_id || "none",
      marison_branch_id: office.marison_branch_id == null ? "" : String(office.marison_branch_id),
    });
    setFormOpen(true);
  };

  const saveOffice = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ variant: "destructive", title: "Data belum lengkap", description: "Kode dan nama kantor wajib diisi." });
      return;
    }
    if (["KCP", "Kost"].includes(form.kedudukan) && form.parent_id === "none") {
      toast({ variant: "destructive", title: "Hirarki belum lengkap", description: "KCP/Kost wajib memiliki kantor induk." });
      return;
    }
    setSaving(true);
    try {
      const externalId = form.marison_branch_id.trim() ? Number(form.marison_branch_id) : null;
      if (externalId != null && !Number.isSafeInteger(externalId)) throw new Error("ID external harus berupa angka bulat.");
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        email: form.email.trim() || null,
        kedudukan: form.kedudukan,
        parent_id: form.parent_id === "none" ? null : form.parent_id,
        marison_branch_id: externalId,
        marison_hierarchy_confirmed: true,
      };
      const query = editing
        ? supabase.from("master_offices").update(payload).eq("id", editing.id)
        : supabase.from("master_offices").insert(payload);
      const { error } = await query;
      if (error) throw error;
      toast({ title: editing ? "Kantor diperbarui" : "Kantor ditambahkan" });
      setFormOpen(false);
      await loadData();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Gagal menyimpan kantor",
        description: error instanceof Error ? error.message : "Terjadi kesalahan.",
      });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSync = async () => {
    try {
      setSyncing(true);
      const preview = await marisonIntegrationService.previewBranches();
      const confirmed = await appDialog.confirm({
        title: "Sinkronkan Kantor Cabang?",
        description: `${preview.source} branch ditemukan di API external. ${preview.toCreate} kantor akan dibuat dan ${preview.toUpdate} kantor akan diperbarui di mirror SIGAP.`,
        confirmText: "Sinkronkan",
      });
      if (!confirmed) return;
      const result = await marisonIntegrationService.syncBranches();
      await loadData();
      if (result.failed > 0) {
        toast({
          variant: "destructive",
          title: "Sinkronisasi belum lengkap",
          description: `${result.created} dibuat, ${result.updated} diperbarui, ${result.failed} gagal.`,
        });
      } else {
        toast({
          title: "Sinkronisasi berhasil",
          description: `${result.source} kantor cabang telah diselaraskan dari API external.`,
        });
      }
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Sinkronisasi gagal",
        description: error instanceof Error ? error.message : "Gagal mengambil kantor cabang dari API external.",
      });
    } finally {
      setSyncing(false);
    }
  };

  const filteredOffices = offices
    .filter(o =>
      o.name.toLowerCase().includes(searchQuery.toLowerCase())
      || o.code.toLowerCase().includes(searchQuery.toLowerCase())
      || o.kedudukan?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (a.marison_review_required !== b.marison_review_required) return a.marison_review_required ? -1 : 1;
      return a.name.localeCompare(b.name, "id");
    });

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" /> Master Kantor Cabang
          </h1>
          <p className="text-sm text-muted-foreground">
            Master UUID SIGAP dengan mapping dan pembaruan data dari API external
          </p>
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
          <Button variant="outline" onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> Tambah Manual
          </Button>
          <Button onClick={handleSync} disabled={syncing} className="gap-2 font-bold text-xs uppercase">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
            Sinkronkan External
          </Button>
        </div>
      </div>

      {syncIssueCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4" />
          {syncIssueCount} branch external mengalami konflik mapping. Periksa hasil preview, lalu isi ID External pada kantor yang benar.
        </div>
      )}

      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[120px] font-bold">KODE</TableHead>
              <TableHead className="font-bold">NAMA KANTOR / CABANG</TableHead>
              <TableHead className="font-bold">ID / KODE EXTERNAL</TableHead>
              <TableHead className="w-[120px] font-bold">KEDUDUKAN</TableHead>
              <TableHead className="font-bold">STATUS DATA</TableHead>
              <TableHead className="text-right font-bold">AKSI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && offices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-20">
                  <Loader2 className="animate-spin mx-auto w-8 h-8 text-primary"/>
                </TableCell>
              </TableRow>
            ) : filteredOffices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-20 text-muted-foreground">
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
                  <TableCell className="text-xs text-muted-foreground">
                    {office.marison_branch_id ?? "-"} / {office.marison_branch_code || "-"}
                  </TableCell>
                  <TableCell>
                    <BadgeKedudukan status={office.kedudukan} />
                  </TableCell>
                  <TableCell>
                    {office.marison_review_required ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-600"
                        title={(office.marison_review_reasons || []).join(", ")}
                      >
                        <AlertCircle className="h-3 w-3" /> Perlu dilengkapi
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-600">Lengkap</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(office)} className="gap-1">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Kantor" : "Tambah Kantor Manual"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-2">
              <Label>Kode *</Label>
              <Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>ID External</Label>
              <Input type="number" value={form.marison_branch_id} onChange={(event) => setForm({ ...form, marison_branch_id: event.target.value })} placeholder="Opsional" />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Nama kantor *</Label>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Email kantor</Label>
              <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Kedudukan</Label>
              <Select value={form.kedudukan} onValueChange={(value) => setForm({ ...form, kedudukan: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Pusat", "KC", "KCP", "Kost"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Kantor induk</Label>
              <Select value={form.parent_id} onValueChange={(value) => setForm({ ...form, parent_id: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tidak ada</SelectItem>
                  {offices.filter((office) => office.id !== editing?.id).map((office) => (
                    <SelectItem key={office.id} value={office.id}>{office.kedudukan} {office.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {editing?.marison_review_required && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
              {(editing.marison_review_reasons || []).join(" · ")}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>Batal</Button>
            <Button onClick={saveOffice} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Komponen Badge Kecil untuk Kedudukan
function BadgeKedudukan({ status }: { status: string | null }) {
  const isKC = status === "KC";
  return (
    <span className={cn(
      "px-2 py-0.5 rounded-full text-[10px] font-black tracking-tighter border",
      isKC 
        ? "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300" 
        : "border-border bg-muted text-muted-foreground"
    )}>
      {status || "-"}
    </span>
  );
}
