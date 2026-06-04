import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, CheckCircle2, Clock, Loader2, RefreshCw, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_DEPARTMENT_KPI_CONFIG,
  departmentKpiService,
  DepartmentKpiConfig,
  DepartmentKpiStatus,
} from "@/services/department-kpi.service";
import { cn } from "@/lib/utils";

const today = new Date();
const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);

const formatMinutes = (minutes?: number | null) => {
  const safe = Math.max(0, Math.round(minutes || 0));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest} menit`;
  if (rest === 0) return `${hours} jam`;
  return `${hours} jam ${rest} menit`;
};

const statusOptions: Array<{ value: DepartmentKpiStatus; label: string }> = [
  { value: "all", label: "Semua Status" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Selesai" },
  { value: "rejected", label: "Ditolak" },
  { value: "late", label: "Telat" },
  { value: "on_time", label: "On-Time" },
];

const DepartmentKPIPage = () => {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    from: formatDateInput(startOfMonth),
    to: formatDateInput(today),
    deptId: "",
    letterTypeId: "",
    formId: "",
    status: "all" as DepartmentKpiStatus,
  });
  const [configForm, setConfigForm] = useState<Omit<DepartmentKpiConfig, "dept_id">>(DEFAULT_DEPARTMENT_KPI_CONFIG);

  const optionsQuery = useQuery({
    queryKey: ["department-kpi-options"],
    queryFn: () => departmentKpiService.getFilterOptions(),
  });

  const summaryQuery = useQuery({
    queryKey: ["department-kpi-summary", filters],
    queryFn: () => departmentKpiService.getSummary(filters),
  });

  const configQuery = useQuery({
    queryKey: ["department-kpi-config", filters.deptId],
    queryFn: () => departmentKpiService.getConfig(filters.deptId),
    enabled: Boolean(filters.deptId),
  });

  const saveConfigMutation = useMutation({
    mutationFn: () => {
      if (!filters.deptId) throw new Error("Pilih departemen terlebih dahulu.");
      return departmentKpiService.saveConfig({
        dept_id: filters.deptId,
        ...configForm,
      });
    },
    onSuccess: async () => {
      toast.success("Konfigurasi KPI departemen disimpan.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["department-kpi-config", filters.deptId] }),
        queryClient.invalidateQueries({ queryKey: ["department-kpi-summary"] }),
      ]);
    },
    onError: (error) => {
      toast.error((error as Error).message || "Gagal menyimpan konfigurasi KPI.");
    },
  });

  useEffect(() => {
    if (configQuery.data) {
      const { dept_id: _deptId, ...form } = configQuery.data;
      setConfigForm(form);
    } else if (!filters.deptId) {
      setConfigForm(DEFAULT_DEPARTMENT_KPI_CONFIG);
    }
  }, [configQuery.data, filters.deptId]);

  const rows = summaryQuery.data || [];
  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += row.total_count;
        acc.completed += row.completed_count;
        acc.pending += row.pending_count;
        acc.rejected += row.rejected_count;
        acc.onTime += row.on_time_count;
        acc.late += row.late_count;
        acc.weightedMinutes += Number(row.avg_minutes || 0) * row.total_count;
        return acc;
      },
      { total: 0, completed: 0, pending: 0, rejected: 0, onTime: 0, late: 0, weightedMinutes: 0 }
    );
  }, [rows]);

  const onTimeRate = totals.total > 0 ? Math.round((totals.onTime / totals.total) * 100) : 0;
  const averageMinutes = totals.total > 0 ? totals.weightedMinutes / totals.total : 0;
  const loading = optionsQuery.isLoading || summaryQuery.isLoading;
  const error = optionsQuery.error || summaryQuery.error;

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const optionData = optionsQuery.data;

  return (
    <div className="min-h-screen bg-background p-6 lg:p-8 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">KPI Departemen</h1>
              <p className="text-sm text-muted-foreground">
                SLA approval dihitung dari jam kerja efektif, termasuk pending sampai waktu sekarang.
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-fit gap-2"
          onClick={() => summaryQuery.refetch()}
          disabled={summaryQuery.isFetching}
        >
          {summaryQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Dari</label>
            <input
              type="date"
              value={filters.from}
              onChange={(event) => setFilter("from", event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sampai</label>
            <input
              type="date"
              value={filters.to}
              onChange={(event) => setFilter("to", event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <FilterSelect label="Departemen" value={filters.deptId} onChange={(value) => setFilter("deptId", value)}>
            <option value="">Semua Departemen</option>
            {(optionData?.departments || []).map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.code ? `${dept.code} - ${dept.name}` : dept.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Jenis Surat" value={filters.letterTypeId} onChange={(value) => setFilter("letterTypeId", value)}>
            <option value="">Semua Jenis</option>
            {(optionData?.letterTypes || []).map((type) => (
              <option key={type.id} value={type.id}>
                {type.code ? `${type.code} - ${type.name}` : type.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Form" value={filters.formId} onChange={(value) => setFilter("formId", value)}>
            <option value="">Semua Form</option>
            {(optionData?.forms || []).map((form) => (
              <option key={form.id} value={form.id}>
                {form.code ? `${form.code} - ${form.name}` : form.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Status" value={filters.status} onChange={(value) => setFilter("status", value)}>
            {statusOptions.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </FilterSelect>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
          {(error as Error).message || "Gagal memuat KPI departemen."}
        </div>
      ) : null}

      {filters.deptId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-black uppercase tracking-tight">Konfigurasi SLA Departemen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <NumberField
                label="SLA Menit"
                value={configForm.sla_minutes}
                onChange={(value) => setConfigForm((prev) => ({ ...prev, sla_minutes: value }))}
              />
              <TimeField label="Mulai Kerja" value={configForm.work_start} onChange={(value) => setConfigForm((prev) => ({ ...prev, work_start: value }))} />
              <TimeField label="Selesai Kerja" value={configForm.work_end} onChange={(value) => setConfigForm((prev) => ({ ...prev, work_end: value }))} />
              <TimeField label="Mulai Istirahat" value={configForm.break_start} onChange={(value) => setConfigForm((prev) => ({ ...prev, break_start: value }))} />
              <TimeField label="Selesai Istirahat" value={configForm.break_end} onChange={(value) => setConfigForm((prev) => ({ ...prev, break_end: value }))} />
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Timezone</label>
                <input
                  value={configForm.timezone}
                  onChange={(event) => setConfigForm((prev) => ({ ...prev, timezone: event.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {[
                  [1, "Sen"],
                  [2, "Sel"],
                  [3, "Rab"],
                  [4, "Kam"],
                  [5, "Jum"],
                  [6, "Sab"],
                  [7, "Min"],
                ].map(([day, label]) => {
                  const active = configForm.work_days.includes(day as number);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setConfigForm((prev) => ({
                        ...prev,
                        work_days: active
                          ? prev.work_days.filter((item) => item !== day)
                          : [...prev.work_days, day as number].sort(),
                      }))}
                      className={cn(
                        "h-9 rounded-md border px-3 text-xs font-black uppercase",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <Button
                onClick={() => saveConfigMutation.mutate()}
                disabled={saveConfigMutation.isPending || configQuery.isLoading}
                className="gap-2"
              >
                {saveConfigMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Simpan Konfigurasi
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Total Step" value={totals.total.toLocaleString("id-ID")} icon={Timer} />
        <MetricCard title="On-Time" value={`${onTimeRate}%`} detail={`${totals.onTime} dari ${totals.total || 0}`} icon={CheckCircle2} tone="success" />
        <MetricCard title="Telat" value={totals.late.toLocaleString("id-ID")} icon={AlertTriangle} tone="warning" />
        <MetricCard title="Pending" value={totals.pending.toLocaleString("id-ID")} icon={Clock} tone="info" />
        <MetricCard title="Rata-rata" value={formatMinutes(averageMinutes)} icon={BarChart3} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base font-black uppercase tracking-tight">Ranking SLA Departemen</CardTitle>
          <Badge variant="secondary" className="rounded-md">
            SLA default 2 jam kerja
          </Badge>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-56 items-center justify-center gap-3 text-sm font-semibold text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Menghitung KPI jam kerja efektif...
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-56 items-center justify-center rounded-lg border border-dashed text-sm font-semibold text-muted-foreground">
              Tidak ada data KPI untuk filter ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <th className="py-3 pr-4">Departemen</th>
                    <th className="py-3 pr-4 text-right">Total</th>
                    <th className="py-3 pr-4 text-right">On-Time</th>
                    <th className="py-3 pr-4 text-right">Telat</th>
                    <th className="py-3 pr-4 text-right">Pending</th>
                    <th className="py-3 pr-4 text-right">Rata-rata</th>
                    <th className="py-3 text-right">Pending Terlama</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const rate = row.total_count > 0 ? Math.round((row.on_time_count / row.total_count) * 100) : 0;
                    return (
                      <tr key={row.dept_id} className="border-b last:border-0">
                        <td className="py-4 pr-4">
                          <div className="font-bold text-foreground">{row.dept_name}</div>
                          <div className="text-xs text-muted-foreground">{row.dept_code || "Tanpa kode"} · SLA {formatMinutes(row.sla_minutes)}</div>
                        </td>
                        <td className="py-4 pr-4 text-right font-semibold">{row.total_count}</td>
                        <td className="py-4 pr-4 text-right">
                          <Badge className={cn("rounded-md", rate >= 80 ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15" : "bg-amber-500/15 text-amber-600 hover:bg-amber-500/15")}>
                            {rate}%
                          </Badge>
                        </td>
                        <td className="py-4 pr-4 text-right font-semibold text-amber-600">{row.late_count}</td>
                        <td className="py-4 pr-4 text-right font-semibold text-sky-600">{row.pending_count}</td>
                        <td className="py-4 pr-4 text-right font-semibold">{formatMinutes(row.avg_minutes)}</td>
                        <td className="py-4 text-right font-semibold">{formatMinutes(row.worst_pending_minutes)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const FilterSelect = ({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) => (
  <div className="space-y-1">
    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</label>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
    >
      {children}
    </select>
  </div>
);

const NumberField = ({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) => (
  <div className="space-y-1">
    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</label>
    <input
      type="number"
      min={1}
      value={value}
      onChange={(event) => onChange(Math.max(1, Number(event.target.value || 1)))}
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
    />
  </div>
);

const TimeField = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
  <div className="space-y-1">
    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</label>
    <input
      type="time"
      value={value?.slice(0, 5) || ""}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
    />
  </div>
);

const MetricCard = ({
  title,
  value,
  detail,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: string;
  detail?: string;
  icon: typeof BarChart3;
  tone?: "default" | "success" | "warning" | "info";
}) => {
  const toneClass = {
    default: "bg-primary/10 text-primary",
    success: "bg-emerald-500/15 text-emerald-600",
    warning: "bg-amber-500/15 text-amber-600",
    info: "bg-sky-500/15 text-sky-600",
  }[tone];

  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{title}</p>
          <p className="truncate text-2xl font-black text-foreground">{value}</p>
          {detail ? <p className="text-xs font-semibold text-muted-foreground">{detail}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
};

export default DepartmentKPIPage;
