import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, CheckCircle2, Clock, Eye, Loader2, RefreshCw, Timer, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_DEPARTMENT_KPI_CONFIG,
  departmentKpiService,
  DepartmentKpiConfig,
  DepartmentKpiSummary,
  DepartmentKpiStatus,
} from "@/services/department-kpi.service";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {DepartmentReceivingPolicy} from '@/components/configuration/DepartmentReceivingPolicy';
import {DepartmentSlaManagers} from '@/components/configuration/DepartmentSlaManagers';

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

const formatDateTime = (value?: string | null) => {
  if (!value) return "Belum selesai";
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusOptions: Array<{ value: DepartmentKpiStatus; label: string }> = [
  { value: "all", label: "Semua Status" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Selesai" },
  { value: "rejected", label: "Ditolak" },
  { value: "late", label: "Telat" },
  { value: "on_time", label: "On-Time" },
];

const DepartmentKPIPage = ({ configurationOnly = false }: { configurationOnly?: boolean }) => {
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
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentKpiSummary | null>(null);

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

  const detailQuery = useQuery({
    queryKey: ["department-kpi-details", filters, selectedDepartment?.dept_id],
    queryFn: () => departmentKpiService.getDetails({
      ...filters,
      deptId: selectedDepartment?.dept_id || null,
    }),
    enabled: Boolean(selectedDepartment?.dept_id),
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
      toast.success("Konfigurasi SLA departemen disimpan.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["department-kpi-config", filters.deptId] }),
        queryClient.invalidateQueries({ queryKey: ["department-kpi-summary"] }),
      ]);
    },
    onError: (error) => {
      toast.error((error as Error).message || "Gagal menyimpan konfigurasi SLA.");
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
        acc.measured += Math.max(row.total_count - row.rejected_count, 0);
        acc.weightedMinutes += Number(row.avg_minutes || 0) * Math.max(row.total_count - row.rejected_count, 0);
        return acc;
      },
      { total: 0, measured: 0, completed: 0, pending: 0, rejected: 0, onTime: 0, late: 0, weightedMinutes: 0 }
    );
  }, [rows]);

  const onTimeRate = totals.measured > 0 ? Math.round((totals.onTime / totals.measured) * 100) : null;
  const averageMinutes = totals.measured > 0 ? totals.weightedMinutes / totals.measured : 0;
  const loading = optionsQuery.isLoading || summaryQuery.isLoading;
  const error = optionsQuery.error || summaryQuery.error;

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const optionData = optionsQuery.data;

  const configurationPanel = (
    <Card className="border-border shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Konfigurasi SLA Departemen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {configurationOnly && (
          <div className="max-w-md">
            <FilterSelect label="Departemen" value={filters.deptId} onChange={(value) => setFilter("deptId", value)}>
              <option value="">Pilih Departemen</option>
              {(optionData?.departments || []).map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.code ? `${dept.code} - ${dept.name}` : dept.name}
                </option>
              ))}
            </FilterSelect>
          </div>
        )}

        {!filters.deptId ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Pilih departemen untuk mengatur SLA dan jam kerja.
          </div>
        ) : (
          <>
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
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Timezone</label>
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
                        "h-9 rounded-md border px-3 text-xs font-semibold",
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
            <DepartmentReceivingPolicy key={filters.deptId} deptId={filters.deptId}/>
            <DepartmentSlaManagers key={`managers-${filters.deptId}`} deptId={filters.deptId}/>
          </>
        )}
      </CardContent>
    </Card>
  );

  if (configurationOnly) {
    return <div className="sigap-page">{configurationPanel}</div>;
  }

  return (
    <div className="sigap-page">
      <div className="sigap-panel sigap-panel-accent flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">SLA Departemen</h1>
              <p className="text-sm text-muted-foreground">
                Evaluasi approval berdasarkan jam kerja efektif.
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

      <Card className="border-border shadow-[var(--shadow-card)]">
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Dari</label>
            <input
              type="date"
              value={filters.from}
              onChange={(event) => setFilter("from", event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Sampai</label>
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
          {(error as Error).message || "Gagal memuat SLA departemen."}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard title="Total Step" value={totals.total.toLocaleString("id-ID")} icon={Timer} />
        <MetricCard
          title="Dinilai SLA"
          value={totals.measured.toLocaleString("id-ID")}
          detail={totals.rejected > 0 ? `${totals.rejected} ditolak tidak dinilai` : "On-time/telat dihitung dari sini"}
          icon={Timer}
        />
        <MetricCard
          title="On-Time"
          value={onTimeRate === null ? "-" : `${onTimeRate}%`}
          detail={totals.measured > 0 ? `${totals.onTime} dari ${totals.measured}` : "Belum ada step yang dinilai"}
          icon={CheckCircle2}
          tone="success"
        />
        <MetricCard title="Telat" value={totals.late.toLocaleString("id-ID")} icon={AlertTriangle} tone="warning" />
        <MetricCard title="Pending" value={totals.pending.toLocaleString("id-ID")} icon={Clock} tone="info" />
        <MetricCard title="Ditolak" value={totals.rejected.toLocaleString("id-ID")} icon={XCircle} tone="danger" />
        <MetricCard title="Rata-rata" value={totals.measured > 0 ? formatMinutes(averageMinutes) : "-"} icon={BarChart3} />
      </div>

      <Card className="border-border shadow-[var(--shadow-card)]">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base font-semibold">Ranking SLA Departemen</CardTitle>
          <Badge variant="secondary" className="rounded-md">
            SLA default 2 jam kerja
          </Badge>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-56 items-center justify-center gap-3 text-sm font-semibold text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Menghitung SLA jam kerja efektif...
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-56 items-center justify-center rounded-lg border border-dashed text-sm font-semibold text-muted-foreground">
              Tidak ada data SLA untuk filter ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-semibold text-muted-foreground">
                    <th className="py-3.5 pr-4">Departemen</th>
                    <th className="py-3.5 pr-4 text-right">Total</th>
                    <th className="py-3.5 pr-4 text-right">On-Time</th>
                    <th className="py-3.5 pr-4 text-right">Telat</th>
                    <th className="py-3.5 pr-4 text-right">Pending</th>
                    <th className="py-3.5 pr-4 text-right">Rata-rata</th>
                    <th className="py-3.5 text-right">Pending Terlama</th>
                    <th className="py-3.5 pl-4 text-right">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const measuredCount = Math.max(row.total_count - row.rejected_count, 0);
                    const rate = measuredCount > 0 ? Math.round((row.on_time_count / measuredCount) * 100) : null;
                    return (
                      <tr
                        key={row.dept_id}
                        tabIndex={0}
                        onClick={() => setSelectedDepartment(row)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedDepartment(row);
                          }
                        }}
                        className="cursor-pointer border-b transition-colors hover:bg-muted/40 focus:bg-muted/40 focus:outline-none last:border-0"
                      >
                        <td className="py-4 pr-4">
                          <div className="font-bold text-foreground">{row.dept_name}</div>
                          <div className="text-xs text-muted-foreground">{row.dept_code || "Tanpa kode"} · SLA {formatMinutes(row.sla_minutes)}</div>
                        </td>
                        <td className="py-4 pr-4 text-right font-semibold">{row.total_count}</td>
                        <td className="py-4 pr-4 text-right">
                          <Badge className={cn("rounded-md", rate === null || rate >= 80 ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15" : "bg-amber-500/15 text-amber-600 hover:bg-amber-500/15")}>
                            {rate === null ? "-" : `${rate}%`}
                          </Badge>
                        </td>
                        <td className="py-4 pr-4 text-right font-semibold text-amber-600">{row.late_count}</td>
                        <td className="py-4 pr-4 text-right font-semibold text-sky-600">{row.pending_count}</td>
                        <td className="py-4 pr-4 text-right font-semibold">{formatMinutes(row.avg_minutes)}</td>
                        <td className="py-4 text-right font-semibold">{formatMinutes(row.worst_pending_minutes)}</td>
                        <td className="py-4 pl-4 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-2"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedDepartment(row);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                            Lihat
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedDepartment)} onOpenChange={(open) => !open && setSelectedDepartment(null)}>
        <DialogContent className="grid max-h-[90dvh] max-w-5xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-5 pr-12">
            <DialogTitle>Detail SLA {selectedDepartment?.dept_name}</DialogTitle>
            <DialogDescription>
              Rincian setiap tahap persetujuan berdasarkan jam kerja efektif dan filter SLA yang sedang digunakan.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto overscroll-contain px-6 pb-6">
            {selectedDepartment ? (
              <div className="sticky top-0 z-10 grid grid-cols-2 gap-3 border-b border-border bg-background py-4 md:grid-cols-4">
                <DetailMetric label="Total Step" value={selectedDepartment.total_count} />
                <DetailMetric label="SLA" value={formatMinutes(selectedDepartment.sla_minutes)} />
                <DetailMetric label="On-Time" value={selectedDepartment.on_time_count} tone="success" />
                <DetailMetric label="Telat" value={selectedDepartment.late_count} tone="danger" />
              </div>
            ) : null}

            {detailQuery.isLoading ? (
              <div className="flex h-64 items-center justify-center gap-3 text-sm font-semibold text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Menghitung rincian SLA...
              </div>
            ) : detailQuery.error ? (
              <div className="my-5 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
                {(detailQuery.error as Error).message || "Gagal memuat detail SLA."}
              </div>
            ) : (detailQuery.data || []).length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm font-semibold text-muted-foreground">
                Tidak ada rincian untuk filter ini.
              </div>
            ) : (
              <div className="space-y-3 pt-4">
                {(detailQuery.data || []).map((detail) => (
                  <div key={detail.signature_id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {detail.no_surat || "Nomor belum tersedia"}
                          </Badge>
                          <Badge className={cn(
                            "rounded-md text-[10px]",
                            detail.kpi_status === "rejected"
                              ? "bg-red-500/15 text-red-600 hover:bg-red-500/15"
                              : detail.kpi_status === "pending"
                                ? "bg-sky-500/15 text-sky-600 hover:bg-sky-500/15"
                                : "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15"
                          )}>
                            {detail.kpi_status === "pending" ? "Pending" : detail.kpi_status === "rejected" ? "Ditolak" : "Selesai"}
                          </Badge>
                          <Badge className={cn(
                            "rounded-md text-[10px]",
                            detail.is_late
                              ? "bg-amber-500/15 text-amber-600 hover:bg-amber-500/15"
                              : "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15"
                          )}>
                            {detail.is_late ? "Telat" : "On-Time"}
                          </Badge>
                        </div>
                        <p className="truncate font-semibold text-foreground">{detail.judul_surat}</p>
                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                          Tahap {detail.step_order}: {detail.role_name} oleh {detail.signer_name}
                        </p>
                      </div>
                      <div className="shrink-0 rounded-lg border border-border bg-muted/20 px-4 py-3 text-right">
                        <p className={cn("text-lg font-semibold", detail.is_late ? "text-amber-600" : "text-emerald-600")}>
                          {formatMinutes(detail.elapsed_minutes)}
                        </p>
                        <p className="text-xs font-medium text-muted-foreground">
                          SLA {formatMinutes(detail.sla_minutes)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 border-t border-border pt-4 text-xs md:grid-cols-2 lg:grid-cols-4">
                      <DetailField label="Mulai dihitung" value={formatDateTime(detail.started_at)} />
                      <DetailField label="Selesai" value={formatDateTime(detail.finished_at)} />
                      <DetailField label="Jenis surat" value={detail.letter_type_name || "-"} />
                      <DetailField label="Form" value={detail.form_name || "-"} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const DetailMetric = ({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "success" | "danger" }) => (
  <div className="rounded-lg border border-border bg-muted/20 p-3">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className={cn(
      "mt-1 text-lg font-semibold",
      tone === "success" && "text-emerald-600",
      tone === "danger" && "text-amber-600"
    )}>
      {value}
    </p>
  </div>
);

const DetailField = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="mt-1 font-semibold text-foreground">{value}</p>
  </div>
);

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
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-muted-foreground">{label}</label>
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
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-muted-foreground">{label}</label>
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
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-muted-foreground">{label}</label>
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
  tone?: "default" | "success" | "warning" | "info" | "danger";
}) => {
  const toneClass = {
    default: "bg-primary/10 text-primary",
    success: "bg-emerald-500/15 text-emerald-600",
    warning: "bg-amber-500/15 text-amber-600",
    info: "bg-sky-500/15 text-sky-600",
    danger: "bg-red-500/15 text-red-600",
  }[tone];

  return (
    <Card className="border-border shadow-[var(--shadow-card)]">
      <CardContent className="flex min-h-[124px] items-center gap-4 p-5">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">{title}</p>
          <p className="truncate text-2xl font-semibold text-foreground">{value}</p>
          {detail ? <p className="text-xs font-medium text-muted-foreground">{detail}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
};

export default DepartmentKPIPage;
