import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
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

type RequestCategory = "asset" | "unit" | "non_unit";
type UsageStatus = "draft" | "active" | "archived";
type RoleName = "membuat" | "memeriksa" | "menyetujui";
type ActionType = "approval" | "unit_allocation";

type Department = { id: string; name: string; code?: string | null };
type Profile = { id: string; full_name: string; job_title?: string | null; department_id?: string | null };
type MasterForm = { id: string; nama_form?: string | null; signature_layout?: { enabled?: boolean; region?: string } | null };
type RouteStep = {
  id?: string;
  step_order: number;
  role_name: RoleName;
  label: string;
  action_type: ActionType;
  signer_department_id: string;
  eligible_user_ids: string[];
  verifier_user_ids: string[];
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
  name: string;
  description?: string | null;
  request_category: RequestCategory;
  scope_type: "all" | "pusat" | "cabang";
  status: UsageStatus;
  sort_order: number;
  form_id: string;
  route_id?: string | null;
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
  signer_department_id: "",
  eligible_user_ids: [],
  verifier_user_ids: [],
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

export default function FormUsageManagementPage() {
  const { toast } = useToast();
  const appDialog = useAppDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  const importedMatrixRef = useRef<string | null>(null);
  const [usages, setUsages] = useState<UsageRecord[]>([]);
  const [forms, setForms] = useState<MasterForm[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [routeTemplates, setRouteTemplates] = useState<RouteTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedUsageId, setSelectedUsageId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
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
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [usageResult, formResult, departmentResult, profileResult, routeResult] = await Promise.all([
        supabase.from("form_usages").select(`
          *,
          master_forms(id, nama_form, signature_layout),
          form_usage_departments(department_id),
          form_usage_steps(
            id, step_order, role_name, label, action_type, signer_department_id,
            form_usage_step_users(user_id),
            form_usage_step_verifiers(user_id)
          ),
          form_usage_attachment_requirements(*)
        `).order("sort_order").order("created_at", { ascending: false }),
        supabase.from("master_forms").select("id, nama_form, signature_layout").order("nama_form"),
        supabase.from("master_departments").select("id, name, code").order("name"),
        supabase.from("profiles").select("id, full_name, job_title, department_id").eq("is_active", true).order("full_name"),
        supabase.from("approval_route_templates").select(`
          id, name, description,
          approval_route_steps(step_order, role_name, label, action_type)
        `).neq("status", "archived").order("name"),
      ]);
      for (const result of [usageResult, formResult, departmentResult, profileResult, routeResult]) {
        if (result.error) throw result.error;
      }
      setUsages((usageResult.data || []) as UsageRecord[]);
      setForms((formResult.data || []) as MasterForm[]);
      setDepartments(departmentResult.data || []);
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
          name: `Salinan ${data.membuat || "Matrix Lama"}`,
          description: "Dibuat dari dokumentasi matrix lama. Lengkapi departemen dan kandidat signer sebelum diaktifkan.",
          form_id: data.form_id || forms[0]?.id || "",
          route_id: "",
          request_category: Array.isArray(data.request_categories) && data.request_categories[0]
            ? data.request_categories[0] as RequestCategory
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
            signer_department_id: "",
            eligible_user_ids: [],
            verifier_user_ids: [],
          })),
          attachments: [],
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
    if (!normalized) return usages;
    return usages.filter(usage =>
      `${usage.name} ${usage.master_forms?.nama_form || ""} ${usage.request_category}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [query, usages]);

  const resetForm = () => {
    setSelectedUsageId(null);
    setFormData({
      name: "",
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
          signer_department_id: step.signer_department_id || "",
          eligible_user_ids: (step.form_usage_step_users || []).map(item => item.user_id),
          verifier_user_ids: (step.form_usage_step_verifiers || []).map(item => item.user_id),
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
          signer_department_id: "",
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
    setFormData(previous => ({
      ...previous,
      steps: previous.steps
        .filter((_step, stepIndex) => stepIndex !== index)
        .map((step, stepIndex) => ({ ...step, step_order: stepIndex + 1 })),
      attachments: previous.attachments.filter(rule => rule.stage_order !== index + 1),
    }));
  };

  const updateStep = (index: number, patch: Partial<RouteStep>) => {
    setFormData(previous => ({
      ...previous,
      steps: previous.steps.map((step, stepIndex) => {
        if (stepIndex !== index) return step;
        const next = { ...step, ...patch };
        if (patch.signer_department_id !== undefined) {
          next.eligible_user_ids = next.eligible_user_ids.filter(userId =>
            profiles.some(profile => profile.id === userId && profile.department_id === patch.signer_department_id)
          );
        }
        return next;
      }),
    }));
  };

  const toggleEligibleUser = (stepIndex: number, userId: string) => {
    const step = formData.steps[stepIndex];
    updateStep(stepIndex, {
      eligible_user_ids: step.eligible_user_ids.includes(userId)
        ? step.eligible_user_ids.filter(id => id !== userId)
        : [...step.eligible_user_ids, userId],
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
    const incompleteStep = formData.steps.find(step =>
      !step.label.trim() || !step.signer_department_id || step.eligible_user_ids.length === 0
    );
    if (incompleteStep) return `Tahap ${incompleteStep.step_order} belum memiliki label, departemen, dan kandidat signer.`;
    if (formData.status === "active") {
      const selectedForm = forms.find(item => item.id === formData.form_id);
      const layout = selectedForm?.signature_layout;
      if (!layout?.enabled || !layout.region) {
        return "Form belum memiliki Signature Region aktif sehingga kegunaan belum dapat diaktifkan.";
      }
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
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        form_id: formData.form_id,
        route_id: formData.route_id || null,
        request_category: formData.request_category,
        scope_type: formData.scope_type,
        status: formData.status,
        sort_order: formData.sort_order,
        updated_at: new Date().toISOString(),
      };
      const stepsPayload = formData.steps.map(step => ({
          step_order: step.step_order,
          role_name: step.role_name,
          label: step.label.trim(),
          signer_department_id: step.signer_department_id,
          action_type: step.action_type,
          eligible_user_ids: step.eligible_user_ids,
          verifier_user_ids: step.verifier_user_ids,
      }));
      const attachmentsPayload = formData.attachments
        .filter(rule => rule.label.trim() && rule.requirement_key.trim())
        .map((rule, index) => ({
          stage_order: rule.stage_order,
          requirement_key: rule.requirement_key.trim().toLowerCase().replace(/\s+/g, "_"),
          label: rule.label.trim(),
          is_required: rule.is_required,
          allow_multiple: rule.allow_multiple,
          min_files: rule.is_required ? Math.max(1, rule.min_files) : Math.max(0, rule.min_files),
          max_files: Math.max(rule.max_files, rule.min_files, 1),
          allowed_types: rule.allowed_types.split(",").map(item => item.trim()).filter(Boolean),
          max_size_bytes: rule.max_size_mb > 0 ? rule.max_size_mb * 1048576 : null,
          sort_order: index,
        }));
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari kegunaan atau form..." className="pl-9" />
        </div>
        <Button onClick={() => openUsage()}>
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
                    <Badge variant="secondary">{usage.request_category.replace("_", " ")}</Badge>
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
                <span>{(usage.form_usage_steps || []).reduce((sum, step) => sum + (step.form_usage_step_verifiers?.length || 0), 0)} pengecek</span>
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
                    <SelectItem value="asset">Aset</SelectItem>
                    <SelectItem value="unit">Unit</SelectItem>
                    <SelectItem value="non_unit">Non Unit</SelectItem>
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
                  const departmentUsers = profiles.filter(profile => profile.department_id === step.signer_department_id);
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
                              <SelectItem value="menyetujui">Menyetujui</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Action</Label>
                          <Select value={step.action_type} onValueChange={value => updateStep(index, { action_type: value as ActionType })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="approval">Approval</SelectItem>
                              <SelectItem value="unit_allocation">Alokasi Unit</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="self-end text-destructive" onClick={() => removeStep(index)} disabled={formData.steps.length <= 2}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-[260px_1fr]">
                        <div className="space-y-2">
                          <Label>Departemen Penandatangan</Label>
                          <Select value={step.signer_department_id} onValueChange={value => updateStep(index, { signer_department_id: value })}>
                            <SelectTrigger><SelectValue placeholder="Pilih departemen" /></SelectTrigger>
                            <SelectContent>{departments.map(department => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2"><Users className="h-4 w-4" /> Kandidat Signer</Label>
                          <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-background p-2">
                            {departmentUsers.length === 0 ? (
                              <p className="p-2 text-xs text-muted-foreground">Pilih departemen atau tambahkan user aktif pada departemen tersebut.</p>
                            ) : departmentUsers.map(profile => (
                              <label key={profile.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted">
                                <input type="checkbox" checked={step.eligible_user_ids.includes(profile.id)} onChange={() => toggleEligibleUser(index, profile.id)} />
                                <span className="font-semibold">{profile.full_name}</span>
                                <span className="text-muted-foreground">{profile.job_title || ""}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        <Label className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4" /> Tim Pengecek Sebelum Tahap Ini
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Jika diisi, signer tahap {step.step_order} bisa melihat dokumen tetapi tombol setuju/tolak terkunci sampai salah satu pengecek memverifikasi data.
                        </p>
                        <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-background p-2">
                          {profiles.map(profile => (
                            <label key={profile.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted">
                              <input type="checkbox" checked={step.verifier_user_ids.includes(profile.id)} onChange={() => toggleVerifierUser(index, profile.id)} />
                              <span className="font-semibold">{profile.full_name}</span>
                              <span className="text-muted-foreground">{profile.job_title || ""}</span>
                            </label>
                          ))}
                        </div>
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
                  <p className="text-xs text-muted-foreground">Tahap 0 adalah lampiran pemohon; tahap 1–8 mengikuti signer.</p>
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
                        <SelectItem value="0">Pemohon</SelectItem>
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
                    <label className="text-[10px] font-bold"><input type="checkbox" checked={rule.is_required} onChange={event => updateAttachment(index, { is_required: event.target.checked })} /> Wajib</label>
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
