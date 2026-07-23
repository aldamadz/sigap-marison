import { useState } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, Loader2, LockKeyhole, RefreshCw, Server, UsersRound, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppDialog } from "@/components/app/AppDialogProvider";
import { useMarisonEnvironment } from "@/providers/MarisonEnvironmentProvider";
import {
  marisonIntegrationService,
  type MarisonEmployeeSyncPreview,
  type MarisonEmployeeSyncResult,
  type MarisonEnvironmentTest,
  type MarisonProbeResult,
} from "@/services/marison-integration.service";

const checkLabels = {
  projects: "Projects",
  units: "Unit",
  nonUnits: "Non Unit",
};

function CheckResult({ label, result }: { label: string; result: MarisonProbeResult }) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {result.ok ? `${result.count ?? 0} data` : result.message || `HTTP ${result.status || 500}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs tabular-nums text-muted-foreground">{result.durationMs} ms</span>
        {result.ok
          ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          : <XCircle className="h-5 w-5 text-destructive" />}
      </div>
    </div>
  );
}

export function MarisonIntegrationPanel() {
  const { status, loading } = useMarisonEnvironment();
  const appDialog = useAppDialog();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<MarisonEnvironmentTest | null>(null);
  const [previewingEmployees, setPreviewingEmployees] = useState(false);
  const [syncingEmployees, setSyncingEmployees] = useState(false);
  const [employeePreview, setEmployeePreview] = useState<MarisonEmployeeSyncPreview | null>(null);
  const [employeeResult, setEmployeeResult] = useState<MarisonEmployeeSyncResult | null>(null);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex min-h-36 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!status?.canManage) return null;

  const environmentConfig = status.environments?.[status.environment];

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await marisonIntegrationService.test();
      setTestResult(result);
      if (result.allHealthy) toast.success(`Koneksi ${result.environment} sehat`);
      else toast.error(`Sebagian endpoint ${result.environment} bermasalah`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tes koneksi gagal");
    } finally {
      setTesting(false);
    }
  };

  const previewEmployees = async (preserveResult = false) => {
    setPreviewingEmployees(true);
    if (!preserveResult) setEmployeeResult(null);
    try {
      const preview = await marisonIntegrationService.previewEmployeeSync();
      setEmployeePreview(preview);
      toast.success(`${preview.employees.ready} karyawan siap disinkronkan`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memeriksa data karyawan");
    } finally {
      setPreviewingEmployees(false);
    }
  };

  const syncEmployees = async () => {
    if (!employeePreview) return;
    const confirmed = await appDialog.confirm({
      title: "Sinkronkan Karyawan dan Kantor?",
      description: `${employeePreview.employees.toCreate} akun baru, ${employeePreview.employees.toUpdate} akun lama, ${employeePreview.branches.toCreate} kantor baru, dan ${employeePreview.branches.toUpdate} kantor lama akan diproses. Role akun lama tetap dipertahankan.`,
      confirmText: "Sinkronkan",
    });
    if (!confirmed) return;
    setSyncingEmployees(true);
    try {
      const result = await marisonIntegrationService.syncEmployees();
      await previewEmployees(true);
      setEmployeeResult(result);
      if (result.failed > 0 || result.skipped > 0) {
        toast.warning(`Sinkronisasi selesai dengan ${result.failed} gagal dan ${result.skipped} dilewati`);
      } else {
        toast.success("Sinkronisasi karyawan dan kantor selesai");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sinkronisasi karyawan dan kantor gagal");
    } finally {
      setSyncingEmployees(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/[0.025]">
      <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <LockKeyhole className="h-4 w-4 text-primary" />
            Integrasi Marison
          </CardTitle>
          <CardDescription className="mt-2">
            Cek koneksi sumber data, lalu sinkronkan kantor dan karyawan dari Marison ke SIGAP.
          </CardDescription>
        </div>
        <Badge variant={status.isStaging ? "secondary" : "default"} className="w-fit gap-1.5 px-3 py-1.5 uppercase">
          {status.isStaging ? <FlaskConical className="h-3.5 w-3.5" /> : <Server className="h-3.5 w-3.5" />}
          {status.environment}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.65fr)]">
          <div className="space-y-3 rounded-md border border-border bg-background px-4 py-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Endpoint aktif</p>
                <p className="mt-1 truncate text-sm font-semibold text-foreground">{environmentConfig?.host || "Belum dikonfigurasi"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Credential server</p>
                <Badge variant={environmentConfig?.configured ? "outline" : "destructive"} className="mt-1">
                  {environmentConfig?.configured ? "Siap" : "Belum siap"}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={runTest} disabled={testing || !environmentConfig?.configured} className="gap-2">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Cek koneksi
              </Button>
              {status.isStaging && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => void previewEmployees()}
                    disabled={previewingEmployees || syncingEmployees || !environmentConfig?.configured}
                    className="gap-2"
                  >
                    {previewingEmployees ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Periksa data
                  </Button>
                  <Button
                    onClick={syncEmployees}
                    disabled={!employeePreview || previewingEmployees || syncingEmployees}
                    className="gap-2"
                  >
                    {syncingEmployees ? <Loader2 className="h-4 w-4 animate-spin" /> : <UsersRound className="h-4 w-4" />}
                    Sinkronkan
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="rounded-md border border-border bg-background px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Otomatisasi berikutnya</p>
            <p className="mt-1 text-sm font-semibold text-foreground">Siap dijadikan cronjob</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Endpoint sinkron manual ini menjadi jalur yang sama untuk scheduler harian malam atau mingguan. Aktivasi cron sebaiknya dilakukan setelah hasil staging stabil.
            </p>
          </div>
        </div>

        {testResult && (
          <div className="rounded-md border-y border-border bg-background px-4">
            {(Object.keys(checkLabels) as Array<keyof typeof checkLabels>).map((key) => (
              <CheckResult key={key} label={checkLabels[key]} result={testResult.checks[key]} />
            ))}
          </div>
        )}

        {status.isStaging && employeePreview && (
          <div className="space-y-4">
            <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
              {[
                ["Sumber", employeePreview.source.employees],
                ["Akun baru", employeePreview.employees.toCreate],
                ["Diperbarui", employeePreview.employees.toUpdate],
                ["Dilewati", employeePreview.employees.blocked],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-background px-4 py-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
                </div>
              ))}
            </div>

            {employeePreview.issues.length > 0 && (
              <div className="rounded-md border border-amber-300/70 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{employeePreview.issues.length} data perlu diperbaiki di sistem external</p>
                    <ul className="mt-2 space-y-1 text-xs">
                      {employeePreview.issues.slice(0, 5).map((issue, index) => (
                        <li key={`${issue.externalId || issue.nik || index}-${index}`}>
                          {issue.nik || "Tanpa NIK"} - {issue.name || issue.names?.join(" / ") || "Tanpa nama"} - {issue.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {status.isStaging && employeeResult && (
          <p className="text-sm text-muted-foreground">
            Hasil terakhir: {employeeResult.created} dibuat, {employeeResult.updated} diperbarui, {employeeResult.failed} gagal, dan {employeeResult.skipped} dilewati.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
