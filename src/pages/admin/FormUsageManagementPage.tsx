import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Copy, FileText, Loader2, Plus, Save, Search, ShieldCheck, Trash2, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppDialog } from "@/components/app/AppDialogProvider";
import { Keu10UsageConfigEditor } from "@/components/surat/Keu10UsageConfigEditor";
import { normalizeKeu10Config, type Keu10Config } from "@/features/surat/registration/lib/keu10-config";
import {
  FUND_ITEM_CHECKLIST_SCHEMA,
  normalizeCheckerInputSchema,
  type CheckerInputField,
  type CheckerInputSchema,
  type CheckerInputType,
} from "@/features/surat/inbox/lib/checker-input";

type RequestCategory = "asset" | "unit" | "non_unit" | "non_asset";
type UsageStatus = "draft" | "active" | "archived";
type RoleName = "membuat" | "memeriksa" | "verifikator" | "menyetujui";
type ActionType = "approval" | "unit_allocation" | "configured_input";
type AssigneeMode = "select" | "requester";
type CandidateScope = "manual" | "request_office" | "request_department" | "branch_office_or_request_department" | "head_office" | "all_offices";
type CandidateSort = "name_asc" | "job_asc" | "office_asc";
type ExternalRevisionRecipient = "requester" | "signer";

type ExternalRevisionPolicy = {
  recipient_type: ExternalRevisionRecipient;
  recipient_step_order: number | null;
  approval_restart_step: number;
};

type Department = { id: string; name: string; code?: string | null };
type Office = { id: string; name: string; code?: string | null; kedudukan?: string | null };
type Profile = { id: string; full_name: string; job_title?: string | null; department_id?: string | null; office_id?: string | null };
type MasterForm = { id: string; nama_form?: string | null };
type RouteStep = {
  id?: string;
  step_order: number;
  role_name: RoleName;
  label: string;
  action_type: ActionType;
  assignee_mode: AssigneeMode;
  input_schema: CheckerInputSchema;
  candidate_scope: CandidateScope;
  skip_if_no_candidate: boolean;
  candidate_fallback_mode: "request_office_all" | "related_branch_manager" | "related_branch_officer" | null;
  signer_department_id: string;
  verifier_department_id: string;
  verifier_scope: "request_office" | "head_office" | "all_offices";
  eligible_user_ids: string[];
  verifier_user_ids: string[];
  verifier_team_enabled?: boolean;
};
type AttachmentRule = {
  id?: string;
  stage_order: number;
  requirement_key: string;
  label: string;
  is_required: boolean;
  allow_multiple: boolean;
  min_files: number;
  max_files: number;
  allowed_types: string;
  max_size_mb: number;
};
type RouteTemplate = {
  id: string;
  name: string;
  description?: string | null;
  approval_route_steps?: Array<{
    step_order: number;
    role_name: RoleName;
    label: string;
    action_type: ActionType;
  }>;
};
type UsageRecord = {
  id: string;
  keu10_config?: Keu10Config | null;
  name: string;
  description?: string | null;
  request_category: RequestCategory;
  scope_type: "all" | "pusat" | "cabang";
  status: UsageStatus;
  sort_order: number;
  form_id: string;
  route_id?: string | null;
  external_revision_policy?: ExternalRevisionPolicy | null;
  master_forms?: MasterForm | null;
  form_usage_departments?: Array<{ department_id: string }>;
  form_usage_steps?: Array<RouteStep & {
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
    allowed_types: string[];
    max_size_bytes?: number | null;
  }>;
};

const emptyStep = (stepOrder: number): RouteStep => ({
  step_order: stepOrder,
  role_name: stepOrder === 1 ? "membuat" : "menyetujui",
  label: stepOrder === 1 ? "Membuat" : `Penyetuju ${stepOrder}`,
  action_type: "approval",
  assignee_mode: "select",
  input_schema: { fields: [] },
  candidate_scope: "manual",
  skip_if_no_candidate: false,
  candidate_fallback_mode: null,
  signer_department_id: "",
  verifier_department_id: "",
  verifier_scope: "request_office",
  eligible_user_ids: [],
  verifier_user_ids: [],
  verifier_team_enabled: false,
});

const emptyAttachment = (): AttachmentRule => ({
  stage_order: 0,
  requirement_key: "",
  label: "",
  is_required: true,
  allow_multiple: false,
  min_files: 1,
  max_files: 1,
  allowed_types: "application/pdf,image/jpeg,image/png",
  max_size_mb: 10,
});

const defaultConfiguredInputSchema = (): CheckerInputSchema => ({
  title: "Pemeriksaan dana",
  description: "Admin pemeriksa melengkapi data sebelum manager meninjau dan menandatangani.",
  fields: [
    {
      key: "approved_amount",
      label: "Nominal hasil pemeriksaan",
      type: "money",
      required: true,
      placeholder: "Rp 0",
      min: 1,
    },
    {
      key: "assessment_note",
      label: "Catatan pemeriksaan",
      type: "textarea",
      required: false,
      placeholder: "Catatan hasil pemeriksaan",
    },
  ],
});

const defaultExternalRevisionPolicy = (): ExternalRevisionPolicy => ({
  recipient_type: "requester",
  recipient_step_order: null,
  approval_restart_step: 1,
});

const normalizeRequestCategory = (value?: string | null): RequestCategory => {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "asset" || normalized === "aset") return "asset";
  if (normalized === "unit") return "unit";
  if (normalized === "non_asset" || normalized === "non-aset" || normalized === "non_aset") return "non_asset";
  return "non_unit";
};

const requestCategoryLabel = (value?: string | null) => {
  const category = normalizeRequestCategory(value);
  if (category === "asset") return "Pengajuan Aset";
  if (category === "unit") return "Pengajuan SPK";
  if (category === "non_asset") return "Pengajuan Dana";
  return "Pengajuan Non Unit";
};

const candidateScopeLabel = (value?: string | null) => {
  if (value === "request_office") return "Kantor pemohon";
  if (value === "request_department") return "Departemen pemohon";
  if (value === "branch_office_or_request_department") return "BM cabang / dept pusat";
  if (value === "head_office") return "Kantor pusat";
  if (value === "all_offices") return "Semua kantor";
  return "Manual";
};

const isDynamicCandidateScope = (value?: CandidateScope | null) => Boolean(value && value !== "manual");

