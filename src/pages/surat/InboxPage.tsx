import React, { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  FileText, 
  Loader2, 
  Search,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Eye,
  XCircle,
  MessageSquare,
  Paperclip,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { suratService } from "@/services/surat.service";
import { supabase } from "@/lib/supabase";
import { documentPreviewService } from "@/services/document-preview.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; 
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function InboxPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // PAGINATION STATE
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5; // Menampilkan 5 data per halaman

  // State untuk Preview & Notes
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<{ [key: string]: string }>({});
  const [allocationUnits, setAllocationUnits] = useState<Record<string, Array<{ value: string; label: string; raw?: any }>>>({});
  const [allocationSelected, setAllocationSelected] = useState<Record<string, any[]>>({});
  const [allocationFiles, setAllocationFiles] = useState<Record<string, Record<string, File | null>>>({});
  const [allocationLoading, setAllocationLoading] = useState<Record<string, boolean>>({});
  const [allocationErrors, setAllocationErrors] = useState<Record<string, string | null>>({});
  const [unitSearch, setUnitSearch] = useState<Record<string, string>>({});
  
  const noteRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});

  // 1. DATA INBOX
  const { data: inbox = [], isLoading: loading } = useQuery({
    queryKey: ['surat-inbox'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Unauthorized");
      return await suratService.getMyInbox(user.id);
    },
    staleTime: 30000,
  });

  // 2. PROFIL USER
  const { data: currentUser } = useQuery({
    queryKey: ['user-profile-inbox'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
      return { ...user, full_name: profile?.full_name };
    }
  });

  // FILTERING LOGIC
  const filteredInbox = inbox.filter((item: any) => 
    item.surat_registrasi.judul_surat.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.surat_registrasi.no_surat?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // PAGINATION LOGIC
  const totalPages = Math.ceil(filteredInbox.length / itemsPerPage);
  
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredInbox.slice(start, start + itemsPerPage);
  }, [filteredInbox, currentPage]);

  const isUnitAllocationRequired = (item: any) =>
    item.requires_unit_allocation === true && item.surat_registrasi?.form_input_data?.request_mode === "unit";

  const getRequestedUnitCount = (item: any) =>
    Number(item.surat_registrasi?.form_input_data?.requested_unit_count || 0);

  const getRequestedProjectCode = (item: any) =>
    String(item.surat_registrasi?.form_input_data?.requested_project?.code || "").trim();

  const getUnitAttachmentRequirements = (item: any) => {
    const requirements = item.surat_registrasi?.form_input_data?.unit_config_snapshot?.allocation_attachment_requirements;
    return Array.isArray(requirements) && requirements.length > 0
      ? requirements
      : [
          { key: "siteplan", label: "Siteplan", required: true },
          { key: "kode_produksi", label: "Kode Produksi", required: true },
          { key: "volume_adendum", label: "Volume Adendum", required: true },
          { key: "hitungan_adendum", label: "Hitungan Adendum", required: true },
        ];
  };

  const getMissingUnitAttachmentLabels = (item: any) => {
    const files = allocationFiles[item.id] || {};
    return getUnitAttachmentRequirements(item)
      .filter((requirement: any) => requirement.required !== false && !files[requirement.key])
      .map((requirement: any) => requirement.label || requirement.key);
  };

  const requestExternalOptions = async (sourceKey: string, variables: Record<string, any> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Tidak terautentikasi");
    const response = await fetch(`/api/data-sources/${sourceKey}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ variables }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "Gagal mengambil data external.");
    return payload.options || [];
  };

  useEffect(() => {
    paginatedData.filter(isUnitAllocationRequired).forEach((item: any) => {
      const signatureId = item.id;
      if (allocationUnits[signatureId] || allocationLoading[signatureId]) return;

      const projectCode = getRequestedProjectCode(item);
      if (!projectCode) {
        setAllocationErrors(prev => ({ ...prev, [signatureId]: "Code project external belum tersedia." }));
        return;
      }

      setAllocationLoading(prev => ({ ...prev, [signatureId]: true }));
      setAllocationErrors(prev => ({ ...prev, [signatureId]: null }));
      requestExternalOptions("marison_units_by_project", { project_code: projectCode })
        .then((options) => {
          setAllocationUnits(prev => ({ ...prev, [signatureId]: options }));
        })
        .catch((error: any) => {
          setAllocationUnits(prev => ({ ...prev, [signatureId]: [] }));
          setAllocationErrors(prev => ({ ...prev, [signatureId]: error.message || "Gagal mengambil data unit." }));
        })
        .finally(() => {
          setAllocationLoading(prev => ({ ...prev, [signatureId]: false }));
        });
    });
  }, [paginatedData]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset ke halaman 1 saat mencari
  };

// FUNGSI APPROVE
const handleApprove = async (item: any) => {
  if (!currentUser?.full_name) {
    toast.error("Profil tidak lengkap.");
    return;
  }

  setProcessingId(item.id);
  try {
    const note = notes[item.id] || "";
    const selectedUnits = allocationSelected[item.id] || [];
    if (isUnitAllocationRequired(item) && selectedUnits.length < getRequestedUnitCount(item)) {
      throw new Error(`Unit terpilih kurang. Minimal ${getRequestedUnitCount(item)} unit.`);
    }
    const missingAttachments = isUnitAllocationRequired(item) ? getMissingUnitAttachmentLabels(item) : [];
    if (missingAttachments.length > 0) {
      throw new Error(`Lampiran unit belum lengkap: ${missingAttachments.join(", ")}.`);
    }

    const selectedAttachmentFiles = getUnitAttachmentRequirements(item)
      .map((requirement: any) => ({
        key: requirement.key,
        label: requirement.label || requirement.key,
        file: allocationFiles[item.id]?.[requirement.key],
      }))
      .filter((entry: any) => entry.file);

    await suratService.approveSurat(
      item.id, 
      item.surat_id, 
      item.surat_registrasi.current_step, 
      currentUser.full_name,
      note,
      isUnitAllocationRequired(item) ? { unitAllocation: { units: selectedUnits, attachments: selectedAttachmentFiles } } : {}
    );
    
    toast.success("Dokumen Berhasil Disetujui", {
      description: "Data telah diperbarui dan diteruskan ke tahap selanjutnya."
    });
    
    setNotes(prev => {
      const newNotes = { ...prev };
      delete newNotes[item.id];
      return newNotes;
    });
    setAllocationSelected(prev => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    setAllocationFiles(prev => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });

    queryClient.invalidateQueries({ queryKey: ['surat-inbox'] });
  } catch (error: any) {
    console.error("Approve Error:", error);
    toast.error(error.message || "Gagal menyetujui dokumen.");
  } finally {
    setProcessingId(null);
  }
};

  // FUNGSI REJECT
  const handleReject = async (item: any) => {
    const note = notes[item.id];
    
    if (!note || note.trim().length < 5) {
      toast.error("Catatan Wajib Diisi", {
        description: "Harap masukkan alasan penolakan minimal 5 karakter pada kolom catatan."
      });
      noteRefs.current[item.id]?.focus();
      return;
    }

    setProcessingId(item.id);
    try {
      await suratService.rejectSurat(item.id, item.surat_id, note);
      toast.error("Dokumen Ditolak", {
        description: "Alur dokumen telah dihentikan secara permanen.",
      });
      queryClient.invalidateQueries({ queryKey: ['surat-inbox'] });
    } catch (error: any) {
      console.error("Reject Error:", error);
      toast.error(error.message || "Gagal menolak dokumen.");
    } finally {
      setProcessingId(null);
    }
  };

  const openPreview = async (suratId: string, fallbackUrl: string) => {
    // Query file_path terbaru dari DB — cegah tampil file lama dari React state
    if (!fallbackUrl) return toast.error("File dokumen belum tersedia.");
    setPreviewingId(suratId);
    
    // Decode dulu sebelum encode ulang — cegah %20 → %2520 → preview kosong
    try {
      const pdfUrl = await documentPreviewService.getPdfUrl(suratId);
      await documentPreviewService.openStoredFileInNewTab(suratId, pdfUrl);
    } catch (error: any) {
      toast.error(error.message || "Gagal membuka PDF.");
    } finally {
      setPreviewingId(null);
    }
  };

  const openLampiran = async (suratId: string, url: string) => {
    if (!url) return;
    try {
      await documentPreviewService.openStoredFileInNewTab(suratId, url);
    } catch (error: any) {
      toast.error(error.message || "Gagal membuka lampiran.");
    }
  };

  const getAttachments = (surat: any) => {
    const attachments = Array.isArray(surat?.surat_attachments) ? surat.surat_attachments : [];
    if (attachments.length > 0) return attachments;
    return surat?.lampiran_path
      ? [{ id: 'legacy-lampiran', file_url: surat.lampiran_path, file_name: surat.lampiran_path.split('/').pop() }]
      : [];
  };

  const toggleAllocatedUnit = (signatureId: string, option: any) => {
    setAllocationSelected(prev => {
      const selected = prev[signatureId] || [];
      const exists = selected.some((item: any) => item.value === option.value);
      return {
        ...prev,
        [signatureId]: exists
          ? selected.filter((item: any) => item.value !== option.value)
          : [...selected, option],
      };
    });
  };

  const renderUnitAllocationPanel = (item: any) => {
    if (!isUnitAllocationRequired(item)) return null;
    const requestedCount = getRequestedUnitCount(item);
    const selected = allocationSelected[item.id] || [];
    const missingAttachments = getMissingUnitAttachmentLabels(item);
    const selectedValues = new Set(selected.map((unit: any) => unit.value));
    const search = (unitSearch[item.id] || "").toLowerCase().trim();
    const units = (allocationUnits[item.id] || []).filter((unit) =>
      !search || unit.label.toLowerCase().includes(search) || String(unit.value).toLowerCase().includes(search)
    );
    const isEnough = selected.length >= requestedCount && missingAttachments.length === 0;

    return (
      <div className={cn(
        "rounded-2xl border p-4 space-y-3",
        isEnough ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"
      )}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Alokasi Unit Perencanaan</p>
            <p className="text-[10px] font-semibold text-muted-foreground">
              {selected.length} unit / {requestedCount} unit diajukan
            </p>
          </div>
          <Badge variant={isEnough ? "default" : "outline"} className="text-[9px] font-black uppercase">
            {isEnough ? "Memenuhi" : "Kurang"}
          </Badge>
        </div>

        <Input
          value={unitSearch[item.id] || ""}
          onChange={(e) => setUnitSearch(prev => ({ ...prev, [item.id]: e.target.value }))}
          placeholder="Cari kode unit..."
          className="h-9 bg-background/80 text-[11px] font-semibold"
        />

        {allocationLoading[item.id] ? (
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat unit
          </div>
        ) : allocationErrors[item.id] ? (
          <p className="text-[10px] font-semibold text-destructive">{allocationErrors[item.id]}</p>
        ) : (
          <div className="max-h-48 overflow-y-auto rounded-xl border border-border/60 bg-background/70">
            {units.length === 0 ? (
              <p className="p-3 text-[10px] font-semibold text-muted-foreground">Unit tidak ditemukan.</p>
            ) : units.map((unit) => (
              <label key={`${item.id}-${unit.value}`} className="flex cursor-pointer items-center gap-2 border-b border-border/40 px-3 py-2 text-[11px] font-bold last:border-b-0 hover:bg-muted/60">
                <input
                  type="checkbox"
                  checked={selectedValues.has(unit.value)}
                  onChange={() => toggleAllocatedUnit(item.id, unit)}
                />
                <span>{unit.label}</span>
              </label>
            ))}
          </div>
        )}
        <div className="space-y-2 rounded-xl border border-border/60 bg-background/70 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Lampiran Unit</p>
          {getUnitAttachmentRequirements(item).map((requirement: any) => {
            const file = allocationFiles[item.id]?.[requirement.key];
            return (
              <label key={`${item.id}-${requirement.key}`} className="grid cursor-pointer grid-cols-1 gap-2 rounded-lg border border-border/40 bg-muted/20 p-3 text-[11px] font-bold md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <span className="uppercase">{requirement.label || requirement.key}</span>
                  {requirement.required !== false && <span className="ml-2 text-destructive">*</span>}
                  <p className="mt-1 truncate text-[10px] font-medium text-muted-foreground">{file ? file.name : "Belum ada file"}</p>
                </div>
                <Input
                  type="file"
                  className="h-9 bg-background text-[10px]"
                  onChange={(event) => {
                    const selectedFile = event.target.files?.[0] || null;
                    setAllocationFiles(prev => ({
                      ...prev,
                      [item.id]: {
                        ...(prev[item.id] || {}),
                        [requirement.key]: selectedFile,
                      },
                    }));
                  }}
                />
              </label>
            );
          })}
          {missingAttachments.length > 0 && (
            <p className="text-[10px] font-semibold text-amber-600">
              Wajib dilengkapi: {missingAttachments.join(", ")}
            </p>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground text-center">
          Synchronizing Secure Inbox
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-10 space-y-10 animate-in fade-in duration-700">
      <Dialog open={!!previewingId}>
        <DialogContent className="max-w-sm rounded-3xl text-center">
          <DialogHeader>
            <DialogTitle className="flex flex-col items-center gap-3 text-sm font-black uppercase">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              PDF sedang dibuat
            </DialogTitle>
            <DialogDescription>
              Dokumen sedang diproses di background. PDF akan terbuka otomatis saat siap.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-primary rounded-full" />
            <h1 className="text-3xl font-black text-foreground tracking-tighter uppercase">
              Inbox <span className="text-primary/50 font-light tracking-widest">Approval</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 ml-5">
            <Badge variant="outline" className="rounded-none border-primary/30 text-primary text-[9px] font-black px-2 py-0">
              {filteredInbox.length} QUEUE
            </Badge>
          </div>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input 
            placeholder="FILTER QUEUE..." 
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-8 h-10 bg-transparent border-0 border-b border-border rounded-none focus-visible:ring-0 uppercase text-[11px] font-bold tracking-widest"
          />
        </div>
      </div>

      {/* LIST SECTION */}
      <div className="max-w-6xl mx-auto space-y-6">
        {paginatedData.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border rounded-3xl opacity-50">
            <ShieldCheck size={32} className="text-muted-foreground mb-4" />
            <h2 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.5em]">
              {searchTerm ? "No Results Found" : "Inbox is Empty"}
            </h2>
          </div>
        ) : (
          paginatedData.map((item: any) => (
            <div key={item.id} className="group flex flex-col overflow-hidden transition-all bg-card border border-border rounded-xl shadow-sm hover:border-primary/40">
              <div className="grid grid-cols-1 md:grid-cols-12">
                {/* Sidebar Info */}
                <div className="md:col-span-2 bg-muted/30 flex flex-col items-center justify-center p-6 border-b md:border-b-0 md:border-r border-border">
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Sequence</span>
                  <span className="text-4xl font-light text-foreground tabular-nums tracking-tighter">0{item.step_order}</span>
                  <Badge className="mt-4 rounded-none bg-primary/10 text-primary border-none text-[8px] font-black px-2">
                    {item.role_name}
                  </Badge>
                </div>

                {/* Content Area */}
                <div className="md:col-span-7 p-6 flex flex-col justify-between gap-6">
                  <div className="flex items-start gap-4">
                    <div className="hidden sm:flex w-12 h-12 rounded-xl bg-primary/5 items-center justify-center text-primary shrink-0 group-hover:bg-primary group-hover:text-white transition-colors duration-500">
                      <FileText size={24} strokeWidth={1.5} />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-primary">{item.surat_registrasi.no_surat || "PENDING/REF"}</span>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">
                          • {new Date(item.surat_registrasi.created_at).toLocaleDateString('id-ID', {day: '2-digit', month: 'short', year: 'numeric'})}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-foreground leading-tight uppercase truncate">{item.surat_registrasi.judul_surat}</h3>
                    </div>
                  </div>

                  <div className="relative group/note">
                    <MessageSquare size={14} className="absolute left-3 top-3 text-muted-foreground group-focus-within/note:text-primary transition-colors" />
                    <Textarea 
                      ref={(el) => (noteRefs.current[item.id] = el)}
                      placeholder="TAMBAHKAN CATATAN ATAU ALASAN PENOLAKAN..."
                      value={notes[item.id] || ""}
                      onChange={(e) => setNotes({...notes, [item.id]: e.target.value})}
                      className="pl-10 min-h-[80px] text-[11px] font-medium bg-muted/20 border-none rounded-lg focus-visible:ring-1 focus-visible:ring-primary/30 resize-none uppercase tracking-wider"
                    />
                  </div>
                  {renderUnitAllocationPanel(item)}
                </div>

                {/* Actions Section */}
                <div className="md:col-span-3 p-6 bg-muted/10 flex flex-col justify-center gap-2 border-t md:border-t-0 md:border-l border-border">
                  {getAttachments(item.surat_registrasi).map((attachment: any, index: number) => (
                    <Button
                      key={attachment.id ?? attachment.file_url}
                      variant="outline"
                      className="w-full h-10 text-[10px] font-black uppercase tracking-widest border-blue-500/30 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                      onClick={() => openLampiran(item.surat_registrasi.id, attachment.file_url)}
                    >
                      <Paperclip size={14} className="mr-2" /> Lampiran {index + 1}
                    </Button>
                  ))}

                  <Button 
                    variant="outline" 
                    className="w-full h-10 text-[10px] font-black uppercase tracking-widest hover:bg-muted"
                    disabled={previewingId === item.surat_registrasi.id}
                    onClick={() => openPreview(item.surat_registrasi.id, item.surat_registrasi.file_path)}
                  >
                    {previewingId === item.surat_registrasi.id ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Eye size={14} className="mr-2" />} Preview Utama
                  </Button>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Button 
                      variant="destructive"
                      disabled={processingId === item.id}
                      onClick={() => handleReject(item)}
                      className="h-10 text-[9px] font-black uppercase tracking-widest shadow-sm active:scale-95"
                    >
                      {processingId === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <span className="flex items-center gap-1"><XCircle size={12}/>Tolak</span>
                      )}
                    </Button>

                    <Button 
                      disabled={
                        processingId === item.id ||
                        (isUnitAllocationRequired(item) && (
                          (allocationSelected[item.id]?.length || 0) < getRequestedUnitCount(item) ||
                          getMissingUnitAttachmentLabels(item).length > 0
                        ))
                      }
                      onClick={() => handleApprove(item)}
                      className="h-10 text-[9px] font-black uppercase tracking-widest shadow-md active:scale-95 bg-emerald-600 hover:bg-emerald-500 text-white border-none transition-all"
                    >
                      {processingId === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <span className="flex items-center gap-1">Setujui<ArrowRight size={12}/></span>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* PAGINATION CONTROLS */}
      {totalPages > 1 && (
        <div className="max-w-6xl mx-auto flex items-center justify-between py-6 border-t border-border">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
              className="h-9 w-9 p-0 rounded-xl"
            >
              <ChevronLeft size={16} />
            </Button>
            
            <div className="flex items-center gap-1">
              {[...Array(totalPages)].map((_, i) => (
                <Button
                  key={i + 1}
                  variant={currentPage === i + 1 ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setCurrentPage(i + 1)}
                  className={`h-9 w-9 p-0 text-[10px] font-bold rounded-xl ${
                    currentPage === i + 1 ? "bg-primary text-white hover:bg-primary/90" : ""
                  }`}
                >
                  {i + 1}
                </Button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="h-9 w-9 p-0 rounded-xl"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* PROTOCOL FOOTER */}
      <div className="max-w-6xl mx-auto flex items-start gap-4 p-8 border border-border rounded-3xl bg-muted/5">
        <AlertCircle className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div className="space-y-1">
          <h3 className="text-sm font-bold uppercase tracking-wider">Protokol Persetujuan</h3>
          <p className="text-[11px] leading-relaxed text-muted-foreground font-medium">
            Dengan menekan <span className="text-emerald-500 font-bold uppercase">Setujui</span>, 
            tanda tangan digital Anda akan dibubuhi stempel waktu dan dokumen diteruskan ke tahap berikutnya. 
            Menekan <span className="text-destructive font-bold uppercase">Tolak</span> mengharuskan 
            Anda mengisi alasan pada kolom catatan untuk menghentikan alur pengajuan.
          </p>
        </div>
      </div>

    </div>
  );
}
