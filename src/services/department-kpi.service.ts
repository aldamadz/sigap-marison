import { supabase } from "@/lib/supabase";

export type DepartmentKpiStatus = "all" | "pending" | "completed" | "rejected" | "late" | "on_time";

export type DepartmentKpiFilters = {
  from?: string | null;
  to?: string | null;
  deptId?: string | null;
  letterTypeId?: string | null;
  formId?: string | null;
  status?: DepartmentKpiStatus;
};

export type DepartmentKpiSummary = {
  dept_id: string;
  dept_name: string;
  dept_code: string | null;
  total_count: number;
  completed_count: number;
  pending_count: number;
  rejected_count: number;
  on_time_count: number;
  late_count: number;
  avg_minutes: number | null;
  sla_minutes: number;
  worst_pending_minutes: number;
};

export type KpiOption = {
  id: string;
  name: string;
  code?: string | null;
};

export type DepartmentKpiConfig = {
  dept_id: string;
  sla_minutes: number;
  work_days: number[];
  work_start: string;
  work_end: string;
  break_start: string;
  break_end: string;
  timezone: string;
  is_active: boolean;
};

export const DEFAULT_DEPARTMENT_KPI_CONFIG = {
  sla_minutes: 120,
  work_days: [1, 2, 3, 4, 5],
  work_start: "08:00",
  work_end: "17:00",
  break_start: "12:00",
  break_end: "13:00",
  timezone: "Asia/Jakarta",
  is_active: true,
};

const toEndExclusive = (dateValue?: string | null) => {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
};

export const departmentKpiService = {
  async getSummary(filters: DepartmentKpiFilters = {}): Promise<DepartmentKpiSummary[]> {
    const { data, error } = await supabase.rpc("get_department_kpi_summary", {
      p_from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : null,
      p_to: toEndExclusive(filters.to),
      p_dept_id: filters.deptId || null,
      p_letter_type_id: filters.letterTypeId || null,
      p_form_id: filters.formId || null,
      p_status: filters.status || "all",
    });

    if (error) throw error;
    return (data || []) as DepartmentKpiSummary[];
  },

  async getFilterOptions() {
    const [departments, letterTypes, forms] = await Promise.all([
      supabase.from("master_departments").select("id, name, code").order("name", { ascending: true }),
      supabase.from("master_letter_types").select("id, name, code").order("name", { ascending: true }),
      supabase.from("master_forms").select("id, nama_form, nomor_form").order("nama_form", { ascending: true }),
    ]);

    if (departments.error) throw departments.error;
    if (letterTypes.error) throw letterTypes.error;
    if (forms.error) throw forms.error;

    return {
      departments: (departments.data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        code: row.code,
      })) as KpiOption[],
      letterTypes: (letterTypes.data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        code: row.code,
      })) as KpiOption[],
      forms: (forms.data || []).map((row: any) => ({
        id: row.id,
        name: row.nama_form,
        code: row.nomor_form,
      })) as KpiOption[],
    };
  },

  async getConfig(deptId: string): Promise<DepartmentKpiConfig> {
    const { data, error } = await supabase
      .from("department_kpi_configs")
      .select("*")
      .eq("dept_id", deptId)
      .maybeSingle();

    if (error) throw error;
    return {
      dept_id: deptId,
      ...DEFAULT_DEPARTMENT_KPI_CONFIG,
      ...(data || {}),
    } as DepartmentKpiConfig;
  },

  async saveConfig(config: DepartmentKpiConfig) {
    const { error } = await supabase
      .from("department_kpi_configs")
      .upsert({
        ...config,
        updated_at: new Date().toISOString(),
      }, { onConflict: "dept_id" });

    if (error) throw error;
  },
};
