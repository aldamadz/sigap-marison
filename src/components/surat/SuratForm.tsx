import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Hash, ArrowDown, Loader2, Briefcase, Calendar as DatePickerIcon,
  Check, ChevronDown, ChevronLeft, ChevronRight, Copy, RefreshCcw,
  ShieldCheck, AlertTriangle, Archive, Home, X, Plus, Image as ImageIcon, Lock,
  Link as LinkIcon, UploadCloud, Trash2
} from "lucide-react";
import {
  type SuratRegistrationDraft,
  type SuratRegistrationDraftFile,
} from "@/services/surat.service";
import { suratRegistrationApi } from "@/features/surat/registration/services/surat-registration-api";
import { suratRecommendationApi } from "@/features/surat/recommendation/services/surat-recommendation-api";
import { buildSignerAssignments } from "@/features/surat/registration/lib/signer-assignments";
import { useSuratAutosave } from "@/features/surat/registration/lib/use-surat-autosave";
import { useSuratDraftLifecycle } from "@/features/surat/registration/lib/use-surat-draft-lifecycle";
import { useLinkedRecommendationContext } from "@/features/surat/registration/lib/use-linked-recommendation-context";
import { useActiveDraftLifecycle } from "@/features/surat/registration/lib/use-active-draft-lifecycle";
import { buildAutoTitle } from "@/features/surat/registration/lib/surat-title-formatters";
import {
  WIZARD_STEP_BERKAS,
  WIZARD_STEPS,
  canGoToStep,
  type WizardStep,
} from "@/features/surat/registration/lib/surat-wizard-steps";
import { useSuratWizardStepper } from "@/features/surat/registration/lib/use-surat-wizard-stepper";
import { validateStep1ForNumberGeneration } from "@/features/surat/registration/lib/surat-wizard-validation";
import { validateSuratSubmit } from "@/features/surat/registration/lib/surat-submit-validation";
import { buildInitialAttachmentMeta, buildRegistrationSubmitPayload } from "@/features/surat/registration/lib/surat-submit-command";
import { executeExternalRevisionSubmit, getExternalRevisionSuccessDescription } from "@/features/surat/registration/services/external-revision-submit";
import { executeRecommendationPostSubmit } from "@/features/surat/recommendation/services/recommendation-post-submit";
import { supabase } from "@/lib/supabase";
import { reconcileSignerAssignments } from "@/lib/signer-assignment-reconciliation";
import { selectInitialRegistrationDraftAttachments } from "@/lib/registration-draft-attachment-classification";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { canUseAssetRecommendation } from "@/lib/asset-recommendation-policy";
import { useAppDialog } from "@/components/app/AppDialogProvider";
import {
  RegistrationSummaryDialog,
  type RegistrationSummaryData,
  type RegistrationSummaryField,
} from "@/components/surat/RegistrationSummaryDialog";
import { formatSummaryValue, humanizeInputKey } from "@/components/surat/request-summary";
import { RecommendationParentSummary } from "@/components/surat/RecommendationParentSummary";
import { RecommendationMultiDetailEditor } from "@/components/surat/RecommendationMultiDetailEditor";
import {
  buildRecommendationMultiDetail,
  recommendationMultiDetailErrors,
  syncRecommendationMultiDetailInput,
} from "@/features/surat/registration/lib/recommendation-multi-detail-builder";
import type { RecommendationAttachment, RecommendationMultiDetail } from "@sigap/shared";
import { NonAsetItemEditor, getNonAsetItemColumnKeys } from "@/components/surat/NonAsetItemEditor";
import { NonUnitRequestEditor } from "@/components/surat/NonUnitRequestEditor";
import { NominalInput } from "@/components/surat/NominalInput";
import { FundSubmissionEditor } from "@/components/surat/FundSubmissionEditor";
import {
  getFundSubmissionAmount,
  normalizeFundSubmissionItems,
  validateFundSubmissionItems,
} from "@/components/surat/fund-submission";
import { Checkbox } from "@/components/ui/checkbox";
import { formatRupiahZero } from "@/lib/rupiah";
import {
  normalizeNonUnitOption,
  resolveNonUnitProjectMapping,
  validateNonUnitRows,
  type NonUnitExternalOption,
  type NonUnitRequestRow,
} from "@/components/surat/non-unit-request";
import {
  canDepartmentRequestUnit,
  clearRecommendationInput,
  clearUnitInput,
  getExternalInputFields,
  getFullRoles,
  getInputSchema,
  getManualInputFields,
  getScalarFieldValue,
  getWorkflowCategories,
  hasUnitRequestFields,
  isMultiSelectField,
  isProfileLocationReady,
  isUnitExternalField,
  isUnitField,
  normalizeTableRows,
} from "@/components/surat/form/surat-form-schema";
import {
  formatDatePickerDisplay,
  formatFileSize,
  getDefaultRequestPlace as getDefaultRequestPlaceForOffice,
  getDepartmentShortLabel,
  getOfficeShortLabel,
  getShortPersonName,
  normalizeNameSearch,
  parseDateInputValue,
  toDateInputValue,
  toReadableName,
} from "@/components/surat/form/surat-form-formatters";
import type {
  AttachmentRequirement,
  AttachmentUploadState,
  CandidateScope,
  CurrentProfile,
  ExternalOption,
  FormInputData,
  LinkedDocumentContext,
  MasterData,
  MasterRecord,
  ProjectOption,
  ProjectRaw,
  RecommendationItemAttachment,
  RequestCategory,
  SignerAssignment,
  SuratFormProps,
  TableRow,
  TemplateField,
  UsageDetailRecord,
} from "@/components/surat/form/surat-form-types";


const RECOMMENDATION_TEMPLATE_NAME = "Rekomendasi Peremajaan Alat";
const RECOMMENDATION_ITEMS_KEY = "recommendation_items";
const RECOMMENDATION_MULTI_DETAIL_KEY = "recommendation_multi_detail";
const RECOMMENDATION_CHECK_MARK = "✓";
const RECOMMENDATION_ACTIONS = [
  { value: "service", label: "Service" },
  { value: "ganti", label: "Ganti Komponen" },
  { value: "beli_baru", label: "Beli Baru" },
  { value: "tidak_direkomendasikan", label: "Tidak Direkomendasikan" },
] as const;
type RecommendationAction = (typeof RECOMMENDATION_ACTIONS)[number]["value"];
type ExternalRevisionContext = {
  eventId: string;
  generation?: number;
  category?: RequestCategory;
  reason?: string;
};

