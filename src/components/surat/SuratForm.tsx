import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Hash, ArrowDown, Loader2, Briefcase,
  Check, ChevronDown, Copy, RefreshCcw,
  ShieldCheck, AlertTriangle, Archive, Home, X, Plus
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
  workflow_allowed_departments?: Array<{ department_id: string }>;
  form_usage_steps?: Array<{
    id: string;
    step_order: number;
    role_name: string;
    label: string;
    action_type?: "approval" | "unit_allocation";
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
    columns?: Array<{
      key: string;
      label?: string;
      type?: string;
      required?: boolean;
    }>;
  };
};

type RequestCategory = "asset" | "unit" | "non_unit" | "non_asset";
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
  | Record<string, unknown>;
type FormInputData = Record<string, FormFieldValue>;
type SignerAssignment = {
  step_order: number;
  role_name: string;
  label_jabatan: string;
  user_id?: string | null;
  form_usage_step_id?: string;
  action_type?: "approval" | "unit_allocation";
  eligible_user_ids?: string[];
  verifier_user_ids?: string[];
  attachment_requirements?: UsageDetailRecord["form_usage_attachment_requirements"];
};

type CurrentProfile = {
  id: string;
  role?: string | null;
  department_id?: string | null;
  office_id?: string | null;
};

export function SuratForm({ onSuccess, isLoading, setIsLoading, setJudulForDisplay }: SuratFormProps) {
  const { toast } = useToast();
  const appDialog = useAppDialog();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── STATE ──────────────────────────────────────────────────────────────────
  const [master, setMaster] = useState<MasterData>({ entities: [], depts: [], offices: [], types: [], users: [], projects: [] });
  const [usageDetails, setUsageDetails]           = useState<UsageDetailRecord[]>([]);
  const [selectedUsage, setSelectedUsage]         = useState<UsageDetailRecord | null>(null);
  const [selectedFormId, setSelectedFormId]       = useState("");
  const [generatedNoSurat, setGeneratedNoSurat]   = useState<string | null>(null);
  const [isProcessingNumber, setIsProcessingNumber] = useState(false);
  const [isCopied, setIsCopied]                   = useState(false);
  const [activeDraftId, setActiveDraftId]         = useState<string | null>(null);
  const [activeDrafts, setActiveDrafts]           = useState<SuratRegistrationDraft[]>([]);
  const [draftToRestore, setDraftToRestore]       = useState<SuratRegistrationDraft | null>(null);
  const [draftLoading, setDraftLoading]           = useState(false);
  const [draftSaveState, setDraftSaveState]       = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [openSignerIndex, setOpenSignerIndex]     = useState<number | null>(null);
  const [signerSearch, setSignerSearch]           = useState<Record<number, string>>({});
  const [lampiranFiles, setLampiranFiles]         = useState<File[]>([]);
  const [initialAttachmentFiles, setInitialAttachmentFiles] = useState<Record<string, File[]>>({});
  const [draftAttachments, setDraftAttachments]   = useState<SuratRegistrationDraftFile[]>([]);
  const [uploadingRequirement, setUploadingRequirement] = useState<string | null>(null);
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
    request_place: "", request_date: new Date().toISOString().slice(0, 10),
    form_input_data: {} as FormInputData
  });
  const [signers, setSigners] = useState<SignerAssignment[]>([]);

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
      const nextInput = category === "unit"
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

  const getTableRows = (key: string) => {
    const rows = formData.form_input_data[key];
    if (!Array.isArray(rows) || rows.length === 0) return [{}];
    return rows
      .filter((row): row is TableRow => !!row && typeof row === "object" && !Array.isArray(row))
      .map((row) => ({ ...row }));
  };

  const setTableRows = (key: string, rows: TableRow[]) => {
    setInputValue(key, rows);
  };

  const updateTableCell = (key: string, rowIndex: number, columnKey: string, value: unknown) => {
    const rows = [...getTableRows(key)];
    rows[rowIndex] = { ...rows[rowIndex], [columnKey]: value };
    setTableRows(key, rows);
  };

  const addTableRow = (key: string) => {
    setTableRows(key, [...getTableRows(key), {}]);
  };

  const removeTableRow = (key: string, rowIndex: number) => {
    const rows = getTableRows(key).filter((_, index) => index !== rowIndex);
    setTableRows(key, rows.length > 0 ? rows : [{}]);
  };

  const isTableFieldComplete = (field: TemplateField) => {
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
  const lockProfileLocation = Boolean(currentProfile) && !isCurrentUserAdmin;
  const profileOfficeId = currentProfile?.office_id || "";
  const profileDepartmentId = currentProfile?.department_id || requesterDepartmentId;

  const filteredUsage = useMemo(() => {
    const category = getRequestCategory();
    if (!category) return [];
    return usageDetails.filter((item) => {
      if (item.scope_type && item.scope_type !== "all") {
        if (item.scope_type === "pusat" && !isPusatSelected) return false;
        if (item.scope_type === "cabang" && isPusatSelected) return false;
      } else if (item.is_cabang !== undefined && item.is_cabang !== !isPusatSelected) return false;
      if (!getWorkflowCategories(item).includes(category)) return false;
      if (!canDepartmentRequestUnit(item, formData.dept_id || requesterDepartmentId)) return false;
      return true;
    });
  }, [usageDetails, isPusatSelected, requesterDepartmentId, formData.dept_id, formData.form_input_data.request_category]);

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

  const getFilteredSignerUsers = (index: number) => {
    const tokens = normalizeNameSearch(signerSearch[index] || "").split(" ").filter(Boolean);
    const eligibleIds = signers[index]?.eligible_user_ids || [];
    const eligibleUsers = eligibleIds.length > 0
      ? (master.users || []).filter(user => eligibleIds.includes(user.id))
      : signers[index]?.form_usage_step_id
        ? []
        : (master.users || []);
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

  const loadUsageDetails = useCallback(async () => {
    const { data, error } = await supabase.from("form_usages")
      .select(`
        id, name, form_id, request_category, scope_type,
        master_forms(id, nama_form, nomor_form, link_form, department_id, input_schema, unit_config, signature_layout),
        form_usage_departments(department_id),
        form_usage_steps(
          id, step_order, role_name, label, action_type, signer_department_id,
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
        if (!draftId && drafts.length === 1) {
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
  }, [refreshActiveDrafts, searchParams, setSearchParams, toast]);

  useEffect(() => {
    if (!draftToRestore || usageDetails.length === 0) return;
    const payload = draftToRestore.payload || {};
    const restoredFormData = payload.formData || {};
    const usageId = String(payload.selectedUsageId || restoredFormData.form_usage_id || restoredFormData.penggunaan_id || "");
    const usage = usageDetails.find(item => item.id === usageId) || null;

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
        },
        signers,
        "details"
      )
        .then(() => setDraftSaveState("saved"))
        .catch(() => setDraftSaveState("error"));
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [activeDraftId, generatedNoSurat, formData, selectedFormId, selectedUsage?.id, signers, draftToRestore]);

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
    const fields = getExternalInputFields(selectedUsage);
    if (fields.length === 0) return;

    let cancelled = false;
    fields.forEach(async (field: TemplateField) => {
      const sourceKey = String(field.external_source_key || field.externalSourceKey || "");
      const dependencyKey = String(field.external_dependency_key || field.externalDependencyKey || "");
      const dependencyValue = dependencyKey ? externalVariables[dependencyKey] : true;

      if (!sourceKey || !dependencyValue) {
        setExternalOptions(prev => ({ ...prev, [field.key]: [] }));
        setExternalErrors(prev => ({ ...prev, [field.key]: dependencyKey ? `${field.label} menunggu ${dependencyKey}.` : "Data source belum diset." }));
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
  }, [selectedUsage, externalVariables]);

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

  const handleUsageChange = (val: string) => {
    const detail = usageDetails.find(u => u.id === val);
    if (!detail) return;
    const isNewUsage = Array.isArray(detail.form_usage_steps);
    setSelectedUsage(detail);
    setFormData(prev => {
      return {
        ...prev,
        penggunaan_id: isNewUsage ? "" : val,
        form_usage_id: isNewUsage ? val : "",
      };
    });
    try {
      const config = typeof detail.ttd_config === "string" ? JSON.parse(detail.ttd_config) : detail.ttd_config;
      if (Array.isArray(config)) {
        const total = config.length;
        setSigners(config.map((c: { form_usage_step_id?: string; roleName?: string; role_name?: string; labelJabatan?: string; label_jabatan?: string; jabatan?: string; action_type?: "approval" | "unit_allocation"; eligible_user_ids?: string[]; verifier_user_ids?: string[]; requires_unit_allocation?: boolean; requiresUnitAllocation?: boolean }, i: number) => ({
          role_name: normalizeRoleName(c.roleName || c.role_name || c.labelJabatan || c.label_jabatan || c.jabatan, i, total),
          label_jabatan: c.labelJabatan || c.label_jabatan || c.jabatan,
          user_id: "",
          step_order: i + 1,
          form_usage_step_id: c.form_usage_step_id,
          action_type: c.action_type || "approval",
          eligible_user_ids: c.eligible_user_ids || [],
          verifier_user_ids: c.verifier_user_ids || [],
          attachment_requirements: detail.form_usage_attachment_requirements?.filter(rule => rule.stage_order === i + 1) || [],
          requires_unit_allocation: c.requires_unit_allocation === true || c.requiresUnitAllocation === true,
        })));
      }
    } catch { toast({ variant: "destructive", title: "Format Alur Salah" }); }
  };

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
      setSearchParams({ draft: draft.id }, { replace: true });
      await refreshActiveDrafts();
      toast({ title: "Nomor Berhasil Didapatkan", description: "Draft disimpan otomatis selama Anda melengkapi dokumen." });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Gagal Mendapatkan Nomor", description: e instanceof Error ? e.message : "Gagal mendapatkan nomor surat." });
    } finally { setIsProcessingNumber(false); }
  };

  const handleResetNumber = async () => {
    if (!generatedNoSurat) return;
    const confirmed = await appDialog.confirm({
      title: "Batalkan Nomor Surat?",
      description: "Nomor ini akan dikosongkan dari antrean dan tidak dipakai untuk pengajuan ini.",
      confirmText: "Batalkan Nomor",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      if (activeDraftId) await suratService.voidRegistrationDraft(activeDraftId);
      else await suratService.cancelRegistration(generatedNoSurat);
      setGeneratedNoSurat(null);
      setActiveDraftId(null);
      setDraftAttachments([]);
      setInitialAttachmentFiles({});
      setLampiranFiles([]);
      setDraftSaveState("idle");
      setSearchParams({}, { replace: true });
      await refreshActiveDrafts();
      toast({ title: "Nomor Dibatalkan" });
    } catch { toast({ variant: "destructive", title: "Gagal membatalkan nomor" }); }
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

  const resetForm = () => {
    setFormData({
      entity_id: "",
      dept_id: lockProfileLocation ? profileDepartmentId : requesterDepartmentId,
      letter_type_id: "",
      office_id: lockProfileLocation ? profileOfficeId : (officePusat?.id || ""),
      project_id: "",
      judul_surat: "", penggunaan_id: "", is_aset: false,
      form_usage_id: "",
      request_place: "", request_date: new Date().toISOString().slice(0, 10), form_input_data: {}
    });
    setGeneratedNoSurat(null); setSelectedUsage(null); setSelectedFormId(""); setLampiranFiles([]); setSigners([]);
    setInitialAttachmentFiles({});
    setDraftAttachments([]);
    setUploadingRequirement(null);
    setActiveDraftId(null);
    setDraftSaveState("idle");
    setSearchParams({}, { replace: true });
    setJudulForDisplay("");
  };

  const handleSubmit = async () => {
    if (!selectedUsage?.master_forms?.link_form) return toast({ variant: "destructive", title: "Template Belum Tersedia" });
    if (!formData.request_place.trim()) return toast({ variant: "destructive", title: "Tempat Wajib Diisi" });
    if (!formData.request_date) return toast({ variant: "destructive", title: "Tanggal Wajib Diisi" });
    if (!hasPlaceDateMapping(selectedUsage)) return toast({
      variant: "destructive",
      title: "Mapping Tempat/Tanggal Belum Ada",
      description: "Admin harus mapping field Tempat, Tanggal ke cell Excel di Master Template.",
    });
    if (lampiranFiles.length + draftAttachments.length === 0 && shouldRequireInitialAttachment()) {
      return toast({ variant: "destructive", title: "Lampiran Wajib", description: "Unggah minimal satu lampiran." });
    }
    const missingInitialAttachments = getMissingInitialAttachmentLabels();
    if (missingInitialAttachments.length > 0) {
      return toast({
        variant: "destructive",
        title: "Lampiran Belum Lengkap",
        description: `Lengkapi: ${missingInitialAttachments.join(", ")}.`,
      });
    }
    if (isUnitMode) {
      if (!hasUnitRequestFields(selectedUsage)) {
        return toast({ variant: "destructive", title: "Matrix Unit Tidak Valid", description: "Pilih matrix/template yang mendukung permohonan unit." });
      }
      if (!canCurrentDepartmentRequestUnit(selectedUsage)) {
        return toast({ variant: "destructive", title: "Mode Unit Tidak Diizinkan", description: "Departemen ini tidak termasuk konfigurasi pengaju unit." });
      }
      const count = Number(getFormFieldValue("requested_unit_count") || 0);
      const requestedProject = getFormFieldValue("requested_project") as { code?: string } | undefined;
      if (!requestedProject?.code) return toast({ variant: "destructive", title: "Proyek Wajib Dipilih", description: "Pilih proyek untuk permohonan unit." });
      if (!Number.isFinite(count) || count < 1) return toast({ variant: "destructive", title: "Jumlah Unit Wajib Diisi", description: "Jumlah unit minimal 1." });
    }
    const missingField = getManualInputFields(selectedUsage).find((field: TemplateField) => !isManualFieldComplete(field));
    if (missingField) return toast({ variant: "destructive", title: "Input Belum Lengkap", description: `${missingField.label} wajib diisi.` });
    if (signers.some(s => !s.user_id)) return toast({ variant: "destructive", title: "Pejabat Belum Lengkap" });
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
        if (activeDraftId) {
          await suratService.finishRegistrationDraft(activeDraftId, "SUBMITTED");
          setActiveDrafts(previous => previous.filter(draft => draft.id !== activeDraftId));
        }
        toast({ title: "Pendaftaran Berhasil", description: `Nomor ${result.no_surat} telah disimpan.` });
        onSuccess(result.no_surat, formData.judul_surat);
        resetForm();
      }
    } catch (error: unknown) {
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: error instanceof Error ? error.message : "Gagal menyimpan surat." });
    } finally { setIsLoading(false); }
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  const renderTableField = (field: TemplateField) => {
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
                {columns.map((column: { key: string; label?: string; required?: boolean; type?: string }) => (
                  <div key={column.key} className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground">
                      {column.label}{column.required !== false ? " *" : ""}
                    </Label>
                    <Input
                      type={column.type === "number" ? "number" : "text"}
                      value={String(row?.[column.key] ?? "")}
                      onChange={e => updateTableCell(field.key, rowIndex, column.key, e.target.value)}
                      className="h-12 bg-background text-sm"
                      placeholder={`Isi ${column.label}`}
                    />
                  </div>
                ))}
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
        ) : (
          <Input
            type={field.type === "date" ? "date" : field.type === "number" || field.type === "currency" ? "number" : "text"}
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
      if (!isUnitMode && isUnitField(field)) return false;
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
    <Card className="overflow-hidden border border-border bg-card shadow-[var(--shadow-card)]">
      <CardContent className="space-y-7 p-4 sm:p-5 md:p-6">

        {!generatedNoSurat && (draftLoading || activeDrafts.length > 1) && (
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Lanjutkan draft registrasi</p>
                <p className="mt-1 text-xs text-muted-foreground">Pilih nomor yang ingin dilanjutkan.</p>
              </div>
              {draftLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            </div>
            {!draftLoading && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {activeDrafts.map(draft => (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => setSearchParams({ draft: draft.id }, { replace: true })}
                    className="min-h-16 rounded-md border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="block font-mono text-xs font-semibold text-primary">{draft.no_surat}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {String(draft.payload?.formData?.judul_surat || "Belum ada judul")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PERINGATAN nomor sudah dipesan ───────────────────────────────── */}
        {generatedNoSurat && (
          <div className="animate-in fade-in zoom-in-95 duration-300">
            <div className={cn(
              "flex items-center gap-4 rounded-lg border p-4",
              draftSaveState === "error"
                ? "border-destructive/20 bg-destructive/10 text-destructive"
                : "border-primary/20 bg-primary/5 text-foreground"
            )}>
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
          </div>
        )}

        {/* ══ SECTION 1: LOKASI & KLASIFIKASI ══════════════════════════════ */}
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
                onValueChange={v => setFormData({ ...formData, dept_id: v })}>
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
                  {master.types?.map((t: MasterRecord) => (
                    <SelectItem key={t.id} value={t.id}>{t.code} - {t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!generatedNoSurat && !!formData.letter_type_id && (
            <>
              {renderRequestClassificationStep()}
              {isUnitMode && renderUnitRequestPanel()}
            </>
          )}

          {/* ══ TOGGLE ASET — posisi baru, MENCOLOK, tepat sebelum tombol nomor ══ */}
          {false && !generatedNoSurat && (
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
              <Button variant="outline" onClick={handleResetNumber} className="border-primary text-primary font-bold hover:bg-primary/5">
                <RefreshCcw className="w-4 h-4 mr-2" /> Ubah Identitas
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
                    <Label className="text-xs font-semibold text-muted-foreground">Perihal (Judul Surat)</Label>
                    <Input className="h-12 bg-muted/20 border-none ring-1 ring-border focus-visible:ring-primary"
                      placeholder="Contoh: Permohonan Pembelian Inventaris Kantor"
                      value={formData.judul_surat}
                      onChange={e => { setFormData({ ...formData, judul_surat: e.target.value }); setJudulForDisplay(e.target.value); }}
                    />
                  </div>

                </div>

                <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-5">
                  <p className="text-sm font-semibold text-foreground">Tanggal Dokumen</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">Tempat</Label>
                      <Input
                        value={formData.request_place}
                        onChange={e => setFormData({ ...formData, request_place: e.target.value })}
                        placeholder="Contoh: Jakarta"
                        className="h-12 bg-background/70 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">Tanggal</Label>
                      <Input
                        type="date"
                        value={formData.request_date}
                        onChange={e => setFormData({ ...formData, request_date: e.target.value })}
                        className="h-12 bg-background/70 text-sm"
                      />
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
                                    {getFilteredSignerUsers(i).map((u: MasterRecord) => (
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
                                        <span className="truncate">{u.full_name}</span>
                                      </CommandItem>
                                    ))}
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
                    disabled={isLoading || signers.some(s => !s.user_id) || !formData.judul_surat}
                    onClick={handleSubmit}
                  >
                    {isLoading
                      ? <div className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin" /><span>Memproses Data...</span></div>
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
  );
}

export default SuratForm;