export default function FormUsageManagementPage() {
  const { toast } = useToast();
  const appDialog = useAppDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  const importedMatrixRef = useRef<string | null>(null);
  const [usages, setUsages] = useState<UsageRecord[]>([]);
  const [forms, setForms] = useState<MasterForm[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [routeTemplates, setRouteTemplates] = useState<RouteTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [formFilter, setFormFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [candidateSearch, setCandidateSearch] = useState<Record<number, string>>({});
  const [candidateJobFilter, setCandidateJobFilter] = useState<Record<number, string>>({});
  const [candidateSort, setCandidateSort] = useState<Record<number, CandidateSort>>({});
  const [verifierSearch, setVerifierSearch] = useState<Record<number, string>>({});
  const [open, setOpen] = useState(false);
  const [selectedUsageId, setSelectedUsageId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    keu10_config: null as Keu10Config | null,
    name: "",
    description: "",
    form_id: "",
    route_id: "",
    request_category: "non_unit" as RequestCategory,
    scope_type: "all" as "all" | "pusat" | "cabang",
    status: "draft" as UsageStatus,
    sort_order: 0,
    department_ids: [] as string[],
    steps: [emptyStep(1), emptyStep(2)] as RouteStep[],
    attachments: [] as AttachmentRule[],
    external_revision_policy: defaultExternalRevisionPolicy(),
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [usageResult, formResult, departmentResult, officeResult, profileResult, routeResult] = await Promise.all([
        supabase.from("form_usages").select(`
          *,
          master_forms(id, nama_form),
          form_usage_departments(department_id),
          form_usage_steps(
            id, step_order, role_name, label, action_type, assignee_mode, input_schema, skip_if_no_candidate, candidate_fallback_mode, signer_department_id, verifier_department_id, verifier_scope,
            candidate_scope,
            form_usage_step_users(user_id),
            form_usage_step_verifiers(user_id)
          ),
          form_usage_attachment_requirements(*)
        `).order("sort_order").order("created_at", { ascending: false }),
        supabase.from("master_forms").select("id, nama_form").order("nama_form"),
        supabase.from("master_departments").select("id, name, code").order("name"),
        supabase.from("master_offices").select("id, name, code, kedudukan").order("name"),
        supabase.from("profiles").select("id, full_name, job_title, department_id, office_id").eq("is_active", true).order("full_name"),
        supabase.from("approval_route_templates").select(`
          id, name, description,
          approval_route_steps(step_order, role_name, label, action_type)
        `).neq("status", "archived").order("name"),
      ]);
      for (const result of [usageResult, formResult, departmentResult, officeResult, profileResult, routeResult]) {
        if (result.error) throw result.error;
      }
      setUsages((usageResult.data || []) as UsageRecord[]);
      setForms((formResult.data || []) as MasterForm[]);
      setDepartments(departmentResult.data || []);
      setOffices(officeResult.data || []);
      setProfiles(profileResult.data || []);
      setRouteTemplates((routeResult.data || []) as RouteTemplate[]);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Gagal Memuat Kegunaan Form",
        description: error instanceof Error ? error.message : "Data tidak dapat dimuat.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const sourceMatrixId = searchParams.get("source_matrix");
    if (!sourceMatrixId || loading || importedMatrixRef.current === sourceMatrixId) return;
    importedMatrixRef.current = sourceMatrixId;
    const importMatrix = async () => {
      try {
        const { data, error } = await supabase
          .from("master_penggunaan_detail")
          .select("id, form_id, membuat, memeriksa, menyetujui, request_categories, is_cabang, ttd_config")
          .eq("id", sourceMatrixId)
          .single();
        if (error) throw error;
        const rawConfig = typeof data.ttd_config === "string"
          ? JSON.parse(data.ttd_config || "[]")
          : data.ttd_config;
        const matrixSteps = Array.isArray(rawConfig) ? rawConfig : [];
        setSelectedUsageId(null);
        setFormData({
          keu10_config: null,
          name: `Salinan ${data.membuat || "Matrix Lama"}`,
          description: "Dibuat dari dokumentasi matrix lama. Lengkapi departemen dan kandidat signer sebelum diaktifkan.",
          form_id: data.form_id || forms[0]?.id || "",
          route_id: "",
          request_category: Array.isArray(data.request_categories) && data.request_categories[0]
            ? normalizeRequestCategory(data.request_categories[0])
            : "non_unit",
          scope_type: data.is_cabang ? "cabang" : "pusat",
          status: "draft",
          sort_order: 0,
          department_ids: [],
          steps: matrixSteps.slice(0, 8).map((step: any, index: number) => ({
            step_order: index + 1,
            role_name: (step.roleName || step.role_name || (index === 0 ? "membuat" : "menyetujui")) as RoleName,
            label: step.labelJabatan || step.jabatan || `Tahap ${index + 1}`,
            action_type: step.requires_unit_allocation ? "unit_allocation" : "approval",
            assignee_mode: "select",
            input_schema: { fields: [] },
            candidate_scope: "manual",
            skip_if_no_candidate: false,
            candidate_fallback_mode: null,
            signer_department_id: "",
            verifier_department_id: "",
            verifier_scope: "request_office",
            eligible_user_ids: [],
            verifier_user_ids: [],
          })),
          attachments: [],
          external_revision_policy: defaultExternalRevisionPolicy(),
        });
        setOpen(true);
        setSearchParams({}, { replace: true });
      } catch (error: unknown) {
        toast({
          variant: "destructive",
          title: "Gagal Menduplikasi Matrix",
          description: error instanceof Error ? error.message : "Matrix lama tidak dapat dibaca.",
        });
      }
    };
    importMatrix();
  }, [forms, loading, searchParams, setSearchParams, toast]);

  const filteredUsages = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    return usages.filter(usage => {
      const matchesSearch = !normalized ||
        `${usage.name} ${usage.master_forms?.nama_form || ""} ${requestCategoryLabel(usage.request_category)}`
          .toLowerCase()
          .includes(normalized);
      const matchesForm = formFilter === "all" || usage.form_id === formFilter;
      const usageDepartmentIds = (usage.form_usage_departments || []).map(item => item.department_id);
      const matchesDepartment = departmentFilter === "all" || usageDepartmentIds.includes(departmentFilter);
      return matchesSearch && matchesForm && matchesDepartment;
    });
  }, [departmentFilter, formFilter, query, usages]);

  const resetForm = () => {
    setSelectedUsageId(null);
    setFormData({
      name: "",
      keu10_config: null,
      description: "",
      form_id: forms[0]?.id || "",
      route_id: "",
      request_category: "non_unit",
      scope_type: "all",
      status: "draft",
      sort_order: 0,
      department_ids: [],
      steps: [emptyStep(1), emptyStep(2)],
      attachments: [],
      external_revision_policy: defaultExternalRevisionPolicy(),
    });
  };

  const openUsage = (usage?: UsageRecord) => {
    if (!usage) {
      resetForm();
      setOpen(true);
      return;
    }
    setSelectedUsageId(usage.id);
    setFormData({
      name: usage.name,
      keu10_config: normalizeKeu10Config(usage.keu10_config),
      description: usage.description || "",
      form_id: usage.form_id,
      route_id: usage.route_id || "",
      request_category: usage.request_category,
      scope_type: usage.scope_type,
      status: usage.status,
      sort_order: usage.sort_order || 0,
      department_ids: (usage.form_usage_departments || []).map(item => item.department_id),
      steps: [...(usage.form_usage_steps || [])]
        .sort((a, b) => a.step_order - b.step_order)
        .map(step => ({
          id: step.id,
          step_order: step.step_order,
          role_name: step.role_name,
          label: step.label,
          action_type: step.action_type,
          assignee_mode: step.assignee_mode || "select",
          input_schema: normalizeCheckerInputSchema(step.input_schema),
          candidate_scope: step.candidate_scope || "manual",
          skip_if_no_candidate: step.skip_if_no_candidate === true,
          candidate_fallback_mode: step.candidate_fallback_mode || null,
          signer_department_id: step.signer_department_id || "",
          verifier_department_id: step.verifier_department_id || "",
          verifier_scope: step.verifier_scope || "request_office",
          eligible_user_ids: (step.form_usage_step_users || []).map(item => item.user_id),
          verifier_user_ids: (step.form_usage_step_verifiers || []).map(item => item.user_id),
          verifier_team_enabled: (step.form_usage_step_verifiers || []).length > 0 || step.action_type !== "approval",
        })),
      attachments: (usage.form_usage_attachment_requirements || []).map(rule => ({
        id: rule.id,
        stage_order: rule.stage_order,
        requirement_key: rule.requirement_key,
        label: rule.label,
        is_required: rule.is_required,
        allow_multiple: rule.allow_multiple,
        min_files: rule.min_files,
        max_files: rule.max_files,
        allowed_types: (rule.allowed_types || []).join(","),
        max_size_mb: Math.round(Number(rule.max_size_bytes || 10485760) / 1048576),
      })),
      external_revision_policy: {
        ...defaultExternalRevisionPolicy(),
        ...(usage.external_revision_policy || {}),
      },
    });
    setOpen(true);
  };

  const applyRouteTemplate = (routeId: string) => {
    const template = routeTemplates.find(item => item.id === routeId);
    setFormData(previous => ({
      ...previous,
      route_id: routeId,
      steps: template?.approval_route_steps
        ?.sort((a, b) => a.step_order - b.step_order)
        .map(step => ({
          step_order: step.step_order,
          role_name: step.role_name,
          label: step.label,
          action_type: step.action_type,
          assignee_mode: "select",
          input_schema: { fields: [] },
          candidate_scope: "manual",
          skip_if_no_candidate: false,
          candidate_fallback_mode: null,
          signer_department_id: "",
          verifier_department_id: "",
          verifier_scope: "request_office",
          eligible_user_ids: [],
          verifier_user_ids: [],
        })) || previous.steps,
    }));
  };

  const addStep = () => {
    if (formData.steps.length >= 8) return;
    setFormData(previous => ({
      ...previous,
      steps: [...previous.steps, emptyStep(previous.steps.length + 1)],
    }));
  };

  const removeStep = (index: number) => {
    if (formData.steps.length <= 2) return;
    setFormData(previous => {
      const nextSteps = previous.steps
        .filter((_step, stepIndex) => stepIndex !== index)
        .map((step, stepIndex) => ({ ...step, step_order: stepIndex + 1 }));
      const maxStep = nextSteps.length;
      const policy = previous.external_revision_policy;
      return {
        ...previous,
        steps: nextSteps,
        attachments: previous.attachments.filter(rule => rule.stage_order !== index + 1),
        external_revision_policy: {
          ...policy,
          recipient_type: policy.recipient_type === "signer" && Number(policy.recipient_step_order || 0) > maxStep
            ? "requester"
            : policy.recipient_type,
          recipient_step_order: policy.recipient_type === "signer" && Number(policy.recipient_step_order || 0) <= maxStep
            ? policy.recipient_step_order
            : null,
          approval_restart_step: Math.min(Math.max(policy.approval_restart_step, 1), maxStep),
        },
      };
    });
  };

  const updateStep = (index: number, patch: Partial<RouteStep>) => {
    setFormData(previous => ({
      ...previous,
      steps: previous.steps.map((step, stepIndex) => {
        if (stepIndex !== index) return step;
        const next = { ...step, ...patch };
        if (patch.action_type && patch.action_type !== "approval") next.verifier_team_enabled = true;
        if (patch.signer_department_id !== undefined) {
          next.eligible_user_ids = next.eligible_user_ids.filter(userId =>
            profiles.some(profile => profile.id === userId && profile.department_id === patch.signer_department_id)
          );
          next.verifier_user_ids = next.verifier_user_ids.filter(userId =>
            profiles.some(profile => profile.id === userId && profile.department_id === patch.signer_department_id)
          );
        }
        return next;
      }),
    }));
  };

  const updateCheckerSchema = (stepIndex: number, patch: Partial<CheckerInputSchema>) => {
    const schema = normalizeCheckerInputSchema(formData.steps[stepIndex].input_schema);
    updateStep(stepIndex, { input_schema: { ...schema, ...patch } });
  };

  const updateCheckerField = (
    stepIndex: number,
    fieldIndex: number,
    patch: Partial<CheckerInputField>,
  ) => {
    const schema = normalizeCheckerInputSchema(formData.steps[stepIndex].input_schema);
    updateCheckerSchema(stepIndex, {
      fields: schema.fields.map((field, index) => index === fieldIndex ? { ...field, ...patch } : field),
    });
  };

  const addCheckerField = (stepIndex: number) => {
    const schema = normalizeCheckerInputSchema(formData.steps[stepIndex].input_schema);
    updateCheckerSchema(stepIndex, {
      fields: [...schema.fields, {
        key: `field_${schema.fields.length + 1}`,
        label: `Field ${schema.fields.length + 1}`,
        type: "text",
        required: false,
      }],
    });
  };

  const removeCheckerField = (stepIndex: number, fieldIndex: number) => {
    const schema = normalizeCheckerInputSchema(formData.steps[stepIndex].input_schema);
    updateCheckerSchema(stepIndex, {
      fields: schema.fields.filter((_field, index) => index !== fieldIndex),
    });
  };

  const toggleEligibleUser = (stepIndex: number, userId: string) => {
    const step = formData.steps[stepIndex];
    updateStep(stepIndex, {
      eligible_user_ids: step.eligible_user_ids.includes(userId)
        ? step.eligible_user_ids.filter(id => id !== userId)
        : [...step.eligible_user_ids, userId],
    });
  };

  const officeMap = useMemo(() => new Map(offices.map(office => [office.id, office])), [offices]);

  const headOfficeIds = useMemo(() => new Set(
    offices
      .filter(office => String(office.kedudukan || "").toLowerCase() === "pusat")
      .map(office => office.id)
  ), [offices]);

  const getStepDepartmentUsers = (step: RouteStep) => {
    if (step.signer_department_id) {
      return profiles.filter(profile => profile.department_id === step.signer_department_id);
    }
    if (!isDynamicCandidateScope(step.candidate_scope)) return [];
    if (step.candidate_scope === "head_office") {
      return profiles.filter(profile => Boolean(profile.office_id && headOfficeIds.has(profile.office_id)));
    }
    return profiles;
  };

  const getJobTitleOptions = (users: Profile[]) =>
    Array.from(new Set(
      users
        .map(profile => String(profile.job_title || "").trim())
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, "id"));

  const getSignerCandidates = (
    step: RouteStep,
    searchValue = "",
    jobFilter = "all",
    sortValue: CandidateSort = "name_asc"
  ) => {
    const search = searchValue.trim().toLowerCase();
    return getStepDepartmentUsers(step)
      .filter(profile => {
        const office = profile.office_id ? officeMap.get(profile.office_id) : null;
        const jobTitle = String(profile.job_title || "").trim();
        if (jobFilter !== "all" && jobTitle !== jobFilter) return false;
        if (!search) return true;
        return [
          profile.full_name,
          profile.job_title,
          office?.name,
          office?.code,
        ].some(value => String(value || "").toLowerCase().includes(search));
      })
      .sort((a, b) => {
        const officeA = a.office_id ? officeMap.get(a.office_id)?.name || "" : "";
        const officeB = b.office_id ? officeMap.get(b.office_id)?.name || "" : "";
        if (sortValue === "job_asc") {
          return `${a.job_title || ""} ${a.full_name}`.localeCompare(`${b.job_title || ""} ${b.full_name}`, "id");
        }
        if (sortValue === "office_asc") {
          return `${officeA} ${a.full_name}`.localeCompare(`${officeB} ${b.full_name}`, "id");
        }
        return String(a.full_name || "").localeCompare(String(b.full_name || ""), "id");
      });
  };

  const getVerifierCandidates = (step: RouteStep, searchValue = "") => {
    const search = searchValue.trim().toLowerCase();
    const departmentId = step.verifier_department_id || step.signer_department_id;
    if (!departmentId && !isDynamicCandidateScope(step.candidate_scope)) return [];
    return profiles.filter(profile => {
      if (departmentId && profile.department_id !== departmentId) return false;
      if (step.verifier_scope === "head_office" && !headOfficeIds.has(profile.office_id || "")) return false;
      if (formData.scope_type === "cabang" && step.verifier_scope === "request_office" && !profile.office_id) return false;
      const office = profile.office_id ? officeMap.get(profile.office_id) : null;
      if (!search) return true;
      return [
        profile.full_name,
        profile.job_title,
        office?.name,
        office?.code,
      ].some(value => String(value || "").toLowerCase().includes(search));
    });
  };

  const setVerifierTeamEnabled = (stepIndex: number, enabled: boolean) => {
    updateStep(stepIndex, {
      verifier_team_enabled: enabled,
      ...(!enabled ? { verifier_user_ids: [] } : {}),
    });
  };

  const toggleVerifierUser = (stepIndex: number, userId: string) => {
    const step = formData.steps[stepIndex];
    updateStep(stepIndex, {
      verifier_user_ids: step.verifier_user_ids.includes(userId)
        ? step.verifier_user_ids.filter(id => id !== userId)
        : [...step.verifier_user_ids, userId],
    });
  };

  const toggleDepartment = (departmentId: string) => {
    setFormData(previous => ({
      ...previous,
      department_ids: previous.department_ids.includes(departmentId)
        ? previous.department_ids.filter(id => id !== departmentId)
        : [...previous.department_ids, departmentId],
    }));
  };

  const addAttachment = () => {
    setFormData(previous => ({
      ...previous,
      attachments: [...previous.attachments, emptyAttachment()],
    }));
  };

  const updateAttachment = (index: number, patch: Partial<AttachmentRule>) => {
    setFormData(previous => ({
      ...previous,
      attachments: previous.attachments.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule
      ),
    }));
  };

  const saveRouteTemplate = async () => {
    const name = await appDialog.prompt({
      title: "Simpan Template Rute",
      description: "Template rute menyimpan urutan role dan action agar bisa dipakai ulang pada kegunaan form lain.",
      label: "Nama template",
      placeholder: "Contoh: Approval Pengadaan 4 Tahap",
      confirmText: "Simpan",
      required: true,
    });
    if (!name?.trim()) return;
    const { data: route, error } = await supabase
      .from("approval_route_templates")
      .insert({ name: name.trim(), status: "active" })
      .select("id")
      .single();
    if (error) throw error;
    const { error: stepError } = await supabase.from("approval_route_steps").insert(
      formData.steps.map(step => ({
        route_id: route.id,
        step_order: step.step_order,
        role_name: step.role_name,
        label: step.label,
        action_type: step.action_type,
      }))
    );
    if (stepError) throw stepError;
    await loadData();
    setFormData(previous => ({ ...previous, route_id: route.id }));
  };

  const validate = () => {
    if (!formData.name.trim() || !formData.form_id) return "Nama kegunaan dan form wajib diisi.";
    if (formData.department_ids.length === 0) return "Pilih minimal satu departemen pengaju.";
    if (formData.steps.length < 2 || formData.steps.length > 8) return "Tahap approval harus berjumlah 2 sampai 8.";
    for (const step of formData.steps) {
      const missing: string[] = [];
      if (!step.label.trim()) missing.push("label tahap");
      if (step.assignee_mode !== "requester" && !isDynamicCandidateScope(step.candidate_scope) && !step.signer_department_id) {
        missing.push("departemen penandatangan");
      }
      if (step.assignee_mode !== "requester" && step.eligible_user_ids.length === 0) missing.push("kandidat signer");
      if ((step.action_type !== "approval" || step.verifier_team_enabled) && step.verifier_user_ids.length === 0) {
        missing.push("operator pemeriksa");
      }
      if (step.verifier_user_ids.some(id => !getVerifierCandidates(step).some(profile => profile.id === id))) {
        missing.push("operator pemeriksa sesuai cakupan");
      }
      if (step.action_type === "configured_input" && normalizeCheckerInputSchema(step.input_schema).fields.length === 0) {
        missing.push("schema input pemeriksa");
      }
      const routing = normalizeCheckerInputSchema(step.input_schema).hrd_ga_review;
      if (routing && (step.action_type !== "approval" || !step.verifier_team_enabled
        || !Object.values(routing.reviewers).every(reviewer => step.verifier_user_ids.includes(reviewer.user_id)))) {
        missing.push("tim kategori HRD & GA yang lengkap (tanpa input wajib)");
      }
      if (missing.length > 0) return `Tahap ${step.step_order} belum memiliki ${missing.join(", ")}.`;
    }
    const attachmentKeys = new Set<string>();
    for (const attachment of formData.attachments.filter(rule => rule.label.trim() && rule.requirement_key.trim())) {
      const key = `${attachment.stage_order}:${attachment.requirement_key.trim().toLowerCase().replace(/\s+/g, "_")}`;
      if (attachmentKeys.has(key)) {
        return `Kunci lampiran "${attachment.requirement_key}" digunakan lebih dari sekali pada tahap ${attachment.stage_order}.`;
      }
      attachmentKeys.add(key);
    }
    const revisionPolicy = formData.external_revision_policy;
    if (revisionPolicy.recipient_type === "signer" && !formData.steps.some(step => step.step_order === revisionPolicy.recipient_step_order)) {
      return "Pilih signer yang menerima perbaikan dari sistem departemen.";
    }
    if (!formData.steps.some(step => step.step_order === revisionPolicy.approval_restart_step)) {
      return "Pilih tahap awal tanda tangan ulang yang valid.";
    }
    return null;
  };

  const saveUsage = async () => {
    const validationError = validate();
    if (validationError) {
      toast({ variant: "destructive", title: "Konfigurasi Belum Lengkap", description: validationError });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        ...(formData.keu10_config ? { keu10_config: formData.keu10_config } : {}),
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        form_id: formData.form_id,
        route_id: formData.route_id || null,
        request_category: formData.request_category,
        scope_type: formData.scope_type,
        status: formData.status,
        sort_order: formData.sort_order,
        external_revision_policy: formData.external_revision_policy,
        updated_at: new Date().toISOString(),
      };
      const stepsPayload = formData.steps.map(step => ({
          step_order: step.step_order,
          role_name: step.role_name,
          label: step.label.trim(),
          signer_department_id: step.signer_department_id,
          verifier_department_id: step.verifier_department_id || null,
          verifier_scope: step.verifier_scope,
          action_type: step.action_type,
          assignee_mode: step.assignee_mode,
          input_schema: normalizeCheckerInputSchema(step.input_schema),
          eligible_user_ids: step.eligible_user_ids,
          verifier_user_ids: step.verifier_user_ids,
          candidate_scope: step.candidate_scope || "manual",
          skip_if_no_candidate: step.skip_if_no_candidate === true,
          candidate_fallback_mode: step.candidate_fallback_mode || null,
      }));
      const attachmentsPayload = formData.attachments
        .filter(rule => rule.label.trim() && rule.requirement_key.trim())
        .map((rule, index) => {
          const minFiles = rule.is_required ? Math.max(1, rule.min_files) : 0;
          return {
            stage_order: rule.stage_order,
            requirement_key: rule.requirement_key.trim().toLowerCase().replace(/\s+/g, "_"),
            label: rule.label.trim(),
            is_required: rule.is_required,
            allow_multiple: rule.allow_multiple,
            min_files: minFiles,
            max_files: Math.max(rule.max_files, minFiles, 1),
            allowed_types: rule.allowed_types.split(",").map(item => item.trim()).filter(Boolean),
            max_size_bytes: rule.max_size_mb > 0 ? rule.max_size_mb * 1048576 : null,
            sort_order: index,
          };
        });
      const { error: saveError } = await supabase.rpc("save_form_usage_config", {
        p_usage_id: selectedUsageId,
        p_payload: payload,
        p_department_ids: formData.department_ids,
        p_steps: stepsPayload,
        p_attachments: attachmentsPayload,
        p_verifiers: formData.steps.map(step => ({
          step_order: step.step_order,
          user_ids: step.verifier_user_ids,
        })),
      });
      if (saveError) throw saveError;

      toast({ title: "Kegunaan Form Disimpan" });
      setOpen(false);
      await loadData();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: error instanceof Error ? error.message : "Konfigurasi tidak dapat disimpan.",
      });
    } finally {
      setSaving(false);
    }
  };

  const archiveUsage = async (usageId: string) => {
    const { error } = await supabase.from("form_usages").update({ status: "archived" }).eq("id", usageId);
    if (error) {
      toast({ variant: "destructive", title: "Gagal Mengarsipkan", description: error.message });
      return;
    }
    await loadData();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(220px,1fr)_220px_220px]">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari kegunaan atau form..." className="pl-9" />
          </div>
          <Select value={formFilter} onValueChange={setFormFilter}>
            <SelectTrigger><SelectValue placeholder="Filter form" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Form</SelectItem>
              {forms.map(form => <SelectItem key={form.id} value={form.id}>{form.nama_form || "Tanpa nama"}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger><SelectValue placeholder="Filter departemen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Departemen</SelectItem>
              {departments.map(department => <SelectItem key={department.id} value={department.id}>{department.code ? `${department.code} - ` : ""}{department.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => openUsage()} className="lg:shrink-0">
          <Plus className="mr-2 h-4 w-4" /> Tambah Kegunaan
        </Button>
      </div>

      {loading ? (
        <div className="flex min-h-80 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredUsages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Belum ada Kegunaan Form</p>
          <p className="mt-1 text-xs text-muted-foreground">Buat konfigurasi draft sebelum registrasi baru diaktifkan.</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filteredUsages.map(usage => (
            <div key={usage.id} className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-bold">{usage.name}</h3>
                    <Badge variant={usage.status === "active" ? "default" : "outline"}>{usage.status}</Badge>
                    <Badge variant="secondary">{requestCategoryLabel(usage.request_category)}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{usage.master_forms?.nama_form || "Form tidak ditemukan"}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openUsage(usage)} title="Edit">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => archiveUsage(usage.id)} title="Arsipkan">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold uppercase text-muted-foreground">
                <span>{usage.form_usage_departments?.length || 0} departemen</span>
                <span>·</span>
                <span>{usage.form_usage_steps?.length || 0} signer</span>
                <span>·</span>
                <span>{(usage.form_usage_steps || []).reduce((sum, step) => sum + (step.form_usage_step_verifiers?.length || 0), 0)} pemeriksa</span>
                <span>·</span>
                <span>{usage.form_usage_attachment_requirements?.length || 0} aturan lampiran</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedUsageId ? "Edit Kegunaan Form" : "Kegunaan Form Baru"}</DialogTitle>
            <DialogDescription>
              Atur kategori, departemen pengaju, tahapan tanda tangan, kandidat signer, dan lampiran yang dibutuhkan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <section className="grid gap-4 rounded-lg border border-border p-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nama Kegunaan</Label>
                <Input value={formData.name} onChange={event => setFormData(previous => ({ ...previous, name: event.target.value }))} placeholder="Contoh: Pengadaan Peralatan IT" />
              </div>
              <div className="space-y-2">
                <Label>Form</Label>
                <Select value={formData.form_id} onValueChange={value => setFormData(previous => ({ ...previous, form_id: value }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih form" /></SelectTrigger>
                  <SelectContent>{forms.map(form => <SelectItem key={form.id} value={form.id}>{form.nama_form}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Kategori</Label>
                <Select value={formData.request_category} onValueChange={value => setFormData(previous => ({ ...previous, request_category: value as RequestCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asset">Pengajuan Aset</SelectItem>
                    <SelectItem value="unit">Pengajuan SPK</SelectItem>
                    <SelectItem value="non_asset">Pengajuan Dana</SelectItem>
                    <SelectItem value="non_unit">Pengajuan Non Unit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select value={formData.scope_type} onValueChange={value => setFormData(previous => ({ ...previous, scope_type: value as "all" | "pusat" | "cabang" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Pusat dan Cabang</SelectItem>
                    <SelectItem value="pusat">Pusat</SelectItem>
                    <SelectItem value="cabang">Cabang</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Deskripsi</Label>
                <Textarea value={formData.description} onChange={event => setFormData(previous => ({ ...previous, description: event.target.value }))} />
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-border p-4">
              <div>
                <h3 className="text-sm font-bold">Departemen Pengaju</h3>
                <p className="text-xs text-muted-foreground">User biasa hanya melihat kegunaan milik departemen profilnya.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {departments.map(department => (
                  <label key={department.id} className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold",
                    formData.department_ids.includes(department.id) && "border-primary bg-primary/5"
                  )}>
                    <input type="checkbox" checked={formData.department_ids.includes(department.id)} onChange={() => toggleDepartment(department.id)} />
                    {department.code ? `${department.code} - ` : ""}{department.name}
                  </label>
                ))}
              </div>
            </section>

            {formData.keu10_config && <Keu10UsageConfigEditor value={formData.keu10_config} onChange={keu10_config => setFormData(previous => ({ ...previous, keu10_config }))} />}

            <section className="space-y-4 rounded-lg border border-border p-4">
              <div>
                <h3 className="text-sm font-bold">Keputusan Sistem Departemen</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Atur penanggung jawab perbaikan dan tahap tanda tangan yang harus diulang setelah sistem departemen meminta revisi.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Perbaikan dikembalikan kepada</Label>
                  <Select
                    value={formData.external_revision_policy.recipient_type === "requester"
                      ? "requester"
                      : `signer:${formData.external_revision_policy.recipient_step_order || 1}`}
                    onValueChange={value => setFormData(previous => ({
                      ...previous,
                      external_revision_policy: value === "requester"
                        ? { ...previous.external_revision_policy, recipient_type: "requester", recipient_step_order: null }
                        : {
                            ...previous.external_revision_policy,
                            recipient_type: "signer",
                            recipient_step_order: Number(value.split(":")[1]),
                          },
                    }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="requester">Pembuat pengajuan</SelectItem>
                      {formData.steps.map(step => (
                        <SelectItem key={step.step_order} value={`signer:${step.step_order}`}>
                          Signer tahap {step.step_order} - {step.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Signer dapat dipilih walaupun pembuat pengajuan tidak tercantum dalam rangkaian tanda tangan.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Tanda tangan ulang dimulai dari</Label>
                  <Select
                    value={String(formData.external_revision_policy.approval_restart_step)}
                    onValueChange={value => setFormData(previous => ({
                      ...previous,
                      external_revision_policy: {
                        ...previous.external_revision_policy,
                        approval_restart_step: Number(value),
                      },
                    }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {formData.steps.map(step => (
                        <SelectItem key={step.step_order} value={String(step.step_order)}>
                          Tahap {step.step_order} - {step.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Signer pada tahap ini dan seluruh tahap setelahnya wajib menyetujui ulang. Tahap sebelumnya dipertahankan sebagai histori.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <Label>Template Rute Approval</Label>
                  <Select value={formData.route_id || "none"} onValueChange={value => value === "none" ? setFormData(previous => ({ ...previous, route_id: "" })) : applyRouteTemplate(value)}>
                    <SelectTrigger><SelectValue placeholder="Opsional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Tanpa template</SelectItem>
                      {routeTemplates.map(route => <SelectItem key={route.id} value={route.id}>{route.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => saveRouteTemplate().catch(error => toast({ variant: "destructive", title: "Gagal Menyimpan Rute", description: error.message }))}>
                    <Save className="mr-2 h-4 w-4" /> Simpan sebagai Template
                  </Button>
                  <Button type="button" variant="outline" onClick={addStep} disabled={formData.steps.length >= 8}>
                    <Plus className="mr-2 h-4 w-4" /> Tahap
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {formData.steps.map((step, index) => {
                  const departmentUsers = getStepDepartmentUsers(step);
                  const jobOptions = getJobTitleOptions(departmentUsers);
                  const visibleCandidates = getSignerCandidates(
                    step,
                    candidateSearch[index] || "",
                    candidateJobFilter[index] || "all",
                    candidateSort[index] || "name_asc"
                  );
                  return (
                    <div key={index} className="rounded-lg border border-border bg-muted/10 p-4">
                      <div className="grid gap-3 md:grid-cols-[70px_1fr_170px_170px_auto]">
                        <div className="space-y-2">
                          <Label>Urutan</Label>
                          <Input value={step.step_order} disabled />
                        </div>
                        <div className="space-y-2">
                          <Label>Label Tahap</Label>
                          <Input value={step.label} onChange={event => updateStep(index, { label: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Role</Label>
                          <Select value={step.role_name} onValueChange={value => updateStep(index, { role_name: value as RoleName })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="membuat">Membuat</SelectItem>
                              <SelectItem value="memeriksa">Memeriksa</SelectItem>
                              <SelectItem value="verifikator">Verifikator</SelectItem>
                              <SelectItem value="menyetujui">Menyetujui</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Action</Label>
                          <Select
                            value={step.action_type}
                            onValueChange={value => {
                              const actionType = value as ActionType;
                              updateStep(index, {
                                action_type: actionType,
                                input_schema: actionType === "configured_input" && normalizeCheckerInputSchema(step.input_schema).fields.length === 0
                                  ? defaultConfiguredInputSchema()
                                  : step.input_schema,
                              });
                            }}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="approval">Approval</SelectItem>
                              <SelectItem value="unit_allocation">Alokasi Unit</SelectItem>
                              <SelectItem value="configured_input">Input Pemeriksa</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="self-end text-destructive" onClick={() => removeStep(index)} disabled={formData.steps.length <= 2}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-[260px_1fr]">
                        <div className="space-y-2">
                          <Label>
                            Departemen Penandatangan
                            {isDynamicCandidateScope(step.candidate_scope) && <span className="ml-1 font-normal text-muted-foreground">(opsional)</span>}
                          </Label>
                          <Select
                            value={step.signer_department_id || "__dynamic__"}
                            onValueChange={value => updateStep(index, { signer_department_id: value === "__dynamic__" ? "" : value })}
                          >
                            <SelectTrigger><SelectValue placeholder="Pilih departemen" /></SelectTrigger>
                            <SelectContent>
                              {isDynamicCandidateScope(step.candidate_scope) && <SelectItem value="__dynamic__">Mengikuti scope kandidat</SelectItem>}
                              {departments.map(department => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <div className="space-y-2 pt-2">
                            <Label>Penetapan Signer</Label>
                            <Select value={step.assignee_mode} onValueChange={value => updateStep(index, { assignee_mode: value as AssigneeMode })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="select">Dipilih pemohon</SelectItem>
                                <SelectItem value="requester">Pemohon otomatis</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground">
                              {step.assignee_mode === "requester"
                                ? "Tahap otomatis memakai akun pemohon dan ikut ditandatangani saat pengajuan dikirim."
                                : "Pemohon memilih salah satu kandidat yang tersedia."}
                            </p>
                          </div>
                          <div className="space-y-2 pt-2">
                            <Label>Scope Kandidat</Label>
                            <Select value={step.candidate_scope || "manual"} onValueChange={value => updateStep(index, {
                              candidate_scope: value as CandidateScope,
                              candidate_fallback_mode: value === "request_office" ? step.candidate_fallback_mode : null,
                            })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="manual">Manual</SelectItem>
                                <SelectItem value="request_office">Kantor pemohon</SelectItem>
                                <SelectItem value="request_department">Departemen pemohon</SelectItem>
                                <SelectItem value="branch_office_or_request_department">BM cabang / dept pusat</SelectItem>
                                <SelectItem value="head_office">Kantor pusat</SelectItem>
                                <SelectItem value="all_offices">Semua kantor</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground">
                              {step.candidate_scope === "request_office"
                                ? "Saat registrasi cabang, kandidat difilter sesuai kantor pemohon."
                                : step.candidate_scope === "request_department"
                                  ? "Saat registrasi, kandidat difilter sesuai departemen pengaju."
                                  : step.candidate_scope === "branch_office_or_request_department"
                                    ? "Jika pemohon cabang, kandidat mengikuti kantor pemohon. Jika pusat, kandidat mengikuti departemen pengaju."
                                : step.candidate_scope === "head_office"
                                  ? "Kandidat difilter ke Kantor Pusat."
                                  : step.candidate_scope === "all_offices"
                                    ? "Semua kandidat terpilih tetap tampil."
                                    : "Tidak ada filter kantor otomatis."}
                            </p>
                            {step.assignee_mode === "select" && (
                              <div className="space-y-2 border-t border-border pt-3">
                                <label className="flex items-start gap-2 text-xs font-medium">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    checked={step.skip_if_no_candidate}
                                    onChange={event => updateStep(index, { skip_if_no_candidate: event.target.checked })}
                                  />
                                  <span>
                                    Lewati tahap jika kandidat kosong
                                    <span className="mt-0.5 block font-normal text-muted-foreground">
                                      Dipakai untuk tahap opsional seperti Asisten BM.
                                    </span>
                                  </span>
                                </label>
                                <div className="space-y-2">
                                  <Label>Kandidat berdasarkan kantor</Label>
                                  <Select value={step.candidate_fallback_mode || "configured"}
                                    disabled={step.candidate_scope !== "request_office"}
                                    onValueChange={value => updateStep(index, {
                                      candidate_fallback_mode: value === "related_branch_manager" ? "related_branch_manager"
                                        : value === "related_branch_officer" ? "related_branch_officer"
                                        : value === "request_office_all" ? "request_office_all" : null,
                                    })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="configured">Kandidat terkonfigurasi saja</SelectItem>
                                      <SelectItem value="related_branch_manager">Branch Manager KC terkait saja</SelectItem>
                                      <SelectItem value="related_branch_officer">BM terkait, lalu Assistant BM / SPV</SelectItem>
                                      <SelectItem value="request_office_all">Semua karyawan jika kandidat kosong</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Users className="h-4 w-4" /> Kandidat Signer
                            <Badge variant="outline" className="ml-1">{candidateScopeLabel(step.candidate_scope)}</Badge>
                          </Label>
                          <div className="grid gap-2 lg:grid-cols-[minmax(180px,1fr)_220px_170px]">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                value={candidateSearch[index] || ""}
                                onChange={event => setCandidateSearch(previous => ({ ...previous, [index]: event.target.value }))}
                                placeholder="Cari nama, jabatan, atau kantor..."
                                className="h-9 pl-9 text-xs"
                              />
                            </div>
                            <Select
                              value={candidateJobFilter[index] || "all"}
                              onValueChange={value => setCandidateJobFilter(previous => ({ ...previous, [index]: value }))}
                            >
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Filter jabatan" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Semua jabatan</SelectItem>
                                {jobOptions.map(jobTitle => (
                                  <SelectItem key={jobTitle} value={jobTitle}>{jobTitle}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={candidateSort[index] || "name_asc"}
                              onValueChange={value => setCandidateSort(previous => ({ ...previous, [index]: value as CandidateSort }))}
                            >
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Urutkan" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="name_asc">Nama A-Z</SelectItem>
                                <SelectItem value="job_asc">Jabatan A-Z</SelectItem>
                                <SelectItem value="office_asc">Kantor A-Z</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-background p-2">
                            {departmentUsers.length === 0 ? (
                              <p className="p-2 text-xs text-muted-foreground">Pilih departemen atau tambahkan user aktif pada departemen tersebut.</p>
                            ) : visibleCandidates.length === 0 ? (
                              <p className="p-2 text-xs text-muted-foreground">Tidak ada kandidat yang cocok dengan filter.</p>
                            ) : visibleCandidates.map(profile => {
                              const office = profile.office_id ? officeMap.get(profile.office_id) : null;
                              return (
                                <label key={profile.id} className="flex items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted">
                                  <input className="mt-0.5" type="checkbox" checked={step.eligible_user_ids.includes(profile.id)} onChange={() => toggleEligibleUser(index, profile.id)} />
                                  <span className="min-w-0">
                                    <span className="block font-semibold">{profile.full_name}</span>
                                    <span className="block text-muted-foreground">{[profile.job_title, office?.name].filter(Boolean).join(" - ")}</span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {step.action_type === "configured_input" && (() => {
                        const schema = normalizeCheckerInputSchema(step.input_schema);
                        return (
                          <div className="mt-4 space-y-3 rounded-lg border border-border bg-background p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <Label>Form Input Tim Pemeriksa</Label>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Operator mengisi data ini sebelum signer tahap {step.step_order} dapat menyetujui.
                                </p>
                              </div>
                              <Button type="button" variant="outline" size="sm" disabled={schema.review_mode === "fund_item_checklist"} onClick={() => addCheckerField(index)}>
                                <Plus className="mr-2 h-4 w-4" /> Field
                              </Button>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-2 sm:col-span-2">
                                <Label>Jenis pemeriksaan</Label>
                                <Select value={schema.review_mode || "fields"} onValueChange={value => updateStep(index, {
                                  input_schema: value === "fund_item_checklist" ? FUND_ITEM_CHECKLIST_SCHEMA : { fields: [{ key: "review_note", label: "Hasil pemeriksaan", type: "textarea", required: true }] },
                                })}>
                                  <SelectTrigger aria-label="Jenis pemeriksaan"><SelectValue /></SelectTrigger>
                                  <SelectContent><SelectItem value="fields">Input khusus</SelectItem><SelectItem value="fund_item_checklist">Checklist Item Dana</SelectItem></SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>Judul Panel</Label>
                                <Input value={schema.title || ""} onChange={event => updateCheckerSchema(index, { title: event.target.value })} />
                              </div>
                              <div className="space-y-2">
                                <Label>Penjelasan</Label>
                                <Input value={schema.description || ""} onChange={event => updateCheckerSchema(index, { description: event.target.value })} />
                              </div>
                            </div>
                            <div className="space-y-2">
                              {schema.review_mode !== "fund_item_checklist" && schema.fields.map((field, fieldIndex) => (
                                <div key={`${field.key}-${fieldIndex}`} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[1fr_1.2fr_150px_100px_auto]">
                                  <Input aria-label={`Kunci field ${fieldIndex + 1}`} value={field.key} onChange={event => updateCheckerField(index, fieldIndex, { key: event.target.value })} placeholder="approved_amount" />
                                  <Input aria-label={`Label field ${fieldIndex + 1}`} value={field.label} onChange={event => updateCheckerField(index, fieldIndex, { label: event.target.value })} placeholder="Label field" />
                                  <Select value={field.type} onValueChange={value => updateCheckerField(index, fieldIndex, { type: value as CheckerInputType })}>
                                    <SelectTrigger aria-label={`Tipe field ${fieldIndex + 1}`}><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="text">Teks</SelectItem>
                                      <SelectItem value="textarea">Teks panjang</SelectItem>
                                      <SelectItem value="money">Rupiah</SelectItem>
                                      <SelectItem value="number">Angka</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <label className="flex min-h-10 items-center gap-2 text-xs font-semibold">
                                    <input type="checkbox" checked={field.required} onChange={event => updateCheckerField(index, fieldIndex, { required: event.target.checked })} />
                                    Wajib
                                  </label>
                                  <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => removeCheckerField(index, fieldIndex)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      <div className="mt-4 space-y-3 rounded-lg border border-border bg-background p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <Label className="flex items-center gap-2">
                              <ShieldCheck className="h-4 w-4" /> Tim Pemeriksa Sebelum Tahap Ini
                            </Label>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Opsional. Jika aktif, pemeriksa menyiapkan data sebelum signer tahap {step.step_order} bisa memproses.
                            </p>
                          </div>
                          <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold">
                            <input
                              type="checkbox"
                              checked={step.verifier_team_enabled ?? step.verifier_user_ids.length > 0}
                              onChange={event => setVerifierTeamEnabled(index, event.target.checked)}
                            />
                            Aktifkan
                          </label>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Departemen Operator</Label>
                            <Select
                              value={step.verifier_department_id || "__signer__"}
                              onValueChange={value => updateStep(index, {
                                verifier_department_id: value === "__signer__" ? "" : value,
                                verifier_user_ids: [],
                              })}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__signer__">Sama dengan penandatangan</SelectItem>
                                {departments.map(department => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Cakupan Operator</Label>
                            <Select
                              value={step.verifier_scope}
                              onValueChange={value => updateStep(index, {
                                verifier_scope: value as RouteStep["verifier_scope"],
                                verifier_user_ids: [],
                              })}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="request_office">Kantor pengaju</SelectItem>
                                <SelectItem value="head_office">Kantor pusat</SelectItem>
                                <SelectItem value="all_offices">Semua kantor</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        {(step.verifier_team_enabled ?? step.verifier_user_ids.length > 0) && (() => {
                          const candidates = getVerifierCandidates(step, verifierSearch[index] || "");
                          return (
                            <div className="space-y-2">
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                  value={verifierSearch[index] || ""}
                                  onChange={event => setVerifierSearch(previous => ({ ...previous, [index]: event.target.value }))}
                                  placeholder="Cari nama, jabatan, atau kantor..."
                                  className="h-9 pl-9 text-xs"
                                />
                              </div>
                              <div className="max-h-44 overflow-y-auto rounded-md border border-border bg-muted/10 p-2">
                                {candidates.length === 0 ? (
                                  <p className="p-2 text-xs text-muted-foreground">Tidak ada kandidat sesuai departemen tahap ini.</p>
                                ) : candidates.map(profile => {
                                  const office = profile.office_id ? officeMap.get(profile.office_id) : null;
                                  return (
                                    <label key={profile.id} className="flex items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted">
                                      <input type="checkbox" className="mt-0.5" checked={step.verifier_user_ids.includes(profile.id)} onChange={() => toggleVerifierUser(index, profile.id)} />
                                      <span className="min-w-0">
                                        <span className="block font-semibold">{profile.full_name}</span>
                                        <span className="block text-muted-foreground">{[profile.job_title, office?.name].filter(Boolean).join(" - ")}</span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Terpilih {step.verifier_user_ids.length} operator pemeriksa.
                              </p>
                              {(() => {
                                const schema = normalizeCheckerInputSchema(step.input_schema);
                                const routing = schema.hrd_ga_review;
                                if (!routing) return null;
                                return <div className="grid gap-3 sm:grid-cols-2">
                                  {(["ga", "hrd"] as const).map(group => <div key={group} className="space-y-2">
                                    <Label>{group === "ga" ? "ATK / rumah tangga" : "BPJS / tenaga harian / dinas"}</Label>
                                    <Select value={routing.reviewers[group].user_id} onValueChange={id => {
                                      const profile = getVerifierCandidates(step).find(candidate => candidate.id === id);
                                      if (!profile) return;
                                      updateStep(index, { input_schema: { ...schema, hrd_ga_review: {
                                        ...routing, reviewers: { ...routing.reviewers, [group]: { user_id: profile.id, full_name: profile.full_name } },
                                      } } });
                                    }}>
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>{getVerifierCandidates(step).filter(profile => step.verifier_user_ids.includes(profile.id)
                                        && profile.id !== routing.reviewers[group === "ga" ? "hrd" : "ga"].user_id)
                                        .map(profile => <SelectItem key={profile.id} value={profile.id}>{profile.full_name}</SelectItem>)}</SelectContent>
                                    </Select>
                                  </div>)}
                                </div>;
                              })()}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold">Persyaratan Lampiran</h3>
                  <p className="text-xs text-muted-foreground">Lampiran pemohon diunggah saat registrasi; tahap 1–8 mengikuti penandatangan.</p>
                </div>
                <Button type="button" variant="outline" onClick={addAttachment}><Plus className="mr-2 h-4 w-4" /> Lampiran</Button>
              </div>
              {formData.attachments.map((rule, index) => (
                <div key={index} className="grid gap-3 rounded-md border border-border bg-muted/10 p-3 md:grid-cols-12">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Tahap</Label>
                    <Select value={String(rule.stage_order)} onValueChange={value => updateAttachment(index, { stage_order: Number(value) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Pemohon (Saat Registrasi)</SelectItem>
                        {formData.steps.map(step => <SelectItem key={step.step_order} value={String(step.step_order)}>Tahap {step.step_order}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-3">
                    <Label>Nama Lampiran</Label>
                    <Input value={rule.label} onChange={event => updateAttachment(index, { label: event.target.value, requirement_key: event.target.value.toLowerCase().replace(/\s+/g, "_") })} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Key</Label>
                    <Input value={rule.requirement_key} onChange={event => updateAttachment(index, { requirement_key: event.target.value })} className="font-mono" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Tipe MIME</Label>
                    <Input value={rule.allowed_types} onChange={event => updateAttachment(index, { allowed_types: event.target.value })} />
                  </div>
                  <div className="space-y-2 md:col-span-1">
                    <Label>Min.</Label>
                    <Input type="number" min={0} value={rule.min_files} onChange={event => updateAttachment(index, { min_files: Number(event.target.value || 0) })} />
                  </div>
                  <div className="space-y-2 md:col-span-1">
                    <Label>Maks.</Label>
                    <Input type="number" min={1} value={rule.max_files} onChange={event => updateAttachment(index, { max_files: Number(event.target.value || 1) })} />
                  </div>
                  <div className="space-y-2 md:col-span-1">
                    <Label>MB/file</Label>
                    <Input type="number" min={1} value={rule.max_size_mb} onChange={event => updateAttachment(index, { max_size_mb: Number(event.target.value || 10) })} />
                  </div>
                  <div className="flex items-end gap-3 pb-2 md:col-span-2">
                    <label className="text-[10px] font-bold"><input type="checkbox" checked={rule.is_required} onChange={event => updateAttachment(index, { is_required: event.target.checked, min_files: event.target.checked ? Math.max(1, rule.min_files) : 0 })} /> Wajib</label>
                    <label className="text-[10px] font-bold"><input type="checkbox" checked={rule.allow_multiple} onChange={event => updateAttachment(index, { allow_multiple: event.target.checked })} /> Multiple</label>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="self-end text-destructive" onClick={() => setFormData(previous => ({ ...previous, attachments: previous.attachments.filter((_item, itemIndex) => itemIndex !== index) }))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </section>

            <section className="grid gap-4 rounded-lg border border-border p-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={value => setFormData(previous => ({ ...previous, status: value as UsageStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="archived">Arsip</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Urutan Tampilan</Label>
                <Input type="number" value={formData.sort_order} onChange={event => setFormData(previous => ({ ...previous, sort_order: Number(event.target.value || 0) }))} />
              </div>
            </section>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={saveUsage} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Simpan Kegunaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
