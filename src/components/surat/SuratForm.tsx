import React, { useEffect, useState, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Check, ChevronDown, Paperclip, Copy, RefreshCcw, ChevronRight, Layers,
  ShieldCheck, AlertTriangle, Archive, Home, X, Plus
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
  const lampiranInputRef = useRef<HTMLInputElement>(null);

  // ── STATE ──────────────────────────────────────────────────────────────────
  const [master, setMaster] = useState<any>({ entities: [], depts: [], offices: [], types: [], users: [], projects: [] });
  const [usageDetails, setUsageDetails]           = useState<any[]>([]);
  const [selectedUsage, setSelectedUsage]         = useState<any>(null);
  const [generatedNoSurat, setGeneratedNoSurat]   = useState<string | null>(null);
  const [isProcessingNumber, setIsProcessingNumber] = useState(false);
  const [isCopied, setIsCopied]                   = useState(false);
  const [openMatrix, setOpenMatrix]               = useState(false);
  const [openSignerIndex, setOpenSignerIndex]     = useState<number | null>(null);
  const [signerSearch, setSignerSearch]           = useState<Record<number, string>>({});
  const [lampiranFiles, setLampiranFiles]         = useState<File[]>([]);
  const [externalOptions, setExternalOptions]     = useState<Record<string, Array<{ value: string; label: string; raw?: any }>>>({});
  const [externalLoading, setExternalLoading]     = useState<Record<string, boolean>>({});
  const [externalErrors, setExternalErrors]       = useState<Record<string, string | null>>({});
  const [externalProjects, setExternalProjects]   = useState<Array<{ value: string; label: string; raw?: any }>>([]);
  const [projectsLoading, setProjectsLoading]     = useState(false);
  const [projectsError, setProjectsError]         = useState<string | null>(null);
  const [formData, setFormData] = useState({
    entity_id: "", dept_id: "", letter_type_id: "",
    office_id: "", project_id: "", judul_surat: "",
    penggunaan_id: "", is_aset: false,
    request_place: "", request_date: new Date().toISOString().slice(0, 10),
    form_input_data: {} as Record<string, any>
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

  const getInputSchema = (item: any) => {
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

  const getManualInputFields = (item: any) =>
    getInputSchema(item).filter((field: any) => {
      const source = field.default_source || field.defaultSource || "manual";
      return source === "manual";
    });

  const getExternalInputFields = (item: any) =>
    getManualInputFields(item).filter((field: any) => field.type === "external_select");

  const isMultiSelectField = (field: any) =>
    field.multiple === true || field.is_multiple === true || field.key === "unit";

  const hasUnitRequestFields = (item: any) => {
    return getUnitConfig(item).enabled;
  };

  const getUnitConfig = (item: any) => suratService.getUnitConfigFromForm(item?.master_forms);

  const canCurrentDepartmentRequestUnit = (item: any) => {
    if (!hasUnitRequestFields(item)) return false;
    const config = getUnitConfig(item);
    if (!config.enabled) return false;
    if (config.allowed_department_ids.length === 0) return true;
    return config.allowed_department_ids.includes(formData.dept_id);
  };

  const shouldRequireInitialAttachment = () => {
    if (!selectedUsage || !isUnitMode) return true;
    return getUnitConfig(selectedUsage).initial_attachment_required;
  };

  const getRequestMode = () =>
    formData.form_input_data.request_mode === "unit" ? "unit" : "barang";

  const isUnitMode = getRequestMode() === "unit";

  const setRequestMode = (mode: "barang" | "unit") => {
    if (mode === "unit" && !canCurrentDepartmentRequestUnit(selectedUsage)) {
      toast({
        variant: "destructive",
        title: "Mode Unit Tidak Tersedia",
        description: "Departemen ini belum diizinkan mengajukan unit pada template ini.",
      });
      return;
    }
    setFormData(prev => {
      const nextInput = { ...prev.form_input_data, request_mode: mode };
      if (mode === "unit") {
        delete nextInput.items;
      } else {
        delete nextInput.requested_project;
        delete nextInput.requested_unit_count;
        delete nextInput.unit_request_sentence;
      }
      return { ...prev, form_input_data: nextInput };
    });
  };

  const hasPlaceDateMapping = (item: any) => {
    const mappedSources = new Set(
      getInputSchema(item)
        .filter((field: any) => !!String(field.cell || field.merge_range || field.mergeRange || "").trim())
        .map((field: any) => field.default_source || field.defaultSource || "manual")
    );
    return mappedSources.has("request_place_date") ||
      (mappedSources.has("request_place") && mappedSources.has("request_date"));
  };

  const setInputValue = (key: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      form_input_data: { ...prev.form_input_data, [key]: value },
    }));
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

  const getTableRows = (key: string) => {
    const rows = formData.form_input_data[key];
    return Array.isArray(rows) && rows.length > 0 ? rows : [{}];
  };

  const setTableRows = (key: string, rows: any[]) => {
    setInputValue(key, rows);
  };

  const updateTableCell = (key: string, rowIndex: number, columnKey: string, value: any) => {
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

  const isTableFieldComplete = (field: any) => {
    const rows = getTableRows(field.key).filter((row: any) =>
      Object.values(row ?? {}).some((value) => String(value ?? "").trim())
    );
    if (field.required !== false && rows.length === 0) return false;
    return rows.every((row: any) =>
      (field.table_config?.columns ?? [])
        .filter((column: any) => column.required !== false)
        .every((column: any) => String(row?.[column.key] ?? "").trim())
    );
  };

  const isManualFieldComplete = (field: any) => {
    if (hasUnitRequestFields(selectedUsage)) {
      if (field.key === "requested_unit_count") return true;
      if (isUnitMode && (field.key === "items" || field.key === "unit")) return true;
      if (!isUnitMode && field.key === "unit") return true;
    }
    if (field.type === "table") return isTableFieldComplete(field);
    const value = formData.form_input_data[field.key];
    if (field.type === "external_select" && isMultiSelectField(field)) {
      return field.required === false || (Array.isArray(value) && value.length > 0);
    }
    return field.required === false || !!String(value?.value ?? value ?? "").trim();
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

  const selectedProject = useMemo(
    () => master.projects?.find((p: any) => p.id === formData.project_id) ?? null,
    [master.projects, formData.project_id]
  );

  const selectedProjectCode = useMemo(() => {
    const code = String(selectedProject?.code ?? "").trim();
    if (code) return code;

    const name = String(selectedProject?.name ?? "").trim();
    const prefix = name.match(/^([A-Za-z0-9]+)\s*-/)?.[1];
    return prefix ? prefix.toUpperCase() : "";
  }, [selectedProject]);

  const externalVariables = useMemo(() => ({
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
    master.users?.find((u: any) => u.id === userId)?.full_name || "";

  const getFilteredSignerUsers = (index: number) => {
    const tokens = normalizeNameSearch(signerSearch[index] || "").split(" ").filter(Boolean);
    if (tokens.length === 0) return master.users || [];

    return (master.users || []).filter((u: any) => {
      const haystack = normalizeNameSearch(u.full_name || "");
      return tokens.every(token => haystack.includes(token));
    });
  };

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
      .select(`*, master_forms!fk_master_forms (id, nama_form, nomor_form, link_form, department_id, input_schema, unit_config)`)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast({ variant: "destructive", title: "Gagal memuat penggunaan", description: error.message });
        else setUsageDetails(data || []);
      });
  }, [toast]);

  useEffect(() => {
    if (!generatedNoSurat) { setSelectedUsage(null); setFormData(prev => ({ ...prev, penggunaan_id: "" })); setSigners([]); }
  }, [isPusatSelected, generatedNoSurat]);

  useEffect(() => {
    if (selectedUsage && isUnitMode && !canCurrentDepartmentRequestUnit(selectedUsage)) {
      setRequestMode("barang");
    }
  }, [formData.dept_id, selectedUsage, isUnitMode]);

  useEffect(() => {
    const fields = getExternalInputFields(selectedUsage);
    if (fields.length === 0) return;

    let cancelled = false;
    fields.forEach(async (field: any) => {
      const sourceKey = field.external_source_key || field.externalSourceKey;
      const dependencyKey = field.external_dependency_key || field.externalDependencyKey;
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
        const currentValue = formData.form_input_data[field.key];
        if (isMultiSelectField(field)) {
          const selected = Array.isArray(currentValue) ? currentValue : [];
          const filtered = selected.filter((item: any) => options.some((option: any) => option.value === item?.value));
          if (selected.length !== filtered.length) setInputValue(field.key, filtered);
        } else if (currentValue?.value && !options.some((option: any) => option.value === currentValue.value)) {
          setInputValue(field.key, undefined);
        }
      } catch (error: any) {
        if (cancelled) return;
        setExternalOptions(prev => ({ ...prev, [field.key]: [] }));
        setExternalErrors(prev => ({ ...prev, [field.key]: error.message || "Gagal mengambil data external." }));
      } finally {
        if (!cancelled) setExternalLoading(prev => ({ ...prev, [field.key]: false }));
      }
    });

    return () => { cancelled = true; };
  }, [selectedUsage, externalVariables]);

  useEffect(() => {
    if (!selectedUsage || !hasUnitRequestFields(selectedUsage)) return;
    let cancelled = false;
    setProjectsLoading(true);
    setProjectsError(null);
    requestExternalOptions("marison_projects")
      .then((options) => { if (!cancelled) setExternalProjects(options); })
      .catch((error: any) => {
        if (!cancelled) {
          setExternalProjects([]);
          setProjectsError(error.message || "Gagal mengambil daftar proyek.");
        }
      })
      .finally(() => { if (!cancelled) setProjectsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedUsage]);

  // ── HANDLERS ───────────────────────────────────────────────────────────────
  const handleProjectChange = (projectId: string) => {
    const proj = master.projects?.find((p: any) => p.id === projectId);
    setFormData(prev => ({ ...prev, project_id: projectId, entity_id: proj?.entity_id || prev.entity_id }));
  };

  const handleUsageChange = (val: string) => {
    const detail = usageDetails.find(u => u.id === val);
    if (!detail) return;
    setSelectedUsage(detail);
    setFormData(prev => ({
      ...prev,
      penggunaan_id: val,
      form_input_data: hasUnitRequestFields(detail) ? { request_mode: canCurrentDepartmentRequestUnit(detail) ? "unit" : "barang" } : {},
    }));
    try {
      const config = typeof detail.ttd_config === "string" ? JSON.parse(detail.ttd_config) : detail.ttd_config;
      if (Array.isArray(config)) {
        const total = config.length;
        setSigners(config.map((c: any, i: number) => ({
          role_name: normalizeRoleName(c.roleName || c.role_name || c.labelJabatan || c.label_jabatan || c.jabatan, i, total),
          label_jabatan: c.labelJabatan || c.label_jabatan || c.jabatan,
          user_id: "",
          step_order: i + 1,
          requires_unit_allocation: c.requires_unit_allocation === true || c.requiresUnitAllocation === true,
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

  const handleRequestedUnitCountChange = (rawValue: string) => {
    const count = Math.max(Number(rawValue || 0), 0);
    setInputValue("requested_unit_count", count || "");
    const project = formData.form_input_data.requested_project;
    setInputValue("unit_request_sentence", project?.name && count > 0
      ? `Butuh : ${count} Unit, Proyek: ${project.name}, Cabang: ${project.branch?.name || "-"}`
      : "");
  };

  const handleExternalProjectChange = (value: string) => {
    const option = externalProjects.find((item) => item.value === value);
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
    const count = Number(formData.form_input_data.requested_unit_count || 0);
    setInputValue("requested_project", requestedProject);
    setInputValue("unit_request_sentence", count > 0
      ? `Butuh : ${count} Unit, Proyek: ${project.name}, Cabang: ${project.branch?.name || "-"}`
      : "");
  };

  const resetForm = () => {
    setFormData({
      entity_id: "", dept_id: "", letter_type_id: "", office_id: officePusat?.id || "", project_id: "",
      judul_surat: "", penggunaan_id: "", is_aset: false,
      request_place: "", request_date: new Date().toISOString().slice(0, 10), form_input_data: {}
    });
    setGeneratedNoSurat(null); setSelectedUsage(null); setLampiranFiles([]); setSigners([]);
    setJudulForDisplay("");
    if (lampiranInputRef.current) lampiranInputRef.current.value = "";
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
    if (lampiranFiles.length === 0 && shouldRequireInitialAttachment()) {
      return toast({ variant: "destructive", title: "Lampiran Wajib", description: "Unggah minimal satu lampiran." });
    }
    if (hasUnitRequestFields(selectedUsage) && isUnitMode) {
      if (!canCurrentDepartmentRequestUnit(selectedUsage)) {
        return toast({ variant: "destructive", title: "Mode Unit Tidak Diizinkan", description: "Departemen ini tidak termasuk konfigurasi pengaju unit." });
      }
      const count = Number(formData.form_input_data.requested_unit_count || 0);
      if (!formData.form_input_data.requested_project?.code) return toast({ variant: "destructive", title: "Proyek Wajib Dipilih", description: "Pilih proyek untuk permohonan unit." });
      if (!Number.isFinite(count) || count < 1) return toast({ variant: "destructive", title: "Jumlah Unit Wajib Diisi", description: "Jumlah unit minimal 1." });
    }
    const missingField = getManualInputFields(selectedUsage).find((field: any) => !isManualFieldComplete(field));
    if (missingField) return toast({ variant: "destructive", title: "Input Belum Lengkap", description: `${missingField.label} wajib diisi.` });
    if (signers.some(s => !s.user_id)) return toast({ variant: "destructive", title: "Pejabat Belum Lengkap" });
    setIsLoading(true);
    try {
      const result = await suratService.createRegistrasi({ ...formData, no_surat: generatedNoSurat }, signers, null, lampiranFiles);
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
  const renderTableField = (field: any) => {
    const columns = field.table_config?.columns ?? [];
    const rows = getTableRows(field.key);

    return (
      <div className="space-y-4">
        <div className="hidden overflow-x-auto rounded-2xl border border-border bg-background/70 md:block">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="sticky top-0 bg-muted/70">
              <tr>
                <th className="w-16 px-4 py-3 text-left text-[11px] font-black uppercase text-muted-foreground">No</th>
                {columns.map((column: any) => (
                  <th key={column.key} className="px-4 py-3 text-left text-[11px] font-black uppercase text-muted-foreground">
                    {column.label}{column.required !== false ? " *" : ""}
                  </th>
                ))}
                <th className="w-16 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any, rowIndex: number) => (
                <tr key={rowIndex} className="border-t border-border">
                  <td className="px-4 py-3 text-xs font-black text-muted-foreground">{rowIndex + 1}</td>
                  {columns.map((column: any) => (
                    <td key={column.key} className="px-4 py-3">
                      <Input
                        type={column.type === "number" ? "number" : "text"}
                        value={row?.[column.key] ?? ""}
                        onChange={e => updateTableCell(field.key, rowIndex, column.key, e.target.value)}
                        className="h-12 min-w-[130px] bg-background text-sm"
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-destructive"
                      onClick={() => removeTableRow(field.key, rowIndex)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {rows.map((row: any, rowIndex: number) => (
            <div key={rowIndex} className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-primary">Barang {rowIndex + 1}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive"
                  onClick={() => removeTableRow(field.key, rowIndex)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-3">
                {columns.map((column: any) => (
                  <div key={column.key} className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground">
                      {column.label}{column.required !== false ? " *" : ""}
                    </Label>
                    <Input
                      type={column.type === "number" ? "number" : "text"}
                      value={row?.[column.key] ?? ""}
                      onChange={e => updateTableCell(field.key, rowIndex, column.key, e.target.value)}
                      className="h-12 bg-background text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <Button type="button" variant="outline" size="lg" className="h-12 rounded-2xl text-xs font-black uppercase" onClick={() => addTableRow(field.key)}>
          <Plus className="mr-2 h-4 w-4" /> Tambah Barang
        </Button>
      </div>
    );
  };

  const renderExternalSelectField = (field: any) => {
    const options = externalOptions[field.key] || [];
    const isMultiple = isMultiSelectField(field);
    const selectedOptions = Array.isArray(formData.form_input_data[field.key]) ? formData.form_input_data[field.key] : [];
    const selectedValues = new Set(selectedOptions.map((item: any) => item.value));
    const currentValue = formData.form_input_data[field.key]?.value || "";
    const dependencyKey = field.external_dependency_key || field.externalDependencyKey;
    const dependencyValue = dependencyKey ? externalVariables[dependencyKey] : true;
    const isDisabled = externalLoading[field.key] || !dependencyValue;
    const toggleOption = (option: any) => {
      if (!isMultiple) {
        setInputValue(field.key, option || { value: option?.value, label: option?.label });
        return;
      }
      const next = selectedValues.has(option.value)
        ? selectedOptions.filter((item: any) => item.value !== option.value)
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
              {selectedOptions.map((option: any) => (
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
          value={currentValue}
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

  const renderManualField = (field: any) => (
    <div key={field.key} className={cn("space-y-2", field.type === "table" && "md:col-span-2")}>
      <Label className="text-[11px] font-black uppercase text-muted-foreground">
        {field.label}{field.required !== false ? " *" : ""}
      </Label>
      {field.type === "table" ? renderTableField(field) : field.type === "external_select" ? (
        renderExternalSelectField(field)
      ) : field.type === "textarea" ? (
        <Textarea
          value={formData.form_input_data[field.key] ?? ""}
          onChange={e => setInputValue(field.key, e.target.value)}
          className="min-h-[140px] bg-background/70 text-sm leading-relaxed"
        />
      ) : (
        <Input
          type={field.type === "date" ? "date" : field.type === "number" || field.type === "currency" ? "number" : "text"}
          value={formData.form_input_data[field.key] ?? ""}
          onChange={e => setInputValue(field.key, e.target.value)}
          className="h-12 bg-background/70 text-sm"
        />
      )}
    </div>
  );

  const getVisibleManualFields = () =>
    getManualInputFields(selectedUsage).filter((field: any) => {
      if (!hasUnitRequestFields(selectedUsage)) return true;
      if (field.key === "requested_unit_count") return false;
      if (isUnitMode) return field.key !== "items" && field.key !== "unit";
      return field.key !== "unit";
    });

  const renderUnitRequestPanel = () => {
    if (!selectedUsage || !hasUnitRequestFields(selectedUsage) || !isUnitMode) return null;
    const selectedProject = formData.form_input_data.requested_project;
    return (
      <div className="space-y-4 rounded-3xl border border-blue-500/20 bg-blue-500/5 p-5 md:p-6">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-black uppercase tracking-widest text-blue-600">Pengajuan Unit</p>
          <p className="text-xs font-medium text-muted-foreground">
            Marketing hanya mengajukan jumlah unit. Perencanaan akan memilih unit spesifik saat approval.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-[11px] font-black uppercase text-muted-foreground">Proyek</Label>
            <Select value={selectedProject?.value || ""} onValueChange={handleExternalProjectChange} disabled={projectsLoading}>
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
            <Label className="text-[11px] font-black uppercase text-muted-foreground">Jumlah Unit Diajukan</Label>
            <Input
              type="number"
              min={1}
              value={formData.form_input_data.requested_unit_count ?? ""}
              onChange={(e) => handleRequestedUnitCountChange(e.target.value)}
              className="h-12 bg-background/70 text-sm"
              placeholder="Contoh: 10"
            />
          </div>
        </div>
        {formData.form_input_data.unit_request_sentence && (
          <div className="rounded-2xl border border-blue-500/20 bg-background/70 p-3 text-xs font-semibold text-blue-700">
            {formData.form_input_data.unit_request_sentence}
          </div>
        )}
      </div>
    );
  };

  const renderRequestModeSelector = () => {
    if (!selectedUsage || !hasUnitRequestFields(selectedUsage) || !canCurrentDepartmentRequestUnit(selectedUsage)) return null;
    return (
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border/60 bg-background/60 p-1">
        {[
          { value: "barang", label: "Barang" },
          { value: "unit", label: "Unit" },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRequestMode(option.value as "barang" | "unit")}
            className={cn(
              "h-11 rounded-xl text-[11px] font-black uppercase transition-all",
              getRequestMode() === option.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  };

  const renderAttachmentUploader = () => (
    <div className="space-y-4 rounded-3xl border border-border/50 bg-muted/10 p-5 md:p-6">
      <div className={cn(
        "relative border-2 border-dashed rounded-2xl p-6 flex items-center gap-5 transition-all",
        lampiranFiles.length > 0 ? "border-emerald-500 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10"
      )}>
        <input
          type="file"
          ref={lampiranInputRef}
          multiple
          className="absolute inset-0 opacity-0 cursor-pointer z-10"
          onChange={e => setLampiranFiles(Array.from(e.target.files ?? []))}
        />
        <div className={cn("p-4 rounded-2xl", lampiranFiles.length > 0 ? "bg-emerald-500 text-white" : "bg-amber-500 text-white")}>
          <Paperclip className="w-6 h-6" />
        </div>
        <div className="text-left flex-1 min-w-0">
          <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            {shouldRequireInitialAttachment() ? "Lampiran Wajib" : "Lampiran Opsional"}
          </p>
          <p className="mt-1 text-sm font-bold truncate">
            {lampiranFiles.length > 0 ? `${lampiranFiles.length} file dipilih` : "Klik untuk unggah PDF/Gambar, bisa lebih dari satu"}
          </p>
        </div>
      </div>

      {lampiranFiles.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {lampiranFiles.map((file, index) => (
            <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-3 rounded-xl border border-border bg-background/70 p-3">
              <Paperclip className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{file.name}</p>
                <p className="text-[10px] font-medium text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-destructive"
                onClick={() => {
                  const next = lampiranFiles.filter((_, i) => i !== index);
                  setLampiranFiles(next);
                  if (lampiranInputRef.current && next.length === 0) lampiranInputRef.current.value = "";
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

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
                      <SelectItem key={p.id} value={p.id}>{p.code ? `${p.code} - ${p.name}` : p.name}</SelectItem>
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
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Template by Sistem</p>
                      <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                        Excel akan dibuat otomatis dari input sistem. User tidak perlu download atau upload file utama.
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-4 rounded-3xl border border-border/50 bg-muted/10 p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tanggal Dokumen</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-[11px] font-black uppercase text-muted-foreground">Tempat</Label>
                      <Input
                        value={formData.request_place}
                        onChange={e => setFormData({ ...formData, request_place: e.target.value })}
                        placeholder="Contoh: Jakarta"
                        className="h-12 bg-background/70 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[11px] font-black uppercase text-muted-foreground">Tanggal</Label>
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
                <div className="space-y-5 rounded-3xl border border-border/50 bg-muted/10 p-5 md:p-6">
                  <div className="flex flex-col gap-1">
                    <p className="text-[11px] font-black uppercase tracking-widest text-primary">Input Detail Template</p>
                    <p className="text-xs font-medium text-muted-foreground">
                      Isi data dokumen di sini. Data ini akan masuk ke template Excel dan PDF otomatis.
                    </p>
                  </div>
                  {renderRequestModeSelector()}
                  {renderUnitRequestPanel()}
                  {getVisibleManualFields().length > 0 && (
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      {getVisibleManualFields().map((field: any) => renderManualField(field))}
                    </div>
                  )}
                </div>
              )}

              {renderAttachmentUploader()}
            </section>

            {/* ══ SECTION 3: SIGNERS ═══════════════════════════════════════ */}
            {signers.length > 0 && (
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
                                    {getFilteredSignerUsers(i).map((u: any) => (
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
