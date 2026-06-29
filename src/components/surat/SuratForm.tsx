import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Hash, ArrowDown, Loader2, Briefcase, Calendar as DatePickerIcon,
  Check, ChevronDown, Copy, RefreshCcw,
  ShieldCheck, AlertTriangle, Archive, Home, X, Plus, Image as ImageIcon,
  Link as LinkIcon, UploadCloud, Trash2
} from "lucide-react";
import {
  suratService,
  type SuratRegistrationDraft,
  type SuratRegistrationDraftFile,
} from "@/services/surat.service";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAppDialog } from "@/components/app/AppDialogProvider";
import {
  RegistrationSummaryDialog,
  type RegistrationSummaryData,
  type RegistrationSummaryField,
} from "@/components/surat/RegistrationSummaryDialog";
import { formatSummaryValue, humanizeInputKey } from "@/components/surat/request-summary";

interface SuratFormProps {
  onSuccess: (noSurat: string, judul: string) => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
  setJudulForDisplay: (val: string) => void;
}

type MasterRecord = {
  id: string;
  full_name?: string;
  name?: string;
  code?: string;
  kedudukan?: string;
  dept_index?: number;
  office_id?: string;
  entity_id?: string;
  department_id?: string | null;
  departmentIds?: string[];
  dept_ids?: string[];
  departmentSortIndexes?: Record<string, number>;
  dept_sort_indexes?: Record<string, number>;
  job_title?: string | null;
  branch?: { name?: string } | null;
};

type MasterData = {
  entities: MasterRecord[];
  depts: MasterRecord[];
  offices: MasterRecord[];
  types: MasterRecord[];
  users: MasterRecord[];
  projects: MasterRecord[];
};

