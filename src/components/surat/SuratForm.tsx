import React, { useEffect, useState, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Download, FileUp, Hash, ArrowDown, Loader2, Briefcase,
  Check, ChevronDown, Paperclip, Copy, RefreshCcw, ChevronRight, Layers,
  ShieldCheck, AlertTriangle, Archive, Home
} from "lucide-react";
import { suratService } from "@/services/surat.service";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface SuratFormProps {
  onSuccess: (noSurat: string, judul: string) => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
  setJudulForDisplay: (val: string) => void;
}

export function SuratForm({ onSuccess, isLoading, setIsLoading, setJudulForDisplay }: SuratFormProps) {
  const { toast } = useToast();
  const fileInputRef     = useRef<HTMLInputElement>(null);
  const lampiranInputRef = useRef<HTMLInputElement>(null);

  // ── STATE ──────────────────────────────────────────────────────────────────
  const [master, setMaster] = useState<any>({ entities: [], depts: [], offices: [], types: [], users: [], projects: [] });
  const [usageDetails, setUsageDetails]           = useState<any[]>([]);
  const [selectedUsage, setSelectedUsage]         = useState<any>(null);
  const [file, setFile]                           = useState<File | null>(null);
  const [generatedNoSurat, setGeneratedNoSurat]   = useState<string | null>(null);
  const [isProcessingNumber, setIsProcessingNumber] = useState(false);
  const [isCopied, setIsCopied]                   = useState(false);
  const [isDownloading, setIsDownloading]         = useState(false);
  const [openMatrix, setOpenMatrix]               = useState(false);
  const [lampiranFile, setLampiranFile]           = useState<File | null>(null);
  const [formData, setFormData] = useState({
    entity_id: "", dept_id: "", letter_type_id: "",
    office_id: "", project_id: "", judul_surat: "",
    penggunaan_id: "", is_aset: false
  });
  const [signers, setSigners] = useState<any[]>([]);

  // ── HELPERS ────────────────────────────────────────────────────────────────
  const normalizeRoleName = (raw: any, index: number, total: number): "membuat" | "memeriksa" | "menyetujui" => {
    const v = String(raw ?? "").toLowerCase().trim();
    if (v === "membuat" || v === "memeriksa" || v === "menyetujui") return v as any;
    if (v.includes("setuju") || v.includes("approve") || v.includes("approval") || v.includes("otoris") || v.includes("final")) return "menyetujui";
    if (v.includes("periksa") || v.includes("review") || v.includes("verifikasi") || v.includes("cek") || v.includes("paraf")) return "memeriksa";
    if (v.includes("buat") || v.includes("draft") || v.includes("pemohon") || v.includes("request")) return "membuat";
    if (index === 0) return "membuat";
    if (index === total - 1) return "menyetujui";
    return "memeriksa";
  };

  const getFullRoles = (item: any) => {
    if (!item?.ttd_config) return [];
    try {
      const config = typeof item.ttd_config === "string" ? JSON.parse(item.ttd_config) : item.ttd_config;
      return Array.isArray(config) ? config.map((c: any) => c.labelJabatan || c.jabatan || c.roleName || c.role_name) : [];
    } catch { return []; }
  };

  const officePusat     = useMemo(() => master.offices?.find((o: any) => o.kedudukan === "Pusat"), [master.offices]);
  const isPusatSelected = useMemo(() => formData.office_id === officePusat?.id, [formData.office_id, officePusat]);

  const filteredUsage = useMemo(() => usageDetails.filter(i => i.is_cabang === !isPusatSelected), [usageDetails, isPusatSelected]);

  const groupedUsage = useMemo(() => {
    const groups: { [k: number]: any[] } = {};
    filteredUsage.forEach(item => {
      const level = getFullRoles(item).length;
      if (level > 0) { if (!groups[level]) groups[level] = []; groups[level].push(item); }
    });
    return groups;
  }, [filteredUsage]);

  const filteredDepts = useMemo(() => {
    if (!master.depts) return [];
    return master.depts.filter((d: any) => {
      const isCabangDept = d.name.toLowerCase().includes("(cabang)");
      return isPusatSelected ? !isCabangDept : isCabangDept;
    }).sort((a: any, b: any) => (a.dept_index || 0) - (b.dept_index || 0));
  }, [master.depts, isPusatSelected]);

  const filteredProjects = useMemo(() => {
    if (isPusatSelected || !master.projects) return [];
    return master.projects.filter((p: any) => p.office_id === formData.office_id);
  }, [master.projects, formData.office_id, isPusatSelected]);

  const isDirty = useMemo(() => !!generatedNoSurat || !!file || formData.judul_surat.length > 0, [generatedNoSurat, file, formData.judul_surat]);

  // ── EFFECTS ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (isDirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [isDirty]);

  useEffect(() => {
    suratService.getMasterData().then(data => {
      setMaster(data);
      const p = data.offices?.find((o: any) => o.kedudukan === "Pusat");
      if (p) setFormData(prev => ({ ...prev, office_id: p.id }));
    }).catch(() => toast({ variant: "destructive", title: "Gagal memuat data master" }));
  }, [toast]);

  useEffect(() => {
    supabase.from("master_penggunaan_detail")
      .select(`*, master_forms!fk_master_forms (id, nama_form, nomor_form, link_form, department_id)`)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast({ variant: "destructive", title: "Gagal memuat penggunaan", description: error.message });
        else setUsageDetails(data || []);
      });
  }, [toast]);

  useEffect(() => {
    if (!generatedNoSurat) { setSelectedUsage(null); setFormData(prev => ({ ...prev, penggunaan_id: "" })); setSigners([]); }
  }, [isPusatSelected, generatedNoSurat]);

  // ── HANDLERS ───────────────────────────────────────────────────────────────
  const handleProjectChange = (projectId: string) => {
    const proj = master.projects?.find((p: any) => p.id === projectId);
    setFormData(prev => ({ ...prev, project_id: projectId, entity_id: proj?.entity_id || prev.entity_id }));
  };

  const handleUsageChange = (val: string) => {
    const detail = usageDetails.find(u => u.id === val);
    if (!detail) return;
    setSelectedUsage(detail);
    setFormData(prev => ({ ...prev, penggunaan_id: val }));
    try {
      const config = typeof detail.ttd_config === "string" ? JSON.parse(detail.ttd_config) : detail.ttd_config;
      if (Array.isArray(config)) {
        const total = config.length;
        setSigners(config.map((c: any, i: number) => ({
          role_name: normalizeRoleName(c.roleName || c.role_name || c.labelJabatan || c.label_jabatan || c.jabatan, i, total),
          label_jabatan: c.labelJabatan || c.label_jabatan || c.jabatan,
          user_id: "", step_order: i + 1
        })));
      }
    } catch { toast({ variant: "destructive", title: "Format Alur Salah" }); }
  };

  const handleGetNumber = async () => {
    if (!isPusatSelected && !formData.project_id)
      return toast({ variant: "destructive", title: "Proyek Belum Dipilih" });
    setIsProcessingNumber(true);
    try {
      const res = await suratService.generateNoSurat(formData);
      setGeneratedNoSurat(res.fullNumber);
      toast({ title: "Nomor Berhasil Didapatkan", description: "Silahkan lengkapi berkas dan penandatangan." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal Mendapatkan Nomor", description: e.message });
    } finally { setIsProcessingNumber(false); }
  };

  const handleResetNumber = async () => {
    if (!generatedNoSurat) return;
    if (!window.confirm("Membatalkan nomor ini akan mengosongkan antrian nomor. Lanjutkan?")) return;
    try {
      await suratService.cancelRegistration(generatedNoSurat);
      setGeneratedNoSurat(null);
      toast({ title: "Nomor Dibatalkan" });
    } catch { toast({ variant: "destructive", title: "Gagal membatalkan nomor" }); }
  };

  const handleDownloadTemplate = async () => {
    if (!formData.judul_surat) return toast({ variant: "destructive", title: "Perihal Kosong" });
    setIsDownloading(true);
    try {
      await suratService.downloadFilledTemplate({ ...formData, no_surat: generatedNoSurat }, selectedUsage.master_forms.link_form);
    } catch { toast({ variant: "destructive", title: "Gagal Mengunduh" }); }
    finally { setIsDownloading(false); }
  };

  const resetForm = () => {
    setFormData({ entity_id: "", dept_id: "", letter_type_id: "", office_id: officePusat?.id || "", project_id: "", judul_surat: "", penggunaan_id: "", is_aset: false });
    setGeneratedNoSurat(null); setSelectedUsage(null); setFile(null); setLampiranFile(null); setSigners([]);
    setJudulForDisplay("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (lampiranInputRef.current) lampiranInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!file) return toast({ variant: "destructive", title: "File Utama Wajib Diunggah" });
    if (signers.some(s => !s.user_id)) return toast({ variant: "destructive", title: "Pejabat Belum Lengkap" });
    setIsLoading(true);
    try {
      const result = await suratService.createRegistrasi({ ...formData, no_surat: generatedNoSurat }, signers, file, lampiranFile);
      if (result) {
        toast({ title: "Pendaftaran Berhasil", description: `Nomor ${result.no_surat} telah disimpan.` });
        onSuccess(result.no_surat, formData.judul_surat);
        resetForm();
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: error.message });
    } finally { setIsLoading(false); }
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <Card className="glass-card border-none overflow-hidden shadow-2xl bg-background/50 backdrop-blur-xl">
      <CardHeader className="bg-gradient-to-r from-primary/10 via-transparent to-transparent border-b border-border/50">
        <CardTitle className="text-xl font-black flex items-center gap-3 tracking-tight uppercase">
          <div className="p-2.5 bg-primary/20 rounded-xl shadow-inner">
            <Layers className="w-5 h-5 text-primary" />
          </div>
          Registrasi Dokumen Digital
        </CardTitle>
      </CardHeader>

      <CardContent className="p-6 md:p-10 space-y-8">

        {/* ── PERINGATAN nomor sudah dipesan ───────────────────────────────── */}
        {generatedNoSurat && (
          <div className="animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-2xl flex items-center gap-4 text-destructive">
              <div className="p-2 bg-destructive rounded-lg text-white shrink-0">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-tight leading-none mb-1">Peringatan Keamanan Data</p>
                <p className="text-[10px] font-medium opacity-80">
                  Nomor surat telah dipesan. Jangan refresh sebelum klik <b>Konfirmasi Pendaftaran</b>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ══ SECTION 1: LOKASI & KLASIFIKASI ══════════════════════════════ */}
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground font-black shadow-lg">1</span>
            <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Lokasi & Klasifikasi</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-3xl bg-muted/30 border border-border/50">
            {/* Kantor */}
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase text-muted-foreground ml-1">Kantor Penerbit</Label>
              <Select disabled={!!generatedNoSurat} value={formData.office_id}
                onValueChange={v => setFormData({ ...formData, office_id: v, project_id: "", dept_id: "", entity_id: "" })}>
                <SelectTrigger className="h-11 bg-background/50 border-none ring-1 ring-border">
                  <SelectValue placeholder="Pilih Kantor..." />
                </SelectTrigger>
                <SelectContent>
                  {master.offices?.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.kedudukan === "Pusat" ? "🏢 Kantor Pusat" : `🏗️ ${o.kedudukan}. ${o.name}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Proyek (cabang saja) */}
            {!isPusatSelected && formData.office_id && (
              <div className="space-y-2 animate-in slide-in-from-top-2">
                <Label className="text-[11px] font-black uppercase text-primary ml-1 flex items-center gap-2">
                  <Briefcase className="w-3 h-3" /> Pilih Proyek Cabang
                </Label>
                <Select disabled={!!generatedNoSurat} value={formData.project_id} onValueChange={handleProjectChange}>
                  <SelectTrigger className="h-11 border-primary/40 bg-primary/5">
                    <SelectValue placeholder="Pilih Proyek..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredProjects.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.code} - {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Entitas */}
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase text-muted-foreground ml-1">Entitas (PT)</Label>
              <Select disabled={!!generatedNoSurat} value={formData.entity_id}
                onValueChange={v => setFormData({ ...formData, entity_id: v })}>
                <SelectTrigger className="h-11 bg-background/50 border-none ring-1 ring-border">
                  <SelectValue placeholder="Pilih PT..." />
                </SelectTrigger>
                <SelectContent>
                  {master.entities?.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.code} - {e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Departemen */}
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase text-muted-foreground ml-1">Departemen</Label>
              <Select disabled={!!generatedNoSurat} value={formData.dept_id}
                onValueChange={v => setFormData({ ...formData, dept_id: v })}>
                <SelectTrigger className="h-11 bg-background/50 border-none ring-1 ring-border">
                  <SelectValue placeholder="Pilih Dept..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredDepts.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Jenis Dokumen */}
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase text-muted-foreground ml-1">Jenis Dokumen</Label>
              <Select disabled={!!generatedNoSurat} value={formData.letter_type_id}
                onValueChange={v => setFormData({ ...formData, letter_type_id: v })}>
                <SelectTrigger className="h-11 bg-background/50 border-none ring-1 ring-border">
                  <SelectValue placeholder="Pilih Jenis..." />
                </SelectTrigger>
                <SelectContent>
                  {master.types?.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.code} - {t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ══ TOGGLE ASET — posisi baru, MENCOLOK, tepat sebelum tombol nomor ══ */}
          {!generatedNoSurat && (
            <div
              role="button"
              onClick={() => setFormData(f => ({ ...f, is_aset: !f.is_aset }))}
              className={cn(
                "relative overflow-hidden rounded-2xl border-2 p-5 transition-all duration-300 cursor-pointer select-none group",
                formData.is_aset
                  ? "bg-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/15"
                  : "bg-muted/20 border-dashed border-muted-foreground/30 hover:border-amber-500/50 hover:bg-amber-500/5"
              )}
            >
              {/* Animated glow saat aktif */}
              {formData.is_aset && (
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/8 via-transparent to-amber-400/5 pointer-events-none" />
              )}

              <div className="relative flex items-center justify-between gap-4">
                {/* Ikon + teks */}
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "p-3 rounded-xl transition-all duration-200 shadow-sm",
                    formData.is_aset
                      ? "bg-amber-500 text-white shadow-amber-500/30"
                      : "bg-background text-muted-foreground group-hover:bg-amber-500/10 group-hover:text-amber-500"
                  )}>
                    {formData.is_aset ? <Archive className="w-5 h-5" /> : <Home className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className={cn(
                      "font-black uppercase tracking-tight text-sm transition-colors",
                      formData.is_aset ? "text-amber-600 dark:text-amber-400" : "text-foreground group-hover:text-amber-600"
                    )}>
                      {formData.is_aset ? "✦ Dokumen Aset — Aktif" : "Tandai sebagai Dokumen Aset"}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                      {formData.is_aset
                        ? "Kolom B4 pada template akan dicentang otomatis sebagai penanda aset"
                        : "Properti · Kendaraan · Inventaris Legal — klik untuk mengaktifkan"}
                    </p>
                  </div>
                </div>

                {/* Switch */}
                <Switch
                  checked={formData.is_aset}
                  onCheckedChange={val => setFormData(f => ({ ...f, is_aset: val }))}
                  onClick={e => e.stopPropagation()}
                  className="data-[state=checked]:bg-amber-500 shrink-0 scale-110"
                />
              </div>

              {/* Badge konfirmasi saat aktif */}
              {formData.is_aset && (
                <div className="relative mt-3 pt-3 border-t border-amber-500/20 flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                    Surat ini ditandai sebagai dokumen aset &amp; akan diproses sesuai alur properti
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Tombol dapatkan nomor / tampilan nomor ────────────────────── */}
          {!generatedNoSurat ? (
            <Button
              onClick={handleGetNumber}
              disabled={isProcessingNumber || !formData.entity_id || !formData.dept_id || !formData.letter_type_id}
              className="w-full h-14 bg-primary text-white font-black rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-primary/20"
            >
              {isProcessingNumber
                ? <Loader2 className="animate-spin mr-2 w-5 h-5" />
                : <><Hash className="w-5 h-5 mr-2" /> DAPATKAN NOMOR SURAT</>
              }
            </Button>
          ) : (
            <div className="p-5 rounded-3xl bg-primary/10 border-2 border-primary/20 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex gap-4 items-center">
                <div className="p-3 bg-primary rounded-2xl text-primary-foreground shadow-lg"><Hash className="w-6 h-6" /></div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-[10px] font-black text-primary uppercase">Nomor Terdaftar</p>
                    {formData.is_aset && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded-full">
                        <Archive className="w-3 h-3 text-amber-500" />
                        <span className="text-[9px] font-black text-amber-500 uppercase">Aset</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-2xl font-black tracking-tighter">{generatedNoSurat}</p>
                    <Button variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => { navigator.clipboard.writeText(generatedNoSurat || ""); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }}>
                      {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
              <Button variant="outline" onClick={handleResetNumber} className="border-primary text-primary font-bold hover:bg-primary/5">
                <RefreshCcw className="w-4 h-4 mr-2" /> Ubah Identitas
              </Button>
            </div>
          )}
        </section>

        {/* ══ SECTION 2: BERKAS ════════════════════════════════════════════ */}
        {generatedNoSurat && (
          <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500">
            <section className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground font-black">2</span>
                <h3 className="text-sm font-black uppercase text-muted-foreground">Persetujuan & Berkas</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Kiri: matrix + judul + template */}
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase text-muted-foreground">
                      Pilih Matrix Alur ({isPusatSelected ? "Pusat" : "Cabang"})
                    </Label>
                    <Popover open={openMatrix} onOpenChange={setOpenMatrix}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full h-auto py-3 justify-between rounded-xl ring-1 ring-border bg-muted/20 hover:bg-muted/30">
                          <div className="truncate text-left">
                            {selectedUsage ? (
                              <div className="flex items-center gap-1 flex-wrap">
                                {getFullRoles(selectedUsage).map((role: string, idx: number, arr: string[]) => (
                                  <React.Fragment key={idx}>
                                    <span className="text-xs font-black uppercase">{role}</span>
                                    {idx < arr.length - 1 && <ChevronRight className="w-3 h-3 opacity-30" />}
                                  </React.Fragment>
                                ))}
                              </div>
                            ) : <span className="text-muted-foreground text-sm">Cari Alur Matrix...</span>}
                          </div>
                          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Cari alur..." />
                          <CommandList className="max-h-[300px]">
                            <CommandEmpty>Alur tidak ditemukan.</CommandEmpty>
                            {Object.keys(groupedUsage).sort((a, b) => parseInt(a) - parseInt(b)).map(level => (
                              <CommandGroup key={level} heading={`ALUR ${level} TAHAP`}>
                                {groupedUsage[parseInt(level)].map((u: any) => (
                                  <CommandItem key={u.id} onSelect={() => { handleUsageChange(u.id); setOpenMatrix(false); }} className="p-3 cursor-pointer">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {getFullRoles(u).map((role: string, idx: number, arr: string[]) => (
                                        <React.Fragment key={idx}>
                                          <span className="text-[10px] px-2 py-0.5 bg-muted rounded-md font-black uppercase">{role}</span>
                                          {idx < arr.length - 1 && <ChevronRight className="w-3 h-3 opacity-30" />}
                                        </React.Fragment>
                                      ))}
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase text-muted-foreground">Perihal (Judul Surat)</Label>
                    <Input className="h-12 bg-muted/20 border-none ring-1 ring-border focus-visible:ring-primary"
                      placeholder="Contoh: Permohonan Pembelian Inventaris Kantor"
                      value={formData.judul_surat}
                      onChange={e => { setFormData({ ...formData, judul_surat: e.target.value }); setJudulForDisplay(e.target.value); }}
                    />
                  </div>

                  {selectedUsage?.master_forms?.link_form && (
                    <Button variant="secondary" className="w-full h-11 rounded-xl font-black text-xs gap-2"
                      onClick={handleDownloadTemplate} disabled={isDownloading}>
                      {isDownloading ? <Loader2 className="animate-spin w-4 h-4" /> : <Download className="w-4 h-4" />}
                      UNDUH TEMPLATE
                    </Button>
                  )}
                </div>

                {/* Kanan: upload */}
                <div className="space-y-4">
                  <div className={cn(
                    "relative border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center min-h-[160px] transition-all",
                    file ? "border-primary bg-primary/5" : "border-muted-foreground/20 bg-muted/10 hover:bg-muted/20"
                  )}>
                    <input type="file" ref={fileInputRef} accept=".xlsx" className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      onChange={e => setFile(e.target.files?.[0] || null)} />
                    <div className={cn("p-4 rounded-2xl mb-2", file ? "bg-primary text-white" : "bg-background text-muted-foreground shadow-sm")}>
                      <FileUp className="w-6 h-6" />
                    </div>
                    <p className="font-black text-xs text-center max-w-[200px] truncate">{file ? file.name : "Unggah File Utama (.xlsx)"}</p>
                    {!file && <p className="text-[10px] opacity-60 mt-1">Format Excel wajib sesuai template</p>}
                  </div>

                  <div className={cn(
                    "relative border-2 border-dashed rounded-2xl p-5 flex items-center gap-4 transition-all",
                    lampiranFile ? "border-emerald-500 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10"
                  )}>
                    <input type="file" ref={lampiranInputRef} className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      onChange={e => setLampiranFile(e.target.files?.[0] || null)} />
                    <div className={cn("p-3 rounded-xl", lampiranFile ? "bg-emerald-500 text-white" : "bg-amber-500 text-white")}>
                      <Paperclip className="w-5 h-5" />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase text-muted-foreground">Lampiran Tambahan (Opsional)</p>
                      <p className="text-xs font-bold truncate">{lampiranFile ? lampiranFile.name : "Klik untuk unggah PDF/Gambar"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ══ SECTION 3: SIGNERS ═══════════════════════════════════════ */}
            {signers.length > 0 && file && (
              <section className="space-y-8 pt-10 border-t animate-in fade-in duration-700">
                <div className="flex items-center gap-4">
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground font-black">3</span>
                  <h3 className="text-sm font-black uppercase text-muted-foreground">Penetapan Pejabat Penandatangan</h3>
                </div>

                <div className="max-w-xl mx-auto space-y-4">
                  {signers.map((s, i) => (
                    <div key={i} className="flex flex-col items-center">
                      <div className="w-full p-5 rounded-2xl bg-card border flex items-center gap-5 shadow-sm hover:border-primary/50 transition-colors">
                        <div className="flex flex-col items-center justify-center w-10 h-10 rounded-xl bg-muted font-black text-[10px] shrink-0">
                          <span className="opacity-50 text-[7px]">KE</span>{s.step_order}
                        </div>
                        <div className="flex-1 text-left space-y-1">
                          <div className="flex flex-col mb-2">
                            <p className="text-xs font-black text-primary uppercase leading-tight">{s.label_jabatan}</p>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">Status: {s.role_name}</p>
                          </div>
                          <Select value={s.user_id} onValueChange={val => { const ns = [...signers]; ns[i].user_id = val; setSigners(ns); }}>
                            <SelectTrigger className="h-10 bg-muted/20 border-none ring-1 ring-border rounded-lg focus:ring-primary">
                              <SelectValue placeholder={`Pilih ${s.label_jabatan}...`} />
                            </SelectTrigger>
                            <SelectContent>
                              {master.users?.map((u: any) => (
                                <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {i < signers.length - 1 && <ArrowDown className="text-primary/20 w-4 h-4 my-1" />}
                    </div>
                  ))}
                </div>

                <div className="pt-6">
                  <Button
                    className="w-full h-16 bg-primary text-white text-lg font-black rounded-3xl shadow-glow transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                    disabled={isLoading || signers.some(s => !s.user_id) || !formData.judul_surat}
                    onClick={handleSubmit}
                  >
                    {isLoading
                      ? <div className="flex items-center gap-3"><Loader2 className="animate-spin w-6 h-6" /><span>MEMPROSES DATA...</span></div>
                      : "KONFIRMASI PENDAFTARAN"
                    }
                  </Button>
                  <p className="text-center text-[10px] text-muted-foreground mt-4 font-medium uppercase tracking-widest">
                    Pastikan semua data sudah benar sebelum konfirmasi
                  </p>
                </div>
              </section>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SuratForm;