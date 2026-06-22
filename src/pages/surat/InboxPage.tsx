import React, { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { 
  Loader2, 
  Search,
  ArrowRight,
  ShieldCheck,
  Eye,
  XCircle,
  MessageSquare,
  Paperclip,
  ChevronDown,
  Calendar as CalendarIcon,
  Building2,
  Home,
  FileUp,
  CheckCircle2,
  UserRound,
  MapPin,
  BriefcaseBusiness,
  PackageOpen,
  ClipboardList,
  Clock3,
  ListFilter,
  RefreshCw,
  Circle,
  CircleCheck,
  AlertTriangle,
  FileCheck2
} from "lucide-react";
import { suratService } from "@/services/surat.service";
import { departmentKpiService, type DepartmentKpiDetail } from "@/services/department-kpi.service";
import { supabase } from "@/lib/supabase";
import { documentPreviewService } from "@/services/document-preview.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; 
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppDialog } from "@/components/app/AppDialogProvider";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function InboxPage() {
  const queryClient = useQueryClient();
  const appDialog = useAppDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [kpiFilter, setKpiFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [taskSwitcherOpen, setTaskSwitcherOpen] = useState(false);

  // State untuk Preview & Notes
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<{ [key: string]: string }>({});
  const [allocationUnits, setAllocationUnits] = useState<Record<string, Array<{ value: string; label: string; raw?: any }>>>({});
  const [allocationProjectSelected, setAllocationProjectSelected] = useState<Record<string, any>>({});
  const [allocationSelected, setAllocationSelected] = useState<Record<string, any[]>>({});
  const [allocationDetails, setAllocationDetails] = useState<Record<string, Record<string, any>>>({});
  const [approvalFiles, setApprovalFiles] = useState<Record<string, Record<string, File[]>>>({});
  const [allocationLoading, setAllocationLoading] = useState<Record<string, boolean>>({});
  const [allocationErrors, setAllocationErrors] = useState<Record<string, string | null>>({});
  const [unitSearch, setUnitSearch] = useState<Record<string, string>>({});
  const [allocationDateOpen, setAllocationDateOpen] = useState<Record<string, boolean>>({});
  
  const noteRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});
  const selectedItemRef = useRef<any>(null);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRealtimeToastRef = useRef<{ key: string; at: number } | null>(null);

  // 1. DATA INBOX
  const { data: inbox = [], isLoading: loading, error: inboxError, refetch: refetchInbox, isFetching } = useQuery({
    queryKey: ['surat-inbox'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Unauthorized");
      return await suratService.getMyInbox(user.id);
    },
    staleTime: 30000,
  });

  const { data: kpiDetails = [], isLoading: kpiLoading } = useQuery({
    queryKey: ['surat-inbox-kpi'],
    queryFn: async () => {
      try {
        return await departmentKpiService.getDetails({ status: 'pending' });
      } catch (error) {
        console.error("Gagal memuat SLA inbox", error);
        return [];
      }
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

  const isVerificationTask = (item: any) => item?.task_type === "verification";

  const isWaitingVerification = (item: any) =>
    item?.verification_required === true && item?.verification_status !== "verified";

  const isPreparedByVerifier = (item: any) =>
    item?.verification_required === true && item?.verification_status === "verified";

  const shouldSignerInputStageData = (item: any) =>
    !item?.verification_required || isVerificationTask(item);

  const getTaskAction = (item: any) => {
    if (isVerificationTask(item)) return "verification";
    if (item.requires_unit_allocation) return "unit";
    if ((item.attachment_requirements_snapshot || []).length > 0) return "attachment";
    return "approval";
  };

  const kpiBySignature = useMemo(() => new Map(
    (kpiDetails as DepartmentKpiDetail[]).map((detail) => [detail.signature_id, detail])
  ), [kpiDetails]);

  const filteredInbox = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return [...inbox]
      .filter((item: any) => {
        const surat = item.surat_registrasi || {};
        const requester = surat.requester_snapshot || surat.data_snapshot?.requester || {};
        const category = String(surat.form_input_data?.request_category || surat.data_snapshot?.request_category || "").toLowerCase();
        const kpi = kpiBySignature.get(item.id);
        const action = getTaskAction(item);
        const matchesSearch = !search || [
          surat.judul_surat,
          surat.no_surat,
          requester.full_name,
          surat.location_snapshot?.department?.name,
        ].some((value) => String(value || "").toLowerCase().includes(search));
        const matchesCategory = categoryFilter === "all" || category === categoryFilter;
        const matchesKpi = kpiFilter === "all" ||
          (kpiFilter === "late" && kpi?.is_late) ||
          (kpiFilter === "due" && kpi && !kpi.is_late && kpi.sla_minutes - kpi.elapsed_minutes <= 30) ||
          (kpiFilter === "on_time" && (!kpi || (!kpi.is_late && kpi.sla_minutes - kpi.elapsed_minutes > 30)));
        return matchesSearch && matchesCategory && matchesKpi && (actionFilter === "all" || action === actionFilter);
      })
      .sort((left: any, right: any) => {
        const leftStarted = new Date(left.available_at || left.surat_registrasi?.created_at || 0).getTime();
        const rightStarted = new Date(right.available_at || right.surat_registrasi?.created_at || 0).getTime();
        return leftStarted - rightStarted;
      });
  }, [inbox, searchTerm, categoryFilter, kpiFilter, actionFilter, kpiBySignature]);

  const requestedTaskId = searchParams.get("task");
  const selectedItem = filteredInbox.find((item: any) => item.id === requestedTaskId) || filteredInbox[0] || null;

  useEffect(() => {
    selectedItemRef.current = selectedItem;
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedItem) {
      if (requestedTaskId) setSearchParams({}, { replace: true });
      return;
    }
    if (requestedTaskId !== selectedItem.id) {
      setSearchParams({ task: selectedItem.id }, { replace: true });
    }
  }, [selectedItem?.id, requestedTaskId, setSearchParams]);

  useEffect(() => {
    if (!currentUser?.id) return;

    const scheduleInboxRefresh = () => {
      if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
      realtimeRefreshTimerRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["surat-inbox"] });
        queryClient.invalidateQueries({ queryKey: ["surat-inbox-kpi"] });
      }, 700);
    };

    const showRealtimeToast = (key: string, title: string, description?: string) => {
      const now = Date.now();
      if (lastRealtimeToastRef.current?.key === key && now - lastRealtimeToastRef.current.at < 2500) return;
      lastRealtimeToastRef.current = { key, at: now };
      toast(title, { description });
    };

    const isActiveSurat = (suratId?: string | null) =>
      !!suratId && selectedItemRef.current?.surat_id === suratId;

    const isActiveSignature = (signatureId?: string | null) =>
      !!signatureId && selectedItemRef.current?.id === signatureId;

    const channel = supabase
      .channel(`inbox-live:${currentUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_signatures" }, (payload: any) => {
        const next = payload.new || {};
        const previous = payload.old || {};
        const related = isActiveSignature(next.id || previous.id) || isActiveSurat(next.surat_id || previous.surat_id);
        if (related) {
          if (next.verification_status === "verified" && previous.verification_status !== "verified") {
            showRealtimeToast("verification-done", "Verifikasi selesai", "Data dari tim pengecek sudah masuk. Tombol tindakan akan diperbarui.");
          } else if (next.verification_status === "revision_requested" && previous.verification_status !== "revision_requested") {
            showRealtimeToast("verification-revision", "Dikembalikan ke tim pengecek", "Tim pengecek perlu memperbarui data sebelum proses dilanjutkan.");
          } else if (next.is_signed !== previous.is_signed || next.status !== previous.status) {
            showRealtimeToast("approval-progress", "Progress persetujuan diperbarui");
          } else if (next.verification_note !== previous.verification_note) {
            showRealtimeToast("verification-note", "Catatan verifikasi diperbarui");
          }
        }
        scheduleInboxRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_attachments" }, (payload: any) => {
        const row = payload.new || payload.old || {};
        if (isActiveSurat(row.surat_id)) {
          showRealtimeToast("attachments-updated", "Lampiran diperbarui", "Lampiran dari tim pengecek sudah disinkronkan.");
        }
        scheduleInboxRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_registrasi" }, (payload: any) => {
        const row = payload.new || payload.old || {};
        if (isActiveSurat(row.id)) {
          showRealtimeToast("surat-updated", "Data pengajuan diperbarui", "Perubahan terbaru sedang dimuat.");
        }
        scheduleInboxRefresh();
      })
      .subscribe();

    return () => {
      if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, queryClient]);

  const isUnitAllocationRequired = (item: any) =>
    item.requires_unit_allocation === true && item.surat_registrasi?.form_input_data?.request_mode === "unit";

  const getRequestedUnitCount = (item: any) =>
    Number(item.surat_registrasi?.form_input_data?.requested_unit_count || 0);

  const getAllocationProject = (item: any) =>
    item.surat_registrasi?.form_input_data?.requested_project ||
    allocationProjectSelected[item.id] ||
    item.surat_registrasi?.form_input_data?.allocated_project;

  const getSelectedAllocationUnits = (item: any) => {
    if (allocationSelected[item.id]) return allocationSelected[item.id];
    if (isVerificationTask(item) && Array.isArray(item.surat_registrasi?.form_input_data?.allocated_units)) {
      return item.surat_registrasi.form_input_data.allocated_units;
    }
    return [];
  };

  const getAllocationDetailMap = (item: any) => {
    if (allocationDetails[item.id]) return allocationDetails[item.id];
    return Object.fromEntries(getSelectedAllocationUnits(item).map((unit: any) => [
      unit.value || unit.label,
      unit.allocation_detail || {},
    ]));
  };

  const getApprovalAttachmentRequirements = (item: any) =>
    Array.isArray(item.attachment_requirements_snapshot)
      ? item.attachment_requirements_snapshot
      : [];

  const getSelectedApprovalFiles = (item: any) =>
    getApprovalAttachmentRequirements(item).flatMap((requirement: any) =>
      (approvalFiles[item.id]?.[requirement.requirement_key] || []).map(file => ({
        key: requirement.requirement_key,
        label: requirement.label || requirement.requirement_key,
        file,
      }))
    );

  const getExistingApprovalAttachments = (item: any, requirementKey: string) =>
    (Array.isArray(item.surat_registrasi?.surat_attachments) ? item.surat_registrasi.surat_attachments : [])
      .filter((attachment: any) =>
        attachment.signature_id === item.id &&
        attachment.stage === "approval" &&
        attachment.requirement_key === requirementKey
      );

  const getMissingApprovalAttachmentLabels = (item: any) => {
    const filesByKey = approvalFiles[item.id] || {};
    return getApprovalAttachmentRequirements(item)
      .filter((requirement: any) => {
        const minimum = requirement.is_required
          ? Math.max(1, Number(requirement.min_files || 1))
          : Number(requirement.min_files || 0);
        const newFileCount = filesByKey[requirement.requirement_key]?.length || 0;
        const existingCount = getExistingApprovalAttachments(item, requirement.requirement_key).length;
        return Math.max(newFileCount, existingCount) < minimum;
      })
      .map((requirement: any) => requirement.label || requirement.requirement_key);
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
    [selectedItem].filter(Boolean).filter(isUnitAllocationRequired).forEach((item: any) => {
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
  }, [selectedItem, allocationProjectSelected]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
  };

// FUNGSI APPROVE
const handleApprove = async (item: any) => {
  if (!currentUser?.full_name) {
    toast.error("Profil tidak lengkap.");
    return;
  }

  try {
    const note = notes[item.id] || "";
    const selectedUnits = getSelectedAllocationUnits(item);
    const selectedProject = getAllocationProject(item);
    const stageDataPreparedByVerifier = isPreparedByVerifier(item);
    if (!stageDataPreparedByVerifier && isUnitAllocationRequired(item) && !selectedProject?.code) {
      throw new Error("Project unit wajib dipilih.");
    }
    if (!stageDataPreparedByVerifier && isUnitAllocationRequired(item) && selectedUnits.length < 1) {
      throw new Error("Pilih minimal 1 unit.");
    }
    if (!stageDataPreparedByVerifier && isUnitAllocationRequired(item)) {
      const details = getAllocationDetailMap(item);
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
    const selectedApprovalFiles = stageDataPreparedByVerifier ? [] : getSelectedApprovalFiles(item);
    const missingApprovalAttachments = stageDataPreparedByVerifier ? [] : getMissingApprovalAttachmentLabels(item);
    if (!stageDataPreparedByVerifier && missingApprovalAttachments.length > 0) {
      throw new Error(`Lampiran approval belum lengkap: ${missingApprovalAttachments.join(", ")}.`);
    }

    if (!stageDataPreparedByVerifier && isUnitAllocationRequired(item) && selectedUnits.length < getRequestedUnitCount(item)) {
      const proceedLess = await appDialog.confirm({
        title: "Unit terpilih kurang dari permintaan",
        description: `Permohonan meminta ${getRequestedUnitCount(item)} unit, tetapi yang dipilih ${selectedUnits.length} unit. Lanjutkan persetujuan dengan jumlah tersebut?`,
        confirmText: "Lanjutkan",
        cancelText: "Periksa lagi",
      });
      if (!proceedLess) return;
    }

    const confirmed = await appDialog.confirm({
      title: "Setujui pengajuan ini?",
      description: (
        <div className="space-y-2 text-left">
          <p className="font-semibold text-foreground">{item.surat_registrasi.judul_surat}</p>
          <p>Persetujuan akan direkam atas nama {currentUser.full_name} dan diteruskan ke tahap berikutnya.</p>
        </div>
      ),
      confirmText: "Ya, setujui",
      cancelText: "Periksa lagi",
    });
    if (!confirmed) return;

    setProcessingId(item.id);

    await suratService.approveSurat(
      item.id, 
      item.surat_id, 
      item.surat_registrasi.current_step, 
      currentUser.full_name,
      note,
      {
        approvalAttachments: selectedApprovalFiles,
        ...(!stageDataPreparedByVerifier && isUnitAllocationRequired(item) ? { unitAllocation: {
          project: selectedProject,
          units: selectedUnits.map((unit: any) => ({
            ...unit,
            allocation_detail: getAllocationDetailMap(item)?.[unit.value] || {},
          })),
        }} : {}),
      }
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
    setApprovalFiles(prev => {
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

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['surat-inbox'] }),
      queryClient.invalidateQueries({ queryKey: ['surat-inbox-kpi'] }),
    ]);
  } catch (error: any) {
    console.error("Approve Error:", error);
    toast.error(error.message || "Gagal menyetujui dokumen.");
  } finally {
    setProcessingId(null);
  }
};

  // FUNGSI REJECT
  const handleReject = async (item: any) => {
    const note = await appDialog.prompt({
      title: "Tolak pengajuan ini?",
      description: `Jelaskan alasan penolakan untuk "${item.surat_registrasi.judul_surat}". Alasan akan terlihat oleh pengaju.`,
      label: "Alasan penolakan",
      placeholder: "Tuliskan alasan yang jelas, minimal 5 karakter...",
      defaultValue: notes[item.id] || "",
      confirmText: "Tolak pengajuan",
      cancelText: "Batal",
      multiline: true,
      required: true,
    });
    if (note === null) return;

    if (note.trim().length < 5) {
      toast.error("Catatan Wajib Diisi", {
        description: "Harap masukkan alasan penolakan minimal 5 karakter pada kolom catatan."
      });
      return;
    }

    setProcessingId(item.id);
    try {
      await suratService.rejectSurat(item.id, item.surat_id, note);
      toast.error("Dokumen Ditolak", {
        description: "Alur dokumen telah dihentikan secara permanen.",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['surat-inbox'] }),
        queryClient.invalidateQueries({ queryKey: ['surat-inbox-kpi'] }),
      ]);
    } catch (error: any) {
      console.error("Reject Error:", error);
      toast.error(error.message || "Gagal menolak dokumen.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleVerify = async (item: any) => {
    try {
      const selectedUnits = getSelectedAllocationUnits(item);
      const selectedProject = getAllocationProject(item);
      if (isUnitAllocationRequired(item) && !selectedProject?.code) {
        throw new Error("Project unit wajib dipilih.");
      }
      if (isUnitAllocationRequired(item) && selectedUnits.length < 1) {
        throw new Error("Pilih minimal 1 unit.");
      }
      if (isUnitAllocationRequired(item)) {
        const incompleteUnit = getIncompleteAllocationUnits(item)[0];
        if (incompleteUnit) {
          throw new Error(`Kode produksi untuk ${incompleteUnit.label || incompleteUnit.value} belum lengkap.`);
        }
      }
      const missingApprovalAttachments = getMissingApprovalAttachmentLabels(item);
      if (missingApprovalAttachments.length > 0) {
        throw new Error(`Lampiran approval belum lengkap: ${missingApprovalAttachments.join(", ")}.`);
      }

      if (isUnitAllocationRequired(item) && selectedUnits.length < getRequestedUnitCount(item)) {
        const proceedLess = await appDialog.confirm({
          title: "Unit terpilih kurang dari permintaan",
          description: `Permohonan meminta ${getRequestedUnitCount(item)} unit, tetapi tim pengecek memilih ${selectedUnits.length} unit. Lanjutkan verifikasi dengan jumlah tersebut?`,
          confirmText: "Lanjutkan verifikasi",
          cancelText: "Periksa lagi",
        });
        if (!proceedLess) return;
      }
    } catch (error: any) {
      toast.error(error.message || "Data verifikasi belum lengkap.");
      return;
    }

    const confirmed = await appDialog.confirm({
      title: "Verifikasi data pengajuan?",
      description: (
        <div className="space-y-2 text-left">
          <p className="font-semibold text-foreground">{item.surat_registrasi.judul_surat}</p>
          <p>Setelah diverifikasi, penanda tangan tahap ini dapat menyetujui atau menolak pengajuan.</p>
        </div>
      ),
      confirmText: "Verifikasi data",
      cancelText: "Periksa lagi",
    });
    if (!confirmed) return;

    setProcessingId(item.id);
    try {
      await suratService.verifySignature(item.id, notes[item.id] || "", {
        suratId: item.surat_id,
        approvalAttachments: getSelectedApprovalFiles(item),
        ...(isUnitAllocationRequired(item) ? {
          unitAllocation: {
            project: getAllocationProject(item),
          units: getSelectedAllocationUnits(item).map((unit: any) => ({
              ...unit,
              allocation_detail: getAllocationDetailMap(item)?.[unit.value] || {},
            })),
          },
        } : {}),
      });
      toast.success("Data berhasil diverifikasi", {
        description: "Pengajuan sudah dapat diproses oleh penanda tangan.",
      });
      setNotes(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
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
      setApprovalFiles(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['surat-inbox'] }),
        queryClient.invalidateQueries({ queryKey: ['surat-inbox-kpi'] }),
      ]);
    } catch (error: any) {
      toast.error(error.message || "Gagal memverifikasi data.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleRequestVerificationRevision = async (item: any) => {
    const note = await appDialog.prompt({
      title: "Kembalikan ke tim pengecek?",
      description: `Tuliskan data yang perlu diperbaiki untuk "${item.surat_registrasi.judul_surat}".`,
      label: "Catatan revisi",
      placeholder: "Contoh: Mohon ganti unit B14 dan lengkapi lampiran siteplan.",
      defaultValue: notes[item.id] || "",
      confirmText: "Kembalikan",
      cancelText: "Batal",
      multiline: true,
      required: true,
    });
    if (note === null) return;
    if (note.trim().length < 5) {
      toast.error("Catatan revisi minimal 5 karakter.");
      return;
    }

    setProcessingId(item.id);
    try {
      await suratService.requestVerificationRevision(item.id, note);
      toast.success("Dikembalikan ke tim pengecek", {
        description: "Signer belum dapat memproses sampai data diverifikasi ulang.",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['surat-inbox'] }),
        queryClient.invalidateQueries({ queryKey: ['surat-inbox-kpi'] }),
      ]);
    } catch (error: any) {
      toast.error(error.message || "Gagal mengembalikan ke tim pengecek.");
    } finally {
      setProcessingId(null);
    }
  };

  const openPreview = async (suratId: string, fallbackUrl: string) => {
    // Ambil file terbaru agar preview tidak menampilkan versi tanda tangan lama.
    if (!fallbackUrl) return toast.error("File dokumen belum tersedia.");
    setPreviewingId(suratId);
    
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

  const updateAllocationDetail = (signatureId: string, unitValue: string, key: string, value: string) => {
    setAllocationDetails((previous) => ({
      ...previous,
      [signatureId]: {
        ...(previous[signatureId] || {}),
        [unitValue]: {
          ...((previous[signatureId] || {})[unitValue] || {}),
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
    return year + "-" + month + "-" + day;
  };

  const formatRequestCategory = (value: unknown) => {
    const category = String(value || "").toLowerCase();
    if (category === "asset") return "Aset";
    if (category === "unit") return "Unit";
    if (category === "non_unit") return "Non Unit";
    return String(value || "-");
  };

  const formatSummaryValue = (value: unknown): string => {
    if (value == null || value === "") return "-";
    if (typeof value === "boolean") return value ? "Ya" : "Tidak";
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (Array.isArray(value)) {
      return value.map((entry: any) => typeof entry === "object" ? entry?.label || entry?.name || entry?.code || entry?.value : entry).filter(Boolean).join(", ");
    }
    if (typeof value === "object") {
      const entry = value as Record<string, unknown>;
      return String(entry.label || entry.name || entry.code || entry.value || "-");
    }
    return String(value);
  };

  const humanizeInputKey = (key: string) => {
    const labels: Record<string, string> = {
      catatan: "Catatan",
      nama_barang: "Nama Barang",
      sat: "Satuan",
      jumlah: "Jumlah",
      status: "Status",
      keterangan: "Keterangan",
      kode: "Kode",
      requested_unit_count: "Jumlah Unit Diajukan",
    };
    return labels[key] || key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  };

  const renderRequestSummary = (item: any) => {
    const surat = item.surat_registrasi || {};
    const requester = surat.requester_snapshot || surat.data_snapshot?.requester || {};
    const location = surat.location_snapshot || surat.data_snapshot?.location || {};
    const input = surat.form_input_data && typeof surat.form_input_data === "object" ? surat.form_input_data : {};
    const dataSnapshot = surat.data_snapshot || {};
    const items = Array.isArray(input.items) ? input.items : Array.isArray(dataSnapshot.detail_barang) ? dataSnapshot.detail_barang : [];
    const requestedProject = input.requested_project || dataSnapshot.requested_project || {};
    const category = input.request_category || dataSnapshot.request_category;
    const requestDate = surat.request_date
      ? new Date(surat.request_date).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })
      : "-";
    const cards = [
      { icon: UserRound, label: "Pengaju", value: requester.full_name || "-", detail: requester.job_title || "-" },
      { icon: BriefcaseBusiness, label: "Departemen", value: location.department?.name || "-", detail: location.form?.nama_form || dataSnapshot.form?.nama_form || "-" },
      { icon: MapPin, label: "Lokasi", value: location.office?.name || "-", detail: requestedProject.name || requestedProject.label || location.project?.name || "Tanpa proyek" },
      { icon: ClipboardList, label: "Permohonan", value: formatRequestCategory(category), detail: [surat.request_place, requestDate].filter((value) => value && value !== "-").join(", ") || "-" },
    ];
    const columns = [
      ["kode", "Kode"], ["nama_barang", "Nama Barang"], ["sat", "Satuan"],
      ["jumlah", "Jumlah"], ["status", "Status"], ["keterangan", "Keterangan"],
    ].filter(([key]) => items.some((row: any) => row?.[key] != null && String(row[key]).trim()));
    const hiddenKeys = new Set([
      "items", "request_mode", "request_category", "unit_config_snapshot", "requested_project",
      "requested_unit_count", "unit_request_sentence", "allocated_at", "allocated_project",
      "allocated_units", "allocated_unit_count", "allocated_by_signature_id", "signers", "catatan",
    ]);
    const extraFields = Object.entries(input).filter(([key, value]) =>
      !hiddenKeys.has(key) && value != null && value !== "" && formatSummaryValue(value) !== "-"
    );

    return (
      <section className="sigap-panel">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <PackageOpen className="h-5 w-5 text-primary" />
            <p className="text-sm font-semibold text-foreground">Ringkasan pengajuan</p>
          </div>
          <Badge variant="outline">{formatRequestCategory(category)}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {cards.map(({ icon: Icon, label, value, detail }) => (
            <div key={label} className="min-w-0 rounded-lg border border-border bg-muted/10 p-3">
              <div className="mb-2 flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4" /><p className="text-xs font-semibold">{label}</p></div>
              <p className="truncate text-sm font-semibold text-foreground" title={String(value)}>{value}</p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={String(detail)}>{detail}</p>
            </div>
          ))}
        </div>
        {category === "unit" && (
          <div className="mt-4 grid gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:grid-cols-2">
            <div><p className="text-xs font-medium text-muted-foreground">Proyek yang diajukan</p><p className="mt-1 text-sm font-semibold">{requestedProject.name || requestedProject.label || "-"}</p></div>
            <div><p className="text-xs font-medium text-muted-foreground">Jumlah unit</p><p className="mt-1 text-sm font-semibold">{input.requested_unit_count || dataSnapshot.requested_unit_count || 0} Unit</p></div>
          </div>
        )}
        {items.length > 0 && columns.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-md border border-border">
            <div className="border-b border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground">Daftar barang / jasa</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-muted/20 text-muted-foreground"><tr><th className="px-3 py-2 text-center">No.</th>{columns.map(([, label]) => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead>
                <tbody>{items.map((row: any, index: number) => <tr key={index} className="border-t border-border"><td className="px-3 py-2 text-center">{index + 1}</td>{columns.map(([key]) => <td key={key} className="whitespace-pre-wrap px-3 py-2">{formatSummaryValue(row?.[key])}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
        {(extraFields.length > 0 || input.catatan) && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {extraFields.map(([key, value]) => <div key={key} className="rounded-lg border border-border bg-muted/10 p-3"><p className="text-xs font-medium text-muted-foreground">{humanizeInputKey(key)}</p><p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{formatSummaryValue(value)}</p></div>)}
            {input.catatan && <div className="rounded-lg border border-border bg-muted/10 p-3 sm:col-span-2"><p className="text-xs font-medium text-muted-foreground">Catatan pemohon</p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{formatSummaryValue(input.catatan)}</p></div>}
          </div>
        )}
      </section>
    );
  };

  const getIncompleteAllocationUnits = (item: any) => {
    const details = getAllocationDetailMap(item);
    return getSelectedAllocationUnits(item).filter((unit: any) => {
      const detail = details[unit.value] || {};
      return !String(detail.production_serial || "").trim() ||
        !String(detail.production_block || "").trim() ||
        !String(detail.production_date || "").trim();
    });
  };

  const renderUnitAllocationPanel = (item: any) => {
    if (!isUnitAllocationRequired(item)) return null;
    if (!shouldSignerInputStageData(item)) {
      const input = item.surat_registrasi?.form_input_data || {};
      const project = input.allocated_project || {};
      const units = Array.isArray(input.allocated_units) ? input.allocated_units : [];
      return (
        <section className="sigap-panel border-emerald-500/30">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold">Alokasi unit dari tim pengecek</p>
                <p className="text-xs text-muted-foreground">{units.length} dari {getRequestedUnitCount(item)} unit permintaan dipilih</p>
              </div>
            </div>
            <Badge className="bg-emerald-600">Terverifikasi</Badge>
          </div>
          <div className="rounded-lg border border-border bg-muted/10 p-3">
            <p className="text-xs font-medium text-muted-foreground">Proyek</p>
            <p className="mt-1 text-sm font-semibold">{project.name || project.label || project.code || "-"}</p>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-muted/30 text-muted-foreground"><tr><th className="px-3 py-2">No.</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Struktur Atas</th><th className="px-3 py-2">Struktur Bawah</th><th className="px-3 py-2">Kode Produksi</th></tr></thead>
              <tbody>{units.map((unit: any, index: number) => {
                const detail = unit.allocation_detail || {};
                const productionCode = [detail.production_serial, "UAI", "PRC", detail.production_block, detail.production_date ? formatDatePickerDisplay(detail.production_date) : null].filter(Boolean).join("/");
                return <tr key={unit.value || unit.label || index} className="border-t border-border"><td className="px-3 py-2">{index + 1}</td><td className="px-3 py-2 font-semibold">{unit.label || unit.value}</td><td className="px-3 py-2">{detail.struktur_atas || "-"}</td><td className="px-3 py-2">{detail.struktur_bawah || "-"}</td><td className="px-3 py-2 font-mono">{productionCode || "-"}</td></tr>;
              })}</tbody>
            </table>
            {units.length === 0 && <p className="p-4 text-sm text-muted-foreground">Belum ada unit yang disimpan.</p>}
          </div>
        </section>
      );
    }
    const requestedCount = getRequestedUnitCount(item);
    const selectedProject = getAllocationProject(item);
    const selected = getSelectedAllocationUnits(item);
    const details = getAllocationDetailMap(item);
    const selectedValues = new Set(selected.map((unit: any) => unit.value));
    const search = (unitSearch[item.id] || "").toLowerCase().trim();
    const units = (allocationUnits[item.id] || []).filter((unit) =>
      !search || unit.label.toLowerCase().includes(search) || String(unit.value).toLowerCase().includes(search)
    );
    const incompleteUnits = getIncompleteAllocationUnits(item);
    const complete = Boolean(selectedProject?.code) && selected.length >= 1 && incompleteUnits.length === 0;
    const progress = requestedCount > 0 ? Math.min(100, Math.round((selected.length / requestedCount) * 100)) : 0;

    return (
      <section className="overflow-hidden rounded-xl border border-primary/20 bg-background">
        <div className="border-b border-border bg-muted/20 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3"><Building2 className="h-5 w-5 text-primary" /><div><p className="text-sm font-semibold">Alokasi unit perencanaan</p><p className="text-xs text-muted-foreground">{selected.length} dari {requestedCount} unit permintaan dipilih</p></div></div>
            <Badge className={cn(complete ? "bg-emerald-600" : "bg-primary")}>{complete ? "Lengkap" : "Perlu dilengkapi"}</Badge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full transition-all", selected.length >= requestedCount ? "bg-emerald-500" : "bg-primary")} style={{ width: Math.max(progress, selected.length ? 10 : 0) + "%" }} /></div>
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-sm font-semibold">Proyek unit</p>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-3">
              <p className="text-sm font-semibold">{selectedProject?.name || selectedProject?.label || selectedProject?.code || "Proyek belum tersedia"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{selectedProject?.branch?.name || selectedProject?.branch || "Mengikuti pilihan pemohon"}</p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Proyek dikunci dari pengajuan pemohon. Jika proyek salah, buat pengajuan baru.</p>
          </div>

          <div className="rounded-md border border-border p-3">
            <div className="mb-3"><p className="text-sm font-semibold">Pilih kavling</p><p className="text-xs text-muted-foreground">Boleh memilih kurang, sama, atau lebih dari jumlah yang diajukan. Jika kurang, sistem akan meminta konfirmasi.</p></div>
            <div className="relative mb-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={unitSearch[item.id] || ""} onChange={(event) => setUnitSearch((previous) => ({ ...previous, [item.id]: event.target.value }))} placeholder="Cari kode unit" className="h-10 pl-9 text-sm" /></div>
            {allocationLoading[item.id] ? (
              <div className="flex h-28 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat unit</div>
            ) : allocationErrors[item.id] ? (
              <p className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{allocationErrors[item.id]}</p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border p-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  {units.map((unit) => {
                    const checked = selectedValues.has(unit.value);
                    return <button type="button" key={unit.value} onClick={() => toggleAllocatedUnit(item.id, unit)} className={cn("flex min-h-12 items-center gap-3 rounded-md border px-3 py-2 text-left", checked ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40")}><span className={cn("flex h-5 w-5 items-center justify-center rounded border", checked && "border-primary bg-primary text-primary-foreground")}>{checked && <CheckCircle2 className="h-3.5 w-3.5" />}</span><span className="truncate text-sm font-semibold">{unit.label}</span></button>;
                  })}
                </div>
                {units.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Unit tidak ditemukan.</p>}
              </div>
            )}
          </div>

          <div className="rounded-md border border-border p-3">
            <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-semibold">Detail kavling dan kode produksi</p><p className="text-xs text-muted-foreground">Geser untuk mengisi setiap unit.</p></div><Badge variant="outline">{selected.length} unit</Badge></div>
            {selected.length === 0 ? (
              <div className="flex h-28 flex-col items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"><Home className="mb-2 h-5 w-5" />Pilih kavling terlebih dahulu.</div>
            ) : (
              <Carousel opts={{ align: "start", containScroll: "trimSnaps" }} className="w-full">
                <div className="mb-3 flex justify-end gap-2"><CarouselPrevious className="static h-8 w-8 translate-y-0" /><CarouselNext className="static h-8 w-8 translate-y-0" /></div>
                <CarouselContent className="-ml-0">
                  {selected.map((unit: any, index: number) => {
                    const detail = details[unit.value] || {};
                    const dateKey = item.id + ":" + unit.value;
                    const ready = !getIncompleteAllocationUnits({ ...item, id: item.id }).some((entry: any) => entry.value === unit.value);
                    return (
                      <CarouselItem key={unit.value} className="basis-full pl-0">
                        <div className="rounded-lg border border-border bg-muted/10 p-4">
                          <div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-semibold">{index + 1}. {unit.label}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{detail.production_serial || "[001]"}/UAI/PRC/{detail.production_block || "[4.1]"}/{detail.production_date ? formatDatePickerDisplay(detail.production_date) : "[14/01/2026]"}</p></div><Badge variant={ready ? "default" : "outline"} className={cn(ready && "bg-emerald-600")}>{ready ? "Lengkap" : "Belum lengkap"}</Badge></div>
                          <div className="space-y-4">
                            <div><p className="mb-2 text-xs font-semibold text-muted-foreground">Rekap adendum (opsional)</p><div className="grid gap-3 sm:grid-cols-2"><Input type="number" value={detail.struktur_atas || ""} onChange={(event) => updateAllocationDetail(item.id, unit.value, "struktur_atas", event.target.value)} placeholder="Struktur atas" className="h-11 text-sm" /><Input type="number" value={detail.struktur_bawah || ""} onChange={(event) => updateAllocationDetail(item.id, unit.value, "struktur_bawah", event.target.value)} placeholder="Struktur bawah" className="h-11 text-sm" /></div></div>
                            <div><p className="mb-2 text-xs font-semibold text-muted-foreground">Kode produksi</p><div className="grid gap-3 sm:grid-cols-3"><Input value={detail.production_serial || ""} onChange={(event) => updateAllocationDetail(item.id, unit.value, "production_serial", event.target.value)} placeholder="Nomor: 001" className="h-11 font-mono text-sm" /><Input value={detail.production_block || ""} onChange={(event) => updateAllocationDetail(item.id, unit.value, "production_block", event.target.value)} placeholder="Blok: 4.1" className="h-11 font-mono text-sm" /><Popover open={Boolean(allocationDateOpen[dateKey])} onOpenChange={(open) => setAllocationDateOpen((previous) => ({ ...previous, [dateKey]: open }))}><PopoverTrigger asChild><Button type="button" variant="outline" className="h-11 justify-start font-mono text-sm"><CalendarIcon className="mr-2 h-4 w-4" />{formatDatePickerDisplay(detail.production_date || "") || "dd/mm/yyyy"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={detail.production_date ? new Date(detail.production_date) : undefined} onSelect={(date) => { if (!date) return; updateAllocationDetail(item.id, unit.value, "production_date", toDateInputValue(date)); setAllocationDateOpen((previous) => ({ ...previous, [dateKey]: false })); }} initialFocus /></PopoverContent></Popover></div></div>
                          </div>
                        </div>
                      </CarouselItem>
                    );
                  })}
                </CarouselContent>
              </Carousel>
            )}
          </div>
        </div>
      </section>
    );
  };

  const renderApprovalAttachmentPanel = (item: any) => {
    const requirements = getApprovalAttachmentRequirements(item);
    if (requirements.length === 0) return null;
    if (!shouldSignerInputStageData(item)) {
      return (
        <section className="sigap-panel border-emerald-500/30">
          <div className="flex items-center gap-3">
            <FileUp className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold">Lampiran tahap sudah disiapkan</p>
              <p className="text-xs text-muted-foreground">File dari tim pengecek dapat dibuka pada panel Dokumen dan lampiran.</p>
            </div>
          </div>
        </section>
      );
    }
    const missing = getMissingApprovalAttachmentLabels(item);
    const isUploading = processingId === item.id;
    return (
      <section className={cn("sigap-panel", missing.length ? "border-amber-500/30" : "border-emerald-500/30")}>
        <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><FileUp className="h-5 w-5 text-primary" /><div><p className="text-sm font-semibold">Lampiran approval</p><p className="text-xs text-muted-foreground">Persyaratan khusus tahap tanda tangan ini.</p></div></div>{isUploading && <Badge><Loader2 className="mr-1 h-3 w-3 animate-spin" />Mengunggah</Badge>}</div>
        <div className="space-y-2">
          {requirements.map((requirement: any) => {
            const key = requirement.requirement_key;
            const files = approvalFiles[item.id]?.[key] || [];
            const existingFiles = getExistingApprovalAttachments(item, key);
            const multiple = requirement.allow_multiple || Number(requirement.max_files || 1) > 1;
            const satisfied = files.length > 0 || existingFiles.length > 0;
            return (
              <label key={key} className={cn("block rounded-lg border p-3", satisfied ? "border-emerald-500/30 bg-emerald-500/5" : "border-border")}>
                <div className="mb-2 flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{requirement.label || key}{requirement.is_required && <span className="ml-1 text-destructive">*</span>}</p><p className="text-xs text-muted-foreground">{files.length ? files.length + " file baru akan mengganti lampiran lama" : existingFiles.length ? existingFiles.length + " file sudah tersedia" : "Belum ada file"}</p></div>{satisfied && <CircleCheck className="h-5 w-5 text-emerald-600" />}</div>
                {existingFiles.length > 0 && files.length === 0 && existingFiles.map((file: any) => <div key={file.id || file.file_url} className="mb-2 flex justify-between gap-2 rounded bg-background px-2 py-1 text-xs"><span className="truncate">{file.file_name || "Lampiran tersimpan"}</span><span className="shrink-0 text-muted-foreground">Sudah ada</span></div>)}
                {files.map((file) => <div key={file.name + file.lastModified} className="mb-2 flex justify-between gap-2 rounded bg-background px-2 py-1 text-xs"><span className="truncate">{file.name}</span><span className="shrink-0 text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</span></div>)}
                <Input type="file" multiple={multiple} accept={Array.isArray(requirement.allowed_types) ? requirement.allowed_types.join(",") : undefined} disabled={isUploading} className="h-10 text-xs" onChange={(event) => { const selected = Array.from(event.target.files || []).slice(0, Number(requirement.max_files || 1)); setApprovalFiles((previous) => ({ ...previous, [item.id]: { ...(previous[item.id] || {}), [key]: selected } })); }} />
              </label>
            );
          })}
        </div>
        {missing.length > 0 && <p className="mt-3 rounded-lg bg-amber-500/10 p-2 text-xs font-medium text-amber-700 dark:text-amber-400">Wajib dilengkapi: {missing.join(", ")}</p>}
      </section>
    );
  };

  const formatMinutes = (minutes?: number | null) => {
    const safe = Math.max(0, Math.round(minutes || 0));
    const hours = Math.floor(safe / 60);
    const rest = safe % 60;
    if (hours === 0) return rest + " menit";
    if (rest === 0) return hours + " jam";
    return hours + " jam " + rest + " menit";
  };

  const getKpiPresentation = (item: any) => {
    const detail = kpiBySignature.get(item.id);
    if (!detail) return { label: "KPI belum tersedia", tone: "muted", detail: "-" };
    const remaining = detail.sla_minutes - detail.elapsed_minutes;
    if (detail.is_late) return { label: "Terlambat", tone: "late", detail: formatMinutes(Math.abs(remaining)) + " melewati SLA" };
    if (remaining <= 30) return { label: "Mendekati SLA", tone: "due", detail: formatMinutes(remaining) + " tersisa" };
    return { label: "Dalam SLA", tone: "safe", detail: formatMinutes(remaining) + " tersisa" };
  };

  const getApprovalBlockers = (item: any) => {
    const blockers: string[] = [];
    if (!isVerificationTask(item) && isWaitingVerification(item)) {
      blockers.push("Menunggu verifikasi tim pengecek");
    }
    if (shouldSignerInputStageData(item) && isUnitAllocationRequired(item)) {
      const selected = getSelectedAllocationUnits(item);
      if (!getAllocationProject(item)?.code) blockers.push("Pilih proyek unit");
      if (selected.length < 1) blockers.push("Pilih minimal 1 unit");
      const incomplete = getIncompleteAllocationUnits(item);
      if (incomplete.length) blockers.push("Lengkapi kode produksi " + incomplete.length + " unit");
    }
    if (shouldSignerInputStageData(item)) {
      const missing = getMissingApprovalAttachmentLabels(item);
      if (missing.length) blockers.push("Unggah: " + missing.join(", "));
    }
    return blockers;
  };

  const renderVerificationNotePanel = (item: any) => {
    if (!item?.verification_required) return null;
    const signatures = item.surat_registrasi?.surat_signatures || [];
    const signature = signatures.find((entry: any) => entry.id === item.id) || item;
    const verifier = Array.isArray(signature.verifier_snapshot)
      ? signature.verifier_snapshot.find((entry: any) => entry.user_id === signature.verified_by)
      : null;
    const verified = signature.verification_status === "verified";
    const revisionRequested = signature.verification_status === "revision_requested";
    const note = String(signature.verification_note || "").trim();

    if (!note && !signature.verified_at && !revisionRequested) return null;

    return (
      <section className={cn(
        "sigap-panel",
        verified && "border-emerald-500/30",
        revisionRequested && "border-amber-500/30",
        !verified && !revisionRequested && "border-sky-500/30"
      )}>
        <div className="flex items-start gap-3">
          <ShieldCheck className={cn(
            "mt-0.5 h-5 w-5",
            verified && "text-emerald-600",
            revisionRequested && "text-amber-600",
            !verified && !revisionRequested && "text-sky-600"
          )} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Catatan tim pengecek</p>
              <Badge variant="outline" className={cn(
                verified && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                revisionRequested && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              )}>
                {verified ? "Sudah diverifikasi" : revisionRequested ? "Perlu revisi" : "Menunggu verifikasi"}
              </Badge>
            </div>
            {signature.verified_at && (
              <p className="mt-1 text-xs text-muted-foreground">
                Diverifikasi oleh {verifier?.full_name || "tim pengecek"} pada {new Date(signature.verified_at).toLocaleString("id-ID")}
              </p>
            )}
            {note && (
              <div className={cn(
                "mt-3 rounded-lg border p-3 text-sm leading-relaxed",
                verified && "border-emerald-500/20 bg-emerald-500/5",
                revisionRequested && "border-amber-500/20 bg-amber-500/5",
                !verified && !revisionRequested && "border-border bg-muted/20"
              )}>
                {note}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  };

  const renderApprovalHistory = (item: any) => {
    const signatures = item.surat_registrasi?.surat_signatures || [];
    return (
      <Accordion type="single" collapsible className="sigap-panel px-4 py-0">
        <AccordionItem value="history" className="border-0">
          <AccordionTrigger className="py-4 hover:no-underline"><div className="flex items-center gap-3 text-left"><FileCheck2 className="h-5 w-5 text-primary" /><div><p className="text-sm font-semibold">Progres persetujuan</p><p className="text-xs font-normal text-muted-foreground">Tahap {item.step_order} dari {signatures.length || item.step_order}</p></div></div></AccordionTrigger>
        <AccordionContent className="pb-4"><div data-testid="approval-history-scroll" className="max-h-[360px] space-y-2 overflow-y-auto overscroll-contain pr-2">{signatures.map((signature: any) => {
            const active = Number(signature.step_order) === Number(item.step_order);
            const signer = signature.signer_snapshot?.full_name || signature.profiles?.full_name || "Belum ditentukan";
            const label = signature.label_jabatan || signature.signer_snapshot?.job_title || signature.role_name;
            const needsVerification = signature.verification_required === true;
            const verified = signature.verification_status === "verified";
            const verifier = Array.isArray(signature.verifier_snapshot)
              ? signature.verifier_snapshot.find((item: any) => item.user_id === signature.verified_by)
              : null;
            return <div key={signature.id} className="flex gap-3"><div className="pt-3">{signature.is_signed ? <CircleCheck className="h-5 w-5 text-emerald-600" /> : active ? <Clock3 className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5 text-muted-foreground/50" />}</div><div className="min-w-0 flex-1 rounded-lg bg-muted/20 p-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold">{signature.step_order}. {label}</p><Badge variant={signature.is_signed ? "default" : "outline"} className={cn(signature.is_signed && "bg-emerald-600")}>{signature.is_signed ? "Selesai" : active ? "Tindakan Anda" : "Menunggu"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{signer}</p>{needsVerification && <div className={cn("mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium", verified ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300")}><ShieldCheck className="h-3.5 w-3.5" />{verified ? "Data sudah diverifikasi" : "Menunggu verifikasi data"}</div>}{signature.verified_at && <p className="mt-1 text-xs text-muted-foreground">Diverifikasi oleh {verifier?.full_name || "tim pengecek"} pada {new Date(signature.verified_at).toLocaleString("id-ID")}</p>}{needsVerification && !verified && signature.verification_note && <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">Catatan revisi: {signature.verification_note}</p>}{signature.signed_at && <p className="mt-1 text-xs text-muted-foreground">{new Date(signature.signed_at).toLocaleString("id-ID")}</p>}{signature.catatan && <p className="mt-2 rounded border border-border bg-background p-2 text-xs">{signature.catatan}</p>}</div></div>;
          })}</div></AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  };

  const renderDocumentsPanel = (item: any) => {
    const surat = item.surat_registrasi;
    const attachments = getAttachments(surat);
    return (
      <section className="sigap-panel">
        <div className="mb-3 flex items-center gap-3"><Paperclip className="h-5 w-5 text-primary" /><div><p className="text-sm font-semibold">Dokumen dan lampiran</p><p className="text-xs text-muted-foreground">PDF digunakan untuk verifikasi visual bila diperlukan.</p></div></div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">Dokumen utama</p><p className="text-xs text-muted-foreground">PDF pengajuan dan tanda tangan terakhir</p></div><Button variant="outline" size="sm" disabled={previewingId === surat.id} onClick={() => openPreview(surat.id, surat.file_path)}>{previewingId === surat.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}Buka</Button></div>
          {attachments.map((attachment: any, index: number) => <div key={attachment.id || attachment.file_url} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{attachment.file_name || "Lampiran " + (index + 1)}</p><p className="text-xs text-muted-foreground">{[attachment.requirement_label || attachment.stage || "Lampiran", attachment.file_size ? (attachment.file_size / 1024 / 1024).toFixed(2) + " MB" : null].filter(Boolean).join(" · ")}</p></div><Button variant="ghost" size="sm" onClick={() => openLampiran(surat.id, attachment.file_url)}><Eye className="mr-2 h-4 w-4" />Buka</Button></div>)}
        </div>
      </section>
    );
  };

  const selectTask = (id: string) => {
    setSearchParams({ task: id });
    setTaskSwitcherOpen(false);
  };

  const renderQueueItem = (item: any) => {
    const surat = item.surat_registrasi || {};
    const requester = surat.requester_snapshot || surat.data_snapshot?.requester || {};
    const department = surat.location_snapshot?.department?.name || surat.data_snapshot?.location?.department?.name || "Departemen tidak tersedia";
    const category = formatRequestCategory(surat.form_input_data?.request_category || surat.data_snapshot?.request_category);
    const kpi = getKpiPresentation(item);
    const active = selectedItem?.id === item.id;
    const requirementCount = getApprovalAttachmentRequirements(item).length;
    const verificationTask = isVerificationTask(item);
    return (
      <button type="button" key={item.id} onClick={() => selectTask(item.id)} className={cn("w-full rounded-md border px-3 py-3 text-left transition-colors", active ? "border-primary bg-primary/[0.08]" : "border-border hover:bg-muted/40")} data-testid={"inbox-task-" + item.id}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-[11px] font-semibold text-primary">{surat.no_surat || "Nomor diproses"}</p>
            <h3 className="mt-1 truncate text-sm font-semibold leading-snug">{surat.judul_surat}</h3>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "mt-0.5 shrink-0",
              kpi.tone === "late" && "border-destructive/30 bg-destructive/10 text-destructive",
              kpi.tone === "due" && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
              kpi.tone === "safe" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            )}
          >
            {kpi.label}
          </Badge>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{requester.full_name || "Pengaju tidak tersedia"} · {department}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{category}</Badge>
            {verificationTask && <Badge variant="outline" className="h-5 border-sky-500/30 bg-sky-500/10 px-1.5 text-[10px] text-sky-700 dark:text-sky-300">Verifikasi</Badge>}
            {item.requires_unit_allocation && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Unit</Badge>}
            {requirementCount > 0 && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{requirementCount} lampiran</Badge>}
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">{kpi.detail}</span>
        </div>
      </button>
    );
  };

  if (loading) {
    return <div className="sigap-page"><Skeleton className="h-20 w-full rounded-lg" /><Skeleton className="h-[620px] rounded-lg" /></div>;
  }

  if (inboxError) {
    return <div className="flex min-h-[520px] flex-col items-center justify-center rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-8 text-center"><AlertTriangle className="mb-4 h-10 w-10 text-destructive" /><h1 className="text-lg font-semibold">Inbox gagal dimuat</h1><p className="mt-2 max-w-md text-sm text-muted-foreground">{(inboxError as Error).message || "Terjadi gangguan saat mengambil antrean."}</p><Button className="mt-5" onClick={() => refetchInbox()} disabled={isFetching}>{isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Coba lagi</Button></div>;
  }

  const activeKpi = selectedItem ? getKpiPresentation(selectedItem) : null;
  const activeBlockers = selectedItem ? getApprovalBlockers(selectedItem) : [];

  return (
    <div className="sigap-page animate-in fade-in duration-300">
      <Dialog open={Boolean(previewingId)}><DialogContent className="max-w-sm text-center"><DialogHeader><DialogTitle className="flex flex-col items-center gap-3 text-base font-semibold"><Loader2 className="h-8 w-8 animate-spin text-primary" />PDF sedang dibuat</DialogTitle><DialogDescription>Dokumen diproses di background dan akan terbuka otomatis saat siap.</DialogDescription></DialogHeader></DialogContent></Dialog>

      <header className="sigap-panel sigap-panel-accent flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold">Inbox Persetujuan</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Fokus pada satu approval. Pilih antrean lain dari switcher.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={taskSwitcherOpen} onOpenChange={setTaskSwitcherOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-10 gap-2">
                <ListFilter className="h-4 w-4" />
                Antrean {filteredInbox.findIndex((item: any) => item.id === selectedItem?.id) + 1 || 0}/{filteredInbox.length}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(92vw,460px)] p-0">
              <div className="border-b border-border p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Pilih antrean approval</p>
                    <p className="text-xs text-muted-foreground">
                      {filteredInbox.length} dari {inbox.length} antrean sesuai filter
                    </p>
                  </div>
                  {isFetching || kpiLoading ? <Loader2 className="mt-1 h-4 w-4 animate-spin text-muted-foreground" /> : null}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari nomor, judul, pengaju, atau departemen"
                    value={searchTerm}
                    onChange={(event) => handleSearchChange(event.target.value)}
                    className="h-10 pl-9 text-sm"
                  />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua kategori</SelectItem>
                      <SelectItem value="asset">Aset</SelectItem>
                      <SelectItem value="unit">Unit</SelectItem>
                      <SelectItem value="non_unit">Non Unit</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={kpiFilter} onValueChange={setKpiFilter}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua KPI</SelectItem>
                      <SelectItem value="late">Terlambat</SelectItem>
                      <SelectItem value="due">Mendekati SLA</SelectItem>
                      <SelectItem value="on_time">Dalam SLA</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua tindakan</SelectItem>
                      <SelectItem value="approval">Persetujuan biasa</SelectItem>
                      <SelectItem value="unit">Alokasi unit</SelectItem>
                      <SelectItem value="attachment">Butuh lampiran</SelectItem>
                      <SelectItem value="verification">Verifikasi data</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="max-h-[min(60vh,520px)] overflow-y-auto overscroll-contain">
                <div className="space-y-2 p-3">
                  {filteredInbox.length ? filteredInbox.map(renderQueueItem) : (
                    <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border p-6 text-center">
                      <ShieldCheck className="mb-3 h-8 w-8 text-muted-foreground" />
                      <p className="text-sm font-semibold">Tidak ada antrean yang cocok</p>
                      <p className="mt-1 text-xs text-muted-foreground">Ubah pencarian atau filter.</p>
                    </div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Badge variant="outline" className="h-10 px-3 text-sm">{inbox.length} total</Badge>
          {isFetching || kpiLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>
      </header>

      <div className="overflow-visible rounded-lg border border-border bg-card shadow-[var(--shadow-card)] lg:h-[calc(100vh-11rem)] lg:min-h-[640px] lg:overflow-hidden">
          <main className="min-w-0 bg-background lg:h-full lg:min-h-0 lg:overflow-hidden">
          {selectedItem ? <div className="flex flex-col lg:h-full lg:min-h-0 lg:overflow-hidden">
            <div className="shrink-0 flex items-start gap-3 border-b border-border bg-card p-4 sm:p-5">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-primary">{selectedItem.surat_registrasi.no_surat || "Nomor diproses"}</span><Badge variant="outline">Tahap {selectedItem.step_order}</Badge><Badge variant="outline">{selectedItem.label_jabatan || selectedItem.role_name}</Badge>{isVerificationTask(selectedItem) && <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300">Verifikasi Data</Badge>}</div><h2 className="mt-2 text-lg font-bold leading-tight sm:text-xl">{selectedItem.surat_registrasi.judul_surat}</h2><p className="mt-1 text-sm text-muted-foreground">Diajukan {new Date(selectedItem.surat_registrasi.created_at).toLocaleString("id-ID")}</p></div>
              {activeKpi && <div className={cn("hidden min-w-36 rounded-lg border p-3 text-right sm:block", activeKpi.tone === "late" && "border-destructive/30 bg-destructive/5", activeKpi.tone === "due" && "border-amber-500/30 bg-amber-500/5", activeKpi.tone === "safe" && "border-emerald-500/30 bg-emerald-500/5")}><p className="text-sm font-semibold">{activeKpi.label}</p><p className="mt-1 text-xs text-muted-foreground">{activeKpi.detail}</p></div>}
            </div>
            <div data-testid="approval-detail-scroll" className="min-h-0 flex-none overflow-visible lg:flex-1 lg:overflow-y-auto lg:overscroll-contain"><div className="w-full space-y-4 p-4 pb-8 sm:p-6">{renderRequestSummary(selectedItem)}{renderApprovalHistory(selectedItem)}{renderUnitAllocationPanel(selectedItem)}{renderDocumentsPanel(selectedItem)}{renderApprovalAttachmentPanel(selectedItem)}{renderVerificationNotePanel(selectedItem)}<section className="sigap-panel"><div className="mb-3 flex items-center gap-3"><MessageSquare className="h-5 w-5 text-primary" /><div><p className="text-sm font-semibold">{isVerificationTask(selectedItem) ? "Catatan verifikasi" : "Catatan persetujuan"}</p><p className="text-xs text-muted-foreground">{isVerificationTask(selectedItem) ? "Opsional. Catatan akan tersimpan pada status verifikasi." : "Opsional. Alasan penolakan akan diminta saat menolak."}</p></div></div><Textarea ref={(element) => (noteRefs.current[selectedItem.id] = element)} placeholder={isVerificationTask(selectedItem) ? "Tambahkan catatan verifikasi bila diperlukan" : "Tambahkan catatan untuk tahap berikutnya"} value={notes[selectedItem.id] || ""} onChange={(event) => setNotes((previous) => ({ ...previous, [selectedItem.id]: event.target.value }))} className="min-h-24 resize-y text-sm" /></section></div></div>
            <div className="shrink-0 border-t border-border bg-background/95 p-4 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur sm:px-6">
              <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  {isVerificationTask(selectedItem) ? (
                    <div className="flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300">
                      <ShieldCheck className="h-4 w-4" />
                      Periksa data dan lampiran sebelum membuka aksi penanda tangan.
                    </div>
                  ) : activeBlockers.length ? (
                    <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p><span className="font-semibold">Belum siap:</span> {activeBlockers.join(" · ")}</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      <CircleCheck className="h-4 w-4" />Semua persyaratan lengkap
                    </div>
                  )}
                </div>
                {isVerificationTask(selectedItem) ? (
                  <Button className="shrink-0 bg-sky-600 text-white hover:bg-sky-500 sm:min-w-40" disabled={processingId === selectedItem.id} onClick={() => handleVerify(selectedItem)}>
                    {processingId === selectedItem.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    Verifikasi Data
                  </Button>
                ) : (
                  <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                    {isPreparedByVerifier(selectedItem) && (
                      <Button variant="outline" className="col-span-2 sm:min-w-40" disabled={processingId === selectedItem.id} onClick={() => handleRequestVerificationRevision(selectedItem)}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Kembalikan ke pengecek
                      </Button>
                    )}
                    <Button variant="destructive" className="sm:min-w-28" disabled={processingId === selectedItem.id} onClick={() => handleReject(selectedItem)}>
                      {processingId === selectedItem.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="mr-2 h-4 w-4" />Tolak</>}
                    </Button>
                    <Button className="bg-emerald-600 text-white hover:bg-emerald-500 sm:min-w-32" disabled={processingId === selectedItem.id || activeBlockers.length > 0} onClick={() => handleApprove(selectedItem)}>
                      {processingId === selectedItem.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Setujui<ArrowRight className="ml-2 h-4 w-4" /></>}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div> : <div className="flex h-full min-h-[640px] flex-col items-center justify-center p-8 text-center lg:min-h-0"><ShieldCheck className="mb-4 h-10 w-10 text-muted-foreground" /><h2 className="text-lg font-semibold">Tidak ada pengajuan dipilih</h2><p className="mt-2 text-sm text-muted-foreground">Pilih pengajuan dari antrean.</p></div>}
        </main>
      </div>
    </div>
  );
}