type UsageDetailRecord = {
  id: string;
  name?: string;
  form_id?: string;
  request_category?: "asset" | "unit" | "non_unit" | "non_asset";
  scope_type?: "all" | "pusat" | "cabang";
  is_cabang?: boolean;
  request_categories?: Array<"asset" | "unit" | "non_unit" | "non_asset">;
  recommendation_config?: RecommendationConfig;
  workflow_allowed_departments?: Array<{ department_id: string }>;
  form_usage_steps?: Array<{
    id: string;
    step_order: number;
    role_name: string;
    label: string;
    action_type?: "approval" | "unit_allocation";
    candidate_scope?: CandidateScope | null;
    signer_department_id?: string | null;
    form_usage_step_users?: Array<{ user_id: string }>;
    form_usage_step_verifiers?: Array<{ user_id: string }>;
  }>;
  form_usage_attachment_requirements?: Array<{
    id: string;
    stage_order: number;
    requirement_key: string;
    label: string;
    is_required: boolean;
    allow_multiple: boolean;
    min_files: number;
    max_files: number;
    allowed_types?: string[];
    max_size_bytes?: number | null;
  }>;
  ttd_config?: unknown;
  master_forms?: {
    id?: string;
    nama_form?: string;
    nomor_form?: string;
    link_form?: string;
    department_id?: string;
    input_schema?: unknown;
    unit_config?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type TemplateField = {
  key: string;
  label?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  default_source?: string;
  defaultSource?: string;
  cell?: string;
  merge_range?: string;
  mergeRange?: string;
  multiple?: boolean;
  is_multiple?: boolean;
  external_source_key?: string;
  externalSourceKey?: string;
  external_dependency_key?: string;
  externalDependencyKey?: string;
  value_key?: string;
  table_config?: {
    start_row?: number;
    end_row?: number;
    no_column?: string;
    columns?: Array<{
      key: string;
      label?: string;
      type?: string;
      required?: boolean;
      options?: Array<{ label?: string; value: string | number } | string | number>;
      helper_text?: string;
      helperText?: string;
    }>;
  };
};

type RequestCategory = "asset" | "unit" | "non_unit" | "non_asset";
type RecommendationConfig = {
  enabled?: boolean;
  optional?: boolean;
  required_before_step?: number;
  form_id?: string;
  usage_id?: string;
  department_id?: string;
  letter_type_id?: string;
  template_name?: string;
};
type LinkedDocumentContext = {
  type: "recommendation";
  parentSuratId: string;
  parentNoSurat?: string;
  requiredBeforeStep?: number | null;
  formId?: string;
  usageId?: string;
  departmentId?: string;
  letterTypeId?: string;
  taskId?: string;
};
type CandidateScope = "manual" | "request_office" | "request_department" | "branch_office_or_request_department" | "head_office" | "all_offices";
type AttachmentRequirement = NonNullable<UsageDetailRecord["form_usage_attachment_requirements"]>[number];
type TableRow = Record<string, unknown>;
type ExternalOption = { value: string; label: string; raw?: unknown };
type ProjectRaw = { id: string; code?: string; name?: string; branch?: { name?: string } | null };
type ProjectOption = { value: string; label: string; raw?: ProjectRaw };
type FormFieldValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | { value?: string; label?: string; code?: string; name?: string; branch?: { name?: string } | null }
  | Array<{ value?: string; label?: string } | string>
  | TableRow[]
  | Record<string, unknown>;
type FormInputData = Record<string, FormFieldValue>;
type SignerAssignment = {
  step_order: number;
  role_name: string;
  label_jabatan: string;
  user_id?: string | null;
  form_usage_step_id?: string;
  action_type?: "approval" | "unit_allocation";
  candidate_scope?: CandidateScope;
  eligible_user_ids?: string[];
  verifier_user_ids?: string[];
  attachment_requirements?: UsageDetailRecord["form_usage_attachment_requirements"];
  requires_unit_allocation?: boolean;
};
type UsageStepConfig = {
  form_usage_step_id?: string;
  roleName?: string;
  role_name?: string;
  labelJabatan?: string;
  label_jabatan?: string;
  jabatan?: string;
  action_type?: "approval" | "unit_allocation";
  candidate_scope?: CandidateScope;
  eligible_user_ids?: string[];
  verifier_user_ids?: string[];
  requires_unit_allocation?: boolean;
  requiresUnitAllocation?: boolean;
};

type CurrentProfile = {
  id: string;
  role?: string | null;
  department_id?: string | null;
  office_id?: string | null;
};
type RecommendationItemAttachment = {
  draft_file_id?: string;
  file_url?: string;
  file_name?: string;
  file_type?: string | null;
  file_size?: number | null;
  uploaded_at?: string;
  source?: "upload" | "paste" | "drop";
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateInputValue = (value?: string | null) => {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const formatDatePickerDisplay = (value?: string | null) => {
  const date = parseDateInputValue(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const RECOMMENDATION_TEMPLATE_NAME = "Rekomendasi Peremajaan Alat";
const RECOMMENDATION_ITEMS_KEY = "recommendation_items";
const RECOMMENDATION_CHECK_MARK = "✓";
const RECOMMENDATION_ACTIONS = [
  { value: "service", label: "Service" },
  { value: "ganti", label: "Ganti" },
  { value: "beli_baru", label: "Beli Baru" },
] as const;
type RecommendationAction = (typeof RECOMMENDATION_ACTIONS)[number]["value"];

const parseLinkedDocumentContext = (params: URLSearchParams): LinkedDocumentContext | null => {
  const type = params.get("linked_type");
  const parentSuratId = params.get("parent_surat");
  if (type !== "recommendation" || !parentSuratId) return null;
  const requiredBeforeStep = Number(params.get("required_before_step") || "");
  return {
    type: "recommendation",
    parentSuratId,
    parentNoSurat: params.get("parent_no_surat") || undefined,
    requiredBeforeStep: Number.isFinite(requiredBeforeStep) && requiredBeforeStep > 0 ? requiredBeforeStep : null,
    formId: params.get("form_id") || undefined,
    usageId: params.get("usage_id") || undefined,
    departmentId: params.get("dept_id") || undefined,
    letterTypeId: params.get("letter_type_id") || undefined,
    taskId: params.get("task_id") || undefined,
  };
};

const linkedDocumentContextEquals = (left: LinkedDocumentContext | null, right: LinkedDocumentContext | null) =>
  JSON.stringify(left || null) === JSON.stringify(right || null);

export function SuratForm({ onSuccess, isLoading, setIsLoading, setJudulForDisplay }: SuratFormProps) {
  const { toast } = useToast();
  const appDialog = useAppDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [linkedDocumentContext, setLinkedDocumentContext] = useState<LinkedDocumentContext | null>(() =>
    parseLinkedDocumentContext(searchParams)
  );

  // ── STATE ──────────────────────────────────────────────────────────────────
  const [master, setMaster] = useState<MasterData>({ entities: [], depts: [], offices: [], types: [], users: [], projects: [] });
  const [usageDetails, setUsageDetails]           = useState<UsageDetailRecord[]>([]);
  const [selectedUsage, setSelectedUsage]         = useState<UsageDetailRecord | null>(null);
  const [selectedFormId, setSelectedFormId]       = useState("");
  const [generatedNoSurat, setGeneratedNoSurat]   = useState<string | null>(null);
  const [isProcessingNumber, setIsProcessingNumber] = useState(false);
  const [isResettingNumber, setIsResettingNumber] = useState(false);
  const [isCopied, setIsCopied]                   = useState(false);
  const [activeDraftId, setActiveDraftId]         = useState<string | null>(null);
  const [activeDrafts, setActiveDrafts]           = useState<SuratRegistrationDraft[]>([]);
  const [draftModalOpen, setDraftModalOpen]       = useState(false);
  const [draftToRestore, setDraftToRestore]       = useState<SuratRegistrationDraft | null>(null);
  const [draftLoading, setDraftLoading]           = useState(false);
  const [draftSaveState, setDraftSaveState]       = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [openSignerIndex, setOpenSignerIndex]     = useState<number | null>(null);
  const [datePickerOpen, setDatePickerOpen]       = useState<Record<string, boolean>>({});
  const [signerSearch, setSignerSearch]           = useState<Record<number, string>>({});
  const [lampiranFiles, setLampiranFiles]         = useState<File[]>([]);
  const [initialAttachmentFiles, setInitialAttachmentFiles] = useState<Record<string, File[]>>({});
  const [draftAttachments, setDraftAttachments]   = useState<SuratRegistrationDraftFile[]>([]);
  const [uploadingRequirement, setUploadingRequirement] = useState<string | null>(null);
  const [uploadingRecommendationAttachment, setUploadingRecommendationAttachment] = useState<string | null>(null);
  const [registrationSummaryOpen, setRegistrationSummaryOpen] = useState(false);
  const [externalOptions, setExternalOptions]     = useState<Record<string, ExternalOption[]>>({});
  const [externalLoading, setExternalLoading]     = useState<Record<string, boolean>>({});
  const [externalErrors, setExternalErrors]       = useState<Record<string, string | null>>({});
  const [externalProjects, setExternalProjects]   = useState<ProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading]     = useState(false);
  const [projectsError, setProjectsError]         = useState<string | null>(null);
  const [currentProfile, setCurrentProfile]       = useState<CurrentProfile | null>(null);
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

  useEffect(() => {
    const nextContext = parseLinkedDocumentContext(searchParams);
    if (nextContext) {
      setLinkedDocumentContext(previous =>
        linkedDocumentContextEquals(previous, nextContext) ? previous : nextContext
      );
      return;
    }
    if (!searchParams.get("draft")) {
      setLinkedDocumentContext(null);
    }
  }, [searchParams]);

  const getFormFieldValue = (key: string) => formData.form_input_data[key];
  const getScalarFieldValue = (value: FormFieldValue) => {
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (value && typeof value === "object" && !Array.isArray(value) && "value" in value) {
      const candidate = (value as { value?: unknown }).value;
      return typeof candidate === "string" || typeof candidate === "number" ? String(candidate) : "";
    }
    return "";
  };
  const getDisplayFieldValue = (key: string) => getScalarFieldValue(getFormFieldValue(key));

  // ── HELPERS ────────────────────────────────────────────────────────────────
  const normalizeRoleName = (raw: unknown, index: number, total: number): "membuat" | "memeriksa" | "menyetujui" => {
    const v = String(raw ?? "").toLowerCase().trim();
    if (v === "membuat" || v === "memeriksa" || v === "menyetujui") return v as "membuat" | "memeriksa" | "menyetujui";
    if (v.includes("setuju") || v.includes("approve") || v.includes("approval") || v.includes("otoris") || v.includes("final")) return "menyetujui";
    if (v.includes("periksa") || v.includes("review") || v.includes("verifikasi") || v.includes("cek") || v.includes("paraf")) return "memeriksa";
    if (v.includes("buat") || v.includes("draft") || v.includes("pemohon") || v.includes("request")) return "membuat";
    if (index === 0) return "membuat";
    if (index === total - 1) return "menyetujui";
    return "memeriksa";
  };

  const getFullRoles = (item: UsageDetailRecord) => {
    if (!item?.ttd_config) return [];
    try {
      const config = typeof item.ttd_config === "string" ? JSON.parse(item.ttd_config) : item.ttd_config;
      return Array.isArray(config) ? config.map((c: { labelJabatan?: string; jabatan?: string; roleName?: string; role_name?: string }) => c.labelJabatan || c.jabatan || c.roleName || c.role_name) : [];
    } catch { return []; }
  };

  const getInputSchema = (item: UsageDetailRecord) => {
    const raw = item?.master_forms?.input_schema;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const getManualInputFields = (item: UsageDetailRecord) =>
    getInputSchema(item).filter((field: TemplateField) => {
      const source = field.default_source || field.defaultSource || "manual";
      return source === "manual";
    });

  const getExternalInputFields = (item: UsageDetailRecord) =>
    getManualInputFields(item).filter((field: TemplateField) => field.type === "external_select");

  const isMultiSelectField = (field: TemplateField) =>
    field.multiple === true || field.is_multiple === true || field.key === "unit";

  const isUnitField = (field: TemplateField) =>
    [
      "unit",
      "requested_project",
      "requested_unit_count",
      "unit_request_sentence",
      "unit_config_snapshot",
      "allocated_project",
      "allocated_units",
      "allocated_unit_count",
    ].includes(field.key);

  const isUnitExternalField = (field: TemplateField) =>
    isUnitField(field) ||
    String(field.external_source_key || field.externalSourceKey || "") === "marison_units_by_project";

  const getWorkflowCategories = (item: UsageDetailRecord | null | undefined): RequestCategory[] => {
    if (item?.request_category) return [item.request_category];
    const categories = Array.isArray(item?.request_categories) ? item.request_categories : [];
    return categories.length > 0 ? categories : ["asset", "non_unit"];
  };

  const hasUnitRequestFields = (item: UsageDetailRecord) =>
    getWorkflowCategories(item).includes("unit");

  const canDepartmentRequestUnit = (item: UsageDetailRecord, deptId: string) => {
    if (!deptId) return false;
    const allowedDepartments = Array.isArray(item.workflow_allowed_departments)
      ? item.workflow_allowed_departments
      : [];
    if (!item.form_usage_steps && !hasUnitRequestFields(item)) return true;
    return allowedDepartments.some(permission => permission.department_id === deptId);
  };

  const canCurrentDepartmentRequestUnit = (item: UsageDetailRecord) =>
    canDepartmentRequestUnit(item, requesterDepartmentId);

  const shouldRequireInitialAttachment = () => {
    const initialRules = selectedUsage?.form_usage_attachment_requirements?.filter(rule => rule.stage_order === 0) || [];
    return initialRules.some(rule => rule.is_required && rule.min_files > 0);
  };

  const getInitialAttachmentRequirements = () =>
    selectedUsage?.form_usage_attachment_requirements?.filter(rule => rule.stage_order === 0) || [];

  const getMissingInitialAttachmentLabels = () =>
    getInitialAttachmentRequirements()
      .filter(rule => {
        const minimum = rule.is_required ? Math.max(1, Number(rule.min_files || 1)) : Number(rule.min_files || 0);
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

  const clearUnitInput = (inputData: Record<string, unknown>) => {
    const nextInput = { ...inputData };
    delete nextInput.requested_project;
    delete nextInput.requested_unit_count;
    delete nextInput.unit_request_sentence;
    delete nextInput.unit_config_snapshot;
    return nextInput;
  };

  const clearRecommendationInput = (inputData: Record<string, unknown>) => {
    const nextInput = { ...inputData };
    delete nextInput.requires_recommendation;
    delete nextInput.recommendation_template_name;
    delete nextInput.recommendation_attachment_note;
    return nextInput;
  };

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
      return {
        ...prev,
        is_aset: category === "asset",
        form_input_data: nextInput,
      };
    });
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

  const hasPlaceDateMapping = (item: UsageDetailRecord) => {
    const mappedSources = new Set(
      getInputSchema(item)
        .filter((field: TemplateField) => !!String(field.cell || field.merge_range || field.mergeRange || "").trim())
        .map((field: TemplateField) => field.default_source || field.defaultSource || "manual")
    );
    return mappedSources.has("request_place_date") ||
      (mappedSources.has("request_place") && mappedSources.has("request_date"));
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

  const normalizeTableRows = (value: unknown): TableRow[] => {
    const rows = value;
    if (!Array.isArray(rows) || rows.length === 0) return [{}];
    return rows
      .filter((row): row is TableRow => !!row && typeof row === "object" && !Array.isArray(row))
      .map((row) => ({ ...row }));
  };

  const getTableRows = (key: string) => normalizeTableRows(formData.form_input_data[key]);

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

  const formatFileSize = (bytes?: number | null) => {
    const size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0) return "";
    if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  };

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
      const uploaded = await suratService.uploadRegistrationDraftFiles(activeDraftId, [file], {
        key: `recommendation_item_${rowIndex + 1}`,
        label: `Lampiran gambar rekomendasi item ${rowIndex + 1}`,
      });
      const attachment = uploaded[0];
      if (!attachment) throw new Error("Lampiran gagal tersimpan.");

      if (previousAttachment?.draft_file_id && previousAttachment.draft_file_id !== attachment.id) {
        await suratService.deleteRegistrationDraftFile(previousAttachment.draft_file_id).catch(() => undefined);
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
        await suratService.deleteRegistrationDraftFile(attachment.draft_file_id);
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
    return "";
  };

  const isRecommendationItemsComplete = (field: TemplateField) => {
    const rows = getTableRows(field.key).filter((row: TableRow) =>
      hasMeaningfulRecommendationRowValue(row)
    );
    if (field.required !== false && rows.length === 0) return false;
    return rows.every((row: TableRow) =>
      String(row.nama_barang ?? "").trim() &&
      String(row.lokasi_pic ?? "").trim() &&
      Boolean(getRecommendationAction(row)) &&
      String(row.uraian ?? "").trim() &&
      Boolean(getRecommendationAttachment(row)?.file_url)
    );
  };

  const isTableFieldComplete = (field: TemplateField) => {
    if (field.key === RECOMMENDATION_ITEMS_KEY) return isRecommendationItemsComplete(field);
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
  const canRequesterUseRecommendation = useMemo(() => {
    const departmentId = formData.dept_id || requesterDepartmentId;
    const department = master.depts.find((dept: MasterRecord) => dept.id === departmentId);
    const code = String(department?.code || "").trim().toUpperCase();
    const name = String(department?.name || "").trim().toLowerCase();
    return code === "PBO" || name === "pengembangan organisasi" || name === "po";
  }, [formData.dept_id, requesterDepartmentId, master.depts]);

  const filteredUsage = useMemo(() => {
    const category = getRequestCategory();
    if (!category) return [];
    return usageDetails.filter((item) => {
      if (
        linkedDocumentContext?.type === "recommendation" &&
        linkedDocumentContext.usageId === item.id
      ) {
        return getWorkflowCategories(item).includes(category);
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

  const canRequesterChooseUnit = useMemo(
    () => usageDetails.some(item =>
      item.is_cabang === !isPusatSelected &&
      canDepartmentRequestUnit(item, requesterDepartmentId)
    ),
    [usageDetails, isPusatSelected, requesterDepartmentId]
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

  const formatIndonesianList = (values: string[]) => {
    const cleaned = values.map((value) => value.trim()).filter(Boolean);
    if (cleaned.length === 0) return "";
    if (cleaned.length === 1) return cleaned[0];
    if (cleaned.length === 2) return `${cleaned[0]} dan ${cleaned[1]}`;
    return `${cleaned.slice(0, -1).join(", ")}, dan ${cleaned[cleaned.length - 1]}`;
  };

  const toReadableLocationName = (value: string) => value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  const getDepartmentTitlePart = (department?: MasterRecord | null) => {
    const rawName = String(department?.name || "").replace(/\s*\(cabang\)\s*/i, "").trim();
    if (!rawName) return "";
    if (/^dept\.?\s+/i.test(rawName)) return rawName.replace(/^dept\.?\s+/i, "Dept. ");
    return `Dept. ${rawName}`;
  };

  const getOfficeTitleSuffix = (office?: MasterRecord | null, department?: MasterRecord | null) => {
    if (!office) return "";
    const name = String(office.name || "").trim();
    const kedudukan = String(office.kedudukan || "").trim().toUpperCase();
    if (kedudukan === "PUSAT" || name.toUpperCase().includes("KANTOR PUSAT")) {
      return [getDepartmentTitlePart(department), "Kantor Pusat"].filter(Boolean).join(" ");
    }
    if (/^KCP\b|^KCP\./i.test(name)) {
      return `KCP. ${toReadableLocationName(name.replace(/^KCP\.?\s*/i, ""))}`.trim();
    }
    if (/^KC\b|^KC\./i.test(name)) {
      return `KC. ${toReadableLocationName(name.replace(/^KC\.?\s*/i, ""))}`.trim();
    }
    return name;
  };

  const getDefaultRequestPlace = (office?: MasterRecord | null) => {
    const suffix = getOfficeTitleSuffix(office, selectedDepartment);
    if (!suffix || suffix.includes("Kantor Pusat")) return "Magelang";
    return suffix.replace(/^(KC|KCP)\.\s+/i, "").trim() || "Magelang";
  };

  const buildAutoTitle = () => {
    const category = getRequestCategory();
    const officeSuffix = getOfficeTitleSuffix(selectedOffice, selectedDepartment);
    const rows = normalizeTableRows(formData.form_input_data.items);
    const itemNames = rows
      .map((row) => String(row.nama_barang || row.name || "").trim())
      .filter(Boolean);
    const itemText = formatIndonesianList(itemNames);
    if (category === "unit") {
      const count = Number(formData.form_input_data.requested_unit_count || 0);
      const project = formData.form_input_data.requested_project as { name?: string } | undefined;
      const title = count > 0
        ? `Permohonan Order Bangun SPK Pembangunan Rumah ${count} Unit`
        : "Permohonan Order Bangun";
      return [title, project?.name, officeSuffix].filter(Boolean).join(" ");
    }
    const categoryLabel = category === "asset"
      ? "Permohonan Aset"
      : category === "non_asset"
        ? "Permohonan Non Aset"
        : category === "non_unit"
          ? "Permohonan Non Unit"
          : "Permohonan";
    return [itemText ? `${categoryLabel} : ${itemText}` : categoryLabel, officeSuffix].filter(Boolean).join(" ");
  };

  useEffect(() => {
    if (!generatedNoSurat || manualTitleOverride) return;
    const nextTitle = buildAutoTitle();
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
    formData.judul_surat,
    setJudulForDisplay,
  ]);

  useEffect(() => {
    if (!generatedNoSurat || manualPlaceOverride) return;
    const nextPlace = getDefaultRequestPlace(selectedOffice);
    if (!nextPlace || nextPlace === formData.request_place) return;
    setFormData(previous => ({ ...previous, request_place: nextPlace }));
  }, [generatedNoSurat, manualPlaceOverride, selectedOffice?.id, selectedDepartment?.id, formData.request_place]);

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

  const externalVariables = useMemo<Record<string, unknown>>(() => ({
    project_id: formData.project_id,
    project_code: selectedProjectCode,
    project_name: selectedProject?.name ?? "",
    office_id: formData.office_id,
    entity_id: formData.entity_id,
    dept_id: formData.dept_id,
    ...formData.form_input_data,
  }), [formData.project_id, formData.office_id, formData.entity_id, formData.dept_id, formData.form_input_data, selectedProject, selectedProjectCode]);

  const isDirty = useMemo(
    () => !!generatedNoSurat || formData.judul_surat.length > 0 || Object.keys(formData.form_input_data).length > 0,
    [generatedNoSurat, formData.judul_surat, formData.form_input_data]
  );

  const normalizeNameSearch = (value: string) =>
    value.toLowerCase().replace(/\s+/g, " ").trim();

  const getSelectedSignerName = (userId: string) =>
    master.users?.find((u: MasterRecord) => u.id === userId)?.full_name || "";

  const getShortPersonName = (name?: string | null) => {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    return parts[0] || "PIC";
  };

  const toReadableName = (value?: string | null) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, letter => letter.toUpperCase());

  const getDepartmentShortLabel = (department?: MasterRecord | null) => {
    const code = String(department?.code || "").trim().toUpperCase();
    const name = String(department?.name || "").trim();
    const normalizedName = name.toLowerCase();
    if (code === "PBO" || normalizedName === "pengembangan organisasi") return "PO";
    if (code === "HRD" || normalizedName.includes("hrd")) return "HRD";
    if (code === "KEU" || normalizedName.includes("keuangan")) return "Keu";
    if (code === "MKT" || normalizedName.includes("marketing")) return "Marketing";
    return code || name || "Pusat";
  };

  const getOfficeShortLabel = (office?: MasterRecord | null) => {
    const kedudukan = String(office?.kedudukan || "").trim();
    const name = String(office?.name || "").trim();
    if (!name) return kedudukan || "Kantor";
    const normalized = name.replace(/\s+/g, " ").trim();
    const prefixed = normalized.match(/^(KC|KCP)\s+(.+)$/i);
    if (prefixed) return `${prefixed[1].toUpperCase()}. ${toReadableName(prefixed[2])}`;
    if (/^KOST\s+/i.test(normalized)) return toReadableName(normalized);
    if (kedudukan && kedudukan.toLowerCase() !== "pusat") return `${kedudukan.toUpperCase()}. ${toReadableName(normalized)}`;
    return toReadableName(normalized);
  };

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

  const refreshActiveDrafts = useCallback(async () => {
    try {
      const drafts = await suratService.getActiveRegistrationDrafts();
      setActiveDrafts(drafts);
      return drafts;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Draft registrasi gagal dimuat.";
      if (!message.toLowerCase().includes("surat_registration_drafts")) {
        toast({ variant: "destructive", title: "Gagal memuat draft", description: message });
      }
      return [];
    }
  }, [toast]);

  // ── EFFECTS ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const shouldWarn = isDirty && (!activeDraftId || draftSaveState !== "saved");
    const h = (e: BeforeUnloadEvent) => { if (shouldWarn) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [isDirty, activeDraftId, draftSaveState]);

  useEffect(() => {
    suratService.getMasterData().then(data => {
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
        id, name, form_id, request_category, scope_type, recommendation_config,
        master_forms(id, nama_form, nomor_form, link_form, department_id, input_schema, unit_config, signature_layout),
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
          master_forms!fk_master_forms(id, nama_form, nomor_form, link_form, department_id, input_schema, unit_config),
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
    if (!currentProfile) return;
    let cancelled = false;
    const draftId = searchParams.get("draft");
    setDraftLoading(Boolean(draftId));

    Promise.all([
      refreshActiveDrafts(),
      draftId ? suratService.getRegistrationDraft(draftId) : Promise.resolve(null),
    ])
      .then(([drafts, requestedDraft]) => {
        if (cancelled) return;
        if (requestedDraft) {
          setDraftToRestore(requestedDraft);
          return;
        }
        if (!draftId && !isCurrentUserAdmin && drafts.length === 1) {
          setSearchParams({ draft: drafts[0].id }, { replace: true });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSearchParams({}, { replace: true });
        toast({
          variant: "destructive",
          title: "Draft tidak dapat dibuka",
          description: error instanceof Error ? error.message : "Draft tidak ditemukan atau sudah kedaluwarsa.",
        });
      })
      .finally(() => { if (!cancelled) setDraftLoading(false); });

    return () => { cancelled = true; };
  }, [currentProfile, isCurrentUserAdmin, refreshActiveDrafts, searchParams, setSearchParams, toast]);

  useEffect(() => {
    if (!draftToRestore || usageDetails.length === 0) return;
    const payload = draftToRestore.payload || {};
    const restoredFormData = payload.formData || {};
    const usageId = String(payload.selectedUsageId || restoredFormData.form_usage_id || restoredFormData.penggunaan_id || "");
    const usage = usageDetails.find(item => item.id === usageId) || null;
    const restoredLinkedContext = payload.linkedDocumentContext as LinkedDocumentContext | undefined;
    if (restoredLinkedContext?.type === "recommendation" && restoredLinkedContext.parentSuratId) {
      setLinkedDocumentContext(restoredLinkedContext);
    }

    setFormData(previous => ({
      ...previous,
      ...restoredFormData,
      form_input_data: restoredFormData.form_input_data || {},
    }));
    setSelectedFormId(String(payload.selectedFormId || usage?.form_id || usage?.master_forms?.id || ""));
    setSelectedUsage(usage);
    setSigners(Array.isArray(draftToRestore.signer_assignments) ? draftToRestore.signer_assignments : []);
    setDraftAttachments(draftToRestore.surat_registration_draft_files || []);
    setInitialAttachmentFiles({});
    setLampiranFiles([]);
    setGeneratedNoSurat(draftToRestore.no_surat);
    setActiveDraftId(draftToRestore.id);
    setJudulForDisplay(String(restoredFormData.judul_surat || ""));
    setDraftSaveState("saved");
    setDraftToRestore(null);

    window.requestAnimationFrame(() => {
      document.getElementById("surat-registration-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [draftToRestore, usageDetails, setJudulForDisplay]);

  useEffect(() => {
    if (!activeDraftId || !generatedNoSurat || draftToRestore) return;
    setDraftSaveState("saving");
    const timeout = window.setTimeout(() => {
      suratService.saveRegistrationDraft(
        activeDraftId,
        {
          formData,
          selectedFormId,
          selectedUsageId: selectedUsage?.id || "",
          linkedDocumentContext,
        },
        signers,
        "details"
      )
        .then(() => setDraftSaveState("saved"))
        .catch(() => setDraftSaveState("error"));
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [activeDraftId, generatedNoSurat, formData, selectedFormId, selectedUsage?.id, signers, draftToRestore, linkedDocumentContext]);

  useEffect(() => {
    if (!generatedNoSurat) {
      setSelectedUsage(null);
      setSelectedFormId("");
      setFormData(prev => ({ ...prev, penggunaan_id: "", form_usage_id: "" }));
      setSigners([]);
    }
  }, [isPusatSelected, generatedNoSurat]);

  useEffect(() => {
    if (!selectedUsage) return;
    const category = getRequestCategory();
    if (!category || !getWorkflowCategories(selectedUsage).includes(category)) {
      setSelectedUsage(null);
      setSigners([]);
    }
  }, [formData.dept_id, selectedUsage, formData.form_input_data.request_category]);

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

  // ── HANDLERS ───────────────────────────────────────────────────────────────
  const handleProjectChange = (projectId: string) => {
    const proj = master.projects?.find((p: MasterRecord) => p.id === projectId);
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
    try {
      const config = typeof detail.ttd_config === "string" ? JSON.parse(detail.ttd_config) : detail.ttd_config;
      if (Array.isArray(config)) {
        const total = config.length;
        setSigners(config.map((c: UsageStepConfig, i: number) => ({
          role_name: normalizeRoleName(c.roleName || c.role_name || c.labelJabatan || c.label_jabatan || c.jabatan, i, total),
          label_jabatan: c.labelJabatan || c.label_jabatan || c.jabatan,
          user_id: "",
          step_order: i + 1,
          form_usage_step_id: c.form_usage_step_id,
          action_type: c.action_type || "approval",
          candidate_scope: c.candidate_scope || "manual",
          eligible_user_ids: c.eligible_user_ids || [],
          verifier_user_ids: c.verifier_user_ids || [],
          attachment_requirements: detail.form_usage_attachment_requirements?.filter(rule => rule.stage_order === i + 1) || [],
          requires_unit_allocation: c.requires_unit_allocation === true || c.requiresUnitAllocation === true,
        })));
      }
    } catch { toast({ variant: "destructive", title: "Format Alur Salah" }); }
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
        request_category: "non_asset",
        request_mode: "barang",
        linked_document_type: "recommendation",
        linked_parent_surat_id: linkedDocumentContext.parentSuratId,
        linked_parent_no_surat: linkedDocumentContext.parentNoSurat || "",
        recommendation_parent_note: linkedDocumentContext.parentNoSurat
          ? `Rekomendasi untuk ${linkedDocumentContext.parentNoSurat}`
          : "Rekomendasi untuk surat aset induk",
      },
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
    if (!requestCategory) {
      return toast({
        variant: "destructive",
        title: "Klasifikasi Belum Dipilih",
        description: "Pilih Aset, Unit, atau Non Unit sebelum mendapatkan nomor surat.",
      });
    }
    if (!selectedUsage) {
      return toast({
        variant: "destructive",
        title: "Kegunaan Form Belum Dipilih",
        description: "Pilih form dan kegunaan sebelum mendapatkan nomor surat.",
      });
    }
    if (filteredUsage.length === 0) {
      return toast({
        variant: "destructive",
        title: "Matrix Belum Tersedia",
        description: "Belum ada matrix yang mendukung klasifikasi, kantor, dan departemen yang dipilih.",
      });
    }
    if (!isPusatSelected && !formData.project_id)
      return toast({ variant: "destructive", title: "Proyek Belum Dipilih" });
    if (requestCategory === "unit") {
      const count = Number(getFormFieldValue("requested_unit_count") || 0);
      const requestedProject = getFormFieldValue("requested_project") as { code?: string } | undefined;
      if (!requestedProject?.code) {
        return toast({ variant: "destructive", title: "Proyek Unit Wajib Dipilih" });
      }
      if (!Number.isFinite(count) || count < 1) {
        return toast({ variant: "destructive", title: "Jumlah Unit Wajib Diisi", description: "Jumlah unit minimal 1." });
      }
    }
    setIsProcessingNumber(true);
    try {
      const res = await suratService.generateNoSurat(formData);
      let draft: SuratRegistrationDraft;
      try {
        draft = await suratService.createRegistrationDraft({
          noUrut: res.noUrut,
          noSurat: res.fullNumber,
          payload: {
            formData,
            selectedFormId,
            selectedUsageId: selectedUsage.id,
            linkedDocumentContext,
          },
          signerAssignments: signers,
        });
      } catch (draftError) {
        await suratService.cancelRegistration(res.fullNumber).catch(() => undefined);
        throw draftError;
      }
      setGeneratedNoSurat(res.fullNumber);
      setActiveDraftId(draft.id);
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
      if (activeDraftId) await suratService.voidRegistrationDraft(activeDraftId);
      else await suratService.cancelRegistration(generatedNoSurat);
      setGeneratedNoSurat(null);
      setActiveDraftId(null);
      setManualTitleOverride(false);
      setManualPlaceOverride(false);
      setDraftAttachments([]);
      setInitialAttachmentFiles({});
      setLampiranFiles([]);
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
    setInitialAttachmentFiles({});
    setDraftAttachments([]);
    setUploadingRequirement(null);
    setUploadingRecommendationAttachment(null);
    setRegistrationSummaryOpen(false);
    setDatePickerOpen({});
    setActiveDraftId(null);
    setDraftModalOpen(false);
    setDraftSaveState("idle");
    setLinkedDocumentContext(null);
    setSearchParams({}, { replace: true });
    setJudulForDisplay("");
  };

  const handleBackToDraftList = async () => {
    if (activeDraftId && generatedNoSurat) {
      try {
        setDraftSaveState("saving");
        await suratService.saveRegistrationDraft(
          activeDraftId,
          {
            formData,
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

  const validateRegistration = () => {
    if (uploadingRequirement || uploadingRecommendationAttachment) {
      toast({
        variant: "destructive",
        title: "Upload Belum Selesai",
        description: "Tunggu sampai seluruh lampiran selesai disimpan.",
      });
      return false;
    }
    if (!generatedNoSurat || !activeDraftId) {
      toast({ variant: "destructive", title: "Nomor Surat Belum Siap", description: "Pesan nomor surat terlebih dahulu." });
      return false;
    }
    if (!selectedUsage?.master_forms?.link_form) {
      toast({ variant: "destructive", title: "Template Belum Tersedia" });
      return false;
    }
    if (!formData.request_place.trim()) {
      toast({ variant: "destructive", title: "Tempat Wajib Diisi" });
      return false;
    }
    if (!formData.request_date) {
      toast({ variant: "destructive", title: "Tanggal Wajib Diisi" });
      return false;
    }
    if (!hasPlaceDateMapping(selectedUsage)) {
      toast({
      variant: "destructive",
      title: "Mapping Tempat/Tanggal Belum Ada",
      description: "Admin harus mapping field Tempat, Tanggal ke cell Excel di Master Template.",
      });
      return false;
    }
    if (lampiranFiles.length + draftAttachments.length === 0 && shouldRequireInitialAttachment()) {
      toast({ variant: "destructive", title: "Lampiran Wajib", description: "Unggah minimal satu lampiran." });
      return false;
    }
    const missingInitialAttachments = getMissingInitialAttachmentLabels();
    if (missingInitialAttachments.length > 0) {
      toast({
        variant: "destructive",
        title: "Lampiran Belum Lengkap",
        description: `Lengkapi: ${missingInitialAttachments.join(", ")}.`,
      });
      return false;
    }
    if (isUnitMode) {
      if (!hasUnitRequestFields(selectedUsage)) {
        toast({ variant: "destructive", title: "Matrix Unit Tidak Valid", description: "Pilih matrix/template yang mendukung permohonan unit." });
        return false;
      }
      if (!canCurrentDepartmentRequestUnit(selectedUsage)) {
        toast({ variant: "destructive", title: "Mode Unit Tidak Diizinkan", description: "Departemen ini tidak termasuk konfigurasi pengaju unit." });
        return false;
      }
      const count = Number(getFormFieldValue("requested_unit_count") || 0);
      const requestedProject = getFormFieldValue("requested_project") as { code?: string } | undefined;
      if (!requestedProject?.code) {
        toast({ variant: "destructive", title: "Proyek Wajib Dipilih", description: "Pilih proyek untuk permohonan unit." });
        return false;
      }
      if (!Number.isFinite(count) || count < 1) {
        toast({ variant: "destructive", title: "Jumlah Unit Wajib Diisi", description: "Jumlah unit minimal 1." });
        return false;
      }
    }
    const missingField = getManualInputFields(selectedUsage).find((field: TemplateField) => !isManualFieldComplete(field));
    if (missingField) {
      toast({ variant: "destructive", title: "Input Belum Lengkap", description: `${missingField.label} wajib diisi.` });
      return false;
    }
    if (signers.some(s => !s.user_id)) {
      toast({ variant: "destructive", title: "Pejabat Belum Lengkap" });
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
      "recommendation_template_name", "requires_recommendation",
    ]);
    const fields: RegistrationSummaryField[] = formFields
      .filter((field) => !hiddenKeys.has(field.key))
      .map((field) => ({
        key: field.key,
        label: field.label || humanizeInputKey(field.key),
        type: field.type,
        value: formData.form_input_data[field.key],
      }))
      .filter((field) => Array.isArray(field.value) ? field.value.length > 0 : formatSummaryValue(field.value) !== "-");

    Object.entries(formData.form_input_data).forEach(([key, value]) => {
      if (mappedKeys.has(key) || hiddenKeys.has(key) || formatSummaryValue(value) === "-") return;
      if (["requested_project", "requested_unit_count", "catatan"].includes(key)) {
        fields.push({ key, label: humanizeInputKey(key), value });
      }
    });

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
      projectName: selectedProject?.name || undefined,
      requestPlace: formData.request_place,
      requestDate: formData.request_date,
      fields,
      attachments: [
        ...localAttachments,
        ...draftAttachments.map((attachment) => ({
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
    if (!validateRegistration()) return;
    setRegistrationSummaryOpen(true);
  };

  const handleSubmit = async () => {
    if (submitLockRef.current || isLoading) return;
    if (!validateRegistration()) return;
    submitLockRef.current = true;
    setIsLoading(true);
    try {
      const initialAttachmentMeta = Object.fromEntries(
        getInitialAttachmentRequirements().flatMap(rule =>
          (initialAttachmentFiles[rule.requirement_key] || []).map(file => [
            file.name,
            { key: rule.requirement_key, label: rule.label },
          ])
        )
      );
      const result = await suratService.createRegistrasi(
        { ...formData, no_surat: generatedNoSurat, initial_attachment_meta: initialAttachmentMeta },
        signers,
        null,
        lampiranFiles,
        draftAttachments
      );
      if (result) {
        let autoSignWarning = "";
        if (linkedDocumentContext?.type === "recommendation" && linkedDocumentContext.parentSuratId) {
          if (linkedDocumentContext.taskId) {
            await suratService.completeRecommendationTask(linkedDocumentContext.taskId, result.id);
          } else {
            await suratService.linkRecommendationDocument(
              linkedDocumentContext.parentSuratId,
              result.id,
              linkedDocumentContext.requiredBeforeStep ?? null
            );
          }
          try {
            await suratService.autoApproveRecommendationFirstStep(result.id);
          } catch (autoSignError: unknown) {
            autoSignWarning = autoSignError instanceof Error
              ? ` Tanda tangan otomatis belum berhasil: ${autoSignError.message}`
              : " Tanda tangan otomatis belum berhasil.";
          }
        }
        if (activeDraftId) {
          await suratService.finishRegistrationDraft(activeDraftId, "SUBMITTED");
          setActiveDrafts(previous => previous.filter(draft => draft.id !== activeDraftId));
        }
        toast({
          title: linkedDocumentContext?.type === "recommendation" ? "Rekomendasi Berhasil Dibuat" : "Pendaftaran Berhasil",
          description: linkedDocumentContext?.type === "recommendation"
            ? `Nomor ${result.no_surat} sudah ditautkan ke surat induk.${autoSignWarning}`
            : `Nomor ${result.no_surat} telah disimpan.`,
        });
        onSuccess(result.no_surat, formData.judul_surat);
        resetForm();
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
    const rows = getTableRows(field.key);
    const maxRows = Math.max(
      Number(field.table_config?.end_row || 0) - Number(field.table_config?.start_row || 0) + 1,
      1
    );
    const canAddRow = rows.length < maxRows;

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Item Rekomendasi</p>
              <p className="mt-1 text-xs text-muted-foreground">{rows.length}/{maxRows} item</p>
            </div>
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
          </div>
        </div>

        {rows.map((row: TableRow, rowIndex: number) => {
          const selectedUserId = String(row.lokasi_pic_user_id ?? "");
          const selectedAction = getRecommendationAction(row);
          const selectedUser = selectedUserId ? master.users.find((user) => user.id === selectedUserId) : null;
          const picLabel = String(row.lokasi_pic ?? "") || (selectedUserId ? getRecommendationPicLabel(selectedUserId) : "");

          return (
            <div key={rowIndex} className="rounded-lg border border-border bg-background p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">No. {rowIndex + 1}</p>
                  <p className="text-sm font-semibold text-foreground">
                    {String(row.nama_barang ?? "").trim() || "Item rekomendasi"}
                  </p>
                </div>
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
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Nama Barang / Alat Kerja *</Label>
                  <Input
                    value={String(row.nama_barang ?? "")}
                    onChange={(event) => updateTableCell(field.key, rowIndex, "nama_barang", event.target.value)}
                    className="h-11 bg-background text-sm"
                    placeholder="Contoh: Mikrofon kondensor"
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
                  <Label className="text-xs font-semibold text-muted-foreground">Lokasi / PIC *</Label>
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
                  <div className="grid grid-cols-3 gap-2">
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
                  <Label className="text-xs font-semibold text-muted-foreground">Uraian *</Label>
                  <Input
                    value={String(row.uraian ?? "")}
                    onChange={(event) => updateTableCell(field.key, rowIndex, "uraian", event.target.value)}
                    className="h-11 bg-background text-sm"
                    placeholder="Contoh: Pembelian baru / service adaptor / ganti unit"
                  />
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Keterangan</Label>
                <Textarea
                  value={String(row.keterangan ?? "")}
                  onChange={(event) => updateTableCell(field.key, rowIndex, "keterangan", event.target.value)}
                  className="min-h-20 bg-background text-sm"
                  placeholder="Opsional"
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
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Link disimpan di data rekomendasi. Posisi di template bisa ditentukan nanti jika sudah ada area khusus.
                  </p>
                </div>

                {(() => {
                  const attachment = getRecommendationAttachment(row);
                  const uploadKey = `${field.key}-${rowIndex}`;
                  const isUploading = uploadingRecommendationAttachment === uploadKey;
                  const inputId = `${field.key}-${rowIndex}-recommendation-image`;
                  return (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">Lampiran Gambar *</Label>
                      <div
                        role="button"
                        tabIndex={0}
                        onPaste={(event) => handleRecommendationPaste(event, field.key, rowIndex)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleRecommendationDrop(event, field.key, rowIndex)}
                        className={cn(
                          "group rounded-lg border border-dashed bg-muted/20 p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                          attachment ? "border-primary/25" : "border-border hover:border-primary/40 hover:bg-primary/5"
                        )}
                      >
                        {attachment?.file_url ? (
                          <div className="space-y-3">
                            <div className="overflow-hidden rounded-md border border-border bg-background">
                              <img
                                src={attachment.file_url}
                                alt={`Lampiran gambar rekomendasi item ${rowIndex + 1}`}
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
                          className="sr-only"
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
            </div>
          );
        })}
      </div>
    );
  };

  const renderTableField = (field: TemplateField) => {
    if (field.key === RECOMMENDATION_ITEMS_KEY) return renderRecommendationItemsField(field);

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
                {field.label}
              </Label>
            </div>
            <p className="mt-2 text-[11px] font-medium text-muted-foreground">
              {isTable
                ? "Gunakan tombol tambah baris jika item lebih dari satu."
                : "Data ini akan ditulis otomatis ke template dan PDF."}
            </p>
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
        ) : (
          <Input
            type={field.type === "number" || field.type === "currency" ? "number" : "text"}
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
      if (!hasUnitRequestFields(selectedUsage)) return true;
      if (field.key === "requested_unit_count") return false;
      if (isUnitMode) return field.key !== "items" && field.key !== "unit";
      return field.key !== "unit";
    });

  const renderUnitRequestPanel = () => {
    if (!isUnitMode) return null;
    const selectedProject = getFormFieldValue("requested_project") as ProjectRaw | undefined;
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
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">Jumlah Unit Diajukan</Label>
            <Input
              type="number"
              min={1}
              value={String(getFormFieldValue("requested_unit_count") ?? "")}
              onChange={(e) => handleRequestedUnitCountChange(e.target.value)}
              disabled={!!generatedNoSurat}
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
            { value: "non_unit", label: "Non Unit", description: "Dokumen umum selain unit" },
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
    try {
      const uploaded = await suratService.uploadRegistrationDraftFiles(activeDraftId, selected, {
        key: rule.requirement_key,
        label: rule.label,
      });
      setDraftAttachments(previous => [...previous, ...uploaded]);
      toast({
        title: "Lampiran Tersimpan",
        description: `${uploaded.length} file tersimpan pada draft.`,
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Gagal Mengunggah Lampiran",
        description: error instanceof Error ? error.message : "Coba unggah kembali.",
      });
    } finally {
      setUploadingRequirement(null);
    }
  };

  const handleRemoveDraftAttachment = async (attachment: SuratRegistrationDraftFile) => {
    try {
      await suratService.deleteRegistrationDraftFile(attachment.id);
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
            const isUploading = uploadingRequirement === rule.requirement_key;
            return (
              <div key={rule.id} className="rounded-xl border border-border bg-background/70 p-4">
                <div className="mb-3">
                  <span className="text-xs font-black uppercase">{rule.label}</span>
                  {rule.is_required && <span className="ml-2 text-destructive">*</span>}
                  <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                    {isUploading
                      ? "Mengunggah dan menyimpan..."
                      : totalFiles > 0
                        ? `${totalFiles} dari ${rule.max_files} file tersimpan`
                        : `Maksimal ${rule.max_files} file`}
                  </p>
                </div>
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
                  disabled={isUploading || totalFiles >= rule.max_files}
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

        {/* ══ SECTION 1: LOKASI & KLASIFIKASI ══════════════════════════════ */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">1</span>
            <h3 className="text-sm font-semibold text-foreground">Lokasi dan Klasifikasi</h3>
          </div>

          {linkedDocumentContext?.type === "recommendation" && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
              <p className="font-semibold">Dokumen rekomendasi aset</p>
              <p className="mt-1 text-xs leading-5">
                Nomor dan approval dokumen ini berdiri sendiri, lalu hasilnya otomatis ditautkan ke surat induk
                {linkedDocumentContext.parentNoSurat ? ` ${linkedDocumentContext.parentNoSurat}` : ""}.
              </p>
            </div>
          )}

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

            {/* Proyek (cabang saja) */}
            {!isPusatSelected && formData.office_id && (
              <div className="space-y-2 animate-in slide-in-from-top-2">
              <Label className="ml-1 flex items-center gap-2 text-xs font-semibold text-primary">
                  <Briefcase className="w-3 h-3" /> Pilih Proyek Cabang
                </Label>
                <Select disabled={!!generatedNoSurat} value={formData.project_id} onValueChange={handleProjectChange}>
                  <SelectTrigger className="h-11 border-primary/40 bg-primary/5">
                    <SelectValue placeholder="Pilih Proyek..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredProjects.map((p: MasterRecord) => (
                      <SelectItem key={p.id} value={p.id}>{p.code ? `${p.code} - ${p.name}` : p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <SelectContent>
                  {master.entities?.map((e: MasterRecord) => (
                    <SelectItem key={e.id} value={e.id}>{e.code} - {e.name}</SelectItem>
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

          {!generatedNoSurat && !!formData.letter_type_id && (
            <>
              {renderRequestClassificationStep()}
              {renderRecommendationOptionStep()}
              {isUnitMode && renderUnitRequestPanel()}
            </>
          )}

          {/* ══ TOGGLE ASET — posisi baru, MENCOLOK, tepat sebelum tombol nomor ══ */}
          {Boolean(import.meta.env.VITE_SHOW_LEGACY_ASSET_TOGGLE) && !generatedNoSurat && (
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
          {!generatedNoSurat && getRequestCategory() && (
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

          {!generatedNoSurat ? (
            <Button
              onClick={handleGetNumber}
              disabled={isProcessingNumber || !formData.entity_id || !formData.dept_id || !formData.letter_type_id}
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
            </div>
          )}
        </section>

        {/* ══ SECTION 2: BERKAS ════════════════════════════════════════════ */}
        {generatedNoSurat && (
          <div id="surat-registration-details" className="scroll-mt-24 space-y-8 animate-in slide-in-from-bottom-5 duration-500">
            <section className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">2</span>
                <h3 className="text-sm font-semibold text-foreground">Persetujuan dan Berkas</h3>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* Kiri: matrix + judul + template */}
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-semibold text-muted-foreground">Perihal (Judul Surat)</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => {
                          const nextTitle = buildAutoTitle();
                          setManualTitleOverride(false);
                          setFormData({ ...formData, judul_surat: nextTitle });
                          setJudulForDisplay(nextTitle);
                        }}
                      >
                        Reset otomatis
                      </Button>
                    </div>
                    <Input className="h-12 bg-muted/20 border-none ring-1 ring-border focus-visible:ring-primary"
                      placeholder="Contoh: Permohonan Pembelian Inventaris Kantor"
                      value={formData.judul_surat}
                      onChange={e => { setManualTitleOverride(true); setFormData({ ...formData, judul_surat: e.target.value }); setJudulForDisplay(e.target.value); }}
                    />
                  </div>

                </div>

                <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-5">
                  <p className="text-sm font-semibold text-foreground">Tanggal Dokumen</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs font-semibold text-muted-foreground">Tempat</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            setManualPlaceOverride(false);
                            setFormData({ ...formData, request_place: getDefaultRequestPlace(selectedOffice) });
                          }}
                        >
                          Reset
                        </Button>
                      </div>
                      <Input
                        value={formData.request_place}
                        onChange={e => { setManualPlaceOverride(true); setFormData({ ...formData, request_place: e.target.value }); }}
                        placeholder="Contoh: Jakarta"
                        className="h-12 bg-background/70 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">Tanggal</Label>
                      {renderDatePickerField({
                        openKey: "request_date",
                        value: formData.request_date,
                        onChange: (value) => setFormData({ ...formData, request_date: value }),
                        placeholder: "dd/mm/yyyy",
                      })}
                    </div>
                  </div>
                </div>
              </div>

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

              {renderAttachmentUploader()}
            </section>

            {/* ══ SECTION 3: SIGNERS ═══════════════════════════════════════ */}
            {signers.length > 0 && (
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

                <div className="pt-6">
                  <Button
                    className="h-12 w-full text-base font-semibold disabled:opacity-50"
                    disabled={isLoading || Boolean(uploadingRequirement) || Boolean(uploadingRecommendationAttachment) || signers.some(s => !s.user_id) || !formData.judul_surat}
                    onClick={handleOpenRegistrationSummary}
                  >
                    {uploadingRequirement || uploadingRecommendationAttachment
                      ? <div className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin" /><span>Menyimpan Lampiran...</span></div>
                      : "Konfirmasi Pendaftaran"
                    }
                  </Button>
                  <p className="mt-3 text-center text-xs font-medium text-muted-foreground">
                    Pastikan semua data sudah benar sebelum konfirmasi
                  </p>
                </div>
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
