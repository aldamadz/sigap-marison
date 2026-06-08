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
  ChevronRight,
  Calendar as CalendarIcon,
  Building2,
  Home,
  FileUp,
  CheckCircle2
} from "lucide-react";
import { suratService } from "@/services/surat.service";
import { supabase } from "@/lib/supabase";
import { documentPreviewService } from "@/services/document-preview.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; 
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [allocationProjects, setAllocationProjects] = useState<Array<{ value: string; label: string; raw?: any }>>([]);
  const [allocationProjectSelected, setAllocationProjectSelected] = useState<Record<string, any>>({});
  const [allocationProjectsLoading, setAllocationProjectsLoading] = useState(false);
  const [allocationProjectsLoaded, setAllocationProjectsLoaded] = useState(false);
  const [allocationProjectsError, setAllocationProjectsError] = useState<string | null>(null);
  const [allocationSelected, setAllocationSelected] = useState<Record<string, any[]>>({});
  const [allocationDetails, setAllocationDetails] = useState<Record<string, Record<string, any>>>({});
  const [allocationFiles, setAllocationFiles] = useState<Record<string, Record<string, File | null>>>({});
  const [allocationLoading, setAllocationLoading] = useState<Record<string, boolean>>({});
  const [allocationErrors, setAllocationErrors] = useState<Record<string, string | null>>({});
  const [unitSearch, setUnitSearch] = useState<Record<string, string>>({});
  const [allocationDateOpen, setAllocationDateOpen] = useState<Record<string, boolean>>({});
  
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

  const getAllocationProject = (item: any) =>
    allocationProjectSelected[item.id] || item.surat_registrasi?.form_input_data?.requested_project;

  const getUnitAttachmentRequirements = (item: any) => {
    const requirements = item.surat_registrasi?.form_input_data?.unit_config_snapshot?.allocation_attachment_requirements;
    const source = Array.isArray(requirements) && requirements.length > 0
      ? requirements
      : [
          { key: "siteplan", label: "Siteplan", required: true },
          { key: "volume_adendum", label: "Volume Adendum", required: true },
          { key: "hitungan_adendum", label: "Hitungan Adendum", required: true },
        ];
    return source.filter((requirement: any) =>
      String(requirement.key || "").toLowerCase() !== "kode_produksi" &&
      String(requirement.label || "").toLowerCase() !== "kode produksi"
    );
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
    if (!paginatedData.some(isUnitAllocationRequired) || allocationProjectsLoaded || allocationProjectsLoading) return;
    setAllocationProjectsLoading(true);
    setAllocationProjectsError(null);
    requestExternalOptions("marison_projects")
      .then(setAllocationProjects)
      .catch((error: any) => setAllocationProjectsError(error.message || "Gagal mengambil daftar project."))
      .finally(() => {
        setAllocationProjectsLoading(false);
        setAllocationProjectsLoaded(true);
      });
  }, [paginatedData, allocationProjectsLoaded, allocationProjectsLoading]);

  useEffect(() => {
    paginatedData.filter(isUnitAllocationRequired).forEach((item: any) => {
      const signatureId = item.id;
      if (allocationUnits[signatureId] || allocationLoading[signatureId]) return;

      const projectCode = String(getAllocationProject(item)?.code || "").trim();
      if (!projectCode) return;

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
  }, [paginatedData, allocationProjectSelected]);

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
    const selectedProject = getAllocationProject(item);
    if (isUnitAllocationRequired(item) && !selectedProject?.code) {
      throw new Error("Project unit wajib dipilih.");
    }
    if (isUnitAllocationRequired(item) && selectedUnits.length < getRequestedUnitCount(item)) {
      throw new Error(`Unit terpilih kurang. Minimal ${getRequestedUnitCount(item)} unit.`);
    }
    if (isUnitAllocationRequired(item)) {
      const details = allocationDetails[item.id] || {};
      const incompleteUnit = selectedUnits.find((unit: any) => {
        const detail = details[unit.value] || {};
        return !String(detail.production_serial || "").trim() ||
          !String(detail.production_block || "").trim() ||
          !String(detail.production_date || "").trim();
      });
      if (incompleteUnit) {
        throw new Error(`Kode produksi untuk ${incompleteUnit.label || incompleteUnit.value} belum lengkap.`);
      }
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
      isUnitAllocationRequired(item) ? {
        unitAllocation: {
          project: selectedProject,
          units: selectedUnits.map((unit: any) => ({
            ...unit,
            allocation_detail: allocationDetails[item.id]?.[unit.value] || {},
          })),
          attachments: selectedAttachmentFiles,
        }
      } : {}
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
    setAllocationDetails(prev => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    setAllocationFiles(prev => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    setAllocationProjectSelected(prev => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    setAllocationDateOpen(prev => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`${item.id}:`)) delete next[key];
      });
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

  const handleAllocationProjectChange = (signatureId: string, projectValue: string) => {
    const option = allocationProjects.find((project) => project.value === projectValue);
    const project = option?.raw;
    setAllocationProjectSelected(prev => ({
      ...prev,
      [signatureId]: project?.code ? {
        value: option?.value,
        label: option?.label,
        id: project.id,
        code: project.code,
        name: project.name,
        branch: project.branch ?? null,
      } : null,
    }));
    setAllocationUnits(prev => {
      const next = { ...prev };
      delete next[signatureId];
      return next;
    });
    setAllocationSelected(prev => ({ ...prev, [signatureId]: [] }));
    setAllocationDetails(prev => {
      const next = { ...prev };
      delete next[signatureId];
      return next;
    });
    setAllocationErrors(prev => ({ ...prev, [signatureId]: null }));
  };

  const updateAllocationDetail = (signatureId: string, unitValue: string, key: string, value: any) => {
    setAllocationDetails(prev => ({
      ...prev,
      [signatureId]: {
        ...(prev[signatureId] || {}),
        [unitValue]: {
          ...((prev[signatureId] || {})[unitValue] || {}),
          [key]: value,
        },
      },
    }));
  };

  const formatDatePickerDisplay = (value: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const toDateInputValue = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const renderUnitAllocationPanel = (item: any) => {
    if (!isUnitAllocationRequired(item)) return null;
    const requestedCount = getRequestedUnitCount(item);
    const selectedProject = getAllocationProject(item);
    const selected = allocationSelected[item.id] || [];
    const missingAttachments = getMissingUnitAttachmentLabels(item);
    const selectedValues = new Set(selected.map((unit: any) => unit.value));
    const search = (unitSearch[item.id] || "").toLowerCase().trim();
    const units = (allocationUnits[item.id] || []).filter((unit) =>
      !search || unit.label.toLowerCase().includes(search) || String(unit.value).toLowerCase().includes(search)
    );
    const details = allocationDetails[item.id] || {};
    const incompleteCodeUnits = selected.filter((unit: any) => {
      const detail = details[unit.value] || {};
      return !String(detail.production_serial || "").trim() ||
        !String(detail.production_block || "").trim() ||
        !String(detail.production_date || "").trim();
    });
    const hasEnoughUnits = selected.length >= requestedCount;
    const isComplete = !!selectedProject?.code && hasEnoughUnits && missingAttachments.length === 0 && incompleteCodeUnits.length === 0;
    const statusLabel = !selectedProject?.code
      ? "Project belum dipilih"
      : !hasEnoughUnits
        ? "Unit kurang"
        : missingAttachments.length > 0
          ? "Lampiran belum lengkap"
          : incompleteCodeUnits.length > 0
            ? "Kode produksi belum lengkap"
            : "Memenuhi";
    const allocationProgress = requestedCount > 0 ? Math.min(100, Math.round((selected.length / requestedCount) * 100)) : 0;
    const canPickMore = selected.length >= requestedCount;

    return (
      <div className="overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-sm">
        <div className="border-b border-border bg-muted/25 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Alokasi Unit Perencanaan</p>
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    Pilih project, kavling, kode produksi, dan lampiran pendukung.
                  </p>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", hasEnoughUnits ? "bg-emerald-500" : "bg-primary")}
                  style={{ width: `${allocationProgress}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-[9px] font-black uppercase text-muted-foreground">Diajukan</p>
                <p className="text-lg font-black tabular-nums">{requestedCount}</p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-[9px] font-black uppercase text-muted-foreground">Dipilih</p>
                <p className={cn("text-lg font-black tabular-nums", hasEnoughUnits ? "text-emerald-600" : "text-primary")}>{selected.length}</p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-[9px] font-black uppercase text-muted-foreground">Status</p>
                <Badge className={cn(
                  "mt-1 rounded-md text-[9px] font-black uppercase",
                  isComplete
                    ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15"
                    : "bg-primary/10 text-primary hover:bg-primary/10"
                )}>
                  {statusLabel}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="space-y-4">
            <section className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Project Unit</p>
                  <p className="text-[10px] font-semibold text-muted-foreground">{selectedProject?.name || "Belum ada project terpilih"}</p>
                </div>
                {selectedProject?.code && <Badge variant="outline" className="font-mono text-[10px]">{selectedProject.code}</Badge>}
              </div>
              <select
                value={selectedProject?.value || ""}
                onChange={(event) => handleAllocationProjectChange(item.id, event.target.value)}
                disabled={allocationProjectsLoading}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-[12px] font-semibold"
              >
                <option value="">{allocationProjectsLoading ? "Memuat project..." : "Pilih project unit"}</option>
                {allocationProjects.map((project) => (
                  <option key={`${item.id}-${project.value}`} value={project.value} disabled={!project.raw?.code}>
                    {project.label}{project.raw?.branch?.name ? ` - ${project.raw.branch.name}` : ""}{!project.raw?.code ? " (code belum tersedia)" : ""}
                  </option>
                ))}
              </select>
              {allocationProjectsError && <p className="mt-2 text-[10px] font-semibold text-destructive">{allocationProjectsError}</p>}
            </section>

            <section className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Pilih Kavling</p>
                  <p className="text-[10px] font-semibold text-muted-foreground">
                    Minimal {requestedCount} unit. Boleh memilih lebih dari jumlah pengajuan.
                  </p>
                </div>
                {canPickMore && <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">Cukup</Badge>}
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={unitSearch[item.id] || ""}
                  onChange={(e) => setUnitSearch(prev => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder="Cari kode unit..."
                  className="h-10 bg-background pl-9 text-[12px] font-semibold"
                />
              </div>

              {allocationLoading[item.id] ? (
                <div className="flex h-28 items-center justify-center gap-2 rounded-xl border border-dashed border-border text-[10px] font-bold uppercase text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Memuat unit
                </div>
              ) : allocationErrors[item.id] ? (
                <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-[10px] font-semibold text-destructive">{allocationErrors[item.id]}</p>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-xl border border-border bg-muted/10 p-2">
                  {units.length === 0 ? (
                    <p className="p-3 text-[10px] font-semibold text-muted-foreground">Unit tidak ditemukan.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {units.map((unit) => {
                        const checked = selectedValues.has(unit.value);
                        return (
                          <button
                            type="button"
                            key={`${item.id}-${unit.value}`}
                            onClick={() => toggleAllocatedUnit(item.id, unit)}
                            className={cn(
                              "flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all",
                              checked
                                ? "border-primary bg-primary/10 text-primary shadow-sm"
                                : "border-border bg-background hover:border-primary/40 hover:bg-primary/5"
                            )}
                          >
                            <span className={cn(
                              "flex h-5 w-5 items-center justify-center rounded-md border",
                              checked ? "border-primary bg-primary text-primary-foreground" : "border-border"
                            )}>
                              {checked && <CheckCircle2 className="h-3.5 w-3.5" />}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[11px] font-black uppercase">{unit.label}</span>
                              <span className="block truncate text-[10px] font-semibold text-muted-foreground">{unit.value}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Detail Kavling dan Kode Produksi</p>
                  <p className="text-[10px] font-semibold text-muted-foreground">
                    Nominal rekap adendum opsional. Kode produksi wajib lengkap.
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">{selected.length} unit</Badge>
              </div>
              {selected.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 text-center">
                  <Home className="mb-2 h-5 w-5 text-muted-foreground" />
                  <p className="text-[11px] font-bold text-muted-foreground">Pilih kavling terlebih dahulu.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selected.map((unit: any, index: number) => {
                    const detail = details[unit.value] || {};
                    const dateKey = `${item.id}:${unit.value}`;
                    const codeReady = String(detail.production_serial || "").trim() &&
                      String(detail.production_block || "").trim() &&
                      String(detail.production_date || "").trim();
                    return (
                      <div key={`${item.id}-detail-${unit.value}`} className="rounded-xl border border-border bg-muted/10 p-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-black uppercase text-foreground">{index + 1}. {unit.label}</p>
                            <p className="font-mono text-[10px] font-semibold text-muted-foreground">
                              {detail.production_serial || "[001]"}/UAI/PRC/{detail.production_block || "[4.1]"}/{detail.production_date ? new Date(detail.production_date).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }) : "[14/01/2026]"}
                            </p>
                          </div>
                          <Badge className={cn(
                            "rounded-md text-[9px] font-black uppercase",
                            codeReady ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15" : "bg-primary/10 text-primary hover:bg-primary/10"
                          )}>
                            {codeReady ? "Lengkap" : "Belum lengkap"}
                          </Badge>
                        </div>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Rekap Adendum</p>
                            <div className="grid grid-cols-1 gap-3">
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-bold text-muted-foreground">Struktur Atas</p>
                                <Input
                                  type="number"
                                  value={detail.struktur_atas || ""}
                                  onChange={(e) => updateAllocationDetail(item.id, unit.value, "struktur_atas", e.target.value)}
                                  placeholder="Masukkan nominal struktur atas"
                                  className="h-11 bg-background text-[13px]"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-bold text-muted-foreground">Struktur Bawah</p>
                                <Input
                                  type="number"
                                  value={detail.struktur_bawah || ""}
                                  onChange={(e) => updateAllocationDetail(item.id, unit.value, "struktur_bawah", e.target.value)}
                                  placeholder="Masukkan nominal struktur bawah"
                                  className="h-11 bg-background text-[13px]"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Kode Produksi</p>
                            <div className="grid grid-cols-1 gap-3">
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-bold text-muted-foreground">Nomor</p>
                                <Input
                                  value={detail.production_serial || ""}
                                  onChange={(e) => updateAllocationDetail(item.id, unit.value, "production_serial", e.target.value)}
                                  placeholder="Contoh: 001"
                                  className="h-11 bg-background font-mono text-[13px]"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-bold text-muted-foreground">Blok</p>
                                <Input
                                  value={detail.production_block || ""}
                                  onChange={(e) => updateAllocationDetail(item.id, unit.value, "production_block", e.target.value)}
                                  placeholder="Contoh: 4.1"
                                  className="h-11 bg-background font-mono text-[13px]"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-bold text-muted-foreground">Tanggal</p>
                                <Popover
                                  open={!!allocationDateOpen[dateKey]}
                                  onOpenChange={(open) => setAllocationDateOpen(prev => ({ ...prev, [dateKey]: open }))}
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-11 w-full justify-start bg-background px-3 font-mono text-[13px] font-normal"
                                    >
                                      <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                                      {formatDatePickerDisplay(detail.production_date || "") || "dd/mm/yyyy"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={detail.production_date ? new Date(detail.production_date) : undefined}
                                      onSelect={(date) => {
                                        if (!date) return;
                                        updateAllocationDetail(item.id, unit.value, "production_date", toDateInputValue(date));
                                        setAllocationDateOpen(prev => ({ ...prev, [dateKey]: false }));
                                      }}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center gap-2">
                <FileUp className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Lampiran Unit</p>
                  <p className="text-[10px] font-semibold text-muted-foreground">Lampiran persyaratan dari konfigurasi unit.</p>
                </div>
              </div>
          {getUnitAttachmentRequirements(item).map((requirement: any) => {
            const file = allocationFiles[item.id]?.[requirement.key];
            return (
              <label key={`${item.id}-${requirement.key}`} className="mb-2 grid cursor-pointer grid-cols-1 gap-2 rounded-lg border border-border bg-muted/10 p-3 text-[11px] font-bold last:mb-0 md:grid-cols-[1fr_auto] md:items-center">
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
            <p className="mt-2 rounded-lg bg-primary/10 p-2 text-[10px] font-semibold text-primary">
              Wajib dilengkapi: {missingAttachments.join(", ")}
            </p>
          )}
          {incompleteCodeUnits.length > 0 && (
            <p className="mt-2 rounded-lg bg-primary/10 p-2 text-[10px] font-semibold text-primary">
              Kode produksi belum lengkap: {incompleteCodeUnits.map((unit: any) => unit.label || unit.value).join(", ")}
            </p>
          )}
            </section>
          </div>
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
    <div className="space-y-8 animate-in fade-in duration-300">
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
                          !getAllocationProject(item)?.code ||
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
