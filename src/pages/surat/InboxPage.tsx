import React, { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
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
  FileCheck2,
  FileDown
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { suratService, type LinkedSuratDocument } from "@/services/surat.service";
import { departmentKpiService, type DepartmentKpiDetail } from "@/services/department-kpi.service";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; 
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAppDialog } from "@/components/app/AppDialogProvider";
import { documentOperationKey, useDocumentOpener } from "@/hooks/useDocumentOpener";
import { getActiveRecommendationDocuments } from "@/components/surat/linked-documents";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatRequestCategory, formatSummaryValue, humanizeInputKey } from "@/components/surat/request-summary";
import { UnitAllocationPendingNotice, UnitAllocationSummary } from "@/components/surat/UnitAllocationSummary";
import { getUnitAllocationData } from "@/components/surat/unit-allocation-data";
import { approvalBadgeClass } from "@/components/surat/approval-status-style";
import { formatRupiahInput, normalizeRupiahDigits } from "@/lib/rupiah";
import { applyRevisionToItems, getActiveRevision, formatRevisionValue } from "@/components/surat/revision-utils";
import { excelSerialToDateInput, exportUnitAllocationTemplateToXlsx, readSpreadsheetRows } from "@/lib/excel";
import { normalizeProductionSerial } from "@/lib/production-code";
import { useAttention } from "@/providers/AttentionProvider";

const getAllocationUnitType = (unit: any, detail: Record<string, any> = unit?.allocation_detail || {}) =>
  String(
    detail.unit_type ||
    detail.type ||
    detail.tipe ||
    unit?.unit_type ||
    unit?.raw?.unit_type ||
    unit?.raw?.type ||
    unit?.raw?.tipe ||
    unit?.raw?.house_type ||
    "",
  ).trim();

const normalizeAllocationDetailForPersistence = (detail: Record<string, any> = {}) => ({
  ...detail,
  production_serial: normalizeProductionSerial(detail.production_serial),
});

