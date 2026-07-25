import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CloudDownload, Loader2, Search, RefreshCw, Building2
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
};

export default function OfficeManagementPage() {
  const { toast } = useToast();
  const appDialog = useAppDialog();
  const [offices, setOffices] = useState<MasterOfficeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("master_offices")
        .select("id,code,name,kedudukan,marison_branch_id,marison_branch_code,marison_synced_at")
        .order("name", { ascending: true });

      if (error) throw error;
      setOffices((data || []) as MasterOfficeRow[]);
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
          <p className="text-sm text-muted-foreground">
            Data read-only dari endpoint Get All Branches API external
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
          <Button onClick={handleSync} disabled={syncing} className="gap-2 font-bold text-xs uppercase">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
            Sinkronkan External
          </Button>
        </div>
      </div>

      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[120px] font-bold">KODE</TableHead>
              <TableHead className="font-bold">NAMA KANTOR / CABANG</TableHead>
              <TableHead className="font-bold">ID / KODE EXTERNAL</TableHead>
              <TableHead className="w-[120px] font-bold">KEDUDUKAN</TableHead>
              <TableHead className="text-right font-bold">TERAKHIR BERUBAH</TableHead>
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
                  <TableCell className="text-xs text-muted-foreground">
                    {office.marison_branch_id ?? "-"} / {office.marison_branch_code || "-"}
                  </TableCell>
                  <TableCell>
                    <BadgeKedudukan status={office.kedudukan} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {office.marison_synced_at
                      ? new Intl.DateTimeFormat("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(office.marison_synced_at))
                      : "Belum tersinkron"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
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
