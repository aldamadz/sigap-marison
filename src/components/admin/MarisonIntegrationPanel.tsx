import { useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, FlaskConical, Loader2, LockKeyhole, RefreshCw, Server, UsersRound, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppDialog } from "@/components/app/AppDialogProvider";
import { useMarisonEnvironment } from "@/providers/MarisonEnvironmentProvider";
import {
  marisonIntegrationService,
  type MarisonEmployeeSyncPreview,
  type MarisonEmployeeSyncResult,
  type MarisonBranchSyncPreview,
  type MarisonBranchSyncResult,
  type MarisonEnvironmentTest,
  type MarisonProbeResult,
  type MarisonProjectSyncPreview,
  type MarisonProjectSyncResult,
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
  const [previewingBranches, setPreviewingBranches] = useState(false);
  const [syncingBranches, setSyncingBranches] = useState(false);
  const [previewingProjects, setPreviewingProjects] = useState(false);
  const [syncingProjects, setSyncingProjects] = useState(false);
  const [employeePreview, setEmployeePreview] = useState<MarisonEmployeeSyncPreview | null>(null);
  const [employeeResult, setEmployeeResult] = useState<MarisonEmployeeSyncResult | null>(null);
  const [branchPreview, setBranchPreview] = useState<MarisonBranchSyncPreview | null>(null);
  const [branchResult, setBranchResult] = useState<MarisonBranchSyncResult | null>(null);
  const [projectPreview, setProjectPreview] = useState<MarisonProjectSyncPreview | null>(null);
  const [projectResult, setProjectResult] = useState<MarisonProjectSyncResult | null>(null);

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

  const previewBranches = async (preserveResult = false) => {
    setPreviewingBranches(true);
    if (!preserveResult) setBranchResult(null);
    try {
      const preview = await marisonIntegrationService.previewBranches();
      setBranchPreview(preview);
      toast.success(`${preview.toCreate + preview.toUpdate} kantor cabang perlu diselaraskan`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memeriksa kantor cabang");
    } finally {
      setPreviewingBranches(false);
    }
  };

  const previewProjects = async (preserveResult = false) => {
    setPreviewingProjects(true);
    if (!preserveResult) setProjectResult(null);
    try {
      const preview = await marisonIntegrationService.previewProjects();
      setProjectPreview(preview);
      toast.success(`${preview.toCreate + preview.toUpdate} proyek perlu diselaraskan`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memeriksa data proyek");
    } finally {
      setPreviewingProjects(false);
    }
  };

  const syncProjects = async () => {
    if (!projectPreview) return;
    const confirmed = await appDialog.confirm({
      title: "Sinkronkan Master Proyek?",
      description: `${projectPreview.source.projects} proyek ditemukan di API external. ${projectPreview.toCreate} proyek akan dibuat dan ${projectPreview.toUpdate} proyek lama akan diperbarui. Kantor cabang yang diperlukan ikut dipastikan termapping.`,
      confirmText: "Sinkronkan",
    });
    if (!confirmed) return;
    setSyncingProjects(true);
    try {
      const result = await marisonIntegrationService.syncProjects();
      await previewProjects(true);
      setProjectResult(result);
      if (result.failed > 0) {
        toast.warning(`Sinkronisasi proyek selesai dengan ${result.failed} data perlu ditinjau`);
      } else {
        toast.success("Sinkronisasi master proyek selesai");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sinkronisasi master proyek gagal");
    } finally {
      setSyncingProjects(false);
    }
  };

  const syncEmployees = async () => {
    if (!employeePreview) return;
    const confirmed = await appDialog.confirm({
      title: "Sinkronkan Karyawan?",
      description: `${employeePreview.employees.toCreate} akun baru dan ${employeePreview.employees.toUpdate} akun lama akan diproses. Relasi kantor pendukung ikut diselaraskan bila diperlukan. Role akun lama tetap dipertahankan.`,
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

  const syncBranches = async () => {
    if (!branchPreview) return;
    const confirmed = await appDialog.confirm({
      title: "Sinkronkan Kantor Cabang?",
      description: `${branchPreview.toCreate} kantor cabang baru akan dibuat dan ${branchPreview.toUpdate} kantor cabang lama akan diperbarui dari Marison.`,
      confirmText: "Sinkronkan",
    });
    if (!confirmed) return;
    setSyncingBranches(true);
    try {
      const result = await marisonIntegrationService.syncBranches();
      await previewBranches(true);
      setBranchResult(result);
      if (result.failed > 0) {
        toast.warning(`Sinkronisasi kantor cabang selesai dengan ${result.failed} data perlu ditinjau`);
      } else {
        toast.success("Sinkronisasi kantor cabang selesai");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sinkronisasi kantor cabang gagal");
    } finally {
      setSyncingBranches(false);
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
            Cek koneksi sumber data, lalu sinkronkan kantor cabang, karyawan, atau proyek dari Marison ke SIGAP.
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
                    disabled={previewingBranches || syncingBranches || previewingEmployees || syncingEmployees || syncingProjects || !environmentConfig?.configured}
                    className="gap-2"
                  >
                    {previewingBranches ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Periksa kantor cabang
                  </Button>
                  <Button
                    onClick={syncBranches}
                    disabled={!branchPreview || previewingBranches || syncingBranches || syncingEmployees || syncingProjects}
                    className="gap-2"
                  >
                    {syncingBranches ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                    Sinkron kantor cabang
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void previewBranches()}
                    disabled={previewingBranches || syncingBranches || previewingEmployees || syncingEmployees || syncingProjects || !environmentConfig?.configured}
                    className="gap-2"
                  >
                    {previewingEmployees ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Periksa karyawan
                  </Button>
                  <Button
                    onClick={syncEmployees}
                    disabled={!employeePreview || previewingBranches || syncingBranches || previewingEmployees || syncingEmployees || syncingProjects}
                    className="gap-2"
                  >
                    {syncingEmployees ? <Loader2 className="h-4 w-4 animate-spin" /> : <UsersRound className="h-4 w-4" />}
                    Sinkron karyawan
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void previewProjects()}
                    disabled={previewingBranches || syncingBranches || previewingProjects || syncingProjects || syncingEmployees || !environmentConfig?.configured}
                    className="gap-2"
                  >
                    {previewingProjects ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Periksa proyek
                  </Button>
                  <Button
                    onClick={syncProjects}
                    disabled={!projectPreview || previewingBranches || syncingBranches || previewingProjects || syncingProjects || syncingEmployees}
                    className="gap-2"
                  >
                    {syncingProjects ? <Loader2 className="h-4 w-4 animate-spin" /> : <Server className="h-4 w-4" />}
                    Sinkron proyek
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

        {status.isStaging && branchPreview && (
          <div className="space-y-4">
            <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
              {[
                ["Sumber kantor", branchPreview.source],
                ["Kantor baru", branchPreview.toCreate],
                ["Diperbarui", branchPreview.toUpdate],
                ["Perlu tinjau", branchPreview.blocked],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-background px-4 py-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {status.isStaging && projectPreview && (
          <div className="space-y-4">
            <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
              {[
                ["Sumber proyek", projectPreview.source.projects],
                ["Proyek baru", projectPreview.toCreate],
                ["Diperbarui", projectPreview.toUpdate],
                ["Perlu tinjau", projectPreview.blocked],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-background px-4 py-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
                </div>
              ))}
            </div>

            {projectPreview.issues.length > 0 && (
              <div className="rounded-md border border-amber-300/70 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{projectPreview.issues.length} proyek/kantor perlu ditinjau</p>
                    <ul className="mt-2 space-y-1 text-xs">
                      {projectPreview.issues.slice(0, 5).map((issue, index) => (
                        <li key={`${issue.externalId || issue.nik || index}-${index}`}>
                          {issue.name || issue.names?.join(" / ") || "Tanpa nama"} - {issue.reason}
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
        {status.isStaging && branchResult && (
          <p className="text-sm text-muted-foreground">
            Hasil kantor cabang terakhir: {branchResult.created} dibuat, {branchResult.updated} diperbarui, dan {branchResult.failed} perlu ditinjau.
          </p>
        )}
        {status.isStaging && projectResult && (
          <p className="text-sm text-muted-foreground">
            Hasil proyek terakhir: {projectResult.created} dibuat, {projectResult.updated} diperbarui, dan {projectResult.failed} perlu ditinjau.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