export default function InboxPage() {
  const queryClient = useQueryClient();
  const { refetch: refetchAttention } = useAttention();
  const appDialog = useAppDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [kpiFilter, setKpiFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [taskSwitcherOpen, setTaskSwitcherOpen] = useState(false);
  const [revisionTarget, setRevisionTarget] = useState("checker");
  const [revisionDialogItem, setRevisionDialogItem] = useState<any | null>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionRows, setRevisionRows] = useState<Array<{
    index: number;
    nama_barang: string;
    action: "keep" | "reject" | "adjust";
    value_type: "unit_count" | "quantity" | "money" | "recommendation" | "text";
    nilai_diajukan: string;
    nilai_disetujui: string;
    alasan: string;
  }>>([]);

  // State untuk dokumen & notes
  const { openPdf, openFile, isOpening } = useDocumentOpener();
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
  const [verificationDraftState, setVerificationDraftState] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [summaryExportingId, setSummaryExportingId] = useState<string | null>(null);
  
  const noteRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});
  const selectedItemRef = useRef<any>(null);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRealtimeToastRef = useRef<{ key: string; at: number } | null>(null);
  const hydrationRef = useRef<Record<string, boolean>>({});
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const hasVerifierTargets = (item: any) =>
    Array.isArray(item?.verifier_snapshot) && item.verifier_snapshot.some((entry: any) => entry?.user_id);

  const getVerifierDisplayName = (item: any) => {
    const names = Array.isArray(item?.verifier_snapshot)
      ? item.verifier_snapshot
          .map((entry: any) => String(entry?.full_name || entry?.name || entry?.display_name || "").trim())
          .filter(Boolean)
      : [];
    const uniqueNames = Array.from(new Set(names));
    if (uniqueNames.length === 0) return "tim pemeriksa";
    if (uniqueNames.length === 1) return uniqueNames[0];
    if (uniqueNames.length === 2) return `${uniqueNames[0]} dan ${uniqueNames[1]}`;
    return `${uniqueNames.slice(0, 2).join(", ")} dan ${uniqueNames.length - 2} lainnya`;
  };

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
  const selectedSuratId = selectedItem?.surat_registrasi?.id || selectedItem?.surat_id || "";

  const { data: linkedDocuments = [], isFetching: linkedDocumentsLoading } = useQuery({
    queryKey: ["surat-linked-documents", selectedSuratId],
    queryFn: () => suratService.getLinkedDocuments(selectedSuratId),
    enabled: Boolean(selectedSuratId),
    staleTime: 15000,
  });

  const { data: revisionHistory = [] } = useQuery({
    queryKey: ["surat-revision-history", selectedSuratId],
    queryFn: () => suratService.getRevisionHistory(selectedSuratId),
    enabled: Boolean(selectedSuratId),
    staleTime: 10000,
  });

  useEffect(() => {
    selectedItemRef.current = selectedItem;
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedItem || !isVerificationTask(selectedItem) || hydrationRef.current[selectedItem.id]) return;
    const draft = getVerificationDraft(selectedItem);
    if (!draft) {
      hydrationRef.current[selectedItem.id] = true;
      return;
    }
    const input = draft.input && typeof draft.input === "object" ? draft.input : {};
    if (String(draft.note || "").trim()) {
      setNotes((previous) => ({ ...previous, [selectedItem.id]: String(draft.note || "") }));
    }
    if ((input as any).allocated_project) {
      setAllocationProjectSelected((previous) => ({ ...previous, [selectedItem.id]: (input as any).allocated_project }));
    }
    if (Array.isArray((input as any).allocated_units)) {
      setAllocationSelected((previous) => ({ ...previous, [selectedItem.id]: (input as any).allocated_units }));
      setAllocationDetails((previous) => ({
        ...previous,
        [selectedItem.id]: Object.fromEntries((input as any).allocated_units.map((unit: any) => [
          unit.value || unit.label,
          unit.allocation_detail || {},
        ])),
      }));
    }
    setVerificationDraftState((previous) => ({ ...previous, [selectedItem.id]: "saved" }));
    hydrationRef.current[selectedItem.id] = true;
  }, [selectedItem?.id]);

  useEffect(() => {
    if (!selectedItem) return;
    if (revisionTarget === "checker" && !hasVerifierTargets(selectedItem)) {
      setRevisionTarget("requester");
    }
  }, [selectedItem, revisionTarget]);

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
        queryClient.invalidateQueries({ queryKey: ["surat-linked-documents"] });
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
            showRealtimeToast("verification-done", "Pemeriksaan selesai", "Data dari tim pemeriksa sudah masuk. Tombol tindakan akan diperbarui.");
          } else if (next.verification_status === "revision_requested" && previous.verification_status !== "revision_requested") {
            showRealtimeToast("verification-revision", "Dikembalikan ke tim pemeriksa", "Tim pemeriksa perlu memperbarui data sebelum proses dilanjutkan.");
          } else if (next.is_signed !== previous.is_signed || next.status !== previous.status) {
            showRealtimeToast("approval-progress", "Progress persetujuan diperbarui");
          } else if (next.verification_note !== previous.verification_note) {
            showRealtimeToast("verification-note", "Catatan pemeriksaan diperbarui");
          }
        }
        scheduleInboxRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_attachments" }, (payload: any) => {
        const row = payload.new || payload.old || {};
        if (isActiveSurat(row.surat_id)) {
          showRealtimeToast("attachments-updated", "Lampiran diperbarui", "Lampiran dari tim pemeriksa sudah disinkronkan.");
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
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_linked_documents" }, (payload: any) => {
        const row = payload.new || payload.old || {};
        if (isActiveSurat(row.parent_surat_id)) {
          showRealtimeToast("linked-documents-updated", "Dokumen rekomendasi diperbarui");
        }
        scheduleInboxRefresh();
      })
      .subscribe();

    return () => {
      if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, queryClient]);

  const isUnitAllocationRequired = (item: any) => {
    const input = item.surat_registrasi?.form_input_data || {};
    const category = String(input.request_category || "").trim();
    const mode = String(input.request_mode || "").trim();
    const isUnitRequest = category ? category === "unit" : mode === "unit";
    return item.requires_unit_allocation === true && isUnitRequest;
  };

  const getRequestedUnitCount = (item: any) =>
    Number(getUnitAllocationData(item.surat_registrasi).requestedCount || 0);

  const hasStoredUnitAllocation = (item: any) =>
    getUnitAllocationData(item.surat_registrasi).units.length > 0;

  const shouldInputUnitAllocation = (item: any) =>
    isUnitAllocationRequired(item) &&
    (
      isVerificationTask(item) ||
      (item?.verification_required !== true && !hasStoredUnitAllocation(item) && shouldSignerInputStageData(item))
    );

  const getAllocationProject = (item: any) =>
    getUnitAllocationData(item.surat_registrasi).project ||
    allocationProjectSelected[item.id] ||
    item.surat_registrasi?.form_input_data?.requested_project ||
    item.surat_registrasi?.form_input_data?.allocated_project;

  const getSelectedAllocationUnits = (item: any) => {
    if (allocationSelected[item.id]) return allocationSelected[item.id];
    return getUnitAllocationData(item.surat_registrasi).units;
  };

  const getAllocationDetailMap = (item: any) => {
    if (allocationDetails[item.id]) return allocationDetails[item.id];
    return Object.fromEntries(getSelectedAllocationUnits(item).map((unit: any) => [
      unit.value || unit.label,
      unit.allocation_detail || {},
    ]));
  };

  const getVerificationDraft = (item: any) => {
    const drafts = item?.surat_registrasi?.data_snapshot?.verification_drafts;
    const draft = drafts && typeof drafts === "object" ? drafts[item.id] : null;
    return draft && typeof draft === "object" ? draft : null;
  };

  const buildVerificationDraftPayload = (item: any) => {
    const selectedUnits = getSelectedAllocationUnits(item);
    const selectedProject = getAllocationProject(item);
    return {
      ...(isUnitAllocationRequired(item) ? {
        allocated_project: selectedProject || null,
        allocated_units: selectedUnits.map((unit: any) => ({
          ...unit,
          allocation_detail: normalizeAllocationDetailForPersistence(
            getAllocationDetailMap(item)?.[unit.value] || unit.allocation_detail || {},
          ),
        })),
        allocated_unit_count: selectedUnits.length,
      } : {}),
    };
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
          : 0;
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

      const project = getAllocationProject(item);
      const projectId = String(project?.id || project?.value || "").trim();
      if (!projectId) return;

      setAllocationLoading(prev => ({ ...prev, [signatureId]: true }));
      setAllocationErrors(prev => ({ ...prev, [signatureId]: null }));
      requestExternalOptions("marison_units_by_project", { project_id: projectId })
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

  useEffect(() => {
    if (!selectedItem || !isVerificationTask(selectedItem) || !hydrationRef.current[selectedItem.id]) return;
    const signatureId = selectedItem.id;
    const payload = buildVerificationDraftPayload(selectedItem);
    const note = notes[signatureId] || "";
    const hasDraftContent = note.trim() || Object.keys(payload).length > 0;
    if (!hasDraftContent) return;

    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      setVerificationDraftState((previous) => ({ ...previous, [signatureId]: "saving" }));
      suratService.saveVerificationDraft(signatureId, payload, note)
        .then(() => {
          setVerificationDraftState((previous) => ({ ...previous, [signatureId]: "saved" }));
        })
        .catch((error) => {
          console.error("Gagal menyimpan draft pemeriksaan", error);
          setVerificationDraftState((previous) => ({ ...previous, [signatureId]: "error" }));
        });
    }, 1200);

    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
  }, [
    selectedItem?.id,
    notes[selectedItem?.id || ""],
    JSON.stringify(allocationProjectSelected[selectedItem?.id || ""] || null),
    JSON.stringify(allocationSelected[selectedItem?.id || ""] || []),
    JSON.stringify(allocationDetails[selectedItem?.id || ""] || {}),
  ]);

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
    const blockers = getApprovalBlockers(item);
    if (blockers.length > 0) {
      throw new Error(`Belum siap: ${blockers.join(", ")}.`);
    }
    const note = notes[item.id] || "";
    const selectedUnits = getSelectedAllocationUnits(item);
    const selectedProject = getAllocationProject(item);
    const stageDataPreparedByVerifier = isPreparedByVerifier(item) || (isUnitAllocationRequired(item) && hasStoredUnitAllocation(item) && !isVerificationTask(item));
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
            allocation_detail: normalizeAllocationDetailForPersistence(
              getAllocationDetailMap(item)?.[unit.value] || {},
            ),
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
      refetchAttention(),
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
        refetchAttention(),
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
          throw new Error(`Tipe dan kode produksi untuk ${incompleteUnit.label || incompleteUnit.value} belum lengkap.`);
        }
      }
      const missingApprovalAttachments = getMissingApprovalAttachmentLabels(item);
      if (missingApprovalAttachments.length > 0) {
        throw new Error(`Lampiran approval belum lengkap: ${missingApprovalAttachments.join(", ")}.`);
      }

      if (isUnitAllocationRequired(item) && selectedUnits.length < getRequestedUnitCount(item)) {
        const proceedLess = await appDialog.confirm({
          title: "Unit terpilih kurang dari permintaan",
          description: `Permohonan meminta ${getRequestedUnitCount(item)} unit, tetapi tim pemeriksa memilih ${selectedUnits.length} unit. Lanjutkan pemeriksaan dengan jumlah tersebut?`,
          confirmText: "Lanjutkan pemeriksaan",
          cancelText: "Periksa lagi",
        });
        if (!proceedLess) return;
      }
    } catch (error: any) {
      toast.error(error.message || "Data pemeriksaan belum lengkap.");
      return;
    }

    const confirmed = await appDialog.confirm({
      title: "Simpan hasil pemeriksaan?",
      description: (
        <div className="space-y-2 text-left">
          <p className="font-semibold text-foreground">{item.surat_registrasi.judul_surat}</p>
          <p>Hasil pemeriksaan akan disimpan dan pengajuan dilanjutkan ke penanda tangan tahap ini.</p>
        </div>
      ),
      confirmText: "Simpan & lanjutkan",
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
              allocation_detail: normalizeAllocationDetailForPersistence(
                getAllocationDetailMap(item)?.[unit.value] || {},
              ),
            })),
          },
        } : {}),
      });
      toast.success("Data berhasil diperiksa", {
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
        refetchAttention(),
      ]);
    } catch (error: any) {
      toast.error(error.message || "Gagal menyimpan pemeriksaan data.");
    } finally {
      setProcessingId(null);
    }
  };

  const getRevisionSourceItems = (item: any) => {
    const input = item?.surat_registrasi?.form_input_data || item?.surat_registrasi?.data_snapshot?.input || {};
    const rows = Array.isArray(input.items) ? input.items : [];
    return rows.filter((row: any) => row && typeof row === "object");
  };

  const getRevisionContext = (item: any) => {
    const input = item?.surat_registrasi?.form_input_data || item?.surat_registrasi?.data_snapshot?.input || {};
    const category = String(input.request_category || input.request_mode || "").toLowerCase();
    const title = String(item?.surat_registrasi?.judul_surat || "").toLowerCase();
    const itemText = getRevisionSourceItems(item).map((row: any) =>
      String(row?.nama_barang || row?.nama || row?.barang || "")
    ).join(" ").toLowerCase();
    if (category === "unit" || title.includes("unit") || itemText.includes("unit")) return "unit";
    if (input.requires_recommendation || title.includes("rekomendasi")) return "recommendation";
    if (category === "asset" || title.includes("aset")) return "asset";
    if (category === "non_asset" || category === "non_unit" || title.includes("non aset")) return "non_asset";
    return "general";
  };

  const getRevisionValueType = (item: any, row?: any): (typeof revisionRows)[number]["value_type"] => {
    const context = getRevisionContext(item);
    if (context === "unit") return "unit_count";
    if (context === "recommendation") return "recommendation";
    const raw = String(row?.nominal || row?.nilai || row?.harga || row?.keterangan || "").toLowerCase();
    if (raw.includes("rp") || raw.includes("biaya") || raw.includes("nominal")) return "money";
    return "quantity";
  };

  const getGeneralRevisionPlaceholder = (item: any) => {
    const context = getRevisionContext(item);
    const targetText = revisionTarget === "checker"
      ? "Mohon tim pemeriksa memperbarui data sesuai catatan ini."
      : revisionTarget === "requester"
        ? "Mohon pemohon meninjau perubahan ini sebelum proses dilanjutkan."
        : revisionTarget === "recommendation"
          ? "Mohon tim rekomendasi memperbarui rekomendasi sesuai catatan ini."
          : "Mohon signer sebelumnya meninjau kembali tahap terkait.";
    const examples: Record<string, string> = {
      unit: `Contoh: Unit yang dapat disetujui hanya 8 dari 10 unit. ${targetText}`,
      asset: `Contoh: Item disetujui sebagian karena jumlah/kebutuhan perlu disesuaikan. ${targetText}`,
      non_asset: `Contoh: Nominal biaya perlu disesuaikan dengan batas persetujuan. ${targetText}`,
      recommendation: `Contoh: Spesifikasi rekomendasi terlalu tinggi. Mohon revisi opsi service/ganti/beli baru beserta lampiran pendukung.`,
      general: `Contoh: Data pengajuan perlu diperbaiki sebelum proses dilanjutkan. ${targetText}`,
    };
    return examples[context] || examples.general;
  };

  const getApprovedValuePlaceholder = (item: any, row: (typeof revisionRows)[number]) => {
    const context = getRevisionContext(item);
    if (context === "unit") {
      const requestedCount = getRequestedUnitCount(item);
      return requestedCount > 0 ? `Contoh: ${Math.max(requestedCount - 1, 1)} unit` : "Contoh: 8 unit";
    }
    if (context === "asset") return "Contoh: 2 unit atau Rp 15.000.000";
    if (context === "recommendation") return "Contoh: Service adaptor / Ganti komponen";
    if (context === "non_asset") return "Contoh: 300.000.000";
    return row.nilai_diajukan ? `Contoh lebih kecil dari ${row.nilai_diajukan}` : "Contoh: 300.000.000";
  };

  const getRevisionReasonPlaceholder = (item: any, row: (typeof revisionRows)[number]) => {
    const context = getRevisionContext(item);
    if (row.action === "reject") {
      const rejectExamples: Record<string, string> = {
        unit: "Contoh: Unit ini tidak disetujui karena stok/kavling tidak memenuhi kebutuhan.",
        asset: "Contoh: Item ini belum prioritas atau belum sesuai kebutuhan operasional.",
        non_asset: "Contoh: Biaya ini belum dapat disetujui karena dokumen pendukung kurang.",
        recommendation: "Contoh: Rekomendasi item ini tidak disetujui karena spesifikasi belum sesuai.",
        general: "Contoh: Item ini tidak disetujui karena alasan operasional.",
      };
      return rejectExamples[context] || rejectExamples.general;
    }
    const adjustExamples: Record<string, string> = {
      unit: "Contoh: Jumlah unit disetujui lebih sedikit karena ketersediaan unit terbatas.",
      asset: "Contoh: Jumlah/nilai disetujui disesuaikan dengan prioritas kebutuhan.",
      non_asset: "Contoh: Nominal disetujui mengikuti batas anggaran yang disetujui.",
      recommendation: "Contoh: Spek/nilai rekomendasi perlu disesuaikan agar lebih efisien.",
      general: "Contoh: Data disetujui sebagian sesuai hasil peninjauan.",
    };
    return adjustExamples[context] || adjustExamples.general;
  };

  const getRevisionRequestedLabel = (item: any) => {
    const context = getRevisionContext(item);
    if (context === "unit") return "Jumlah diajukan";
    if (context === "recommendation") return "Rekomendasi diajukan";
    return "Nilai diajukan";
  };

  const getRevisionApprovedLabel = (item: any) => {
    const context = getRevisionContext(item);
    if (context === "unit") return "Jumlah disetujui";
    if (context === "recommendation") return "Rekomendasi disetujui";
    return "Nilai disetujui";
  };

  const getRevisionDecisionLabel = (action: (typeof revisionRows)[number]["action"]) => {
    if (action === "adjust") return "Disetujui sebagian";
    if (action === "reject") return "Tidak disetujui";
    return "Tidak berubah";
  };

  const updateApprovedRevisionValue = (item: any, row: (typeof revisionRows)[number], value: string) => {
    if (row.value_type === "unit_count" || row.value_type === "quantity") {
      const digits = value.replace(/[^\d]/g, "");
      const approvedCount = Number(digits || 0);
      const requestedCount = Number(String(row.nilai_diajukan || "").replace(/[^\d]/g, "")) || getRequestedUnitCount(item);
      const nextAction: (typeof revisionRows)[number]["action"] = !digits || approvedCount === requestedCount
        ? "keep"
        : approvedCount <= 0
          ? "reject"
          : "adjust";
      updateRevisionRow(row.index, { nilai_disetujui: digits, action: nextAction });
      return;
    }
    if (row.value_type === "money") {
      updateRevisionRow(row.index, { nilai_disetujui: formatRupiahInput(value) });
      return;
    }
    updateRevisionRow(row.index, { nilai_disetujui: value });
  };

  const openRevisionDialog = (item: any) => {
    const rows = getRevisionSourceItems(item);
    const context = getRevisionContext(item);
    const requestedUnitCount = getRequestedUnitCount(item);
    setRevisionDialogItem(item);
    setRevisionNote(notes[item.id] || "");
    setRevisionRows(rows.map((row: any, index: number) => {
      const valueType = getRevisionValueType(item, row);
      return {
        index,
        nama_barang: String(row.nama_barang || row.nama || row.barang || `Item ${index + 1}`),
        action: "keep",
        value_type: valueType,
        nilai_diajukan: valueType === "unit_count" && requestedUnitCount > 0
          ? String(requestedUnitCount)
          : String(row.nilai_diajukan || row.jumlah || row.nominal || row.keterangan || ""),
        nilai_disetujui: "",
        alasan: "",
      };
    }));
  };

  const updateRevisionRow = (index: number, patch: Partial<(typeof revisionRows)[number]>) => {
    setRevisionRows((current) => current.map((row) => row.index === index ? { ...row, ...patch } : row));
  };

  const isGenericRevisionNote = (value: unknown) => {
    const normalized = String(value || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    return !normalized ||
      normalized === "instruksi utama" ||
      normalized === "catatan revisi" ||
      normalized === "tuliskan instruksi perbaikan" ||
      normalized === "tulis instruksi perbaikan" ||
      normalized === "instruksi perbaikan";
  };

  const normalizeRevisionMainNote = (note: string, itemRevisions: Array<{ alasan?: string; nama_barang?: string }>) => {
    const trimmed = note.trim();
    if (!isGenericRevisionNote(trimmed)) return trimmed;
    const firstReason = itemRevisions.map((row) => String(row.alasan || "").trim()).find(Boolean);
    if (firstReason) return firstReason;
    const firstItem = itemRevisions.map((row) => String(row.nama_barang || "").trim()).find(Boolean);
    return firstItem ? `Perbaikan diperlukan pada ${firstItem}.` : "";
  };

  const getRevisionDisplayReason = (event: any) => {
    const reason = String(event?.reason || "").trim();
    if (!isGenericRevisionNote(reason)) return reason;
    const firstReason = Array.isArray(event?.changes?.item_revisions)
      ? event.changes.item_revisions
          .map((row: any) => String(row?.alasan || row?.reason || "").trim())
          .find(Boolean)
      : "";
    return firstReason || "Perbaikan sudah tercatat pada detail item.";
  };

  const buildCheckerInputSnapshot = (item: any) => {
    const input = item?.surat_registrasi?.form_input_data || item?.surat_registrasi?.data_snapshot?.input || {};
    const allocation = getUnitAllocationData(item?.surat_registrasi);
    const snapshot = {
      ...input,
      allocated_project: allocation.project || input.allocated_project || input.requested_project || null,
      allocated_units: allocation.units,
      allocated_unit_count: allocation.units.length || input.allocated_unit_count || null,
      requested_unit_count: allocation.requestedCount || input.requested_unit_count || null,
    };
    return Array.isArray(snapshot.allocated_units) && snapshot.allocated_units.length > 0
      ? snapshot
      : null;
  };

  const handleReturnForRevision = async (item: any) => {
    const target = revisionTarget as "requester" | "checker" | "signer" | "recommendation";
    const targetLabel: Record<string, string> = {
      requester: "pemohon",
      checker: "tim pemeriksa",
      signer: "signer sebelumnya",
      recommendation: "tim IT/rekomendasi",
    };
    const itemRevisions = revisionRows
      .filter((row) => row.action !== "keep" || row.alasan.trim().length > 0)
      .map((row) => ({
        index: row.index,
        action: row.action,
        value_type: row.value_type,
        nama_barang: row.nama_barang,
        nilai_diajukan: row.value_type === "money" ? (normalizeRupiahDigits(row.nilai_diajukan) || row.nilai_diajukan) : row.nilai_diajukan,
        nilai_disetujui: row.value_type === "money" ? (normalizeRupiahDigits(row.nilai_disetujui) || row.nilai_disetujui) : row.nilai_disetujui,
        ...(row.value_type === "unit_count" ? {
          unit_diajukan: row.nilai_diajukan,
          unit_disetujui: row.nilai_disetujui,
          jumlah_diajukan: row.nilai_diajukan,
          jumlah_disetujui: row.nilai_disetujui,
        } : {}),
        ...(row.value_type === "quantity" ? {
          jumlah_diajukan: row.nilai_diajukan,
          jumlah_disetujui: row.nilai_disetujui,
        } : {}),
        ...(row.value_type === "money" ? {
          nominal_diajukan: normalizeRupiahDigits(row.nilai_diajukan) || row.nilai_diajukan,
          nominal_disetujui: normalizeRupiahDigits(row.nilai_disetujui) || row.nilai_disetujui,
        } : {}),
        alasan: row.alasan.trim(),
      }));
    if (revisionRows.length > 0 && itemRevisions.length === 0) {
      toast.error("Pilih minimal satu item yang perlu diperbaiki, atau isi instruksi perbaikan pada item.");
      return;
    }
    const note = normalizeRevisionMainNote(revisionRows.length > 0 ? "" : revisionNote, itemRevisions);
    if (note.trim().length < 5) {
      toast.error("Catatan revisi minimal 5 karakter.");
      return;
    }
    const invalid = itemRevisions.find((row) => String(row.alasan || "").trim().length < 5);
    if (invalid) {
      toast.error(`Alasan perubahan item "${invalid.nama_barang}" minimal 5 karakter.`);
      return;
    }

    setProcessingId(item.id);
    try {
      const restartStep = target === "signer"
        ? Math.max(1, Number(item.step_order || 1) - 1)
        : Number(item.step_order || 1);
      const checkerInputSnapshot = target === "checker" ? buildCheckerInputSnapshot(item) : null;
      await suratService.requestProcessRevision({
        suratId: item.surat_id,
        signatureId: item.id,
        targetType: target,
        targetStep: target === "signer"
          ? restartStep
          : target === "checker"
            ? Number(item.step_order || 1)
            : null,
        reason: note,
        changes: {
          note,
          requested_by: "approval_inbox",
          requires_resign: true,
          restart_step: restartStep,
          item_revisions: itemRevisions,
          ...(checkerInputSnapshot ? { checker_input_snapshot: checkerInputSnapshot } : {}),
        },
      });
      toast.success("Proses dikembalikan", {
        description: `Pengajuan masuk status Menunggu Perbaikan dan dikirim ke ${targetLabel[target] || "tujuan revisi"}.`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['surat-inbox'] }),
        queryClient.invalidateQueries({ queryKey: ['surat-inbox-kpi'] }),
        queryClient.invalidateQueries({ queryKey: ['surat-revision-history'] }),
        refetchAttention(),
      ]);
      setRevisionDialogItem(null);
    } catch (error: any) {
      toast.error(error.message || "Gagal mengembalikan proses.");
    } finally {
      setProcessingId(null);
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

  const normalizeImportHeader = (value: unknown) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");

  const getImportColumnIndex = (headers: string[], aliases: string[]) => {
    const normalizedAliases = aliases.map(normalizeImportHeader);
    return headers.findIndex((header) => normalizedAliases.includes(normalizeImportHeader(header)));
  };

  const normalizeImportDate = (value: unknown) => {
    const text = String(value || "").trim();
    if (!text) return "";
    const serialDate = excelSerialToDateInput(text);
    if (serialDate) return serialDate;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (!match) return text;
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${month}-${day}`;
  };

  const downloadAllocationTemplate = async (item: any) => {
    const selected = getSelectedAllocationUnits(item);
    if (selected.length === 0) {
      toast.error("Pilih kavling terlebih dahulu sebelum mengunduh template.");
      return;
    }
    const details = getAllocationDetailMap(item);
    const project = getAllocationProject(item);
    const rows = selected.map((unit: any, index: number) => {
      const detail = details[unit.value] || unit.allocation_detail || {};
      return {
        No: index + 1,
        Proyek: project?.name || project?.label || project?.code || "",
        Kavling: unit.label || unit.value,
        "Struktur Atas": detail.struktur_atas ? formatRupiahInput(detail.struktur_atas) : "",
        "Struktur Bawah": detail.struktur_bawah ? formatRupiahInput(detail.struktur_bawah) : "",
        "Tipe Unit": getAllocationUnitType(unit, detail),
        "Nomor Kode Produksi": normalizeProductionSerial(detail.production_serial),
        "Blok": detail.production_block || "",
        "Tanggal Produksi": detail.production_date ? formatDatePickerDisplay(detail.production_date) : "",
      };
    });
    await exportUnitAllocationTemplateToXlsx(
      rows,
      `template_alokasi_unit_${item.surat_registrasi?.no_surat || item.id}.xlsx`.replace(/[^\w.-]+/g, "_"),
    );
  };

  const importAllocationTemplate = async (item: any, file: File | null) => {
    if (!file) return;
    const selected = getSelectedAllocationUnits(item);
    if (selected.length === 0) {
      toast.error("Pilih kavling terlebih dahulu sebelum import data.");
      return;
    }
    try {
      const rows = await readSpreadsheetRows(file);
      const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeImportHeader(cell) === "kavling"));
      if (headerIndex < 0) throw new Error("Header Kavling tidak ditemukan.");

      const headers = rows[headerIndex];
      const kavlingIndex = getImportColumnIndex(headers, ["Kavling", "Unit"]);
      const strukturAtasIndex = getImportColumnIndex(headers, ["Struktur Atas", "Atas"]);
      const strukturBawahIndex = getImportColumnIndex(headers, ["Struktur Bawah", "Bawah"]);
      const unitTypeIndex = getImportColumnIndex(headers, ["Tipe Unit", "Tipe", "Type", "Unit Type"]);
      const serialIndex = getImportColumnIndex(headers, ["Nomor Kode Produksi", "Nomor", "Serial", "Production Serial"]);
      const blockIndex = getImportColumnIndex(headers, ["Blok", "Production Block"]);
      const dateIndex = getImportColumnIndex(headers, ["Tanggal Produksi", "Tanggal", "Production Date"]);
      if (kavlingIndex < 0) throw new Error("Kolom Kavling wajib tersedia.");

      const selectedByKey = new Map<string, any>();
      selected.forEach((unit: any) => {
        selectedByKey.set(String(unit.value || "").trim().toLowerCase(), unit);
        selectedByKey.set(String(unit.label || "").trim().toLowerCase(), unit);
      });

      const importedDetails: Record<string, any> = {};
      const skipped: string[] = [];
      let importedCount = 0;

      rows.slice(headerIndex + 1).forEach((row) => {
        const kavling = String(row[kavlingIndex] || "").trim();
        if (!kavling) return;
        const unit = selectedByKey.get(kavling.toLowerCase());
        if (!unit) {
          skipped.push(kavling);
          return;
        }
        const unitValue = unit.value || unit.label;
        importedDetails[unitValue] = {
          ...((allocationDetails[item.id] || {})[unitValue] || unit.allocation_detail || {}),
          ...(strukturAtasIndex >= 0 ? { struktur_atas: normalizeRupiahDigits(row[strukturAtasIndex] || "") } : {}),
          ...(strukturBawahIndex >= 0 ? { struktur_bawah: normalizeRupiahDigits(row[strukturBawahIndex] || "") } : {}),
          ...(unitTypeIndex >= 0 ? { unit_type: String(row[unitTypeIndex] || "").trim() } : {}),
          ...(serialIndex >= 0 ? { production_serial: normalizeProductionSerial(row[serialIndex]) } : {}),
          ...(blockIndex >= 0 ? { production_block: String(row[blockIndex] || "").trim() } : {}),
          ...(dateIndex >= 0 ? { production_date: normalizeImportDate(row[dateIndex]) } : {}),
        };
        importedCount += 1;
      });

      if (importedCount === 0) {
        throw new Error("Tidak ada baris yang cocok dengan kavling terpilih.");
      }

      setAllocationDetails((previous) => ({
        ...previous,
        [item.id]: {
          ...(previous[item.id] || {}),
          ...importedDetails,
        },
      }));

      toast.success(`Import alokasi berhasil: ${importedCount} kavling diperbarui.`, {
        description: skipped.length > 0 ? `${skipped.length} baris dilewati karena kavling belum dipilih.` : undefined,
      });
    } catch (error: any) {
      toast.error(error.message || "Gagal import template alokasi unit.");
    }
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

  const renderRequestSummary = (item: any) => {
    const surat = item.surat_registrasi || {};
    const requester = surat.requester_snapshot || surat.data_snapshot?.requester || {};
    const location = surat.location_snapshot || surat.data_snapshot?.location || {};
    const input = surat.form_input_data && typeof surat.form_input_data === "object" ? surat.form_input_data : {};
    const dataSnapshot = surat.data_snapshot || {};
    const rawItems = Array.isArray(input.items) ? input.items : Array.isArray(dataSnapshot.detail_barang) ? dataSnapshot.detail_barang : [];
    const items = applyRevisionToItems(rawItems, getActiveRevision(surat));
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
    const itemColumns = [
      { key: "nama_barang", label: "Nama Barang", getValue: (row: any) => row?.nama_barang ?? row?.nama ?? row?.barang },
      { key: "sat", label: "Satuan", getValue: (row: any) => row?.sat ?? row?.satuan ?? row?.unit },
      { key: "jumlah", label: "Jumlah", getValue: (row: any) => row?.jumlah },
      { key: "status", label: "Status", getValue: (row: any) => row?.status },
      { key: "keterangan", label: "Keterangan", getValue: (row: any) => row?.keterangan },
    ];
    const getRowRevision = (row: any) => row?.__revision || null;
    const visibleItemColumns = itemColumns.filter((column) => column.key !== "keterangan" || items.some((row: any) => formatSummaryValue(column.getValue(row)) !== "-" || getRowRevision(row)));
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
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div><p className="text-xs font-medium text-muted-foreground">Proyek yang diajukan</p><p className="mt-1 text-sm font-semibold">{requestedProject.name || requestedProject.label || "-"}</p></div>
          </div>
        )}
        {items.length > 0 && visibleItemColumns.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-md border border-border">
            <div className="border-b border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground">Daftar barang / jasa</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-muted/20 text-muted-foreground"><tr><th className="px-3 py-2 text-center">No.</th>{visibleItemColumns.map((column) => <th key={column.key} className="px-3 py-2">{column.label}</th>)}</tr></thead>
                <tbody>{items.map((row: any, index: number) => {
                  const revision = getRowRevision(row);
                  const rejected = revision?.action === "reject";
                  return (
                    <tr key={index} className={cn("border-t border-border", revision && "bg-amber-500/[0.04]")}>
                      <td className="px-3 py-2 text-center">{index + 1}</td>
                      {visibleItemColumns.map((column) => (
                        <td key={column.key} className="whitespace-pre-wrap px-3 py-2 align-top">
                          <span className={cn(rejected && "text-muted-foreground line-through decoration-2")}>{formatSummaryValue(column.getValue(row))}</span>
                          {column.key === "keterangan" && revision && (
                            <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
                              {revision.action === "reject" && <p className="font-semibold">Item tidak disetujui.</p>}
                              {revision.action === "adjust" && (
                                <p className="font-semibold">
                                  Nilai disetujui: {formatRevisionValue(revision.nilai_disetujui, revision, row)}
                                  {revision.nilai_diajukan ? ` dari ${formatRevisionValue(revision.nilai_diajukan, revision, row)}` : ""}
                                </p>
                              )}
                              {revision.alasan && <p className="mt-1">{revision.alasan}</p>}
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}</tbody>
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
      return !getAllocationUnitType(unit, detail) ||
        !String(detail.production_serial || "").trim() ||
        !String(detail.production_block || "").trim() ||
        !String(detail.production_date || "").trim();
    });
  };

  const renderUnitAllocationPanel = (item: any) => {
    const storedAllocation = getUnitAllocationData(item.surat_registrasi);
    const hasStoredAllocation = storedAllocation.units.length > 0;
    const isActiveUnitInputTask = shouldInputUnitAllocation(item);
    if (hasStoredAllocation && !isActiveUnitInputTask) {
      return (
        <section className="sigap-panel border-emerald-500/30">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold">Alokasi unit dari tim pemeriksa</p>
                <p className="text-xs text-muted-foreground">{storedAllocation.units.length} dari {getRequestedUnitCount(item)} unit permintaan dipilih</p>
              </div>
            </div>
            <Badge variant="outline" className={approvalBadgeClass("verification_done")}>Sudah diperiksa</Badge>
          </div>
          <UnitAllocationSummary
            units={storedAllocation.units}
            project={storedAllocation.project}
            requestedCount={getRequestedUnitCount(item)}
            className="border-0 bg-transparent p-0"
          />
        </section>
      );
    }
    if (!isUnitAllocationRequired(item)) {
      const input = item.surat_registrasi?.form_input_data || {};
      const category = String(input.request_category || item.surat_registrasi?.data_snapshot?.request_category || "").trim();
      if (category === "unit") return <UnitAllocationPendingNotice className="sigap-panel" />;
      return null;
    }
    if (!isActiveUnitInputTask) {
      return (
        <section className="sigap-panel border-amber-500/30">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-600" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">Alokasi unit dari tim pemeriksa</p>
                <Badge variant="outline" className={approvalBadgeClass("verification_waiting")}>
                  Data kavling belum tersedia
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Tahap ini sudah masuk ke penanda tangan. Jika kavling belum tampil, minta tim pemeriksa mengembalikan dan menyimpan pilihan kavling terlebih dahulu.
              </p>
            </div>
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
            <Badge
              variant="outline"
              className={approvalBadgeClass(complete ? "verification_done" : "verification_waiting")}
            >
              {complete ? "Lengkap" : "Perlu dilengkapi"}
            </Badge>
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
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold">Detail kavling dan kode produksi</p>
                <p className="text-xs text-muted-foreground">Isi data tiap kavling dalam satu tabel. Header tetap terlihat saat daftar discroll.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{selected.length} unit</Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadAllocationTemplate(item)}
                  disabled={selected.length === 0}
                  className="gap-2"
                >
                  <FileDown className="h-4 w-4" />
                  Download template
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={selected.length === 0}
                  className="gap-2"
                  onClick={() => document.getElementById(`allocation-import-${item.id}`)?.click()}
                >
                  <FileUp className="h-4 w-4" />
                  Import data
                </Button>
                <input
                  id={`allocation-import-${item.id}`}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    void importAllocationTemplate(item, file);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
            </div>
            {selected.length === 0 ? (
              <div className="flex h-28 flex-col items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"><Home className="mb-2 h-5 w-5" />Pilih kavling terlebih dahulu.</div>
            ) : (
              <div className="max-h-[520px] overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[1240px] border-collapse text-sm">
                  <thead className="sticky top-0 z-20 bg-muted text-xs text-muted-foreground shadow-[0_1px_0_hsl(var(--border))]">
                    <tr>
                      <th className="sticky left-0 z-30 w-12 border-r border-border bg-muted px-3 py-3 text-center font-semibold">No.</th>
                      <th className="sticky left-12 z-30 w-28 border-r border-border bg-muted px-3 py-3 text-left font-semibold">Kavling</th>
                      <th className="w-32 border-r border-border px-3 py-3 text-left font-semibold">Tipe Unit</th>
                      <th className="w-40 border-r border-border px-3 py-3 text-right font-semibold">Struktur Atas</th>
                      <th className="w-40 border-r border-border px-3 py-3 text-right font-semibold">Struktur Bawah</th>
                      <th className="w-36 border-r border-border px-3 py-3 text-left font-semibold">Nomor</th>
                      <th className="w-32 border-r border-border px-3 py-3 text-left font-semibold">Blok</th>
                      <th className="w-44 border-r border-border px-3 py-3 text-left font-semibold">Tanggal</th>
                      <th className="w-64 px-3 py-3 text-left font-semibold">Kode Produksi</th>
                    </tr>
                  </thead>
                  <tbody className="bg-background">
                    {selected.map((unit: any, index: number) => {
                    const detail = details[unit.value] || {};
                    const dateKey = item.id + ":" + unit.value;
                    const ready = !getIncompleteAllocationUnits({ ...item, id: item.id }).some((entry: any) => entry.value === unit.value);
                    return (
                      <tr key={unit.value} className="border-t border-border align-middle">
                        <td className="sticky left-0 z-10 border-r border-border bg-background px-3 py-2 text-center text-xs font-semibold text-muted-foreground">{index + 1}</td>
                        <td className="sticky left-12 z-10 border-r border-border bg-background px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{unit.label}</span>
                            <span className={cn("h-2 w-2 rounded-full", ready ? "bg-emerald-500" : "bg-amber-500")} aria-label={ready ? "Lengkap" : "Belum lengkap"} />
                          </div>
                        </td>
                        <td className="border-r border-border px-2 py-2">
                          <Input
                            value={getAllocationUnitType(unit, detail)}
                            onChange={(event) => updateAllocationDetail(item.id, unit.value, "unit_type", event.target.value)}
                            placeholder="4.0"
                            aria-label={`Tipe unit ${unit.label}`}
                            className="h-11 text-sm"
                          />
                        </td>
                        <td className="border-r border-border px-2 py-2">
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={formatRupiahInput(detail.struktur_atas)}
                            onChange={(event) => updateAllocationDetail(
                              item.id,
                              unit.value,
                              "struktur_atas",
                              normalizeRupiahDigits(event.target.value),
                            )}
                            placeholder="1.000.000"
                            aria-label={`Struktur atas ${unit.label}`}
                            className="h-11 text-right text-sm tabular-nums"
                          />
                        </td>
                        <td className="border-r border-border px-2 py-2">
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={formatRupiahInput(detail.struktur_bawah)}
                            onChange={(event) => updateAllocationDetail(
                              item.id,
                              unit.value,
                              "struktur_bawah",
                              normalizeRupiahDigits(event.target.value),
                            )}
                            placeholder="1.000.000"
                            aria-label={`Struktur bawah ${unit.label}`}
                            className="h-11 text-right text-sm tabular-nums"
                          />
                        </td>
                        <td className="border-r border-border px-2 py-2">
                          <Input
                            value={detail.production_serial || ""}
                            onChange={(event) => updateAllocationDetail(
                              item.id,
                              unit.value,
                              "production_serial",
                              event.target.value.replace(/\D/g, ""),
                            )}
                            onBlur={(event) => updateAllocationDetail(
                              item.id,
                              unit.value,
                              "production_serial",
                              normalizeProductionSerial(event.target.value),
                            )}
                            placeholder="001"
                            aria-label={`Nomor kode produksi ${unit.label}`}
                            className="h-11 font-mono text-sm"
                          />
                        </td>
                        <td className="border-r border-border px-2 py-2">
                          <Input
                            value={detail.production_block || ""}
                            onChange={(event) => updateAllocationDetail(item.id, unit.value, "production_block", event.target.value)}
                            placeholder="4.1"
                            aria-label={`Blok kode produksi ${unit.label}`}
                            className="h-11 font-mono text-sm"
                          />
                        </td>
                        <td className="border-r border-border px-2 py-2">
                          <Popover open={Boolean(allocationDateOpen[dateKey])} onOpenChange={(open) => setAllocationDateOpen((previous) => ({ ...previous, [dateKey]: open }))}>
                            <PopoverTrigger asChild>
                              <Button type="button" variant="outline" className="h-11 w-full justify-start font-mono text-sm">
                                <CalendarIcon className="mr-2 h-4 w-4" />
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
                                  setAllocationDateOpen((previous) => ({ ...previous, [dateKey]: false }));
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {normalizeProductionSerial(detail.production_serial) || "[001]"}/UAI/PRC/{detail.production_block || "[4.1]"}/{detail.production_date ? formatDatePickerDisplay(detail.production_date) : "[14/01/2026]"}
                        </td>
                      </tr>
                    );
                  })}
                  </tbody>
                </table>
              </div>
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
              <p className="text-xs text-muted-foreground">File dari tim pemeriksa dapat dibuka pada panel Dokumen dan lampiran.</p>
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

  const safeFilename = (value: string) =>
    value
      .trim()
      .replace(/[^\w\s.-]+/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 140) || "Summary_Pengajuan";

  const loadPdfImage = async (src: string) => {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const addReportSectionTitle = (doc: jsPDF, title: string, y: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(18, 40, 28);
    doc.text(title, 36, y);
    doc.setTextColor(0, 0, 0);
    return y + 8;
  };

  const exportApprovalSummary = async (item: any) => {
    setSummaryExportingId(item.id);
    try {
      const surat = item.surat_registrasi || {};
      const input = surat.form_input_data || surat.data_snapshot?.input || {};
      const requester = surat.requester_snapshot || surat.data_snapshot?.requester || {};
      const location = surat.location_snapshot || surat.data_snapshot?.location || {};
      const allocation = getUnitAllocationData(surat);
      const allocatedProject = allocation.project && typeof allocation.project === "object" && !Array.isArray(allocation.project)
        ? allocation.project as Record<string, unknown>
        : {};
      const title = String(surat.judul_surat || "Pengajuan");
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const margin = 36;
      const logo = await loadPdfImage("/logo-marison-regency-group.png").catch(() => null);
      let cursorY = 34;

      if (logo) {
        doc.addImage(logo, "PNG", margin, cursorY, 118, 55, undefined, "FAST");
      }

      doc.setDrawColor(36, 120, 74);
      doc.setLineWidth(1);
      doc.line(margin, 108, 559, 108);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("LAPORAN RINGKASAN PENGAJUAN", 559, 46, { align: "right" });
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Marison Regency Group", 559, 64, { align: "right" });
      doc.text("SIGAP - Sistem Approval Digital", 559, 80, { align: "right" });

      cursorY = 132;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(`Summary Pengajuan - ${title}`, margin, cursorY, { maxWidth: 520 });
      cursorY += 30;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("Dibuat : Selasa, 7 Juli 2026, Pukul 09.29 WIB", margin, cursorY);
      cursorY += 28;

      cursorY = addReportSectionTitle(doc, "Informasi Pengajuan", cursorY);
      autoTable(doc, {
        startY: cursorY,
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 5, overflow: "linebreak" },
        headStyles: { fillColor: [36, 120, 74] },
        head: [["Informasi", "Nilai"]],
        body: [
          ["Nomor surat", surat.no_surat || "Nomor diproses"],
          ["Judul", title],
          ["Pengaju", requester.full_name || "-"],
          ["Departemen", location.department?.name || "-"],
          ["Kantor", location.office?.name || "-"],
          ["Proyek", allocatedProject.name || allocatedProject.label || input.requested_project?.name || input.requested_project?.label || location.project?.name || "-"],
          ["Kategori", formatRequestCategory(input.request_category || input.request_mode)],
          ["Tempat, tanggal", [surat.request_place, surat.request_date ? new Date(surat.request_date).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : ""].filter(Boolean).join(", ") || "-"],
        ],
        columnStyles: { 0: { cellWidth: 120, fontStyle: "bold" }, 1: { cellWidth: 380 } },
      });
      cursorY = (doc as any).lastAutoTable.finalY + 28;

      const rows = Array.isArray(input.items) ? applyRevisionToItems(input.items, getActiveRevision(surat)) : [];
      if (rows.length > 0) {
        cursorY = addReportSectionTitle(doc, "Detail Barang atau Jasa", cursorY);
        autoTable(doc, {
          startY: cursorY,
          theme: "grid",
          styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
          headStyles: { fillColor: [36, 120, 74] },
          head: [["No.", "Nama Barang", "Satuan", "Jumlah", "Status", "Keterangan"]],
          body: rows.map((row: any, index: number) => [
            index + 1,
            formatSummaryValue(row.nama_barang || row.nama || row.barang),
            formatSummaryValue(row.sat || row.satuan || row.unit),
            formatSummaryValue(row.jumlah),
            formatSummaryValue(row.status),
            formatSummaryValue(row.keterangan),
          ]),
          columnStyles: { 0: { cellWidth: 28, halign: "center" }, 1: { cellWidth: 170 }, 2: { cellWidth: 55 }, 3: { cellWidth: 55 }, 4: { cellWidth: 45 }, 5: { cellWidth: 145 } },
        });
        cursorY = (doc as any).lastAutoTable.finalY + 28;
      }

      if (allocation.units.length > 0) {
        cursorY = addReportSectionTitle(doc, "Rekap Unit Dialokasikan", cursorY);
        let totalAtas = 0;
        let totalBawah = 0;
        const allocationRows = allocation.units.map((unit: any, index: number) => {
          const detail = unit.allocation_detail || {};
          const atas = Number(String(detail.struktur_atas || "0").replace(/\D/g, "")) || 0;
          const bawah = Number(String(detail.struktur_bawah || "0").replace(/\D/g, "")) || 0;
          totalAtas += atas;
          totalBawah += bawah;
          const code = detail.production_serial && detail.production_block && detail.production_date
            ? `${normalizeProductionSerial(detail.production_serial)}/UAI/PRC/${detail.production_block}/${new Date(detail.production_date).toLocaleDateString("id-ID")}`
            : "-";
          return [
            index + 1,
            formatSummaryValue(unit.label || unit.value || unit.code),
            formatSummaryValue(getAllocationUnitType(unit, detail)),
            code,
            atas ? atas.toLocaleString("id-ID") : "-",
            bawah ? bawah.toLocaleString("id-ID") : "-",
            atas + bawah ? (atas + bawah).toLocaleString("id-ID") : "-",
          ];
        });
        allocationRows.push([
          "",
          "TOTAL",
          "",
          "",
          totalAtas ? totalAtas.toLocaleString("id-ID") : "-",
          totalBawah ? totalBawah.toLocaleString("id-ID") : "-",
          totalAtas + totalBawah ? (totalAtas + totalBawah).toLocaleString("id-ID") : "-",
        ]);
        autoTable(doc, {
          startY: cursorY,
          theme: "grid",
          styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
          headStyles: { fillColor: [36, 120, 74] },
          head: [["No.", "Kavling", "Tipe", "Kode Produksi", "Struktur Atas", "Struktur Bawah", "Nominal"]],
          body: allocationRows,
          didParseCell: (data) => {
            if (data.section === "body" && data.row.index === allocationRows.length - 1) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [235, 247, 239];
            }
          },
        });
        cursorY = (doc as any).lastAutoTable.finalY + 28;
      }

      doc.save(`${safeFilename(`Summary Pengajuan - ${title}`)}.pdf`);
    } catch (error: any) {
      toast.error(error?.message || "Gagal membuat Summary Pengajuan.");
    } finally {
      setSummaryExportingId(null);
    }
  };

  const getKpiPresentation = (item: any) => {
    const detail = kpiBySignature.get(item.id);
    if (!detail) return { label: "KPI belum tersedia", tone: "muted", detail: "-" };
    const remaining = detail.sla_minutes - detail.elapsed_minutes;
    if (detail.is_late) return { label: "Terlambat", tone: "late", detail: formatMinutes(Math.abs(remaining)) + " melewati SLA" };
    if (remaining <= 30) return { label: "Mendekati SLA", tone: "due", detail: formatMinutes(remaining) + " tersisa" };
    return { label: "Dalam SLA", tone: "safe", detail: formatMinutes(remaining) + " tersisa" };
  };

  const getRecommendationRequirement = (item: any) => {
    const input = item.surat_registrasi?.form_input_data || {};
    if (input.requires_recommendation !== true) return null;
    const config = item.surat_registrasi?.policy_snapshot?.recommendation_config || {};
    return {
      config,
      requiredBeforeStep: Math.max(1, Number(config.required_before_step || 3)),
    };
  };

  const getRecommendationDocuments = () =>
    (linkedDocuments as LinkedSuratDocument[]).filter(document =>
      document.link_type === "recommendation" && document.status === "active"
    );

  const isRecommendationDone = () =>
    getRecommendationDocuments().some(document =>
      ["DONE", "SELESAI", "COMPLETED"].includes(String(document.child_status || "").toUpperCase())
    );

  const getApprovalBlockers = (item: any) => {
    const blockers: string[] = [];
    if (!isVerificationTask(item) && isWaitingVerification(item)) {
      blockers.push(`Menunggu pemeriksaan ${getVerifierDisplayName(item)}`);
    }
    const recommendation = getRecommendationRequirement(item);
    if (
      recommendation &&
      Number(item.step_order || 0) >= recommendation.requiredBeforeStep &&
      !isRecommendationDone()
    ) {
      blockers.push("Dokumen rekomendasi belum selesai");
    }
    if (shouldInputUnitAllocation(item)) {
      const selected = getSelectedAllocationUnits(item);
      if (!getAllocationProject(item)?.code) blockers.push("Pilih proyek unit");
      if (selected.length < 1) blockers.push("Pilih minimal 1 unit");
      const incomplete = getIncompleteAllocationUnits(item);
      if (incomplete.length) blockers.push("Lengkapi tipe dan kode produksi " + incomplete.length + " unit");
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
              <p className="text-sm font-semibold">Catatan tim pemeriksa</p>
              <Badge
                variant="outline"
                className={approvalBadgeClass(verified ? "verification_done" : "verification_waiting")}
              >
                {verified ? "Sudah diperiksa" : revisionRequested ? "Perlu revisi" : "Menunggu pemeriksaan"}
              </Badge>
            </div>
            {signature.verified_at && (
              <p className="mt-1 text-xs text-muted-foreground">
                Diperiksa oleh {verifier?.full_name || "tim pemeriksa"} pada {new Date(signature.verified_at).toLocaleString("id-ID")}
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

  const handleResolveRevisionWork = async (item: any) => {
    const revision = getActiveRevision(item?.surat_registrasi);
    if (!revision?.event_id) {
      toast.error("Data perbaikan tidak ditemukan.");
      return;
    }
    const note = notes[item.id] || "";
    setProcessingId(item.id);
    try {
      await suratService.resolveProcessRevision(revision.event_id, note);
      toast.success("Perbaikan selesai", {
        description: "Pengajuan dikirim ke pemohon untuk persetujuan kelanjutan proses.",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['surat-inbox'] }),
        queryClient.invalidateQueries({ queryKey: ['surat-inbox-kpi'] }),
        queryClient.invalidateQueries({ queryKey: ['surat-revision-history'] }),
        refetchAttention(),
      ]);
    } catch (error: any) {
      toast.error(error.message || "Gagal menyelesaikan perbaikan.");
    } finally {
      setProcessingId(null);
    }
  };

  const renderRevisionHistory = () => {
    const rows = Array.isArray(revisionHistory) ? revisionHistory : [];
    if (rows.length === 0) return null;
    const targetLabels: Record<string, string> = {
      requester: "Pemohon",
      checker: "Tim pemeriksa",
      signer: "Signer sebelumnya",
      recommendation: "Tim IT / rekomendasi",
    };
    return (
      <section className="sigap-panel border-amber-500/30">
        <div className="mb-3 flex items-center gap-3">
          <RefreshCw className="h-5 w-5 text-amber-600" />
          <div>
            <p className="text-sm font-semibold">Riwayat perbaikan</p>
            <p className="text-xs text-muted-foreground">Mencatat perubahan, alasan, dan pihak yang diminta memperbaiki data.</p>
          </div>
        </div>
        <div className="space-y-2">
          {rows.map((event: any) => (
            <div key={event.id} className="rounded-lg border border-border bg-muted/10 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">
                    {event.actor_name || "User"} mengembalikan ke {targetLabels[event.target_type] || event.target_type}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.created_at ? new Date(event.created_at).toLocaleString("id-ID") : "-"}
                    {event.from_step ? ` · Dari tahap ${event.from_step}` : ""}
                    {event.target_step ? ` · Tujuan tahap ${event.target_step}` : ""}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    event.status === "open" && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                    event.status === "resolved" && approvalBadgeClass("approved"),
                    event.status === "cancelled" && approvalBadgeClass("rejected"),
                  )}
                >
                  {event.status === "open" ? "Menunggu Perbaikan" : event.status === "resolved" ? "Selesai" : "Dibatalkan"}
                </Badge>
              </div>
              <p className="mt-3 whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-sm leading-relaxed">
                {getRevisionDisplayReason(event)}
              </p>
            </div>
          ))}
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
            const rejected = signature.status === "REJECTED";
            const signer = signature.signer_snapshot?.full_name || signature.profiles?.full_name || "Belum ditentukan";
            const label = signature.label_jabatan || signature.signer_snapshot?.job_title || signature.role_name;
            const needsVerification = signature.verification_required === true;
            const verified = signature.verification_status === "verified";
            const verifier = Array.isArray(signature.verifier_snapshot)
              ? signature.verifier_snapshot.find((item: any) => item.user_id === signature.verified_by)
              : null;
            const tone = rejected ? "rejected" : signature.is_signed ? "approved" : active ? "active" : "waiting";
            return <div key={signature.id} className="flex gap-3"><div className="pt-3">{rejected ? <XCircle className="h-5 w-5 text-red-600" /> : signature.is_signed ? <CircleCheck className="h-5 w-5 text-emerald-600" /> : active ? <Clock3 className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5 text-muted-foreground/50" />}</div><div className="min-w-0 flex-1 rounded-lg bg-muted/20 p-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold">{signature.step_order}. {label}</p><Badge variant="outline" className={approvalBadgeClass(tone)}>{rejected ? "Ditolak" : signature.is_signed ? "Selesai" : active ? "Tindakan Anda" : "Menunggu"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{signer}</p>{needsVerification && <div className={cn("mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium", approvalBadgeClass(verified ? "verification_done" : "verification_waiting"))}><ShieldCheck className="h-3.5 w-3.5" />{verified ? "Data sudah diperiksa" : "Menunggu pemeriksaan data"}</div>}{signature.verified_at && <p className="mt-1 text-xs text-muted-foreground">Diperiksa oleh {verifier?.full_name || "tim pemeriksa"} pada {new Date(signature.verified_at).toLocaleString("id-ID")}</p>}{needsVerification && !verified && signature.verification_note && <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">Catatan revisi: {signature.verification_note}</p>}{signature.signed_at && <p className="mt-1 text-xs text-muted-foreground">{new Date(signature.signed_at).toLocaleString("id-ID")}</p>}{signature.catatan && <p className="mt-2 rounded border border-border bg-background p-2 text-xs">{signature.catatan}</p>}</div></div>;
          })}</div></AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  };

  const renderRecommendationPanel = (item: any) => {
    const recommendation = getRecommendationRequirement(item);
    if (!recommendation) return null;

    const docs = getRecommendationDocuments();
    const done = isRecommendationDone();

    return (
      <section className={cn(
        "sigap-panel",
        done ? "border-emerald-500/30" : "border-amber-500/30"
      )}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <FileCheck2 className={cn("h-5 w-5", done ? "text-emerald-600" : "text-amber-600")} />
              <p className="text-sm font-semibold">Rekomendasi aset</p>
              <Badge
                variant="outline"
                className={cn(
                  done && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  !done && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                )}
              >
                {done ? "Selesai" : "Menunggu rekomendasi"}
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Nomor rekomendasi dibuat otomatis setelah pengajuan induk dikonfirmasi. Staff IT menyelesaikannya dari menu Rekomendasi.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {linkedDocumentsLoading && (
            <div className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memuat dokumen rekomendasi...
            </div>
          )}
          {!linkedDocumentsLoading && docs.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
              Belum ada dokumen rekomendasi yang tertaut.
            </div>
          )}
          {docs.map(document => {
            const operationKey = documentOperationKey.pdf(document.child_surat_id, "linked");
            const opening = isOpening(operationKey);

            return (
            <div key={document.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-xs font-semibold text-primary">{document.child_no_surat || "Nomor diproses"}</p>
                <p className="mt-1 truncate text-sm font-semibold">{document.child_judul_surat || "Dokumen rekomendasi"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Status {document.child_status || "-"}
                  {document.child_created_at ? ` · ${new Date(document.child_created_at).toLocaleString("id-ID")}` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={opening || !document.child_surat_id}
                onClick={() => void openPdf(document.child_surat_id, operationKey)}
              >
                {opening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                {opening ? "Menyiapkan PDF" : "Buka"}
              </Button>
            </div>
            );
          })}
        </div>
      </section>
    );
  };

  const renderDocumentsPanel = (item: any) => {
    const surat = item.surat_registrasi;
    const attachments = getAttachments(surat);
    const recommendationFiles = getActiveRecommendationDocuments(linkedDocuments as LinkedSuratDocument[]);
    const documentKey = documentOperationKey.pdf(surat.id, "inbox");
    const documentOpening = isOpening(documentKey);
    return (
      <section className="sigap-panel">
        <div className="mb-3 flex items-center gap-3"><Paperclip className="h-5 w-5 text-primary" /><div><p className="text-sm font-semibold">Dokumen dan lampiran</p><p className="text-xs text-muted-foreground">PDF digunakan untuk pemeriksaan visual bila diperlukan.</p></div></div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Dokumen utama</p>
              <p className="text-xs text-muted-foreground">PDF pengajuan dan tanda tangan terakhir</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={documentOpening || !surat.id}
              onClick={() => void openPdf(surat.id, documentKey)}
            >
              {documentOpening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              {documentOpening ? "Menyiapkan PDF" : "Buka"}
            </Button>
          </div>
          {attachments.map((attachment: any, index: number) => {
            const attachmentKey = documentOperationKey.file(surat.id, String(attachment.id || attachment.file_url || index));
            const attachmentOpening = isOpening(attachmentKey);
            return (
              <div key={attachment.id || attachment.file_url} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{attachment.file_name || "Lampiran " + (index + 1)}</p>
                  <p className="text-xs text-muted-foreground">{[attachment.requirement_label || attachment.stage || "Lampiran", attachment.file_size ? (attachment.file_size / 1024 / 1024).toFixed(2) + " MB" : null].filter(Boolean).join(" · ")}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={attachmentOpening || !attachment.file_url}
                  onClick={() => void openFile(surat.id, attachment.file_url, attachmentKey)}
                >
                  {attachmentOpening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                  {attachmentOpening ? "Membuka" : "Buka"}
                </Button>
              </div>
            );
          })}
          {recommendationFiles.map((document) => {
            const recommendationKey = documentOperationKey.pdf(document.suratId, `recommendation-${document.id}`);
            const recommendationOpening = isOpening(recommendationKey);
            return (
              <div key={document.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{document.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{document.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{document.subtitle}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={recommendationOpening || !document.suratId}
                  onClick={() => void openPdf(document.suratId, recommendationKey)}
                >
                  {recommendationOpening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                  {recommendationOpening ? "Menyiapkan PDF" : "Buka PDF"}
                </Button>
              </div>
            );
          })}
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
            {verificationTask && <Badge variant="outline" className="h-5 border-sky-500/30 bg-sky-500/10 px-1.5 text-[10px] text-sky-700 dark:text-sky-300">Pemeriksaan</Badge>}
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
                      <SelectItem value="verification">Pemeriksaan data</SelectItem>
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
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-primary">{selectedItem.surat_registrasi.no_surat || "Nomor diproses"}</span><Badge variant="outline">Tahap {selectedItem.step_order}</Badge><Badge variant="outline">{selectedItem.label_jabatan || selectedItem.role_name}</Badge>{isVerificationTask(selectedItem) && <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300">Pemeriksaan Data</Badge>}</div><h2 className="mt-2 text-lg font-bold leading-tight sm:text-xl">{selectedItem.surat_registrasi.judul_surat}</h2><p className="mt-1 text-sm text-muted-foreground">Diajukan {new Date(selectedItem.surat_registrasi.created_at).toLocaleString("id-ID")}</p></div>
              {activeKpi && <div className={cn("hidden min-w-36 rounded-lg border p-3 text-right sm:block", activeKpi.tone === "late" && "border-destructive/30 bg-destructive/5", activeKpi.tone === "due" && "border-amber-500/30 bg-amber-500/5", activeKpi.tone === "safe" && "border-emerald-500/30 bg-emerald-500/5")}><p className="text-sm font-semibold">{activeKpi.label}</p><p className="mt-1 text-xs text-muted-foreground">{activeKpi.detail}</p></div>}
            </div>
             <div data-testid="approval-detail-scroll" className="min-h-0 flex-none overflow-visible lg:flex-1 lg:overflow-y-auto lg:overscroll-contain"><div className="w-full space-y-4 p-4 pb-8 sm:p-6">{renderRequestSummary(selectedItem)}{renderRevisionHistory()}{renderApprovalHistory(selectedItem)}{renderUnitAllocationPanel(selectedItem)}{renderRecommendationPanel(selectedItem)}{renderDocumentsPanel(selectedItem)}{renderApprovalAttachmentPanel(selectedItem)}{renderVerificationNotePanel(selectedItem)}<section className="sigap-panel"><div className="mb-3 flex items-center gap-3"><MessageSquare className="h-5 w-5 text-primary" /><div><p className="text-sm font-semibold">{isVerificationTask(selectedItem) ? "Catatan pemeriksaan" : "Catatan persetujuan"}</p><p className="text-xs text-muted-foreground">{isVerificationTask(selectedItem) ? "Opsional. Catatan akan tersimpan pada status pemeriksaan." : "Opsional. Alasan penolakan akan diminta saat menolak."}</p></div></div><Textarea ref={(element) => { noteRefs.current[selectedItem.id] = element; }} placeholder={isVerificationTask(selectedItem) ? "Tambahkan catatan pemeriksaan bila diperlukan" : "Tambahkan catatan untuk tahap berikutnya"} value={notes[selectedItem.id] || ""} onChange={(event) => setNotes((previous) => ({ ...previous, [selectedItem.id]: event.target.value }))} className="min-h-24 resize-y text-sm" /></section></div></div>
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
                  {isVerificationTask(selectedItem) && verificationDraftState[selectedItem.id] && (
                    <p className={cn("mt-1 text-xs text-muted-foreground", verificationDraftState[selectedItem.id] === "error" && "text-destructive")}>
                      {verificationDraftState[selectedItem.id] === "saving" && "Menyimpan otomatis..."}
                      {verificationDraftState[selectedItem.id] === "saved" && "Tersimpan otomatis"}
                      {verificationDraftState[selectedItem.id] === "error" && "Autosave gagal. Periksa koneksi sebelum lanjut."}
                    </p>
                  )}
                </div>
                {isVerificationTask(selectedItem) ? (
                  <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:justify-end">
                    <Button variant="outline" disabled={summaryExportingId === selectedItem.id} onClick={() => void exportApprovalSummary(selectedItem)}>
                      {summaryExportingId === selectedItem.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                      Export Summary
                    </Button>
                    <Button className="shrink-0 bg-sky-600 text-white hover:bg-sky-500 sm:min-w-40" disabled={processingId === selectedItem.id} onClick={() => handleVerify(selectedItem)}>
                      {processingId === selectedItem.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                      Simpan & lanjutkan
                    </Button>
                  </div>
                ) : String(selectedItem.surat_registrasi?.status || "").toUpperCase() === "MENUNGGU_PERBAIKAN" ? (
                  <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:justify-end">
                    <Button variant="outline" disabled={summaryExportingId === selectedItem.id} onClick={() => void exportApprovalSummary(selectedItem)}>
                      {summaryExportingId === selectedItem.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                      Export Summary
                    </Button>
                    <Button className="shrink-0 bg-amber-600 text-white hover:bg-amber-500 sm:min-w-44" disabled={processingId === selectedItem.id} onClick={() => handleResolveRevisionWork(selectedItem)}>
                      {processingId === selectedItem.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Selesaikan perbaikan
                    </Button>
                  </div>
                ) : (
                  <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                    <Button variant="outline" className="col-span-2 sm:col-span-1" disabled={summaryExportingId === selectedItem.id} onClick={() => void exportApprovalSummary(selectedItem)}>
                      {summaryExportingId === selectedItem.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                      Export Summary
                    </Button>
                    <div className="col-span-2 flex min-w-[260px] gap-2">
                      <Select value={revisionTarget} onValueChange={setRevisionTarget}>
                        <SelectTrigger className="h-10 text-xs">
                          <SelectValue placeholder="Kembalikan ke..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="requester">Pemohon</SelectItem>
                          {hasVerifierTargets(selectedItem) && <SelectItem value="checker">Tim pemeriksa</SelectItem>}
                          {Number(selectedItem.step_order || 1) > 1 && <SelectItem value="signer">Signer sebelumnya</SelectItem>}
                          {getRecommendationRequirement(selectedItem) && <SelectItem value="recommendation">Tim IT / rekomendasi</SelectItem>}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" className="shrink-0" disabled={processingId === selectedItem.id} onClick={() => openRevisionDialog(selectedItem)}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Kembalikan
                      </Button>
                    </div>
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
      <Dialog open={Boolean(revisionDialogItem)} onOpenChange={(open) => { if (!open && !processingId) setRevisionDialogItem(null); }}>
        <DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Kembalikan proses untuk perbaikan</DialogTitle>
            <DialogDescription>
              Tandai item yang perlu diubah. Pemohon akan melihat ringkasan perubahan sebelum proses dilanjutkan.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">Perubahan item</p>
                <p className="text-xs text-muted-foreground">Gunakan jika ada item yang dicoret, dikurangi, atau nilainya disetujui berbeda.</p>
              </div>
              {revisionRows.length === 0 ? (
                <div className="space-y-2 rounded-lg border border-dashed border-border p-4">
                  <Label>Catatan perbaikan</Label>
                  <Textarea
                    value={revisionNote}
                    onChange={(event) => setRevisionNote(event.target.value)}
                    placeholder={revisionDialogItem ? getGeneralRevisionPlaceholder(revisionDialogItem) : "Tuliskan data yang perlu diperbaiki."}
                    className="min-h-24"
                  />
                  <p className="text-xs text-muted-foreground">
                    Surat ini belum memiliki item terstruktur, jadi catatan ini dipakai sebagai alasan perbaikan.
                  </p>
                </div>
              ) : revisionRows.map((row) => {
                const isUnitRevision = revisionDialogItem ? getRevisionContext(revisionDialogItem) === "unit" : false;
                return (
                <div key={row.index} className="rounded-lg border border-border bg-muted/10 p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-muted-foreground">Item {row.index + 1}</p>
                      <p className={cn("mt-1 text-sm font-semibold", row.action === "reject" && "line-through text-muted-foreground")}>{row.nama_barang}</p>
                      {row.action === "keep" && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Item ini akan tetap mengikuti data pengajuan awal.
                        </p>
                      )}
                    </div>
                    <div className="w-full lg:w-48">
                      <Label className="text-xs">Keputusan</Label>
                      {isUnitRevision ? (
                        <div className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium">
                          {getRevisionDecisionLabel(row.action)}
                        </div>
                      ) : (
                        <Select value={row.action} onValueChange={(value: "keep" | "reject" | "adjust") => updateRevisionRow(row.index, { action: value })}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="keep">Tidak berubah</SelectItem>
                            <SelectItem value="adjust">Disetujui sebagian</SelectItem>
                            <SelectItem value="reject">Tidak disetujui</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                  {(isUnitRevision || row.action !== "keep") && (
                    <div className={cn("mt-3 grid gap-3", row.action === "adjust" ? "md:grid-cols-3" : isUnitRevision ? "md:grid-cols-2" : "md:grid-cols-1")}>
                      {(row.action === "adjust" || isUnitRevision) && (
                        <>
                          <div>
                            <Label className="text-xs">{revisionDialogItem ? getRevisionRequestedLabel(revisionDialogItem) : "Nilai diajukan"}</Label>
                            <div className="mt-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                              {row.nilai_diajukan || (isUnitRevision ? "Jumlah unit tidak tercatat" : "Tidak tercatat sebagai nominal")}
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">{revisionDialogItem ? getRevisionApprovedLabel(revisionDialogItem) : "Nilai disetujui"}</Label>
                            <Input
                              value={row.nilai_disetujui}
                              onChange={(event) => revisionDialogItem
                                ? updateApprovedRevisionValue(revisionDialogItem, row, event.target.value)
                                : updateRevisionRow(row.index, { nilai_disetujui: formatRupiahInput(event.target.value) })}
                              placeholder={revisionDialogItem ? getApprovedValuePlaceholder(revisionDialogItem, row) : "Isi nilai yang disetujui"}
                              className="mt-1"
                            />
                          </div>
                        </>
                      )}
                      <div>
                        <Label className="text-xs">{row.action === "keep" ? "Instruksi perbaikan" : "Alasan perubahan"}</Label>
                        <Input
                          value={row.alasan}
                          onChange={(event) => updateRevisionRow(row.index, { alasan: event.target.value })}
                          placeholder={row.action === "keep" ? "Contoh: Kirim ulang ke tim pemeriksa untuk memperbarui data/lampiran." : revisionDialogItem ? getRevisionReasonPlaceholder(revisionDialogItem, row) : "Wajib jika item berubah"}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
              })}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" disabled={processingId === revisionDialogItem?.id} onClick={() => setRevisionDialogItem(null)}>
              Batal
            </Button>
            <Button type="button" disabled={!revisionDialogItem || processingId === revisionDialogItem?.id} onClick={() => revisionDialogItem && handleReturnForRevision(revisionDialogItem)}>
              {processingId === revisionDialogItem?.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Kembalikan proses
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