export function SuratForm({ onSuccess, isLoading, setIsLoading, setJudulForDisplay }: SuratFormProps) {
  const { toast } = useToast();
  const appDialog = useAppDialog();
  const [searchParams, setSearchParams] = useSearchParams();

  // Linked-recommendation controller (Pass E). Owns `linkedDocumentContext`,
  // the parent-summary fetch, the URL→state re-sync, and the
  // `parentRecommendationItems` memo. `setLinkedDocumentContext` is
  // exposed so the draft-restore effect (Pass D) and the form-reset path
  // can still write it directly.
  const {
    linkedDocumentContext,
    setLinkedDocumentContext,
    recommendationParentSummary,
    recommendationParentLoading,
    recommendationParentError,
    parentRecommendationItems,
    loadRecommendationParentSummary,
    isRecommendationFlow,
  } = useLinkedRecommendationContext({ searchParams });

  // Active-draft id lifecycle (Pass F). Owns the `activeDraftId` +
  // `activeDraftReservationId` pair that used to be inline. Wrappers
  // (`markDraftCreated` / `markDraftRestored` / `markDraftVoided` /
  // `clearActiveDraftId`) preserve the original setter sequences
  // without reordering or adding side effects.
  const {
    activeDraftId,
    activeDraftReservationId,
    setActiveDraftId,
    setActiveDraftReservationId,
    clearActiveDraftId,
    markDraftCreated,
    markDraftRestored,
    markDraftVoided,
  } = useActiveDraftLifecycle();

  // ── STATE ──────────────────────────────────────────────────────────────────
  const [master, setMaster] = useState<MasterData>({ entities: [], depts: [], offices: [], types: [], users: [], projects: [] });
  const [usageDetails, setUsageDetails]           = useState<UsageDetailRecord[]>([]);
  const [selectedUsage, setSelectedUsage]         = useState<UsageDetailRecord | null>(null);
  const [selectedFormId, setSelectedFormId]       = useState("");
  const [generatedNoSurat, setGeneratedNoSurat]   = useState<string | null>(null);
  const [externalRevision, setExternalRevision] = useState<ExternalRevisionContext | null>(null);
  const [isProcessingNumber, setIsProcessingNumber] = useState(false);
  const [isResettingNumber, setIsResettingNumber] = useState(false);
  const [isCopied, setIsCopied]                   = useState(false);
  const [fundWithoutProject, setFundWithoutProject] = useState(false);
  const [draftModalOpen, setDraftModalOpen]       = useState(false);
  const [openSignerIndex, setOpenSignerIndex]     = useState<number | null>(null);
  const [datePickerOpen, setDatePickerOpen]       = useState<Record<string, boolean>>({});
  const [signerSearch, setSignerSearch]           = useState<Record<number, string>>({});
  const [lampiranFiles, setLampiranFiles]         = useState<File[]>([]);
  const [initialAttachmentFiles, setInitialAttachmentFiles] = useState<Record<string, File[]>>({});
  const [draftAttachments, setDraftAttachments]   = useState<SuratRegistrationDraftFile[]>([]);
  const [uploadingRequirement, setUploadingRequirement] = useState<string | null>(null);
  const [attachmentUploadStates, setAttachmentUploadStates] = useState<Record<string, AttachmentUploadState>>({});
  const [uploadingRecommendationAttachment, setUploadingRecommendationAttachment] = useState<string | null>(null);
  const [registrationSummaryOpen, setRegistrationSummaryOpen] = useState(false);
  const [externalOptions, setExternalOptions]     = useState<Record<string, ExternalOption[]>>({});
  const [externalLoading, setExternalLoading]     = useState<Record<string, boolean>>({});
  const [externalErrors, setExternalErrors]       = useState<Record<string, string | null>>({});
  const [externalProjects, setExternalProjects]   = useState<ProjectOption[]>([]);
  const [nonUnitOptions, setNonUnitOptions]       = useState<NonUnitExternalOption[]>([]);
  const [nonUnitLoading, setNonUnitLoading]       = useState(false);
  const [nonUnitError, setNonUnitError]           = useState<string | null>(null);
  const [nonUnitReloadKey, setNonUnitReloadKey]   = useState(0);
  const [projectsLoading, setProjectsLoading]     = useState(false);
  const [projectsError, setProjectsError]         = useState<string | null>(null);
  const [projectUnitAvailability, setProjectUnitAvailability] = useState<{
    loading: boolean;
    count: number | null;
    error: string | null;
  }>({ loading: false, count: null, error: null });
  const [currentProfile, setCurrentProfile]       = useState<CurrentProfile | null>(null);
  const [activeRecommendationItem, setActiveRecommendationItem] = useState(0);
  const [requesterDepartmentId, setRequesterDepartmentId] = useState("");
  const [formData, setFormData] = useState({
    entity_id: "", dept_id: "", letter_type_id: "",
    office_id: "", project_id: "", judul_surat: "",
    penggunaan_id: "", is_aset: false,
    form_usage_id: "",
    request_place: "", request_date: toDateInputValue(new Date()),
    form_input_data: {} as FormInputData
  });
  const [manualTitleOverride, setManualTitleOverride] = useState(false);
  const [manualPlaceOverride, setManualPlaceOverride] = useState(false);
  const [signers, setSigners] = useState<SignerAssignment[]>([]);
  const submitLockRef = useRef(false);

  const getFormFieldValue = (key: string) => formData.form_input_data[key];
  const getDisplayFieldValue = (key: string) => getScalarFieldValue(getFormFieldValue(key));

  // ── HELPERS ────────────────────────────────────────────────────────────────
  const canCurrentDepartmentRequestUnit = (item: UsageDetailRecord) =>
    canDepartmentRequestUnit(item, requesterDepartmentId);


  const getInitialAttachmentRequirements = () =>
    selectedUsage?.form_usage_attachment_requirements?.filter(rule => rule.stage_order === 0) || [];

  const getMissingInitialAttachmentLabels = () =>
    getInitialAttachmentRequirements()
      .filter(rule => {
        const minimum = rule.is_required ? Math.max(1, Number(rule.min_files || 1)) : 0;
        const localCount = initialAttachmentFiles[rule.requirement_key]?.length || 0;
        const persistedCount = draftAttachments.filter(
          attachment => attachment.requirement_key === rule.requirement_key
        ).length;
        return localCount + persistedCount < minimum;
      })
      .map(rule => rule.label || rule.requirement_key);

  const getRequestCategory = (): RequestCategory | null => {
    const category = formData.form_input_data.request_category;
    return category === "asset" || category === "unit" || category === "non_unit" || category === "non_asset"
      ? category
      : null;
  };

  const getRequestMode = () => getRequestCategory() === "unit" ? "unit" : "barang";
  const isUnitMode = getRequestCategory() === "unit";


  const applyRecommendationChoice = (required: boolean) => {
    setFormData(prev => ({
      ...prev,
      form_input_data: {
        ...prev.form_input_data,
        requires_recommendation: required,
        recommendation_template_name: RECOMMENDATION_TEMPLATE_NAME,
        recommendation_attachment_note: required
          ? "Pemohon membutuhkan lampiran rekomendasi untuk permohonan aset ini."
          : "Pemohon tidak membutuhkan lampiran rekomendasi untuk permohonan aset ini.",
      },
    }));
  };

  const setRequestCategory = (category: RequestCategory) => {
    if (category === "unit" && !canRequesterChooseUnit) {
      toast({
        variant: "destructive",
        title: "Unit Tidak Diizinkan",
        description: requesterDepartmentId
          ? "Belum ada matrix Unit yang mengizinkan departemen akun Anda pada scope kantor ini."
          : "Departemen akun Anda belum ditentukan.",
      });
      return;
    }
    setFormData(prev => {
      const baseInput = category === "unit"
        ? {
            ...prev.form_input_data,
            request_category: category,
            request_mode: "unit",
          }
        : clearUnitInput({
            ...prev.form_input_data,
            request_category: category,
            request_mode: "barang",
          });
      const nextInput = category === "asset" && canRequesterUseRecommendation
        ? {
            ...baseInput,
            requires_recommendation: typeof baseInput.requires_recommendation === "boolean"
              ? baseInput.requires_recommendation
              : false,
            recommendation_template_name: RECOMMENDATION_TEMPLATE_NAME,
            recommendation_attachment_note: typeof baseInput.recommendation_attachment_note === "string"
              ? baseInput.recommendation_attachment_note
              : "Pemohon tidak membutuhkan lampiran rekomendasi untuk permohonan aset ini.",
          }
        : clearRecommendationInput(baseInput);
      if (category !== "non_asset") {
        delete nextInput.fund_type;
        delete nextInput.fund_amount;
        delete nextInput.fund_without_project;
      }
      return {
        ...prev,
        project_id: prev.form_input_data.request_category === category ? prev.project_id : "",
        is_aset: category === "asset",
        form_input_data: nextInput,
      };
    });
    if (category !== "non_asset") setFundWithoutProject(false);
    if (category === "unit") {
      setFormData(prev => {
        const nextInput = { ...prev.form_input_data };
        delete nextInput.items;
        return { ...prev, form_input_data: nextInput };
      });
    }
    setSelectedUsage(null);
    setSelectedFormId("");
    setSigners([]);
    setFormData(prev => ({ ...prev, penggunaan_id: "", form_usage_id: "" }));
  };

  const getRequestCombinationLabel = () => {
    const category = getRequestCategory();
    if (category === "asset") return "Aset";
    if (category === "unit") return "Unit";
    if (category === "non_asset") return "Non Aset";
    if (category === "non_unit") return "Non Unit";
    return "Belum dipilih";
  };

  const setInputValue = (key: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      form_input_data: { ...prev.form_input_data, [key]: value },
    }));
  };

  const requestExternalOptions = async (sourceKey: string, variables: Record<string, unknown> = {}) => {
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

  const getTableRows = (key: string) => normalizeTableRows(formData.form_input_data[key]);

  const recommendationMultiDetail = useMemo(() => {
    if (linkedDocumentContext?.type !== "recommendation" || parentRecommendationItems.length === 0) return null;
    return buildRecommendationMultiDetail(parentRecommendationItems, formData.form_input_data);
  }, [
    linkedDocumentContext?.type,
    parentRecommendationItems,
    formData.form_input_data[RECOMMENDATION_MULTI_DETAIL_KEY],
    formData.form_input_data[RECOMMENDATION_ITEMS_KEY],
  ]);

  useEffect(() => {
    if (!recommendationMultiDetail) return;
    setFormData((previous) => {
      const nextInput = syncRecommendationMultiDetailInput(previous.form_input_data, recommendationMultiDetail);
      if (
        JSON.stringify(previous.form_input_data[RECOMMENDATION_MULTI_DETAIL_KEY]) === JSON.stringify(nextInput[RECOMMENDATION_MULTI_DETAIL_KEY])
        && JSON.stringify(previous.form_input_data[RECOMMENDATION_ITEMS_KEY]) === JSON.stringify(nextInput[RECOMMENDATION_ITEMS_KEY])
      ) return previous;
      return {
        ...previous,
        form_input_data: nextInput,
      };
    });
  }, [recommendationMultiDetail]);

  const setRecommendationMultiDetail = (model: RecommendationMultiDetail) => {
    setFormData((previous) => ({
      ...previous,
      form_input_data: syncRecommendationMultiDetailInput(previous.form_input_data, model),
    }));
  };

  const uploadRecommendationDetailAttachments = async (
    parentId: string,
    detailId: string,
    files: File[],
    source: "upload" | "paste" | "drop",
  ) => {
    const validFiles = files.filter((file) => file.type.startsWith("image/") && file.size <= 5 * 1024 * 1024);
    if (validFiles.length !== files.length) {
      toast({
        variant: "destructive",
        title: "Sebagian gambar tidak dapat digunakan",
        description: "Gunakan PNG, JPG, JPEG, atau WebP dengan ukuran maksimal 5 MB per gambar.",
      });
    }
    if (validFiles.length === 0) return;
    if (!activeDraftId || !recommendationMultiDetail) {
      toast({ variant: "destructive", title: "Draft belum siap", description: "Muat ulang rekomendasi lalu coba lagi." });
      return;
    }

    const uploadKey = `${parentId}:${detailId}`;
    setUploadingRecommendationAttachment(uploadKey);
    try {
      const uploaded = await suratRegistrationApi.uploadRegistrationDraftFiles(activeDraftId, validFiles, {
        key: `recommendation_detail_${detailId}`,
        label: "Lampiran gambar detail rekomendasi",
      });
      const currentDetail = recommendationMultiDetail.items
        .find((parent) => parent.id === parentId)?.details.find((detail) => detail.id === detailId);
      const startOrder = currentDetail?.attachments.length || 0;
      const nextAttachments: RecommendationAttachment[] = uploaded.map((file, index) => ({
        id: file.id,
        order: startOrder + index,
        caption: file.file_name,
        source,
        storage_path: file.file_url,
        metadata: {
          draft_file_id: file.id,
          file_name: file.file_name,
          file_type: file.file_type,
          file_size: file.file_size,
        },
      }));
      setDraftAttachments((previous) => [
        ...previous.filter((item) => !uploaded.some((file) => file.id === item.id)),
        ...uploaded,
      ]);
      setRecommendationMultiDetail({
        ...recommendationMultiDetail,
        items: recommendationMultiDetail.items.map((parent) => parent.id !== parentId ? parent : ({
          ...parent,
          details: parent.details.map((detail) => detail.id !== detailId ? detail : ({
            ...detail,
            attachments: [...detail.attachments, ...nextAttachments],
          })),
        })),
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Lampiran gagal disimpan",
        description: error instanceof Error ? error.message : "Coba unggah ulang gambar.",
      });
    } finally {
      setUploadingRecommendationAttachment(null);
    }
  };

  const deleteRecommendationDetailAttachment = async (
    parentId: string,
    detailId: string,
    attachment: RecommendationAttachment,
  ) => {
    if (!recommendationMultiDetail) return;
    const draftFileId = String(attachment.metadata?.draft_file_id || attachment.id || "").trim();
    try {
      if (draftFileId) await suratRegistrationApi.deleteRegistrationDraftFile(draftFileId);
      setDraftAttachments((previous) => previous.filter((file) => file.id !== draftFileId));
      setRecommendationMultiDetail({
        ...recommendationMultiDetail,
        items: recommendationMultiDetail.items.map((parent) => parent.id !== parentId ? parent : ({
          ...parent,
          details: parent.details.map((detail) => detail.id !== detailId ? detail : ({
            ...detail,
            attachments: detail.attachments
              .filter((item) => item.id !== attachment.id)
              .map((item, order) => ({ ...item, order })),
          })),
        })),
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Lampiran gagal dihapus",
        description: error instanceof Error ? error.message : "Coba hapus ulang lampiran.",
      });
    }
  };

  const deleteRecommendationDetail = async (parentId: string, detail: RecommendationMultiDetail["items"][number]["details"][number]) => {
    if (!recommendationMultiDetail) return;
    try {
      const draftFileIds = detail.attachments
        .map((attachment) => String(attachment.metadata?.draft_file_id || attachment.id || "").trim())
        .filter(Boolean);
      await Promise.all(draftFileIds.map((id) => suratRegistrationApi.deleteRegistrationDraftFile(id)));
      setDraftAttachments((previous) => previous.filter((file) => !draftFileIds.includes(file.id)));
      setRecommendationMultiDetail({
        ...recommendationMultiDetail,
        items: recommendationMultiDetail.items.map((parent) => parent.id !== parentId ? parent : ({
          ...parent,
          details: parent.details
            .filter((item) => item.id !== detail.id)
            .map((item, order) => ({ ...item, order })),
        })),
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Detail gagal dihapus",
        description: error instanceof Error ? error.message : "Coba hapus ulang detail.",
      });
    }
  };

  const setTableRows = (key: string, rows: TableRow[]) => {
    setInputValue(key, rows);
  };

  const updateTableCell = (key: string, rowIndex: number, columnKey: string, value: unknown) => {
    setFormData(previous => {
      const rows = normalizeTableRows(previous.form_input_data[key]);
      rows[rowIndex] = { ...(rows[rowIndex] || {}), [columnKey]: value };
      return {
        ...previous,
        form_input_data: { ...previous.form_input_data, [key]: rows },
      };
    });
  };

  const updateTableRow = (key: string, rowIndex: number, patch: TableRow) => {
    setFormData(previous => {
      const rows = normalizeTableRows(previous.form_input_data[key]);
      rows[rowIndex] = { ...(rows[rowIndex] || {}), ...patch };
      return {
        ...previous,
        form_input_data: { ...previous.form_input_data, [key]: rows },
      };
    });
  };

  const addTableRow = (key: string) => {
    setTableRows(key, [...getTableRows(key), {}]);
  };

  const removeTableRow = (key: string, rowIndex: number) => {
    const rows = getTableRows(key).filter((_, index) => index !== rowIndex);
    setTableRows(key, rows.length > 0 ? rows : [{}]);
  };

  const getRecommendationAttachment = (row: TableRow): RecommendationItemAttachment | null => {
    const attachment = row.recommendation_attachment;
    if (attachment && typeof attachment === "object" && !Array.isArray(attachment)) {
      return attachment as RecommendationItemAttachment;
    }
    const flatUrl = String(row.recommendation_attachment_url || "").trim();
    const flatDraftFileId = String(row.recommendation_attachment_draft_file_id || "").trim();
    const flatFileName = String(row.recommendation_attachment_file_name || "").trim();
    if (!flatUrl && !flatDraftFileId && !flatFileName) return null;
    return {
      draft_file_id: flatDraftFileId || undefined,
      file_url: flatUrl || undefined,
      file_name: flatFileName || undefined,
      file_type: String(row.recommendation_attachment_file_type || "").trim() || null,
      file_size: Number(row.recommendation_attachment_file_size || 0) || null,
      uploaded_at: String(row.recommendation_attachment_uploaded_at || "").trim() || undefined,
      source: String(row.recommendation_attachment_source || "").trim() as RecommendationItemAttachment["source"],
    };
  };

  const hasMeaningfulRecommendationRowValue = (row: TableRow) =>
    Object.entries(row ?? {}).some(([key, value]) => {
      if (key === "recommendation_attachment") return false;
      if (key.startsWith("recommendation_attachment_")) return Boolean(String(value ?? "").trim());
      if (value && typeof value === "object") return false;
      return Boolean(String(value ?? "").trim());
    });


  const uploadRecommendationItemAttachment = async (
    fieldKey: string,
    rowIndex: number,
    file: File,
    source: "upload" | "paste" | "drop" = "upload"
  ) => {
    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Lampiran harus gambar",
        description: "Gunakan file PNG, JPG, JPEG, atau hasil paste screenshot.",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Gambar terlalu besar",
        description: "Ukuran maksimal lampiran gambar rekomendasi adalah 5 MB.",
      });
      return;
    }
    if (!activeDraftId) {
      toast({
        variant: "destructive",
        title: "Draft belum siap",
        description: "Buka rekomendasi dari menu Rekomendasi agar lampiran bisa tersimpan ke draft.",
      });
      return;
    }

    const row = getTableRows(fieldKey)[rowIndex] || {};
    const previousAttachment = getRecommendationAttachment(row);
    const uploadKey = `${fieldKey}-${rowIndex}`;
    setUploadingRecommendationAttachment(uploadKey);
    try {
      const uploaded = await suratRegistrationApi.uploadRegistrationDraftFiles(activeDraftId, [file], {
        key: `recommendation_item_${rowIndex + 1}`,
        label: `Lampiran gambar rekomendasi item ${rowIndex + 1}`,
      });
      const attachment = uploaded[0];
      if (!attachment) throw new Error("Lampiran gagal tersimpan.");

      if (previousAttachment?.draft_file_id && previousAttachment.draft_file_id !== attachment.id) {
        await suratRegistrationApi.deleteRegistrationDraftFile(previousAttachment.draft_file_id).catch(() => undefined);
      }
      setDraftAttachments(previous => [
        ...previous.filter(item => item.id !== attachment.id && item.id !== previousAttachment?.draft_file_id),
        attachment,
      ]);
      updateTableRow(fieldKey, rowIndex, {
        recommendation_attachment: null,
        recommendation_attachment_draft_file_id: attachment.id,
        recommendation_attachment_url: attachment.file_url,
        recommendation_attachment_file_name: attachment.file_name,
        recommendation_attachment_file_type: attachment.file_type,
        recommendation_attachment_file_size: attachment.file_size,
        recommendation_attachment_uploaded_at: new Date().toISOString(),
        recommendation_attachment_source: source,
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Lampiran gagal disimpan",
        description: error instanceof Error ? error.message : "Coba unggah ulang gambar.",
      });
    } finally {
      setUploadingRecommendationAttachment(null);
    }
  };

  const clearRecommendationItemAttachment = async (fieldKey: string, rowIndex: number) => {
    const row = getTableRows(fieldKey)[rowIndex] || {};
    const attachment = getRecommendationAttachment(row);
    if (!attachment) return;
    try {
      if (attachment.draft_file_id) {
        await suratRegistrationApi.deleteRegistrationDraftFile(attachment.draft_file_id);
        setDraftAttachments(previous => previous.filter(item => item.id !== attachment.draft_file_id));
      }
      updateTableRow(fieldKey, rowIndex, {
        recommendation_attachment: null,
        recommendation_attachment_draft_file_id: "",
        recommendation_attachment_url: "",
        recommendation_attachment_file_name: "",
        recommendation_attachment_file_type: "",
        recommendation_attachment_file_size: "",
        recommendation_attachment_uploaded_at: "",
        recommendation_attachment_source: "",
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Lampiran gagal dihapus",
        description: error instanceof Error ? error.message : "Coba hapus ulang lampiran.",
      });
    }
  };

  const handleRecommendationPaste = (event: React.ClipboardEvent<HTMLDivElement>, fieldKey: string, rowIndex: number) => {
    const imageFile = Array.from(event.clipboardData.files || []).find(file => file.type.startsWith("image/"));
    if (!imageFile) return;
    event.preventDefault();
    void uploadRecommendationItemAttachment(fieldKey, rowIndex, imageFile, "paste");
  };

  const handleRecommendationDrop = (event: React.DragEvent<HTMLDivElement>, fieldKey: string, rowIndex: number) => {
    const imageFile = Array.from(event.dataTransfer.files || []).find(file => file.type.startsWith("image/"));
    if (!imageFile) return;
    event.preventDefault();
    void uploadRecommendationItemAttachment(fieldKey, rowIndex, imageFile, "drop");
  };

  const getRecommendationAction = (row: TableRow): RecommendationAction | "" => {
    const explicit = String(row.recommendation_action ?? "").trim();
    if (RECOMMENDATION_ACTIONS.some(action => action.value === explicit)) return explicit as RecommendationAction;
    if (String(row.service ?? "").trim()) return "service";
    if (String(row.ganti ?? "").trim()) return "ganti";
    if (String(row.beli_baru ?? "").trim()) return "beli_baru";
    if (String(row.tidak_direkomendasikan ?? "").trim()) return "tidak_direkomendasikan";
    return "";
  };

  const getRecommendationActionLabel = (value: string) =>
    RECOMMENDATION_ACTIONS.find(action => action.value === value)?.label || "Belum dipilih";

  const getRecommendationReason = (row: TableRow) =>
    String(row.keterangan ?? row.alasan ?? row.reason ?? "").trim();

  const isRecommendationNotRecommended = (row: TableRow) =>
    getRecommendationAction(row) === "tidak_direkomendasikan";

  const isRecommendationRowComplete = (row: TableRow) => {
    const action = getRecommendationAction(row);
    if (!action) return false;
    if (action === "tidak_direkomendasikan") return getRecommendationReason(row).length >= 5;
    return Boolean(
      String(row.nama_barang ?? "").trim()
      && String(row.lokasi_pic_user_id ?? row.lokasi_pic ?? "").trim()
      && String(row.uraian ?? "").trim()
      && getRecommendationAttachment(row)?.file_url
    );
  };

  const isRecommendationItemsComplete = (field: TemplateField) => {
    if (recommendationMultiDetail) {
      return recommendationMultiDetail.items.length > 0
        && recommendationMultiDetailErrors(recommendationMultiDetail).length === 0;
    }
    const rows = getTableRows(field.key).filter((row: TableRow) =>
      hasMeaningfulRecommendationRowValue(row)
    );
    if (field.required !== false && rows.length === 0) return false;
    return rows.every((row: TableRow) => isRecommendationRowComplete(row));
  };

  const isTableFieldComplete = (field: TemplateField) => {
    if (field.key === RECOMMENDATION_ITEMS_KEY) return isRecommendationItemsComplete(field);
    if (field.key === "items" && getRequestCategory() === "non_unit" && !shouldUseDefaultBranchProject) {
      return validateNonUnitRows(getFormFieldValue(field.key)).length === 0;
    }
    const rows = getTableRows(field.key).filter((row: TableRow) =>
      Object.values(row ?? {}).some((value) => String(value ?? "").trim())
    );
    if (field.required !== false && rows.length === 0) return false;
    return rows.every((row: TableRow) =>
      (field.table_config?.columns ?? [])
        .filter((column: { required?: boolean }) => column.required !== false)
        .every((column: { key: string }) => String(row?.[column.key] ?? "").trim())
    );
  };

  const isManualFieldComplete = (field: TemplateField) => {
    if (!isUnitMode && isUnitField(field)) return true;
    if (hasUnitRequestFields(selectedUsage)) {
      if (field.key === "requested_unit_count") return true;
      if (isUnitMode && (field.key === "items" || field.key === "unit")) return true;
      if (!isUnitMode && field.key === "unit") return true;
    }
    if (field.type === "table") return isTableFieldComplete(field);
    const value = getFormFieldValue(field.key);
    if (field.type === "external_select" && isMultiSelectField(field)) {
      return field.required === false || (Array.isArray(value) && value.length > 0);
    }
    return field.required === false || !!getScalarFieldValue(value).trim();
  };

  const officePusat     = useMemo(() => master.offices?.find((o: MasterRecord) => o.kedudukan === "Pusat"), [master.offices]);
  const isPusatSelected = useMemo(() => formData.office_id === officePusat?.id, [formData.office_id, officePusat]);
  const isCurrentUserAdmin = useMemo(
    () => ["admin", "super_admin"].includes(String(currentProfile?.role || "").toLowerCase()),
    [currentProfile?.role]
  );

  // Draft lifecycle (activeDrafts list, draftToRestore, draftLoading,
  // refreshActiveDrafts) is owned by useSuratDraftLifecycle. The
  // setters are exposed so the hydrate effect and the submit-confirm
  // path can still mutate them locally.
  const {
    activeDrafts,
    draftToRestore,
    draftLoading,
    refreshActiveDrafts,
    setDraftToRestore,
    finishSubmittedDraft,
  } = useSuratDraftLifecycle({
    currentProfile,
    isCurrentUserAdmin,
    searchParams,
    setSearchParams,
    toast,
  });

  const myDrafts = useMemo(
    () => activeDrafts.filter(draft => draft.created_by === currentProfile?.id),
    [activeDrafts, currentProfile?.id]
  );
  const otherDrafts = useMemo(
    () => isCurrentUserAdmin ? activeDrafts.filter(draft => draft.created_by !== currentProfile?.id) : [],
    [activeDrafts, currentProfile?.id, isCurrentUserAdmin]
  );
  const lockProfileLocation = Boolean(currentProfile) && !isCurrentUserAdmin;
  const profileOfficeId = currentProfile?.office_id || "";
  const profileDepartmentId = currentProfile?.department_id || requesterDepartmentId;
  const profileLocationReady = isProfileLocationReady(currentProfile, formData, isCurrentUserAdmin);
  const canRequesterUseRecommendation = useMemo(() => {
    if (linkedDocumentContext?.type === "recommendation") return false;
    const departmentId = formData.dept_id || requesterDepartmentId;
    const department = master.depts.find((dept: MasterRecord) => dept.id === departmentId);
    return canUseAssetRecommendation(department);
  }, [formData.dept_id, requesterDepartmentId, master.depts, linkedDocumentContext]);

  const filteredUsage = useMemo(() => {
    const category = getRequestCategory();
    if (!category) return [];
    return usageDetails.filter((item) => {
      if (
        linkedDocumentContext?.type === "recommendation" &&
        linkedDocumentContext.usageId === item.id
      ) {
        // The linked task is the authority for its form/usage pairing.
        return true;
      }
      if (item.scope_type && item.scope_type !== "all") {
        if (item.scope_type === "pusat" && !isPusatSelected) return false;
        if (item.scope_type === "cabang" && isPusatSelected) return false;
      } else if (item.is_cabang !== undefined && item.is_cabang !== !isPusatSelected) return false;
      if (!getWorkflowCategories(item).includes(category)) return false;
      if (!canDepartmentRequestUnit(item, formData.dept_id || requesterDepartmentId)) return false;
      return true;
    });
  }, [usageDetails, isPusatSelected, requesterDepartmentId, formData.dept_id, formData.form_input_data.request_category, linkedDocumentContext]);

  const availableForms = useMemo(() => {
    const seen = new Set<string>();
    return filteredUsage.flatMap(item => {
      const formId = item.form_id || item.master_forms?.id;
      if (!formId || seen.has(formId)) return [];
      seen.add(formId);
      return [{ id: formId, name: item.master_forms?.nama_form || "Form tanpa nama" }];
    });
  }, [filteredUsage]);

  const usagesForSelectedForm = useMemo(
    () => filteredUsage.filter(item => (item.form_id || item.master_forms?.id) === selectedFormId),
    [filteredUsage, selectedFormId]
  );
  const selectedFormName = useMemo(() => {
    const selectedForm = availableForms.find(form => form.id === selectedFormId);
    return selectedForm?.name || selectedUsage?.master_forms?.nama_form || "Form dokumen";
  }, [availableForms, selectedFormId, selectedUsage?.master_forms?.nama_form]);

  const canRequesterChooseUnit = useMemo(
    () => usageDetails.some(item =>
      getWorkflowCategories(item).includes("unit") &&
      (item.scope_type === "all" ||
        (item.scope_type === "pusat" && isPusatSelected) ||
        (item.scope_type === "cabang" && !isPusatSelected) ||
        (!item.scope_type && item.is_cabang === !isPusatSelected)) &&
      canDepartmentRequestUnit(item, formData.dept_id || requesterDepartmentId)
    ),
    [usageDetails, isPusatSelected, requesterDepartmentId, formData.dept_id]
  );

  const filteredDepts = useMemo(() => {
    if (!master.depts) return [];
    return master.depts.filter((d: MasterRecord) => {
      const isCabangDept = d.name.toLowerCase().includes("(cabang)");
      return isPusatSelected ? !isCabangDept : isCabangDept;
    }).sort((a: MasterRecord, b: MasterRecord) => (a.dept_index || 0) - (b.dept_index || 0));
  }, [master.depts, isPusatSelected]);

  const departmentSelectOptions = useMemo(() => {
    if (!lockProfileLocation) return filteredDepts;
    return master.depts.filter((dept: MasterRecord) => dept.id === formData.dept_id);
  }, [filteredDepts, lockProfileLocation, master.depts, formData.dept_id]);

  const filteredProjects = useMemo(() => {
    if (isPusatSelected || !master.projects) return [];
    return master.projects.filter((p: MasterRecord) => p.office_id === formData.office_id);
  }, [master.projects, formData.office_id, isPusatSelected]);

  const selectedProject = useMemo(
    () => master.projects?.find((p: MasterRecord) => p.id === formData.project_id) ?? null,
    [master.projects, formData.project_id]
  );

  const selectedLetterType = useMemo(
    () => master.types?.find((type: MasterRecord) => type.id === formData.letter_type_id) ?? null,
    [master.types, formData.letter_type_id]
  );

  const selectedOffice = useMemo(
    () => master.offices?.find((office: MasterRecord) => office.id === formData.office_id) ?? null,
    [master.offices, formData.office_id]
  );

  const selectedDepartment = useMemo(
    () => master.depts?.find((dept: MasterRecord) => dept.id === (formData.dept_id || requesterDepartmentId)) ?? null,
    [master.depts, formData.dept_id, requesterDepartmentId]
  );

  const getDefaultRequestPlace = (office?: MasterRecord | null) =>
    getDefaultRequestPlaceForOffice(office, selectedDepartment);

  useEffect(() => {
    if (!generatedNoSurat || manualTitleOverride) return;
    const nextTitle = buildAutoTitle({
      category: getRequestCategory(),
      formInputData: formData.form_input_data,
      selectedOffice,
      selectedDepartment,
      linkedDocumentContext,
      recommendationParentSummary,
      getRecommendationAction,
    });
    if (!nextTitle || nextTitle === formData.judul_surat) return;
    setFormData(previous => ({ ...previous, judul_surat: nextTitle }));
    setJudulForDisplay(nextTitle);
  }, [
    generatedNoSurat,
    manualTitleOverride,
    formData.form_input_data,
    formData.office_id,
    formData.dept_id,
    selectedOffice?.id,
    selectedDepartment?.id,
    selectedUsage?.id,
    recommendationParentSummary,
    linkedDocumentContext,
    formData.judul_surat,
    setJudulForDisplay,
  ]);

  useEffect(() => {
    if (!generatedNoSurat || !manualTitleOverride || formData.judul_surat.trim()) return;
    setManualTitleOverride(false);
  }, [generatedNoSurat, manualTitleOverride, formData.judul_surat]);

  useEffect(() => {
    if (!generatedNoSurat || manualPlaceOverride) return;
    const nextPlace = getDefaultRequestPlace(selectedOffice);
    if (!nextPlace || nextPlace === formData.request_place) return;
    setFormData(previous => ({ ...previous, request_place: nextPlace }));
  }, [generatedNoSurat, manualPlaceOverride, selectedOffice?.id, selectedDepartment?.id, formData.request_place]);

  useEffect(() => {
    if (!generatedNoSurat || !manualPlaceOverride || formData.request_place.trim()) return;
    setManualPlaceOverride(false);
  }, [generatedNoSurat, manualPlaceOverride, formData.request_place]);

  const departmentLetterTypes = useMemo(() => {
    const selectedDeptId = formData.dept_id || requesterDepartmentId;
    if (!selectedDeptId) return [];
    return (master.types || [])
      .filter((type: MasterRecord) => {
        const departmentIds = (type.departmentIds || type.dept_ids || []) as string[];
        return departmentIds.includes(selectedDeptId);
      })
      .sort((a: MasterRecord, b: MasterRecord) => {
        const aIndexes = a.departmentSortIndexes || a.dept_sort_indexes || {};
        const bIndexes = b.departmentSortIndexes || b.dept_sort_indexes || {};
        return (aIndexes[selectedDeptId] ?? 999) - (bIndexes[selectedDeptId] ?? 999)
          || String(a.name || "").localeCompare(String(b.name || ""), "id");
      });
  }, [master.types, formData.dept_id, requesterDepartmentId]);

  const isPermohonanType = useMemo(() => {
    const name = String(selectedLetterType?.name || selectedLetterType?.code || "").toLowerCase();
    return name.includes("permohonan") || selectedLetterType?.code === "MH";
  }, [selectedLetterType]);

  const selectedProjectCode = useMemo(() => {
    const code = String(selectedProject?.code ?? "").trim();
    if (code) return code;

    const name = String(selectedProject?.name ?? "").trim();
    const prefix = name.match(/^([A-Za-z0-9]+)\s*-/)?.[1];
    return prefix ? prefix.toUpperCase() : "";
  }, [selectedProject]);

  const isBranchOfficeSelected = Boolean(formData.office_id && !isPusatSelected);
  const branchHasRegisteredProjects = isBranchOfficeSelected && filteredProjects.length > 0;
  const isFundMode = getRequestCategory() === "non_asset";
  const isNonUnitMode = getRequestCategory() === "non_unit";
  const requiresMarisonProject = isNonUnitMode || isFundMode;
  const useRegistrationWizard = !isRecommendationFlow;
  const {
    activeWizardStep,
    showSectionBerkas,
    showSectionSigners,
    isIdentityActive,
    isContentActive,
    isSignerActive,
    setCurrentStep: setWizardStep,
    goToStep: setWizardStepDirect,
    goToNextStep: goToNextWizardStep,
    goToPreviousStep: goToPreviousWizardStep,
    resetWizardStep,
  } = useSuratWizardStepper(
    useRegistrationWizard,
    Boolean(generatedNoSurat),
    signers.length > 0,
  );
  const shouldUseDefaultBranchProject = isBranchOfficeSelected && !branchHasRegisteredProjects
    && getRequestCategory() !== "unit" && !isFundMode;
  const nonUnitProjectCandidates = useMemo(
    () => isPusatSelected ? (master.projects || []) : filteredProjects,
    [filteredProjects, isPusatSelected, master.projects],
  );
  const readyNonUnitProjects = useMemo(
    () => nonUnitProjectCandidates.filter((project) =>
      resolveNonUnitProjectMapping(project, master.offices).ready
    ),
    [master.offices, nonUnitProjectCandidates],
  );
  const unavailableNonUnitProjectCount = nonUnitProjectCandidates.length - readyNonUnitProjects.length;
  const projectSelectionOptions = requiresMarisonProject ? readyNonUnitProjects : filteredProjects;
  const selectedNonUnitProjectMapping = useMemo(
    () => resolveNonUnitProjectMapping(selectedProject, master.offices),
    [master.offices, selectedProject],
  );
  const selectedMarisonProjectId = selectedNonUnitProjectMapping.projectId || 0;
  const selectedMarisonBranchId = selectedNonUnitProjectMapping.branchId || 0;
  const isMarisonProjectReady = requiresMarisonProject && selectedNonUnitProjectMapping.ready;
  const shouldShowProjectSelector = Boolean(
    formData.office_id && (!isPusatSelected || requiresMarisonProject)
  );
  const hasRegisteredProjectCandidates = requiresMarisonProject
    ? nonUnitProjectCandidates.length > 0
    : branchHasRegisteredProjects;

  const effectiveFormInputData = useMemo<FormInputData>(() => {
    const input = { ...formData.form_input_data };
    if (isFundMode) {
      const fundItems = normalizeFundSubmissionItems(input.items);
      input.items = fundItems;
      input.fund_amount = getFundSubmissionAmount(fundItems);
    } else {
      delete input.fund_amount;
    }
    if (requiresMarisonProject && isMarisonProjectReady && selectedProject) {
      const snapshotCode = selectedNonUnitProjectMapping.code || "";
      const snapshotName = selectedNonUnitProjectMapping.name || "";
      const snapshotBranchName = selectedNonUnitProjectMapping.branchName || "";
      input.requested_project = {
        id: selectedMarisonProjectId,
        value: String(selectedMarisonProjectId),
        external_id: selectedMarisonProjectId,
        code: snapshotCode,
        name: snapshotName,
        label: snapshotName || snapshotCode,
        branch_id: selectedMarisonBranchId,
        branch: {
          id: selectedMarisonBranchId,
          name: snapshotBranchName,
        },
        raw: {
          id: selectedMarisonProjectId,
          project_id: selectedMarisonProjectId,
          code: snapshotCode,
          name: snapshotName,
          branch_id: selectedMarisonBranchId,
          branch: {
            id: selectedMarisonBranchId,
            name: snapshotBranchName,
          },
        },
      };
    } else if (requiresMarisonProject) {
      delete input.requested_project;
    }
    if (shouldUseDefaultBranchProject) {
      return {
        ...input,
        project_code: "000",
        project_name: "Tanpa proyek",
        project_is_default: true,
      };
    }
    if (input.project_is_default === true) {
      delete input.project_code;
      delete input.project_name;
      delete input.project_is_default;
    }
    return input;
  }, [
    formData.form_input_data,
    requiresMarisonProject,
    isMarisonProjectReady,
    selectedMarisonProjectId,
    selectedMarisonBranchId,
    selectedProject,
    selectedNonUnitProjectMapping,
    shouldUseDefaultBranchProject,
    isFundMode,
  ]);

  const effectiveFormData = useMemo(() => ({
    ...formData,
    project_id: shouldUseDefaultBranchProject ? "" : formData.project_id,
    form_input_data: effectiveFormInputData,
  }), [formData, shouldUseDefaultBranchProject, effectiveFormInputData]);

  // Autosave controller — owns draftSaveState + the 900ms debounce timer.
  // Hook is invoked here so the live `effectiveFormData` reference is what
  // gets persisted, never an empty placeholder.
  const [draftSaveState, setDraftSaveState] = useSuratAutosave({
    activeDraftId,
    generatedNoSurat,
    draftToRestore,
    selectedUsage,
    linkedDocumentContext,
    effectiveFormData,
    selectedFormId,
    signers,
  });

  const externalVariables = useMemo<Record<string, unknown>>(() => ({
    project_id: requiresMarisonProject ? selectedMarisonProjectId || "" : effectiveFormData.project_id,
    project_code: shouldUseDefaultBranchProject ? "000" : selectedProjectCode,
    project_name: shouldUseDefaultBranchProject ? "Tanpa proyek" : selectedProject?.name ?? "",
    office_id: formData.office_id,
    entity_id: formData.entity_id,
    dept_id: formData.dept_id,
    ...effectiveFormInputData,
  }), [effectiveFormData.project_id, formData.office_id, formData.entity_id, formData.dept_id, effectiveFormInputData, selectedProject, selectedProjectCode, shouldUseDefaultBranchProject, requiresMarisonProject, selectedMarisonProjectId]);

  const isDirty = useMemo(
    () => !!generatedNoSurat || formData.judul_surat.length > 0 || Object.keys(formData.form_input_data).length > 0,
    [generatedNoSurat, formData.judul_surat, formData.form_input_data]
  );

  const getSelectedSignerName = (userId: string) =>
    master.users?.find((user: MasterRecord) => user.id === userId)?.full_name || "";

  const getRecommendationPicLabel = (userId: string) => {
    const user = master.users.find((item) => item.id === userId);
    if (!user) return "";
    const office = master.offices.find((item) => item.id === user.office_id);
    const department = master.depts.find((item) => item.id === user.department_id);
    const isHeadOffice = String(office?.kedudukan || "").toLowerCase() === "pusat";
    const location = isHeadOffice ? getDepartmentShortLabel(department) : getOfficeShortLabel(office);
    return `${location} / ${getShortPersonName(user.full_name)}`;
  };

  const getRecommendationUserMeta = (user: MasterRecord) => {
    const office = master.offices.find((item) => item.id === user.office_id);
    const department = master.depts.find((item) => item.id === user.department_id);
    const isHeadOffice = String(office?.kedudukan || "").toLowerCase() === "pusat";
    return [
      user.job_title,
      isHeadOffice ? department?.name : getOfficeShortLabel(office),
    ].filter(Boolean).join(" - ");
  };

  const isHeadOfficeUser = (user: MasterRecord) => {
    const office = (master.offices || []).find((item) => item.id === user.office_id);
    return String(office?.kedudukan || "").toLowerCase() === "pusat";
  };

  const isRequesterHeadOffice = () => {
    const office = (master.offices || []).find((item) => item.id === formData.office_id);
    return String(office?.kedudukan || "").toLowerCase() === "pusat";
  };

  const isSignerAllowedByScope = (user: MasterRecord, signer: SignerAssignment) => {
    const scope = signer.candidate_scope || "manual";
    if (scope === "request_office") return Boolean(formData.office_id && user.office_id === formData.office_id);
    if (scope === "request_department") return Boolean((formData.dept_id || requesterDepartmentId) && user.department_id === (formData.dept_id || requesterDepartmentId));
    if (scope === "branch_office_or_request_department") {
      if (isRequesterHeadOffice()) {
        const departmentId = formData.dept_id || requesterDepartmentId;
        return Boolean(departmentId && user.department_id === departmentId && isHeadOfficeUser(user));
      }
      return Boolean(formData.office_id && user.office_id === formData.office_id);
    }
    if (scope === "head_office") return isHeadOfficeUser(user);
    return true;
  };

  const getEligibleSignerUsersForSigner = (signer?: SignerAssignment) => {
    if (!signer) return [];
    const eligibleIds = signer.eligible_user_ids || [];
    return eligibleIds.length > 0
      ? (master.users || []).filter(user => eligibleIds.includes(user.id) && isSignerAllowedByScope(user, signer))
      : signer.form_usage_step_id
        ? []
        : (master.users || []).filter(user => isSignerAllowedByScope(user, signer));
  };

  const getFilteredSignerUsers = (index: number) => {
    const tokens = normalizeNameSearch(signerSearch[index] || "").split(" ").filter(Boolean);
    const signer = signers[index];
    const eligibleUsers = getEligibleSignerUsersForSigner(signer);
    if (tokens.length === 0) return eligibleUsers;

    return eligibleUsers.filter((u: MasterRecord) => {
      const haystack = normalizeNameSearch(u.full_name || "");
      return tokens.every(token => haystack.includes(token));
    });
  };

  // ── EFFECTS ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const shouldWarn = isDirty && (!activeDraftId || draftSaveState !== "saved");
    const h = (e: BeforeUnloadEvent) => { if (shouldWarn) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [isDirty, activeDraftId, draftSaveState]);

  useEffect(() => {
    suratRegistrationApi.getMasterData().then(data => {
      setMaster(data);
      const p = data.offices?.find((o: MasterRecord) => o.kedudukan === "Pusat");
      if (p) setFormData(prev => ({ ...prev, office_id: prev.office_id || p.id }));
    }).catch(() => toast({ variant: "destructive", title: "Gagal memuat data master" }));
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser()
      .then(async ({ data: { user } }) => {
        if (!user) return;
        const { data, error } = await supabase
          .from("profiles")
          .select("id, role, department_id, office_id")
          .eq("id", user.id)
          .single();
        if (error) throw error;
        if (!cancelled) {
          const departmentId = data?.department_id || "";
          const officeId = data?.office_id || "";
          const isAdmin = ["admin", "super_admin"].includes(String(data?.role || "").toLowerCase());
          setCurrentProfile(data as CurrentProfile);
          setRequesterDepartmentId(departmentId);
          setFormData(prev => ({
            ...prev,
            office_id: isAdmin ? prev.office_id : officeId,
            dept_id: isAdmin ? (prev.dept_id || departmentId) : departmentId,
          }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "Profil Tidak Lengkap",
            description: "Departemen akun gagal dimuat. Pengajuan Unit tidak tersedia.",
          });
        }
      });
    return () => { cancelled = true; };
  }, [toast]);

  useEffect(() => {
    if (!formData.office_id || signers.length === 0 || master.users.length === 0) return;
    setSigners(prev => {
      let changed = false;
      const next = prev.map((signer) => {
        const eligibleUsers = getEligibleSignerUsersForSigner(signer);
        if (!signer.user_id && eligibleUsers.length === 1) {
          changed = true;
          return { ...signer, user_id: eligibleUsers[0].id };
        }
        if (!signer.user_id) return signer;
        if (!eligibleUsers.some(user => user.id === signer.user_id)) {
          changed = true;
          return { ...signer, user_id: "" };
        }
        return signer;
      });
      return changed ? next : prev;
    });
  }, [formData.office_id, formData.dept_id, requesterDepartmentId, master.users, signers]);

  const loadUsageDetails = useCallback(async () => {
    const { data, error } = await supabase.from("form_usages")
      .select(`
        id, name, form_id, request_category, scope_type, recommendation_config, external_revision_policy,
        master_forms(id, nama_form, nomor_form, department_id, input_schema),
        form_usage_departments(department_id),
        form_usage_steps(
          id, step_order, role_name, label, action_type, candidate_scope, signer_department_id,
          form_usage_step_users(user_id),
          form_usage_step_verifiers(user_id)
        ),
        form_usage_attachment_requirements(*)
      `)
      .eq("status", "active")
      .order("sort_order", { ascending: true });

    if (error) {
      toast({ variant: "destructive", title: "Gagal memuat penggunaan", description: error.message });
      return;
    }

    let nextUsageDetails: UsageDetailRecord[];
    if ((data || []).length > 0) {
      nextUsageDetails = (data || []).map((item: any) => ({
        ...item,
        workflow_allowed_departments: item.form_usage_departments || [],
        request_categories: [item.request_category],
        is_cabang: item.scope_type === "cabang",
        ttd_config: [...(item.form_usage_steps || [])]
          .sort((a, b) => a.step_order - b.step_order)
          .map(step => ({
            form_usage_step_id: step.id,
            roleName: step.role_name,
            labelJabatan: step.label,
            action_type: step.action_type,
            candidate_scope: step.candidate_scope || "manual",
            signer_department_id: step.signer_department_id,
            eligible_user_ids: (step.form_usage_step_users || []).map((candidate: { user_id: string }) => candidate.user_id),
            verifier_user_ids: (step.form_usage_step_verifiers || []).map((candidate: { user_id: string }) => candidate.user_id),
            requires_unit_allocation: step.action_type === "unit_allocation",
          })),
      }));
    } else {
      const { data: legacyData, error: legacyError } = await supabase
        .from("master_penggunaan_detail")
        .select(`
          *,
          master_forms!fk_master_forms(id, nama_form, nomor_form, department_id, input_schema),
          workflow_allowed_departments(department_id)
        `)
        .order("created_at", { ascending: false });
      if (legacyError) {
        toast({ variant: "destructive", title: "Gagal memuat fallback matrix", description: legacyError.message });
        return;
      }
      nextUsageDetails = legacyData || [];
    }
    setUsageDetails(nextUsageDetails);
    setSelectedUsage((current) => {
      if (!current?.id) return current;
      return nextUsageDetails.find((item) => item.id === current.id) || current;
    });
  }, [toast]);

  useEffect(() => {
    loadUsageDetails();
    const channel = supabase.channel("surat-form-configuration-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "master_forms" }, loadUsageDetails)
      .on("postgres_changes", { event: "*", schema: "public", table: "form_usages" }, loadUsageDetails)
      .on("postgres_changes", { event: "*", schema: "public", table: "form_usage_departments" }, loadUsageDetails)
      .on("postgres_changes", { event: "*", schema: "public", table: "form_usage_steps" }, loadUsageDetails)
      .on("postgres_changes", { event: "*", schema: "public", table: "form_usage_step_users" }, loadUsageDetails)
      .on("postgres_changes", { event: "*", schema: "public", table: "form_usage_attachment_requirements" }, loadUsageDetails)
      .on("postgres_changes", { event: "*", schema: "public", table: "master_penggunaan_detail" }, loadUsageDetails)
      .on("postgres_changes", { event: "*", schema: "public", table: "workflow_allowed_departments" }, loadUsageDetails)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadUsageDetails]);

  useEffect(() => {
    if (!draftToRestore || usageDetails.length === 0) return;
    const payload = draftToRestore.payload || {};
    const restoredFormData = payload.formData || {};
    const restoredInput = restoredFormData.form_input_data || {};
    const usageId = String(payload.selectedUsageId || restoredFormData.form_usage_id || restoredFormData.penggunaan_id || "");
    const usage = usageDetails.find(item => item.id === usageId) || null;
    const restoredLinkedContext = payload.linkedDocumentContext as LinkedDocumentContext | undefined;
    const restoredExternalRevision = payload.externalRevision as ExternalRevisionContext | undefined;
    if (restoredLinkedContext?.type === "recommendation" && restoredLinkedContext.parentSuratId) {
      setLinkedDocumentContext(restoredLinkedContext);
    }

    setFormData(previous => ({
      ...previous,
      ...restoredFormData,
      is_aset: restoredLinkedContext?.type === "recommendation" ? true : restoredFormData.is_aset,
      form_input_data: restoredLinkedContext?.type === "recommendation"
        ? {
            ...(restoredFormData.form_input_data || {}),
            request_category: "asset",
            request_mode: "barang",
          }
        : restoredFormData.form_input_data || {},
    }));
    setFundWithoutProject(
      restoredInput.fund_without_project === true
        || (restoredInput.request_category === "non_asset"
          && !restoredFormData.project_id
          && Boolean(draftToRestore.no_surat)),
    );
    setSelectedFormId(String(payload.selectedFormId || usage?.form_id || usage?.master_forms?.id || ""));
    setSelectedUsage(usage);
    const persistedSigners = Array.isArray(draftToRestore.signer_assignments)
      ? draftToRestore.signer_assignments
      : [];
    const configuredSigners = usage ? buildSignerAssignments(usage) : [];
    setSigners(configuredSigners.length > 0
      ? reconcileSignerAssignments(configuredSigners, persistedSigners)
      : persistedSigners);
    setDraftAttachments(draftToRestore.surat_registration_draft_files || []);
    setExternalRevision(restoredExternalRevision?.eventId ? restoredExternalRevision : null);
    setInitialAttachmentFiles({});
    setLampiranFiles([]);
    setGeneratedNoSurat(draftToRestore.no_surat);
    setWizardStep(WIZARD_STEP_BERKAS);
    markDraftRestored(draftToRestore);
    setJudulForDisplay(String(restoredFormData.judul_surat || ""));
    setDraftSaveState("saved");
    setDraftToRestore(null);

    window.requestAnimationFrame(() => {
      document.getElementById("surat-registration-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [draftToRestore, usageDetails, setJudulForDisplay]);

  useEffect(() => {
    if (!activeDraftId || !selectedUsage) return;
    const configuredSigners = buildSignerAssignments(selectedUsage);
    if (configuredSigners.length === 0) return;

    setSigners((current) => {
      const reconciled = reconcileSignerAssignments(configuredSigners, current);
      return JSON.stringify(reconciled) === JSON.stringify(current) ? current : reconciled;
    });
  }, [activeDraftId, selectedUsage]);

  useEffect(() => {
    if (!generatedNoSurat) {
      setSelectedUsage(null);
      setSelectedFormId("");
      setFormData(prev => ({ ...prev, penggunaan_id: "", form_usage_id: "" }));
      setSigners([]);
    }
  }, [isPusatSelected, generatedNoSurat]);

  useEffect(() => {
    // Setelah nomor terdaftar, konfigurasi workflow yang berubah tidak boleh
    // memutus tautan usage/draft — penanda tangan yang sudah diisi harus aman.
    if (!selectedUsage || generatedNoSurat) return;
    if (
      linkedDocumentContext?.type === "recommendation" &&
      linkedDocumentContext.usageId === selectedUsage.id
    ) return;
    const category = getRequestCategory();
    if (!category || !getWorkflowCategories(selectedUsage).includes(category)) {
      setSelectedUsage(null);
      setSigners([]);
    }
  }, [formData.dept_id, selectedUsage, formData.form_input_data.request_category, linkedDocumentContext, generatedNoSurat]);

  useEffect(() => {
    if (getRequestCategory() !== "asset" || canRequesterUseRecommendation) return;
    if (formData.form_input_data.requires_recommendation === undefined) return;
    setFormData(previous => ({
      ...previous,
      form_input_data: clearRecommendationInput(previous.form_input_data),
    }));
  }, [canRequesterUseRecommendation, formData.form_input_data.request_category, formData.form_input_data.requires_recommendation]);

  useEffect(() => {
    const fields = getExternalInputFields(selectedUsage);
    if (fields.length === 0) return;

    let cancelled = false;
    fields.forEach(async (field: TemplateField) => {
      const sourceKey = String(field.external_source_key || field.externalSourceKey || "");
      const dependencyKey = String(field.external_dependency_key || field.externalDependencyKey || "");
      const dependencyValue = dependencyKey ? externalVariables[dependencyKey] : true;
      if (isUnitExternalField(field) && !isUnitMode) {
        setExternalOptions(prev => ({ ...prev, [field.key]: [] }));
        setExternalErrors(prev => ({ ...prev, [field.key]: null }));
        setExternalLoading(prev => ({ ...prev, [field.key]: false }));
        return;
      }

      if (!sourceKey || !dependencyValue) {
        setExternalOptions(prev => ({ ...prev, [field.key]: [] }));
        setExternalErrors(prev => ({
          ...prev,
          [field.key]: isUnitExternalField(field) ? null : dependencyKey ? `${field.label} menunggu ${dependencyKey}.` : "Data source belum diset.",
        }));
        setExternalLoading(prev => ({ ...prev, [field.key]: false }));
        return;
      }

      setExternalLoading(prev => ({ ...prev, [field.key]: true }));
      setExternalErrors(prev => ({ ...prev, [field.key]: null }));
      try {
        const options = await requestExternalOptions(sourceKey, externalVariables);
        if (cancelled) return;
        setExternalOptions(prev => ({ ...prev, [field.key]: options }));
        const currentValue = getFormFieldValue(field.key) as { value?: string } | Array<{ value?: string }> | undefined;
        if (isMultiSelectField(field)) {
          const selected = Array.isArray(currentValue) ? currentValue : [];
          const filtered = selected.filter((item) => options.some((option) => option.value === item?.value));
          if (selected.length !== filtered.length) setInputValue(field.key, filtered);
        } else if (currentValue && !Array.isArray(currentValue) && currentValue.value && !options.some((option) => option.value === currentValue.value)) {
          setInputValue(field.key, undefined);
        }
      } catch (error: unknown) {
        if (cancelled) return;
        setExternalOptions(prev => ({ ...prev, [field.key]: [] }));
        const message = error instanceof Error ? error.message : "Gagal mengambil data external.";
        setExternalErrors(prev => ({ ...prev, [field.key]: message }));
      } finally {
        if (!cancelled) setExternalLoading(prev => ({ ...prev, [field.key]: false }));
      }
    });

    return () => { cancelled = true; };
  }, [selectedUsage, externalVariables, isUnitMode]);

  useEffect(() => {
    if (!isNonUnitMode || !selectedUsage || !generatedNoSurat) {
      setNonUnitOptions([]);
      setNonUnitError(null);
      setNonUnitLoading(false);
      return;
    }
    if (!isMarisonProjectReady) {
      setNonUnitOptions([]);
      setNonUnitError(null);
      setNonUnitLoading(false);
      return;
    }

    let cancelled = false;
    setNonUnitLoading(true);
    setNonUnitError(null);
    requestExternalOptions("marison_non_units_by_project", {
      project_id: selectedMarisonProjectId,
    })
      .then((options: ExternalOption[]) => {
        if (cancelled) return;
        const normalized = options
          .map((option) => normalizeNonUnitOption(option))
          .filter((option): option is NonUnitExternalOption => Boolean(option));
        setNonUnitOptions(normalized);
        if (normalized.length === 0) {
          setNonUnitError("Belum ada jenis pekerjaan Non Unit untuk proyek ini.");
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setNonUnitOptions([]);
        setNonUnitError(error instanceof Error ? error.message : "Gagal mengambil jenis pekerjaan Non Unit.");
      })
      .finally(() => {
        if (!cancelled) setNonUnitLoading(false);
      });
    return () => { cancelled = true; };
  }, [isNonUnitMode, isMarisonProjectReady, selectedMarisonProjectId, nonUnitReloadKey, selectedUsage?.id, generatedNoSurat]);

  useEffect(() => {
    if (getRequestCategory() !== "unit") return;
    if (externalProjects.length > 0) return;
    let cancelled = false;
    setProjectsLoading(true);
    setProjectsError(null);
    requestExternalOptions("marison_projects")
      .then((options) => { if (!cancelled) setExternalProjects(options); })
      .catch((error: unknown) => {
        if (!cancelled) {
          setExternalProjects([]);
          setProjectsError(error instanceof Error ? error.message : "Gagal mengambil daftar proyek.");
        }
      })
      .finally(() => { if (!cancelled) setProjectsLoading(false); });
    return () => { cancelled = true; };
  }, [formData.form_input_data.request_category, externalProjects.length]);

  useEffect(() => {
    if (getRequestCategory() !== "unit") {
      setProjectUnitAvailability({ loading: false, count: null, error: null });
      return;
    }
    const requestedProject = formData.form_input_data.requested_project as { id?: string; code?: string } | undefined;
    const projectId = String(requestedProject?.id || "").trim();
    if (!projectId) {
      setProjectUnitAvailability({ loading: false, count: null, error: null });
      return;
    }

    let cancelled = false;
    setProjectUnitAvailability({ loading: true, count: null, error: null });
    requestExternalOptions("marison_units_by_project", {
      project_id: projectId,
      requested_project: requestedProject,
    })
      .then((options) => {
        if (!cancelled) {
          setProjectUnitAvailability({ loading: false, count: options.length, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setProjectUnitAvailability({
            loading: false,
            count: null,
            error: error instanceof Error ? error.message : "Jumlah unit tersedia belum termuat.",
          });
        }
      });

    return () => { cancelled = true; };
  }, [formData.form_input_data.request_category, formData.form_input_data.requested_project]);

  // ── HANDLERS ───────────────────────────────────────────────────────────────
  const handleProjectChange = (projectId: string) => {
    const proj = master.projects?.find((p: MasterRecord) => p.id === projectId);
    setFundWithoutProject(false);
    setFormData(prev => ({ ...prev, project_id: projectId, entity_id: proj?.entity_id || prev.entity_id }));
  };

  const handleLetterTypeChange = (letterTypeId: string) => {
    setFormData(prev => ({ ...prev, letter_type_id: letterTypeId }));
  };

  const applySelectedUsage = (detail: UsageDetailRecord) => {
    const isNewUsage = Array.isArray(detail.form_usage_steps);
    setSelectedUsage(detail);
    setFormData(prev => {
      return {
        ...prev,
        penggunaan_id: isNewUsage ? "" : detail.id,
        form_usage_id: isNewUsage ? detail.id : "",
      };
    });
    const configuredSigners = buildSignerAssignments(detail);
    if (configuredSigners.length > 0) {
      setSigners(configuredSigners);
    } else {
      toast({ variant: "destructive", title: "Format Alur Salah" });
    }
  };

  const handleUsageChange = (val: string) => {
    const detail = usageDetails.find(u => u.id === val);
    if (!detail) return;
    applySelectedUsage(detail);
  };

  useEffect(() => {
    if (!linkedDocumentContext || linkedDocumentContext.type !== "recommendation" || generatedNoSurat) return;

    const targetUsage = linkedDocumentContext.usageId
      ? usageDetails.find(usage => usage.id === linkedDocumentContext.usageId)
      : null;

    setFormData(previous => ({
      ...previous,
      dept_id: linkedDocumentContext.departmentId || previous.dept_id,
      letter_type_id: linkedDocumentContext.letterTypeId || previous.letter_type_id,
      form_input_data: {
        ...previous.form_input_data,
        request_category: "asset",
        request_mode: "barang",
        linked_document_type: "recommendation",
        linked_parent_surat_id: linkedDocumentContext.parentSuratId,
        linked_parent_no_surat: linkedDocumentContext.parentNoSurat || "",
        recommendation_parent_note: linkedDocumentContext.parentNoSurat
          ? `Rekomendasi untuk ${linkedDocumentContext.parentNoSurat}`
          : "Rekomendasi untuk surat aset induk",
      },
      is_aset: true,
    }));

    if (linkedDocumentContext.formId && selectedFormId !== linkedDocumentContext.formId) {
      setSelectedFormId(linkedDocumentContext.formId);
    }
    if (targetUsage && selectedUsage?.id !== targetUsage.id) {
      applySelectedUsage(targetUsage);
    }
  }, [linkedDocumentContext, generatedNoSurat, usageDetails, selectedFormId, selectedUsage?.id]);

  useEffect(() => {
    if (generatedNoSurat || !getRequestCategory()) return;
    const selectedFormStillAvailable = selectedFormId
      ? availableForms.some(form => form.id === selectedFormId)
      : false;
    if (selectedFormId && !selectedFormStillAvailable) {
      setSelectedFormId("");
      setSelectedUsage(null);
      setSigners([]);
      setFormData(previous => ({ ...previous, form_usage_id: "", penggunaan_id: "" }));
      return;
    }
    if (!selectedFormId && availableForms.length === 1) {
      setSelectedFormId(availableForms[0].id);
    }
  }, [availableForms, selectedFormId, generatedNoSurat, formData.form_input_data.request_category]);

  useEffect(() => {
    if (generatedNoSurat || !selectedFormId) return;
    const selectedUsageId = selectedUsage?.id || "";
    const selectedUsageStillAvailable = selectedUsageId
      ? usagesForSelectedForm.some(usage => usage.id === selectedUsageId)
      : false;
    if (selectedUsageId && !selectedUsageStillAvailable) {
      setSelectedUsage(null);
      setSigners([]);
      setFormData(previous => ({ ...previous, form_usage_id: "", penggunaan_id: "" }));
      return;
    }
    if (!selectedUsageId && usagesForSelectedForm.length === 1) {
      applySelectedUsage(usagesForSelectedForm[0]);
    }
  }, [generatedNoSurat, selectedFormId, selectedUsage?.id, usagesForSelectedForm, formData.form_input_data.request_category]);

  const handleGetNumber = async () => {
    const requestCategory = getRequestCategory();
    const step1Check = validateStep1ForNumberGeneration({
      profileLocationReady,
      requestCategory,
      selectedUsageId: selectedUsage?.id ?? null,
      filteredUsageCount: filteredUsage.length,
      unitProjectCode: (getFormFieldValue("requested_project") as { code?: string } | undefined)?.code,
      unitCount: Number(getFormFieldValue("requested_unit_count") || 0),
      branchHasRegisteredProjects,
      projectId: formData.project_id,
      shouldUseDefaultBranchProject,
      isMarisonProjectReady,
      fundWithoutProject,
      fundType: String(getFormFieldValue("fund_type") || ""),
    });
    if (!step1Check.valid) {
      return toast({
        variant: "destructive",
        title: step1Check.errorTitle!,
        ...(step1Check.errorDescription ? { description: step1Check.errorDescription } : {}),
      });
    }
    setIsProcessingNumber(true);
    try {
      const res = await suratRegistrationApi.generateNoSurat(effectiveFormData);
      let draft: SuratRegistrationDraft;
      try {
        draft = await suratRegistrationApi.createRegistrationDraft({
          noUrut: res.noUrut,
          noSurat: res.fullNumber,
          payload: {
            formData: effectiveFormData,
            selectedFormId,
            selectedUsageId: selectedUsage.id,
            linkedDocumentContext,
          },
          signerAssignments: signers,
        });
      } catch (draftError) {
        await suratRegistrationApi.cancelRegistration(res.fullNumber).catch(() => undefined);
        throw draftError;
      }
      setGeneratedNoSurat(res.fullNumber);
      setWizardStep(WIZARD_STEP_BERKAS);
      markDraftCreated(draft);
      setDraftSaveState("saved");
      setSearchParams({
        draft: draft.id,
        ...(linkedDocumentContext ? {
          linked_type: linkedDocumentContext.type,
          parent_surat: linkedDocumentContext.parentSuratId,
          parent_no_surat: linkedDocumentContext.parentNoSurat || "",
          required_before_step: String(linkedDocumentContext.requiredBeforeStep || ""),
          form_id: linkedDocumentContext.formId || "",
          usage_id: linkedDocumentContext.usageId || "",
          dept_id: linkedDocumentContext.departmentId || "",
          letter_type_id: linkedDocumentContext.letterTypeId || "",
          task_id: linkedDocumentContext.taskId || "",
        } : {}),
      }, { replace: true });
      await refreshActiveDrafts();
      toast({ title: "Nomor Berhasil Didapatkan", description: "Draft disimpan otomatis selama Anda melengkapi dokumen." });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Gagal Mendapatkan Nomor", description: e instanceof Error ? e.message : "Gagal mendapatkan nomor surat." });
    } finally { setIsProcessingNumber(false); }
  };

  const handleResetNumber = async () => {
    if (isResettingNumber) return;
    if (!generatedNoSurat) return;
    const confirmed = await appDialog.confirm({
      title: "Batalkan Nomor Surat?",
      description: "Nomor ini akan dikosongkan dari antrean dan tidak dipakai untuk pengajuan ini.",
      confirmText: "Batalkan Nomor",
      variant: "destructive",
    });
    if (!confirmed) return;
    setIsResettingNumber(true);
    try {
      if (activeDraftId) await suratRegistrationApi.voidRegistrationDraft(activeDraftId);
      else await suratRegistrationApi.cancelRegistration(generatedNoSurat);
      setGeneratedNoSurat(null);
      markDraftVoided();
      setManualTitleOverride(false);
      setManualPlaceOverride(false);
      setDraftAttachments([]);
      setInitialAttachmentFiles({});
      setLampiranFiles([]);
      setAttachmentUploadStates({});
      setDraftSaveState("idle");
      setSearchParams({}, { replace: true });
      await refreshActiveDrafts();
      toast({ title: "Nomor Dibatalkan" });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Gagal membatalkan nomor",
        description: error instanceof Error ? error.message : "Nomor belum bisa dibatalkan.",
      });
    } finally {
      setIsResettingNumber(false);
    }
  };

  const handleRequestedUnitCountChange = (rawValue: string) => {
    const count = Math.max(Number(rawValue || 0), 0);
    setInputValue("requested_unit_count", count || "");
    const project = getFormFieldValue("requested_project") as { name?: string } | undefined;
    setInputValue("unit_request_sentence", project?.name && count > 0
      ? `Nama Barang: Permohonan Order Bangun SPK Pembangunan Rumah ${count} Unit, SAT: Unit, Jumlah: ${count}, Status: 2`
      : "");
  };

  const handleExternalProjectChange = (value: string) => {
    const option = externalProjects.find((item) => item.value === value) as ProjectOption | undefined;
    const project = option?.raw;
    if (!option || !project?.code) return;
    const requestedProject = {
      value: option.value,
      label: option.label,
      id: project.id,
      code: project.code,
      name: project.name,
      branch: project.branch ?? null,
    };
    const count = Number(getFormFieldValue("requested_unit_count") || 0);
    setInputValue("requested_project", requestedProject);
    setInputValue("unit_request_sentence", count > 0
      ? `Nama Barang: Permohonan Order Bangun SPK Pembangunan Rumah ${count} Unit, SAT: Unit, Jumlah: ${count}, Status: 2`
      : "");
  };

  const getDraftCreatorName = (draft: SuratRegistrationDraft) => {
    if (draft.created_by === currentProfile?.id) return "Anda";
    return master.users.find((user: MasterRecord) => user.id === draft.created_by)?.full_name || "User tidak ditemukan";
  };

  const openDraft = (draftId: string) => {
    setSearchParams({ draft: draftId }, { replace: true });
    setDraftModalOpen(false);
  };

  const renderDraftCard = (draft: SuratRegistrationDraft, options?: { showCreator?: boolean }) => (
    <button
      key={draft.id}
      type="button"
      onClick={() => openDraft(draft.id)}
      className="w-full rounded-md border border-border bg-background px-3 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs font-semibold text-primary">{draft.no_surat}</span>
        {options?.showCreator && (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {getDraftCreatorName(draft)}
          </span>
        )}
      </span>
      <span className="mt-1 block truncate text-xs text-muted-foreground">
        {String(draft.payload?.formData?.judul_surat || "Belum ada judul")}
      </span>
    </button>
  );

  const resetForm = () => {
    setFormData({
      entity_id: "",
      dept_id: lockProfileLocation ? profileDepartmentId : requesterDepartmentId,
      letter_type_id: "",
      office_id: lockProfileLocation ? profileOfficeId : (officePusat?.id || ""),
      project_id: "",
      judul_surat: "", penggunaan_id: "", is_aset: false,
      form_usage_id: "",
      request_place: "", request_date: toDateInputValue(new Date()), form_input_data: {}
    });
    setGeneratedNoSurat(null); setSelectedUsage(null); setSelectedFormId(""); setLampiranFiles([]); setSigners([]);
    resetWizardStep();
    setInitialAttachmentFiles({});
    setDraftAttachments([]);
    setUploadingRequirement(null);
    setAttachmentUploadStates({});
    setUploadingRecommendationAttachment(null);
    setRegistrationSummaryOpen(false);
    setDatePickerOpen({});
    clearActiveDraftId();
    setDraftModalOpen(false);
    setDraftSaveState("idle");
    setLinkedDocumentContext(null);
    setExternalRevision(null);
    setSearchParams({}, { replace: true });
    setJudulForDisplay("");
  };

  const handleBackToDraftList = async () => {
    if (activeDraftId && generatedNoSurat) {
      try {
        setDraftSaveState("saving");
        await suratRegistrationApi.saveRegistrationDraft(
        activeDraftId,
        {
            formData: effectiveFormData,
            selectedFormId,
            selectedUsageId: selectedUsage?.id || "",
            linkedDocumentContext,
          },
          signers,
          "details"
        );
        setDraftSaveState("saved");
      } catch (error: unknown) {
        setDraftSaveState("error");
        toast({
          variant: "destructive",
          title: "Draft belum tersimpan",
          description: error instanceof Error ? error.message : "Perubahan draft gagal disimpan.",
        });
        return;
      }
    }

    resetForm();
    await refreshActiveDrafts();
    setDraftModalOpen(true);
  };

  const getLatestConfiguredSignerAssignments = () => {
    if (!selectedUsage?.id) return signers;
    const latestUsage = usageDetails.find((usage) => usage.id === selectedUsage.id) || selectedUsage;
    const configuredSigners = buildSignerAssignments(latestUsage);
    if (configuredSigners.length === 0) return signers;

    return reconcileSignerAssignments(configuredSigners, signers).map((signer) => {
      const eligibleUsers = getEligibleSignerUsersForSigner(signer);
      if (signer.user_id && eligibleUsers.some((user) => user.id === signer.user_id)) return signer;
      return {
        ...signer,
        user_id: eligibleUsers.length === 1 ? eligibleUsers[0].id : "",
      };
    });
  };

  const validateRegistration = (signerAssignments: SignerAssignment[] = signers) => {
    const missingField = getManualInputFields(selectedUsage).find((field: TemplateField) => !isManualFieldComplete(field));
    const firstRecommendationError = recommendationMultiDetail ? recommendationMultiDetailErrors(recommendationMultiDetail)[0] : undefined;

    const result = validateSuratSubmit({
      uploadingRequirement: Boolean(uploadingRequirement),
      uploadingRecommendationAttachment: Boolean(uploadingRecommendationAttachment),
      generatedNoSurat,
      activeDraftId,
      requestPlace: formData.request_place,
      requestDate: formData.request_date,
      missingInitialAttachmentLabels: getMissingInitialAttachmentLabels(),

      isUnitMode,
      hasUnitRequestFields: hasUnitRequestFields(selectedUsage),
      canCurrentDepartmentRequestUnit: canCurrentDepartmentRequestUnit(selectedUsage),
      requestedUnitCount: Number(getFormFieldValue("requested_unit_count") || 0),
      requestedProjectCode: (getFormFieldValue("requested_project") as { code?: string } | undefined)?.code,

      isNonUnitMode,
      shouldUseDefaultBranchProject,
      isMarisonProjectReady,
      firstNonUnitError: isNonUnitMode ? validateNonUnitRows(effectiveFormInputData.items)[0]?.message : undefined,

      isFundMode,
      fundWithoutProject,
      fundType: String(getFormFieldValue("fund_type") || ""),
      firstFundIssue: isFundMode ? validateFundSubmissionItems(effectiveFormInputData.items)[0]?.message : undefined,

      missingField: missingField ? { key: missingField.key, label: missingField.label } : undefined,
      firstRecommendationError,

      signerAssignments,
    });

    if (!result.valid) {
      toast({
        variant: "destructive",
        title: result.errorTitle!,
        ...(result.errorDescription ? { description: result.errorDescription } : {}),
      });
      return false;
    }
    return true;
  };

  const getRegistrationSummaryData = (): RegistrationSummaryData => {
    const requester = master.users.find((user) => user.id === currentProfile?.id);
    const department = master.depts.find((item) => item.id === formData.dept_id);
    const office = master.offices.find((item) => item.id === formData.office_id);
    const formFields = selectedUsage ? getManualInputFields(selectedUsage) : [];
    const mappedKeys = new Set(formFields.map((field) => field.key));
    const hiddenKeys = new Set([
      "request_mode", "request_category", "unit_config_snapshot", "recommendation_attachment_note",
      "recommendation_template_name", "recommendation_multi_detail", "requires_recommendation", "project_code", "project_name", "project_is_default", "fund_type", "fund_amount", "fund_without_project",
    ]);
    const fields: RegistrationSummaryField[] = formFields
      .filter((field) => !hiddenKeys.has(field.key))
      .map((field) => ({
        key: field.key,
        label: field.key === "items" && isNonUnitMode
          ? "Daftar Pekerjaan Non Unit"
          : field.label || humanizeInputKey(field.key),
        type: field.type,
        value: effectiveFormInputData[field.key],
      }))
      .filter((field) => Array.isArray(field.value) ? field.value.length > 0 : formatSummaryValue(field.value) !== "-");

    if (isFundMode) {
      fields.push({
        key: "fund_type",
        label: "Jenis Pengajuan Dana",
        value: getFormFieldValue("fund_type") === "production_cost" ? "Biaya Produksi" : "Biaya Operasional",
      });
      fields.push({
        key: "fund_amount",
        label: "Total Pengajuan Dana",
        value: formatRupiahZero(getFundSubmissionAmount(effectiveFormInputData.items)),
      });
    }

    Object.entries(effectiveFormInputData).forEach(([key, value]) => {
      if (mappedKeys.has(key) || hiddenKeys.has(key) || formatSummaryValue(value) === "-") return;
      if (["requested_project", "requested_unit_count", "catatan"].includes(key)) {
        fields.push({ key, label: humanizeInputKey(key), value });
      }
    });

    const persistedInitialAttachments = selectInitialRegistrationDraftAttachments(
      draftAttachments,
      new Set(getInitialAttachmentRequirements().map((requirement) => requirement.requirement_key)),
      effectiveFormInputData,
    );
    const localAttachments = [
      ...lampiranFiles.map((file, index) => ({
        id: `main-${index}-${file.name}`,
        name: file.name,
        type: file.type,
        size: file.size,
        label: "Lampiran pengajuan",
      })),
      ...Object.entries(initialAttachmentFiles).flatMap(([requirementKey, files]) => {
        const requirement = getInitialAttachmentRequirements().find((item) => item.requirement_key === requirementKey);
        return files.map((file, index) => ({
          id: `${requirementKey}-${index}-${file.name}`,
          name: file.name,
          type: file.type,
          size: file.size,
          label: requirement?.label || requirementKey,
        }));
      }),
    ];

    return {
      noSurat: generatedNoSurat || "",
      title: formData.judul_surat,
      category: formData.form_input_data.request_category,
      usageName: selectedUsage?.name || "-",
      formName: selectedUsage?.master_forms?.nama_form || "-",
      requesterName: requester?.full_name || "-",
      requesterJobTitle: requester?.job_title || undefined,
      departmentName: department?.name || "-",
      officeName: office?.name || "-",
      projectName: shouldUseDefaultBranchProject ? "Tanpa proyek" : selectedProject?.name || undefined,
      requestPlace: formData.request_place,
      requestDate: formData.request_date,
      fields,
      attachments: [
        ...localAttachments,
        ...persistedInitialAttachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.file_name,
          type: attachment.file_type,
          size: attachment.file_size,
          label: attachment.requirement_label,
        })),
      ],
      signers: signers.map((signer) => {
        const user = master.users.find((item) => item.id === signer.user_id);
        return {
          step: signer.step_order,
          role: `${toReadableName(signer.role_name)} · ${signer.label_jabatan}`,
          name: user?.full_name || "Belum dipilih",
          jobTitle: user?.job_title || undefined,
        };
      }),
      isRecommendation: linkedDocumentContext?.type === "recommendation",
    };
  };

  const handleOpenRegistrationSummary = () => {
    const latestSigners = getLatestConfiguredSignerAssignments();
    const signerConfigurationChanged = JSON.stringify(latestSigners) !== JSON.stringify(signers);
    if (signerConfigurationChanged) {
      setSigners(latestSigners);
      toast({
        title: "Alur penandatangan diperbarui",
        description: "Draft mengikuti konfigurasi Kegunaan Form terbaru.",
      });
    }
    if (!validateRegistration(latestSigners)) return;
    setRegistrationSummaryOpen(true);
  };

  const handleSubmit = async () => {
    if (submitLockRef.current || isLoading) return;
    const latestSigners = getLatestConfiguredSignerAssignments();
    if (JSON.stringify(latestSigners) !== JSON.stringify(signers)) {
      setSigners(latestSigners);
      setRegistrationSummaryOpen(false);
      toast({
        title: "Alur penandatangan berubah",
        description: "Konfigurasi admin telah diperbarui. Periksa ringkasan sekali lagi sebelum mendaftarkan.",
      });
      return;
    }
    if (!validateRegistration(latestSigners)) return;
    submitLockRef.current = true;
    setIsLoading(true);
    try {
      if (externalRevision?.eventId && activeDraftId) {
        const result = await executeExternalRevisionSubmit({
          revisionEventId: externalRevision.eventId,
          draftId: activeDraftId,
          formData: effectiveFormData,
          requesterNote: effectiveFormInputData.requester_revision_note as string | null | undefined,
        });
        toast({
          title: "Perbaikan berhasil dikirim",
          description: getExternalRevisionSuccessDescription(result.next_step),
        });
        onSuccess(generatedNoSurat || "", formData.judul_surat);
        resetForm();
        return;
      }
      const initialAttachmentMeta = buildInitialAttachmentMeta(
        getInitialAttachmentRequirements(),
        initialAttachmentFiles
      );
      const payload = buildRegistrationSubmitPayload(
        effectiveFormData,
        generatedNoSurat,
        activeDraftReservationId,
        activeDraftId,
        initialAttachmentMeta
      );
      const result = await suratRegistrationApi.createRegistrasi(
        payload,
        latestSigners,
        null,
        lampiranFiles
      );
      if (result) {
        const autoSignWarning = await executeRecommendationPostSubmit({
          linkedDocumentContext,
          recommendationSuratId: result.id,
        });

        await finishSubmittedDraft(activeDraftId);
        toast({
          title: linkedDocumentContext?.type === "recommendation" ? "Rekomendasi Berhasil Dibuat" : "Pendaftaran Berhasil",
          description: linkedDocumentContext?.type === "recommendation"
            ? `Nomor ${result.no_surat} sudah ditautkan ke surat induk.${autoSignWarning}`
            : `Nomor ${result.no_surat} telah disimpan.`,
        });
        onSuccess(result.no_surat, formData.judul_surat);
        resetForm();
        setActiveDraftReservationId(null);
      }
    } catch (error: unknown) {
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: error instanceof Error ? error.message : "Gagal menyimpan surat." });
    } finally {
      submitLockRef.current = false;
      setIsLoading(false);
    }
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  const renderDatePickerField = ({
    openKey,
    value,
    onChange,
    placeholder = "dd/mm/yyyy",
    disabled = false,
    className,
  }: {
    openKey: string;
    value?: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
  }) => (
    <Popover
      open={Boolean(datePickerOpen[openKey])}
      onOpenChange={(open) => setDatePickerOpen((previous) => ({ ...previous, [openKey]: open }))}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-12 w-full justify-start bg-background/70 text-left text-sm font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <DatePickerIcon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{formatDatePickerDisplay(value) || placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parseDateInputValue(value)}
          onSelect={(date) => {
            if (!date) return;
            onChange(toDateInputValue(date));
            setDatePickerOpen((previous) => ({ ...previous, [openKey]: false }));
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );

  const renderRecommendationItemsField = (field: TemplateField) => {
    if (recommendationMultiDetail) {
      return (
        <RecommendationMultiDetailEditor
          model={recommendationMultiDetail}
          onChange={setRecommendationMultiDetail}
          users={master.users}
          offices={master.offices}
          departments={master.depts}
          uploadingKey={uploadingRecommendationAttachment}
          onUpload={uploadRecommendationDetailAttachments}
          onDeleteAttachment={deleteRecommendationDetailAttachment}
          onDeleteDetail={deleteRecommendationDetail}
        />
      );
    }
    const rows = getTableRows(field.key);
    const isLinkedRecommendation =
      linkedDocumentContext?.type === "recommendation" && parentRecommendationItems.length > 0;
    const maxRows = Math.max(
      Number(field.table_config?.end_row || 0) - Number(field.table_config?.start_row || 0) + 1,
      1
    );
    const canAddRow = rows.length < maxRows;
    const recommendationRowIsComplete = (row: TableRow) => isRecommendationRowComplete(row);
    const completedItems = rows.filter(recommendationRowIsComplete).length;
    const selectedItemIndex = Math.min(activeRecommendationItem, Math.max(rows.length - 1, 0));
    const visibleRows = rows
      .map((row, rowIndex) => ({ row, rowIndex }))
      .filter(({ rowIndex }) => !isLinkedRecommendation || rowIndex === selectedItemIndex);

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {isLinkedRecommendation ? "Rekomendasi per Item Permohonan" : "Item Rekomendasi"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isLinkedRecommendation
                  ? `${completedItems} dari ${rows.length} item lengkap`
                  : `${rows.length}/${maxRows} item`}
              </p>
            </div>
            {isLinkedRecommendation ? (
              <span className="inline-flex h-9 items-center self-start rounded-md bg-primary/10 px-3 text-xs font-semibold text-primary sm:self-auto">
                Item {selectedItemIndex + 1} dari {rows.length}
              </span>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canAddRow}
                onClick={() => addTableRow(field.key)}
                className="h-10 rounded-md text-xs font-semibold"
              >
                <Plus className="mr-2 h-4 w-4" /> Tambah Item
              </Button>
            )}
          </div>

          {isLinkedRecommendation && (
            <div className="mt-4 flex gap-2 overflow-x-auto border-t border-border pt-4 pb-1">
              {rows.map((row, rowIndex) => {
                const active = rowIndex === selectedItemIndex;
                const complete = recommendationRowIsComplete(row);
                const parentItemName = String(row.parent_item_name || parentRecommendationItems[rowIndex]?.parent_item_name || "").trim();
                return (
                  <button
                    key={`recommendation-item-navigation-${rowIndex}`}
                    type="button"
                    onClick={() => setActiveRecommendationItem(rowIndex)}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex min-w-[150px] max-w-[220px] items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    <span className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      complete
                        ? "bg-emerald-600 text-white"
                        : active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                    )}>
                      {complete ? <Check className="h-3.5 w-3.5" /> : rowIndex + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">
                        {parentItemName || `Item ${rowIndex + 1}`}
                      </span>
                      <span className="mt-0.5 block text-[11px]">
                        {complete ? "Lengkap" : "Belum lengkap"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {visibleRows.map(({ row, rowIndex }) => {
          const selectedUserId = String(row.lokasi_pic_user_id ?? "");
          const selectedAction = getRecommendationAction(row);
          const notRecommended = selectedAction === "tidak_direkomendasikan";
          const selectedUser = selectedUserId ? master.users.find((user) => user.id === selectedUserId) : null;
          const picLabel = String(row.lokasi_pic ?? "") || (selectedUserId ? getRecommendationPicLabel(selectedUserId) : "");

          return (
            <div key={rowIndex} className="rounded-lg border border-border bg-background p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">No. {rowIndex + 1}</p>
                  <p className="text-sm font-semibold text-foreground">
                    {String(row.parent_item_name || parentRecommendationItems[rowIndex]?.parent_item_name || "").trim() || "Item permohonan"}
                  </p>
                </div>
                {!isLinkedRecommendation && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={rows.length === 1 && !hasMeaningfulRecommendationRowValue(row)}
                    onClick={() => removeTableRow(field.key, rowIndex)}
                    className="h-9 px-2 text-destructive hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Nama Barang / Alat Kerja {notRecommended ? "" : "*"}
                  </Label>
                  <Input
                    value={String(row.nama_barang ?? "")}
                    onChange={(event) => {
                      updateTableCell(field.key, rowIndex, "nama_barang", event.target.value);
                    }}
                    className="h-11 bg-background text-sm"
                    placeholder="Contoh: Printer Epson L3250 / HP ProBook 440 G10"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">No Registrasi</Label>
                  <Input
                    value={String(row.no_registrasi ?? "")}
                    onChange={(event) => updateTableCell(field.key, rowIndex, "no_registrasi", event.target.value)}
                    className="h-11 bg-background text-sm"
                    placeholder="Opsional"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Lokasi / PIC {notRecommended ? "" : "*"}
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-auto min-h-11 w-full justify-between bg-background px-3 py-2 text-left text-sm font-normal"
                      >
                        <span className="line-clamp-2">
                          {picLabel || "Pilih user"}
                        </span>
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Cari nama PIC..." />
                        <CommandList className="max-h-[280px]">
                          <CommandEmpty>User tidak ditemukan.</CommandEmpty>
                          <CommandGroup>
                            {master.users.map((user) => {
                              const locationLabel = getRecommendationPicLabel(user.id);
                              const checked = selectedUserId === user.id;
                              return (
                                <CommandItem
                                  key={`${field.key}-${rowIndex}-${user.id}`}
                                  value={`${user.full_name || ""} ${getRecommendationUserMeta(user)} ${locationLabel}`}
                                  onSelect={() => updateTableRow(field.key, rowIndex, {
                                    lokasi_pic_user_id: user.id,
                                    lokasi_pic: locationLabel,
                                  })}
                                >
                                  <div className={cn(
                                    "mr-2 flex h-4 w-4 items-center justify-center rounded border",
                                    checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                                  )}>
                                    {checked && <Check className="h-3 w-3" />}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{user.full_name}</p>
                                    <p className="truncate text-xs text-muted-foreground">{getRecommendationUserMeta(user) || locationLabel}</p>
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {selectedUser && (
                    <p className="text-xs text-muted-foreground">Masuk ke template sebagai: {picLabel}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Kerusakan</Label>
                  <Input
                    value={String(row.kerusakan ?? "")}
                    onChange={(event) => updateTableCell(field.key, rowIndex, "kerusakan", event.target.value)}
                    className="h-11 bg-background text-sm"
                    placeholder="Opsional"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[260px_1fr]">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Hasil Rekomendasi *</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
                    {RECOMMENDATION_ACTIONS.map((action) => {
                      const selected = selectedAction === action.value;
                      return (
                        <button
                          key={action.value}
                          type="button"
                          onClick={() => updateTableRow(field.key, rowIndex, {
                            recommendation_action: action.value,
                            service: action.value === "service" ? RECOMMENDATION_CHECK_MARK : "",
                            ganti: action.value === "ganti" ? RECOMMENDATION_CHECK_MARK : "",
                            beli_baru: action.value === "beli_baru" ? RECOMMENDATION_CHECK_MARK : "",
                            tidak_direkomendasikan: action.value === "tidak_direkomendasikan" ? RECOMMENDATION_CHECK_MARK : "",
                          })}
                          className={cn(
                            "h-10 rounded-md border px-2 text-xs font-semibold transition-colors",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-foreground hover:bg-muted"
                          )}
                        >
                          {action.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Uraian {notRecommended ? "" : "*"}
                  </Label>
                  <Input
                    value={String(row.uraian ?? "")}
                    onChange={(event) => updateTableCell(field.key, rowIndex, "uraian", event.target.value)}
                    className="h-11 bg-background text-sm"
                    placeholder={notRecommended ? "Opsional" : "Contoh: Pembelian baru / service adaptor / ganti unit"}
                  />
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  {notRecommended ? "Alasan tidak direkomendasikan *" : "Keterangan"}
                </Label>
                <Textarea
                  value={String(row.keterangan ?? "")}
                  onChange={(event) => updateTableCell(field.key, rowIndex, "keterangan", event.target.value)}
                  className="min-h-20 bg-background text-sm"
                  placeholder={notRecommended ? "Contoh: Item belum prioritas atau spesifikasi belum mendukung kebutuhan." : "Opsional"}
                />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Link Referensi</Label>
                  <div className="relative">
                    <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={String(row.reference_link ?? "")}
                      onChange={(event) => updateTableCell(field.key, rowIndex, "reference_link", event.target.value)}
                      className="h-11 bg-background pl-9 text-sm"
                      placeholder="Opsional, contoh: https://..."
                      inputMode="url"
                    />
                  </div>
                </div>

                {(() => {
                  const attachment = getRecommendationAttachment(row);
                  const uploadKey = `${field.key}-${rowIndex}`;
                  const isUploading = uploadingRecommendationAttachment === uploadKey;
                  const inputId = `${field.key}-${rowIndex}-recommendation-image`;
                  if (notRecommended && !attachment?.file_url) {
                    return (
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground">Lampiran Gambar</Label>
                        <div className="rounded-lg border border-dashed border-amber-500/35 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-900 dark:text-amber-100">
                          Gambar tidak wajib untuk item yang tidak direkomendasikan. Pastikan alasan ditulis jelas agar pemohon memahami item yang dicoret.
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Lampiran Gambar {notRecommended ? "" : "*"}
                      </Label>
                      <div
                        onPaste={(event) => handleRecommendationPaste(event, field.key, rowIndex)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleRecommendationDrop(event, field.key, rowIndex)}
                        className={cn(
                          "group rounded-lg border border-dashed bg-muted/20 p-3 transition-colors",
                          attachment ? "border-primary/25" : "border-border hover:border-primary/40 hover:bg-primary/5"
                        )}
                      >
                        {attachment?.file_url ? (
                          <div className="space-y-3">
                            <div className="overflow-hidden rounded-md border border-border bg-background">
                              <img
                                src={attachment.file_url}
                                alt={`Lampiran gambar rekomendasi item ${rowIndex + 1}`}
                                loading="lazy"
                                decoding="async"
                                className="h-36 w-full object-contain"
                              />
                            </div>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-foreground">{attachment.file_name || "Lampiran gambar"}</p>
                                <p className="text-xs text-muted-foreground">{formatFileSize(attachment.file_size)}</p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-destructive hover:text-destructive"
                                aria-label={`Hapus lampiran gambar item ${rowIndex + 1}`}
                                onClick={() => void clearRecommendationItemAttachment(field.key, rowIndex)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center px-3 py-6 text-center">
                            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-background text-primary shadow-sm">
                              {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
                            </div>
                            <p className="text-sm font-semibold text-foreground">
                              {isUploading ? "Menyimpan gambar" : "Tempel screenshot atau unggah gambar"}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              Klik untuk memilih file, drag gambar ke sini, atau tekan Ctrl+V setelah screenshot.
                            </p>
                          </div>
                        )}
                        <Input
                          id={inputId}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          aria-label={attachment ? `Ganti gambar item ${rowIndex + 1}` : `Pilih gambar item ${rowIndex + 1}`}
                          className="hidden"
                          disabled={isUploading}
                          onChange={(event) => {
                            const selectedFile = event.target.files?.[0];
                            event.currentTarget.value = "";
                            if (selectedFile) void uploadRecommendationItemAttachment(field.key, rowIndex, selectedFile, "upload");
                          }}
                        />
                        <label
                          htmlFor={inputId}
                          className={cn(
                            "mt-3 flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-semibold transition-colors hover:bg-muted",
                            isUploading && "pointer-events-none opacity-60"
                          )}
                        >
                          <UploadCloud className="mr-2 h-4 w-4" />
                          {attachment ? "Ganti Gambar" : "Pilih Gambar"}
                        </label>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {isLinkedRecommendation && rows.length > 1 && (
                <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={rowIndex === 0}
                    onClick={() => setActiveRecommendationItem(Math.max(rowIndex - 1, 0))}
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Sebelumnya
                  </Button>
                  <span className={cn(
                    "hidden text-xs font-semibold sm:block",
                    recommendationRowIsComplete(row) ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                  )}>
                    {recommendationRowIsComplete(row)
                      ? "Item ini lengkap"
                      : notRecommended
                        ? "Pilih aksi dan isi alasan"
                        : "Lengkapi field wajib dan gambar"}
                  </span>
                  <Button
                    type="button"
                    variant={rowIndex === rows.length - 1 ? "outline" : "default"}
                    disabled={rowIndex === rows.length - 1}
                    onClick={() => setActiveRecommendationItem(Math.min(rowIndex + 1, rows.length - 1))}
                  >
                    Berikutnya
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderTableField = (field: TemplateField) => {
    if (field.key === RECOMMENDATION_ITEMS_KEY) return renderRecommendationItemsField(field);
    if (field.key === "items" && isNonUnitMode && !shouldUseDefaultBranchProject) {
      return (
        <NonUnitRequestEditor
          rows={getTableRows(field.key) as NonUnitRequestRow[]}
          options={nonUnitOptions}
          loading={nonUnitLoading}
          error={nonUnitError}
          projectReady={isMarisonProjectReady}
          projectName={selectedProject?.name || ""}
          onChange={(rows) => setTableRows(field.key, rows)}
          onRetry={() => setNonUnitReloadKey((current) => current + 1)}
        />
      );
    }

    if (field.key === "items" && isFundMode
      && getNonAsetItemColumnKeys(field.table_config?.columns ?? []) !== null) {
      return (
        <NonAsetItemEditor
          rows={getTableRows(field.key)}
          columns={field.table_config?.columns ?? []}
          onChange={(rows) => setTableRows(field.key, rows)}
        />
      );
    }

    const columns = field.table_config?.columns ?? [];
    const rows = getTableRows(field.key);

    return (
      <div className="space-y-4">
        <div className="space-y-3">
          {rows.map((row: TableRow, rowIndex: number) => (
            <div key={rowIndex} className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-2 border-b border-border/50 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-primary">Baris {rowIndex + 1}</p>
                  <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                    Isi detail item sesuai kolom yang sudah dikonfigurasi admin.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 w-fit rounded-xl text-[10px] font-black uppercase text-destructive hover:text-destructive"
                  onClick={() => removeTableRow(field.key, rowIndex)}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Hapus
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {columns.map((column) => {
                  const options = (column.options || []).map((option) => {
                    if (typeof option === "string" || typeof option === "number") {
                      return { value: String(option), label: String(option) };
                    }
                    return { value: String(option.value), label: String(option.label || option.value) };
                  });
                  const helperText = column.helper_text || column.helperText;
                  return (
                  <div key={column.key} className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground">
                      {column.label}{column.required !== false ? " *" : ""}
                    </Label>
                    {column.type === "date" ? (
                      renderDatePickerField({
                        openKey: `table:${field.key}:${rowIndex}:${column.key}`,
                        value: String(row?.[column.key] ?? ""),
                        onChange: (value) => updateTableCell(field.key, rowIndex, column.key, value),
                        placeholder: "dd/mm/yyyy",
                        className: "bg-background",
                      })
                    ) : column.type === "select" ? (
                      <Select
                        value={String(row?.[column.key] ?? "")}
                        onValueChange={(value) => updateTableCell(field.key, rowIndex, column.key, value)}
                      >
                        <SelectTrigger className="h-12 bg-background text-sm">
                          <SelectValue placeholder={`Pilih ${column.label}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={column.type === "number" ? "number" : "text"}
                        value={String(row?.[column.key] ?? "")}
                        onChange={e => updateTableCell(field.key, rowIndex, column.key, e.target.value)}
                        className="h-12 bg-background text-sm"
                        placeholder={`Isi ${column.label}`}
                      />
                    )}
                    {helperText && <p className="text-[11px] font-medium text-muted-foreground">{helperText}</p>}
                  </div>
                );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-semibold text-muted-foreground">
            Tambahkan baris baru untuk barang kedua, ketiga, dan seterusnya.
          </p>
          <Button type="button" variant="outline" size="lg" className="h-12 rounded-2xl text-xs font-black uppercase" onClick={() => addTableRow(field.key)}>
            <Plus className="mr-2 h-4 w-4" /> Tambah Baris
          </Button>
        </div>
      </div>
    );
  };

  const renderExternalSelectField = (field: TemplateField) => {
    const options = externalOptions[field.key] || [];
    const isMultiple = isMultiSelectField(field);
    const selectedOptions = (Array.isArray(formData.form_input_data[field.key]) ? formData.form_input_data[field.key] : []) as ExternalOption[];
    const selectedValues = new Set(selectedOptions.map((item: ExternalOption) => item.value));
    const currentValue = getFormFieldValue(field.key) as { value?: string } | undefined;
    const dependencyKey = String(field.external_dependency_key || field.externalDependencyKey || "");
    const dependencyValue = dependencyKey ? externalVariables[dependencyKey] : true;
    const isDisabled = externalLoading[field.key] || !dependencyValue;
    const toggleOption = (option: ExternalOption) => {
      if (!isMultiple) {
        setInputValue(field.key, option || { value: option?.value, label: option?.label });
        return;
      }
      const next = selectedValues.has(option.value)
        ? selectedOptions.filter((item: ExternalOption) => item.value !== option.value)
        : [...selectedOptions, option];
      setInputValue(field.key, next);
    };

    if (isMultiple) {
      return (
        <div className="space-y-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={isDisabled}
                className="h-auto min-h-12 w-full justify-between bg-background/70 px-3 py-2 text-left text-sm font-normal"
              >
                <span className="line-clamp-2 flex-1">
                  {externalLoading[field.key]
                    ? "Memuat data..."
                    : selectedOptions.length > 0
                      ? `${selectedOptions.length} ${field.label} dipilih`
                      : `Pilih ${field.label}`}
                </span>
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder={`Cari ${field.label}...`} />
                <CommandList>
                  <CommandEmpty>Data tidak ditemukan.</CommandEmpty>
                  <CommandGroup>
                    {options.map((option) => {
                      const checked = selectedValues.has(option.value);
                      return (
                        <CommandItem key={`${field.key}-${option.value}`} onSelect={() => toggleOption(option)}>
                          <div className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded border",
                            checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                          )}>
                            {checked && <Check className="h-3 w-3" />}
                          </div>
                          <span>{option.label}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {selectedOptions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedOptions.map((option: ExternalOption) => (
                <button
                  key={`${field.key}-selected-${option.value}`}
                  type="button"
                  onClick={() => toggleOption(option)}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
                >
                  <span className="truncate">{option.label}</span>
                  <X className="h-3 w-3 shrink-0" />
                </button>
              ))}
            </div>
          )}
          {externalErrors[field.key] && (
            <p className="text-[10px] font-semibold text-amber-600">{externalErrors[field.key]}</p>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <Select
          value={currentValue?.value || ""}
          disabled={isDisabled}
          onValueChange={(value) => {
            const option = options.find((item) => item.value === value);
            setInputValue(field.key, option || { value, label: value });
          }}
        >
          <SelectTrigger className="h-12 bg-background/70 text-sm">
            <SelectValue placeholder={externalLoading[field.key] ? "Memuat data..." : `Pilih ${field.label}`} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={`${field.key}-${option.value}`} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {externalErrors[field.key] && (
          <p className="text-[10px] font-semibold text-amber-600">{externalErrors[field.key]}</p>
        )}
      </div>
    );
  };

  const renderManualField = (field: TemplateField, index = 0) => {
    const isTable = field.type === "table";
    const isLongText = field.type === "textarea";
    const inputPlaceholder = field.placeholder || `Isi ${field.label}`;
    const displayLabel = field.key === "items" && isNonUnitMode
      ? "Detail Pekerjaan Non Unit"
      : field.label;

    return (
      <div key={field.key} className={cn(
        "rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)] md:p-5",
        isTable && "space-y-4"
      )}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-primary/10 px-2 text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <Label className="text-sm font-semibold text-foreground">
                {displayLabel}
              </Label>
            </div>
            {!isTable && (
              <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                Data ini akan ditulis otomatis ke template dan PDF.
              </p>
            )}
          </div>
          <span className={cn(
            "inline-flex w-fit rounded-md border px-2.5 py-1 text-[11px] font-semibold",
            field.required !== false
              ? "border-primary/20 bg-primary/10 text-primary"
              : "border-border bg-muted/40 text-muted-foreground"
          )}>
            {field.required !== false ? "Wajib" : "Opsional"}
          </span>
        </div>

        {isTable ? renderTableField(field) : field.type === "external_select" ? (
          renderExternalSelectField(field)
        ) : isLongText ? (
          <Textarea
            value={getDisplayFieldValue(field.key)}
            onChange={e => setInputValue(field.key, e.target.value)}
            className="min-h-[180px] resize-y bg-background text-sm leading-relaxed"
            placeholder={inputPlaceholder}
          />
        ) : field.type === "date" ? (
          renderDatePickerField({
            openKey: `field:${field.key}`,
            value: getDisplayFieldValue(field.key),
            onChange: (value) => setInputValue(field.key, value),
            placeholder: inputPlaceholder,
          })
        ) : field.type === "currency" ? (
          <NominalInput
            value={getFormFieldValue(field.key)}
            onCommit={(canonical) => setInputValue(field.key, canonical)}
            ariaLabel={field.label || field.key}
            className="h-12"
          />
        ) : (
          <Input
            type={field.type === "number" ? "number" : "text"}
            value={getDisplayFieldValue(field.key)}
            onChange={e => setInputValue(field.key, e.target.value)}
            className="h-12 bg-background text-sm"
            placeholder={inputPlaceholder}
          />
        )}
      </div>
    );
  };

  const getVisibleManualFields = () =>
    getManualInputFields(selectedUsage).filter((field: TemplateField) => {
      if (!isUnitMode && isUnitExternalField(field)) return false;
      if (isUnitMode && (field.key === "items" || field.key === "unit")) return false;
      if (isFundMode && (field.key === "items" || field.key === "fund_amount")) return false;
      if (!hasUnitRequestFields(selectedUsage)) return true;
      if (field.key === "requested_unit_count") return false;
      if (isUnitMode) return field.key !== "items" && field.key !== "unit";
      return field.key !== "unit";
    });

  const renderUnitRequestPanel = () => {
    if (!isUnitMode) return null;
    const selectedProject = getFormFieldValue("requested_project") as ProjectRaw | undefined;
    const requestedCount = Number(getFormFieldValue("requested_unit_count") || 0);
    const availableCount = Number(projectUnitAvailability.count ?? 0);
    const exceedsAvailability = selectedProject?.code &&
      projectUnitAvailability.count != null &&
      requestedCount > availableCount;
    return (
      <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-5 md:p-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-primary">Pengajuan Unit</p>
          <p className="text-xs font-medium text-muted-foreground">
            Pemohon hanya mengajukan jumlah unit. Perencanaan akan memilih unit spesifik saat approval.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">Proyek</Label>
            <Select value={(getFormFieldValue("requested_project") as { value?: string } | undefined)?.value || ""} onValueChange={handleExternalProjectChange} disabled={projectsLoading || !!generatedNoSurat}>
              <SelectTrigger className="h-12 bg-background/70 text-sm">
                <SelectValue placeholder={projectsLoading ? "Memuat proyek..." : "Pilih proyek"} />
              </SelectTrigger>
              <SelectContent>
                {externalProjects.map((project) => (
                  <SelectItem key={project.value} value={project.value} disabled={!project.raw?.code}>
                    {project.label}{project.raw?.branch?.name ? ` - ${project.raw.branch.name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projectsError && <p className="text-[10px] font-semibold text-destructive">{projectsError}</p>}
            {selectedProject?.code ? (
              <p className={cn(
                "text-[11px] font-medium",
                projectUnitAvailability.error ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"
              )}>
                {projectUnitAvailability.loading
                  ? "Memuat jumlah unit tersedia..."
                  : projectUnitAvailability.error
                    ? "Jumlah unit tersedia belum termuat."
                    : `Kapasitas tersedia saat ini: ${projectUnitAvailability.count ?? 0} unit.`}
              </p>
            ) : (
              <p className="text-[11px] font-medium text-muted-foreground">Pilih proyek untuk melihat jumlah unit tersedia.</p>
            )}
            {exceedsAvailability && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Jumlah yang diajukan melebihi kapasitas unit yang sedang termuat. Pengajuan tetap bisa dilanjutkan, tetapi tim pemeriksa perlu menyesuaikan alokasi.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">Jumlah Unit Diajukan</Label>
            <Input
              type="number"
              min={1}
              value={String(getFormFieldValue("requested_unit_count") ?? "")}
              onChange={(e) => handleRequestedUnitCountChange(e.target.value)}
              disabled={!!generatedNoSurat && !(externalRevision && getRequestCategory() === "unit")}
              className="h-12 bg-background/70 text-sm"
              placeholder="Contoh: 10"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderRequestClassificationStep = () => {
    const category = getRequestCategory();
    return (
      <div className="space-y-3 rounded-lg border border-border bg-card p-4 md:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Klasifikasi Dokumen</p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              Pilih klasifikasi sebelum sistem menentukan matrix dan template yang tersedia.
            </p>
          </div>
          <span className="inline-flex w-fit items-center rounded-md border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
            {getRequestCombinationLabel()}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { value: "asset", label: "Aset", description: "Dokumen aset / properti" },
            { value: "unit", label: "Unit", description: "Permohonan/order bangun unit" },
            { value: "non_asset", label: "Non Aset", description: "Dokumen barang/jasa non aset" },
            { value: "non_unit", label: "Non Unit", description: "Pekerjaan proyek tanpa alokasi kavling" },
          ].map((option) => (
            (() => {
              const unitDisabled = option.value === "unit" && !canRequesterChooseUnit;
              return (
            <button
              key={option.value}
              type="button"
              disabled={!!generatedNoSurat || unitDisabled}
              onClick={() => setRequestCategory(option.value as RequestCategory)}
              className={cn(
                "rounded-md border px-4 py-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-70",
                category === option.value
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-background/70 text-foreground hover:bg-muted"
              )}
            >
              <span className="block text-sm font-semibold">{option.label}</span>
              <span className={cn(
                "mt-1 block text-[10px] font-semibold",
                category === option.value ? "text-primary-foreground/80" : "text-muted-foreground"
              )}>
                {option.description}
              </span>
              {unitDisabled && (
                <span className="mt-2 block text-[9px] font-bold text-amber-600">
                  Tidak tersedia untuk departemen akun Anda
                </span>
              )}
            </button>
              );
            })()
          ))}
        </div>
      </div>
    );
  };

  const renderFundTypeStep = () => {
    if (!isFundMode) return null;
    return (
      <div className="space-y-2 rounded-lg border border-border bg-card p-4 md:p-5">
        <Label className="text-sm font-semibold text-foreground">Jenis Pengajuan Dana</Label>
        <p className="text-xs text-muted-foreground">
          Pilihan ini dikirim sebagai tipe Fund Submission ke Marison.
        </p>
        <Select
          disabled={!!generatedNoSurat}
          value={String(getFormFieldValue("fund_type") || "")}
          onValueChange={(value) => setInputValue("fund_type", value)}
        >
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Pilih jenis pengajuan dana..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="operational">Biaya Operasional</SelectItem>
            <SelectItem value="production_cost">Biaya Produksi</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  };

  const renderRecommendationOptionStep = () => {
    if (getRequestCategory() !== "asset") return null;
    if (!canRequesterUseRecommendation) return null;
    const required = formData.form_input_data.requires_recommendation === true;
    const options = [
      {
        value: true,
        label: "Butuh rekomendasi",
        description: "Pengajuan aset ini membutuhkan lampiran rekomendasi. Template rekomendasi sudah tersedia di sistem.",
      },
      {
        value: false,
        label: "Tidak perlu rekomendasi",
        description: "Pengajuan aset dapat berjalan tanpa lampiran rekomendasi tambahan.",
      },
    ];

    return (
      <div className="space-y-3 rounded-lg border border-border bg-card p-4 md:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Rekomendasi Aset</p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              Tentukan apakah permohonan aset ini membutuhkan lampiran rekomendasi.
            </p>
          </div>
          <span className={cn(
            "inline-flex w-fit rounded-md border px-3 py-1 text-[11px] font-semibold",
            required
              ? "border-primary/20 bg-primary/10 text-primary"
              : "border-border bg-muted/40 text-muted-foreground"
          )}>
            {required ? "Rekomendasi diperlukan" : "Tanpa rekomendasi"}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((option) => {
            const selected = required === option.value;
            return (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => applyRecommendationChoice(option.value)}
                className={cn(
                  "min-h-24 rounded-md border px-4 py-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  selected
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-background/70 text-foreground hover:bg-muted"
                )}
                aria-pressed={selected}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border",
                    selected ? "border-primary-foreground bg-primary-foreground text-primary" : "border-muted-foreground/40"
                  )}>
                    {selected && <Check className="h-3.5 w-3.5" />}
                  </span>
                  {option.label}
                </span>
                <span className={cn(
                  "mt-2 block text-xs leading-5",
                  selected ? "text-primary-foreground/85" : "text-muted-foreground"
                )}>
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderRequestWorkflowStep = () => {
    return null;
  };

  const handleAttachmentSelection = async (rule: AttachmentRequirement, selectedFiles: File[]) => {
    const persisted = draftAttachments.filter(item => item.requirement_key === rule.requirement_key);
    const local = initialAttachmentFiles[rule.requirement_key] || [];
    const remainingSlots = Math.max(Number(rule.max_files || 1) - persisted.length - local.length, 0);
    const selected = selectedFiles.slice(0, remainingSlots);
    if (selected.length === 0) {
      toast({
        variant: "destructive",
        title: "Batas Lampiran Tercapai",
        description: `Maksimal ${rule.max_files || 1} file untuk ${rule.label}.`,
      });
      return;
    }

    if (!activeDraftId) {
      setInitialAttachmentFiles(previous => {
        const next = {
          ...previous,
          [rule.requirement_key]: [...(previous[rule.requirement_key] || []), ...selected],
        };
        setLampiranFiles(Object.values(next).flat());
        return next;
      });
      return;
    }

    setUploadingRequirement(rule.requirement_key);
    setAttachmentUploadStates(previous => ({
      ...previous,
      [rule.requirement_key]: {
        phase: "uploading",
        fileName: selected[0]?.name || "",
        fileIndex: 1,
        fileCount: selected.length,
        percent: 0,
      },
    }));
    try {
      const uploaded = await suratRegistrationApi.uploadRegistrationDraftFiles(activeDraftId, selected, {
        key: rule.requirement_key,
        label: rule.label,
      }, progress => {
        setAttachmentUploadStates(previous => ({
          ...previous,
          [rule.requirement_key]: {
            phase: progress.phase,
            fileName: progress.fileName,
            fileIndex: progress.fileIndex,
            fileCount: progress.fileCount,
            percent: progress.percent,
          },
        }));
      });
      setDraftAttachments(previous => [...previous, ...uploaded]);
      setAttachmentUploadStates(previous => ({
        ...previous,
        [rule.requirement_key]: {
          phase: "success",
          fileName: uploaded.at(-1)?.file_name || selected.at(-1)?.name || "",
          fileIndex: selected.length,
          fileCount: selected.length,
          percent: 100,
        },
      }));
      toast({
        title: "Lampiran Tersimpan",
        description: `${uploaded.length} file tersimpan pada draft.`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error && typeof error.message === "string"
          ? error.message
          : "Coba unggah kembali.";
      setAttachmentUploadStates(previous => ({
        ...previous,
        [rule.requirement_key]: {
          phase: "error",
          fileName: previous[rule.requirement_key]?.fileName || selected[0]?.name || "",
          fileIndex: previous[rule.requirement_key]?.fileIndex || 1,
          fileCount: selected.length,
          percent: previous[rule.requirement_key]?.percent || 0,
          message,
        },
      }));
      toast({
        variant: "destructive",
        title: "Gagal Mengunggah Lampiran",
        description: message,
      });
    } finally {
      setUploadingRequirement(null);
    }
  };

  const handleRemoveDraftAttachment = async (attachment: SuratRegistrationDraftFile) => {
    try {
      await suratRegistrationApi.deleteRegistrationDraftFile(attachment.id);
      setDraftAttachments(previous => previous.filter(item => item.id !== attachment.id));
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Gagal Menghapus Lampiran",
        description: error instanceof Error ? error.message : "Coba kembali.",
      });
    }
  };

  const renderAttachmentUploader = () => {
    const configuredRequirements = getInitialAttachmentRequirements();
    if (configuredRequirements.length > 0) {
      return (
        <div className="space-y-4 rounded-3xl border border-border/50 bg-muted/10 p-5 md:p-6">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-primary">Lampiran Pemohon</p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">Unggah setiap dokumen sesuai persyaratan kegunaan.</p>
          </div>
          {configuredRequirements.map(rule => {
            const files = initialAttachmentFiles[rule.requirement_key] || [];
            const persistedFiles = draftAttachments.filter(
              attachment => attachment.requirement_key === rule.requirement_key
            );
            const totalFiles = files.length + persistedFiles.length;
            const uploadState = attachmentUploadStates[rule.requirement_key];
            const uploadInProgress = uploadState?.phase === "uploading" || uploadState?.phase === "saving";
            return (
              <div key={rule.id} className="rounded-xl border border-border bg-background/70 p-4">
                <div className="mb-3">
                  <span className="text-xs font-black uppercase">{rule.label}</span>
                  {rule.is_required && <span className="ml-2 text-destructive">*</span>}
                  <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                    {uploadInProgress
                      ? uploadState.phase === "saving" ? "Menyimpan data lampiran..." : "Mengunggah lampiran..."
                      : totalFiles > 0
                        ? `${totalFiles} dari ${rule.max_files} file tersimpan`
                        : `Maksimal ${rule.max_files} file`}
                  </p>
                </div>
                {uploadState && (
                  <div
                    className={cn(
                      "mb-3 rounded-lg border px-3 py-3",
                      uploadState.phase === "error"
                        ? "border-destructive/40 bg-destructive/5"
                        : uploadState.phase === "success"
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-primary/25 bg-primary/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">
                          {uploadState.fileName || "Lampiran"}
                        </p>
                        <p className={cn(
                          "mt-1",
                          uploadState.phase === "error" ? "text-destructive" : "text-muted-foreground",
                        )}>
                          {uploadState.phase === "uploading" &&
                            `File ${uploadState.fileIndex} dari ${uploadState.fileCount} sedang diunggah`}
                          {uploadState.phase === "saving" && "Upload selesai. Menyimpan data lampiran"}
                          {uploadState.phase === "success" && "Lampiran berhasil disimpan"}
                          {uploadState.phase === "error" && (uploadState.message || "Upload gagal. Pilih file untuk mencoba kembali")}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-foreground">
                        {uploadState.phase === "error" ? "Gagal" : `${uploadState.percent}%`}
                      </span>
                    </div>
                    {uploadState.phase !== "error" && (
                      <Progress
                        value={uploadState.percent}
                        className="mt-3 h-2"
                        aria-label={`Progres upload ${rule.label}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={uploadState.percent}
                      />
                    )}
                  </div>
                )}
                {persistedFiles.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {persistedFiles.map(attachment => (
                      <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-foreground">{attachment.file_name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {attachment.file_size ? `${Math.ceil(attachment.file_size / 1024)} KB` : "Tersimpan di draft"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => void handleRemoveDraftAttachment(attachment)}
                          aria-label={`Hapus ${attachment.file_name}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <Input
                  type="file"
                  multiple={rule.allow_multiple || rule.max_files > 1}
                  accept={rule.allowed_types?.join(",")}
                  disabled={Boolean(uploadingRequirement) || totalFiles >= rule.max_files}
                  onChange={event => {
                    const selected = Array.from(event.target.files || []);
                    event.currentTarget.value = "";
                    void handleAttachmentSelection(rule, selected);
                  }}
                />
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  return (
    <>
    <Card className="overflow-hidden border border-border bg-card shadow-[var(--shadow-card)]">
      <CardContent className="space-y-7 p-4 sm:p-5 md:p-6">

        {!generatedNoSurat && (draftLoading || activeDrafts.length > 0) && (
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Draft registrasi tersedia</p>
                <p className="mt-1 text-xs text-muted-foreground">Buka daftar draft untuk melanjutkan nomor yang sudah dipesan.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => setDraftModalOpen(true)}
                  disabled={draftLoading || activeDrafts.length === 0}
                >
                  Lihat draft
                  {activeDrafts.length > 0 && (
                    <span className="ml-2 rounded-full bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] text-primary-foreground">
                      {activeDrafts.length}
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchParams({}, { replace: true });
                    setDraftModalOpen(false);
                  }}
                >
                  Buat baru
                </Button>
                {draftLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              </div>
            </div>
          </div>
        )}

        {/* ── PERINGATAN nomor sudah dipesan ───────────────────────────────── */}
        <Dialog open={draftModalOpen} onOpenChange={setDraftModalOpen}>
          <DialogContent className="grid max-h-[88dvh] max-w-2xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0">
            <DialogHeader className="border-b border-border px-5 py-4 pr-12">
              <DialogTitle>Draft registrasi</DialogTitle>
              <DialogDescription>Pilih draft yang ingin dilanjutkan.</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-4">
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">Milik saya</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{myDrafts.length}</span>
                </div>
                {myDrafts.length > 0 ? (
                  <div className="grid gap-2">
                    {myDrafts.map(draft => renderDraftCard(draft))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                    Tidak ada draft milik Anda.
                  </div>
                )}
              </section>

              {isCurrentUserAdmin && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">User lain</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{otherDrafts.length}</span>
                  </div>
                  {otherDrafts.length > 0 ? (
                    <div className="grid gap-2">
                      {otherDrafts.map(draft => renderDraftCard(draft, { showCreator: true }))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                      Tidak ada draft user lain.
                    </div>
                  )}
                </section>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {generatedNoSurat && (
          <div className="animate-in fade-in zoom-in-95 duration-300">
            <div className={cn(
              "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
              draftSaveState === "error"
                ? "border-destructive/20 bg-destructive/10 text-destructive"
                : "border-primary/20 bg-primary/5 text-foreground"
            )}>
              <div className="flex items-center gap-4">
                <div className={cn(
                  "shrink-0 rounded-md p-2 text-white",
                  draftSaveState === "error" ? "bg-destructive" : "bg-primary"
                )}>
                  {draftSaveState === "saving"
                    ? <Loader2 className="h-5 w-5 animate-spin" />
                    : draftSaveState === "error"
                      ? <AlertTriangle className="h-5 w-5" />
                      : <Check className="h-5 w-5" />}
                </div>
                <div>
                  <p className="mb-1 text-sm font-semibold leading-none">Nomor sudah dipesan</p>
                  <p className="text-xs font-medium opacity-80">
                    {draftSaveState === "saving" && "Menyimpan perubahan..."}
                    {draftSaveState === "saved" && "Perubahan tersimpan otomatis. Anda dapat melanjutkan draft ini nanti."}
                    {draftSaveState === "error" && "Perubahan terakhir belum tersimpan. Periksa koneksi Anda."}
                    {draftSaveState === "idle" && "Draft registrasi sedang disiapkan."}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleBackToDraftList()}
                disabled={draftSaveState === "saving"}
                className="shrink-0"
              >
                Kembali ke daftar draft
              </Button>
            </div>
          </div>
        )}

        {isRecommendationFlow && (
          <section className="space-y-5">
            <RecommendationParentSummary
              data={recommendationParentSummary}
              loading={recommendationParentLoading}
              error={recommendationParentError}
              onRetry={() => void loadRecommendationParentSummary()}
            />

            {generatedNoSurat && (
              <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-primary/20 bg-primary/10 p-5 md:flex-row md:items-center">
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl bg-primary p-3 text-primary-foreground shadow-lg">
                    <Hash className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-primary">Nomor Rekomendasi</p>
                    <p className="mt-1 text-xl font-semibold tracking-tight">{generatedNoSurat}</p>
                  </div>
                </div>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        tabIndex={0}
                        role="img"
                        aria-label="Nomor rekomendasi terkunci"
                        className="inline-flex h-11 w-11 cursor-default items-center justify-center rounded-md border border-primary/20 bg-background text-primary outline-none transition-colors hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <Lock className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px] text-center">
                      Nomor dibuat otomatis dari pengajuan induk dan tidak dapat diubah di sini.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          </section>
        )}

        {/* ══ STEPPER REGISTRASI (wizard 1 → 2 → 3) ═══════════════════════ */}
        {useRegistrationWizard && (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <ol className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3" aria-label="Langkah registrasi surat">
              {WIZARD_STEPS.map(({ step, title, description }) => {
                const reachable = canGoToStep(step, Boolean(generatedNoSurat));
                const isActive = activeWizardStep === step;
                const isDone = Boolean(generatedNoSurat) && step < activeWizardStep;
                return (
                  <li key={step}>
                    <button
                      type="button"
                      disabled={!reachable}
                      onClick={() => setWizardStepDirect(step)}
                      aria-current={isActive ? "step" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all",
                        isActive
                          ? "border-primary/50 bg-primary/5 shadow-[var(--shadow-card)]"
                          : reachable
                            ? "border-border bg-muted/20 hover:border-primary/30 hover:bg-muted/30"
                            : "cursor-not-allowed border-border bg-muted/10 opacity-60"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                          isActive
                            ? "border-primary bg-primary text-primary-foreground"
                            : isDone
                              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : "border-border bg-background text-muted-foreground"
                        )}
                      >
                        {isDone ? <Check className="h-4 w-4" /> : step}
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block truncate text-sm font-semibold", isActive ? "text-foreground" : "text-muted-foreground")}>
                          {title}
                        </span>
                        <span className="hidden truncate text-[11px] text-muted-foreground sm:block">{description}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {generatedNoSurat && (
              <div className="flex shrink-0 items-center gap-2 self-start rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <Hash className="h-4 w-4 text-primary" />
                <span className="max-w-[220px] truncate text-xs font-semibold text-foreground">{generatedNoSurat}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => { navigator.clipboard.writeText(generatedNoSurat || ""); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }}
                  aria-label="Salin nomor surat"
                >
                  {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ══ SECTION 1: LOKASI & KLASIFIKASI ══════════════════════════════ */}
        {!isRecommendationFlow && isIdentityActive && (
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">1</span>
            <h3 className="text-sm font-semibold text-foreground">Lokasi dan Klasifikasi</h3>
          </div>

          <div className="grid grid-cols-1 gap-5 rounded-lg border border-border bg-muted/20 p-4 md:grid-cols-2 md:p-5">
            {/* Kantor */}
            <div className="space-y-2">
              <Label className="ml-1 text-xs font-semibold text-muted-foreground">Kantor Penerbit</Label>
              <Select disabled={!!generatedNoSurat || lockProfileLocation} value={formData.office_id}
                onValueChange={v => setFormData({ ...formData, office_id: v, project_id: "", dept_id: "", entity_id: "" })}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pilih Kantor..." />
                </SelectTrigger>
                <SelectContent>
                  {master.offices?.map((o: MasterRecord) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.kedudukan === "Pusat" ? "🏢 Kantor Pusat" : `🏗️ ${o.kedudukan}. ${o.name}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Proyek cabang, serta proyek external wajib untuk Non Unit dan Non Aset. */}
            {shouldShowProjectSelector && (
              <div className="space-y-2 animate-in slide-in-from-top-2">
                <Label className="ml-1 flex items-center gap-2 text-xs font-semibold text-primary">
                  <Briefcase className="w-3 h-3" />
                  {requiresMarisonProject ? "Proyek Tujuan" : "Proyek Cabang"}
                </Label>
                {hasRegisteredProjectCandidates && projectSelectionOptions.length > 0 ? (
                  <Select disabled={!!generatedNoSurat} value={formData.project_id} onValueChange={handleProjectChange}>
                    <SelectTrigger className="h-11 border-primary/40 bg-primary/5">
                      <SelectValue placeholder="Pilih Proyek..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projectSelectionOptions.map((p: MasterRecord) => {
                        const projectOffice = master.offices?.find((office: MasterRecord) => office.id === p.office_id);
                        const projectLabel = p.code ? `${p.code} - ${p.name}` : p.name;
                        return (
                          <SelectItem key={p.id} value={p.id}>
                            {requiresMarisonProject && isPusatSelected && projectOffice?.name
                              ? `${projectLabel} · ${projectOffice.name}`
                              : projectLabel}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : requiresMarisonProject && !shouldUseDefaultBranchProject ? (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                    <div className="text-sm font-medium">Belum ada proyek yang siap digunakan</div>
                    <div className="mt-1 text-xs">
                      {hasRegisteredProjectCandidates
                        ? "Mapping proyek/kantor Marison (termasuk mapping staging trial) perlu dilengkapi admin di Master Proyek."
                        : "Belum ada proyek external yang tersedia untuk kantor ini."}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2.5">
                    <div className="text-sm font-medium text-foreground">Tidak ada proyek terdaftar</div>
                    <div className="mt-1 text-xs text-muted-foreground">Kode proyek pada nomor surat akan memakai 000.</div>
                  </div>
                )}
                {isFundMode && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-muted bg-muted/40 px-3 py-2.5">
                    <Checkbox
                      className="mt-0.5"
                      checked={fundWithoutProject}
                      disabled={!!generatedNoSurat}
                      onCheckedChange={(checked) => {
                        if (checked === true) {
                          setFundWithoutProject(true);
                          setFormData((prev) => ({
                            ...prev,
                            project_id: "",
                            form_input_data: {
                              ...prev.form_input_data,
                              fund_without_project: true,
                            },
                          }));
                        } else {
                          setFundWithoutProject(false);
                          setFormData((prev) => ({
                            ...prev,
                            form_input_data: {
                              ...prev.form_input_data,
                              fund_without_project: false,
                            },
                          }));
                        }
                      }}
                    />
                    <span className="text-sm">
                      <span className="font-medium text-foreground">Tanpa Proyek (Dana Umum)</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Pengajuan dana tidak terikat proyek; dikirim ke Marison tanpa <code>project_id</code>.
                      </span>
                    </span>
                  </label>
                )}
                {requiresMarisonProject && unavailableNonUnitProjectCount > 0 && (
                  <p className="px-1 text-xs text-muted-foreground">
                    {unavailableNonUnitProjectCount} proyek belum tersedia karena mapping Marison (atau mapping staging trial) belum lengkap.
                  </p>
                )}
              </div>
            )}

            {/* Entitas */}
            <div className="space-y-2">
              <Label className="ml-1 text-xs font-semibold text-muted-foreground">Entitas (PT)</Label>
              <Select disabled={!!generatedNoSurat} value={formData.entity_id}
                onValueChange={v => setFormData({ ...formData, entity_id: v })}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pilih PT..." />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  collisionPadding={16}
                  className="max-w-[calc(100vw-2rem)]"
                >
                  {master.entities?.map((e: MasterRecord) => (
                    <SelectItem
                      key={e.id}
                      value={e.id}
                      className="[&>span:last-child]:whitespace-normal [&>span:last-child]:break-words"
                    >
                      {e.code} - {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Departemen */}
            <div className="space-y-2">
              <Label className="ml-1 text-xs font-semibold text-muted-foreground">Departemen</Label>
              <Select disabled={!!generatedNoSurat || lockProfileLocation} value={formData.dept_id}
                onValueChange={v => setFormData({ ...formData, dept_id: v, letter_type_id: "" })}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pilih Dept..." />
                </SelectTrigger>
                <SelectContent>
                  {departmentSelectOptions.map((d: MasterRecord) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Jenis Dokumen */}
            <div className="space-y-2">
              <Label className="ml-1 text-xs font-semibold text-muted-foreground">Jenis Dokumen</Label>
              <Select disabled={!!generatedNoSurat} value={formData.letter_type_id}
                onValueChange={handleLetterTypeChange}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pilih Jenis..." />
                </SelectTrigger>
                <SelectContent>
                  {departmentLetterTypes.map((t: MasterRecord) => (
                    <SelectItem key={t.id} value={t.id}>{t.code} - {t.name}</SelectItem>
                  ))}
                  {formData.dept_id && departmentLetterTypes.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      Belum ada jenis dokumen untuk departemen ini.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isRecommendationFlow && !generatedNoSurat && !!formData.letter_type_id && (
            <>
              {renderRequestClassificationStep()}
              {renderFundTypeStep()}
              {renderRecommendationOptionStep()}
              {isUnitMode && renderUnitRequestPanel()}
            </>
          )}

          {/* ══ TOGGLE ASET — posisi baru, MENCOLOK, tepat sebelum tombol nomor ══ */}
          {Boolean(import.meta.env.VITE_SHOW_LEGACY_ASSET_TOGGLE) && !isRecommendationFlow && !generatedNoSurat && (
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
          {!isRecommendationFlow && !generatedNoSurat && !draftLoading && getRequestCategory() && (
            <div className="grid gap-4 rounded-2xl border border-border bg-muted/10 p-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-[11px] font-black uppercase text-muted-foreground">Form Dokumen</Label>
                <Select
                  value={selectedFormId}
                  onValueChange={value => {
                    setSelectedFormId(value);
                    setSelectedUsage(null);
                    setSigners([]);
                    setFormData(previous => ({ ...previous, form_usage_id: "", penggunaan_id: "" }));
                  }}
                >
                  <SelectTrigger className="h-12 bg-background">
                    <SelectValue placeholder="Pilih form sesuai kebutuhan" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableForms.map(form => (
                      <SelectItem key={form.id} value={form.id}>{form.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-black uppercase text-muted-foreground">Kegunaan</Label>
                <Select
                  disabled={!selectedFormId}
                  value={selectedUsage?.id || ""}
                  onValueChange={handleUsageChange}
                >
                  <SelectTrigger className="h-12 bg-background">
                    <SelectValue placeholder={selectedFormId ? "Pilih kegunaan dan alur approval" : "Pilih form terlebih dahulu"} />
                  </SelectTrigger>
                  <SelectContent>
                    {usagesForSelectedForm.map(usage => (
                      <SelectItem key={usage.id} value={usage.id}>
                        {usage.name || getFullRoles(usage).join(" - ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {availableForms.length === 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs font-semibold text-amber-700 md:col-span-2 dark:text-amber-300">
                  Belum ada kegunaan aktif untuk kategori, departemen, dan kantor yang dipilih.
                </div>
              )}
            </div>
          )}

          {generatedNoSurat && selectedUsage && !isRecommendationFlow && (
            <div className="grid gap-4 rounded-2xl border border-border bg-muted/10 p-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-[11px] font-black uppercase text-muted-foreground">Form Dokumen</Label>
                <div className="flex min-h-12 items-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground">
                  {selectedFormName}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-black uppercase text-muted-foreground">Kegunaan</Label>
                <div className="flex min-h-12 items-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground">
                  {selectedUsage.name || getFullRoles(selectedUsage).join(" - ") || "Kegunaan form"}
                </div>
              </div>
            </div>
          )}

          {!generatedNoSurat ? (
            <Button
              onClick={handleGetNumber}
              disabled={isProcessingNumber || !profileLocationReady || !formData.entity_id || !formData.dept_id || !formData.letter_type_id}
              className="h-12 w-full font-semibold"
            >
              {isProcessingNumber
                ? <Loader2 className="animate-spin mr-2 w-5 h-5" />
                : <><Hash className="mr-2 h-4 w-4" /> Dapatkan Nomor Surat</>
              }
            </Button>
          ) : (
            <div className="flex flex-col items-center justify-between gap-4 rounded-lg border border-primary/20 bg-primary/10 p-5 md:flex-row">
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
                    <p className="text-xl font-semibold tracking-tight">{generatedNoSurat}</p>
                    <Button variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => { navigator.clipboard.writeText(generatedNoSurat || ""); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }}>
                      {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
              {isRecommendationFlow ? (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        tabIndex={0}
                        role="img"
                        aria-label="Nomor rekomendasi terkunci"
                        className="inline-flex h-11 w-11 cursor-default items-center justify-center rounded-md border border-primary/20 bg-background text-primary outline-none transition-colors hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <Lock className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px] text-center">
                      Nomor dibuat otomatis dari pengajuan induk dan tidak dapat diubah di sini.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : externalRevision ? (
                <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                  <Lock className="h-4 w-4" />
                  Nomor dan identitas dokumen dipertahankan untuk revisi generasi {externalRevision.generation || "berikutnya"}.
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleResetNumber()}
                  disabled={isResettingNumber}
                  className="border-primary text-primary font-bold hover:bg-primary/5"
                >
                  {isResettingNumber ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-2 h-4 w-4" />
                  )}
                  Ubah Identitas
                </Button>
              )}
            </div>
          )}
        </section>
        )}

        {/* ══ SECTION 2: BERKAS ════════════════════════════════════════════ */}
        {generatedNoSurat && (
          <div id="surat-registration-details" className="scroll-mt-24 space-y-8 animate-in slide-in-from-bottom-5 duration-500">
            {showSectionBerkas && (
            <section className="space-y-6">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">2</span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold leading-tight text-foreground">Persetujuan dan Berkas</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Lengkapi perihal, tempat, tanggal, lampiran, dan penandatangan sebelum pengajuan didaftarkan.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
                <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                  <div className="space-y-3">
                    <div className="min-w-0">
                      <Label className="text-sm font-semibold text-foreground">Perihal</Label>
                      <p className="mt-1 text-xs text-muted-foreground">Judul otomatis mengikuti data dokumen. Kosongkan field jika ingin kembali memakai judul otomatis.</p>
                    </div>
                    <Textarea
                      className="min-h-[92px] resize-none bg-background text-sm leading-relaxed"
                      placeholder="Contoh: Permohonan Pembelian Inventaris Kantor"
                      value={formData.judul_surat}
                      disabled={Boolean(externalRevision && getRequestCategory() === "unit")}
                      onChange={e => {
                        const nextValue = e.target.value;
                        setManualTitleOverride(Boolean(nextValue.trim()));
                        setFormData({ ...formData, judul_surat: nextValue });
                        setJudulForDisplay(nextValue);
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Tempat dan Tanggal Dokumen</p>
                    <p className="mt-1 text-xs text-muted-foreground">Tempat otomatis mengikuti kantor penerbit. Kosongkan field jika ingin kembali otomatis.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">Tempat</Label>
                      <Input
                        value={formData.request_place}
                        disabled={Boolean(externalRevision && getRequestCategory() === "unit")}
                        onChange={e => {
                          const nextValue = e.target.value;
                          setManualPlaceOverride(Boolean(nextValue.trim()));
                          setFormData({ ...formData, request_place: nextValue });
                        }}
                        placeholder="Contoh: Jakarta"
                        className="h-11 bg-background text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">Tanggal</Label>
                      {renderDatePickerField({
                        openKey: "request_date",
                        value: formData.request_date,
                        onChange: (value) => setFormData({ ...formData, request_date: value }),
                        placeholder: "dd/mm/yyyy",
                        disabled: Boolean(externalRevision && getRequestCategory() === "unit"),
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {isFundMode && (
                <FundSubmissionEditor
                  value={getFormFieldValue("items")}
                  onChange={(items) => setInputValue("items", items)}
                />
              )}

              {selectedUsage && (getVisibleManualFields().length > 0 || hasUnitRequestFields(selectedUsage)) && (
                <div className="space-y-5">
                  {renderRequestWorkflowStep()}
                  {getVisibleManualFields().length > 0 && (
                    <div className="space-y-4">
                      {getVisibleManualFields().map((field: TemplateField, index: number) => renderManualField(field, index))}
                    </div>
                  )}
                </div>
              )}

              {externalRevision && getRequestCategory() === "unit" && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
                  <Label htmlFor="requester-revision-note" className="text-sm font-semibold">Catatan perbaikan pemohon (opsional)</Label>
                  <Textarea
                    id="requester-revision-note"
                    value={String(getFormFieldValue("requester_revision_note") || "")}
                    onChange={(event) => setInputValue("requester_revision_note", event.target.value)}
                    placeholder="Jelaskan perubahan jumlah unit bila diperlukan"
                    className="min-h-20 resize-y bg-background"
                  />
                </div>
              )}

              {!(externalRevision && getRequestCategory() === "unit") && renderAttachmentUploader()}
            </section>
            )}

            {useRegistrationWizard && isContentActive && (
              <div className="flex items-center justify-between gap-3 border-t border-border pt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goToPreviousWizardStep}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" /> Kembali
                </Button>
                <Button
                  type="button"
                  onClick={goToNextWizardStep}
                >
                  Selanjutnya <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}

            {/* ══ SECTION 3: SIGNERS ═══════════════════════════════════════ */}
            {showSectionSigners && (
              <section className="space-y-6 border-t pt-8 animate-in fade-in duration-700">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">3</span>
                  <h3 className="text-sm font-semibold text-foreground">Penetapan Pejabat Penandatangan</h3>
                </div>

                <div className="mx-auto max-w-2xl space-y-3">
                  {signers.map((s, i) => (
                    <div key={i} className="flex flex-col items-center">
                      <div className="flex w-full items-center gap-4 rounded-lg border bg-card p-4 shadow-[var(--shadow-card)] transition-colors hover:border-primary/50">
                        <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md bg-muted text-[10px] font-semibold">
                          <span className="opacity-50 text-[7px]">KE</span>{s.step_order}
                        </div>
                        <div className="flex-1 text-left space-y-1">
                          <div className="flex flex-col mb-2">
                            <p className="text-xs font-semibold leading-tight text-primary">{s.label_jabatan}</p>
                            <p className="text-[11px] font-medium text-muted-foreground">Status: {s.role_name}</p>
                          </div>
                          <Popover open={openSignerIndex === i} onOpenChange={(open) => setOpenSignerIndex(open ? i : null)}>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={Boolean(externalRevision)}
                                className="h-10 w-full justify-between bg-muted/20 border-none ring-1 ring-border rounded-lg font-medium text-left"
                              >
                                <span className={cn("truncate", !s.user_id && "text-muted-foreground")}>
                                  {s.user_id ? getSelectedSignerName(s.user_id) : `Pilih ${s.label_jabatan}...`}
                                </span>
                                <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <Command shouldFilter={false}>
                                <CommandInput
                                  value={signerSearch[i] || ""}
                                  onValueChange={(value) => setSignerSearch(prev => ({ ...prev, [i]: value }))}
                                  placeholder="Cari nama depan, tengah, atau belakang..."
                                />
                                <CommandList className="max-h-[260px]">
                                  <CommandEmpty>User tidak ditemukan.</CommandEmpty>
                                  <CommandGroup>
                                    {getFilteredSignerUsers(i).map((u: MasterRecord) => {
                                      const officeName = master.offices.find(office => office.id === u.office_id)?.name;
                                      return (
                                      <CommandItem
                                        key={u.id}
                                        value={u.full_name}
                                        onSelect={() => {
                                          const ns = [...signers];
                                          ns[i].user_id = u.id;
                                          setSigners(ns);
                                          setOpenSignerIndex(null);
                                          setSignerSearch(prev => ({ ...prev, [i]: "" }));
                                        }}
                                        className="cursor-pointer"
                                      >
                                        <Check className={cn("mr-2 h-4 w-4", s.user_id === u.id ? "opacity-100" : "opacity-0")} />
                                        <span className="min-w-0">
                                          <span className="block truncate">{u.full_name}</span>
                                          <span className="block truncate text-[11px] text-muted-foreground">
                                            {[u.job_title, officeName].filter(Boolean).join(" · ")}
                                          </span>
                                        </span>
                                      </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                      {i < signers.length - 1 && <ArrowDown className="text-primary/20 w-4 h-4 my-1" />}
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3 pt-6 sm:flex-row">
                  {useRegistrationWizard && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 sm:w-44"
                      onClick={goToPreviousWizardStep}
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" /> Kembali
                    </Button>
                  )}
                  <Button
                    className="h-12 flex-1 text-base font-semibold disabled:opacity-50"
                    disabled={isLoading || Boolean(uploadingRequirement) || Boolean(uploadingRecommendationAttachment) || signers.some(s => !s.user_id) || !formData.judul_surat}
                    onClick={handleOpenRegistrationSummary}
                  >
                    {uploadingRequirement || uploadingRecommendationAttachment
                      ? <div className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin" /><span>Menyimpan Lampiran...</span></div>
                      : externalRevision ? "Tinjau dan Kirim Perbaikan" : "Konfirmasi Pendaftaran"
                    }
                  </Button>
                </div>
                <p className="text-center text-xs font-medium text-muted-foreground">
                  Pastikan semua data sudah benar sebelum konfirmasi
                </p>
              </section>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    <RegistrationSummaryDialog
      open={registrationSummaryOpen}
      data={getRegistrationSummaryData()}
      submitting={isLoading}
      onOpenChange={setRegistrationSummaryOpen}
      onConfirm={() => void handleSubmit()}
    />
    </>
  );
}

export default SuratForm;
