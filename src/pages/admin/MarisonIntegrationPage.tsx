import { useState } from "react";
import { Navigate } from "react-router";
import { CheckCircle2, FlaskConical, Loader2, LockKeyhole, RefreshCw, Server, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMarisonEnvironment } from "@/providers/MarisonEnvironmentProvider";
import {
  marisonIntegrationService,
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

export default function MarisonIntegrationPage() {
  const { status, loading } = useMarisonEnvironment();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<MarisonEnvironmentTest | null>(null);

  if (loading) {
    return <div className="flex h-56 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!status?.canManage) return <Navigate to="/dashboard" replace />;

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

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div className="hidden sm:block">
          <h1 className="text-xl font-semibold text-foreground">Integrasi Marison</h1>
          <p className="mt-1 text-sm text-muted-foreground">Status sumber data untuk deployment ini.</p>
        </div>
        <Badge variant={status.isStaging ? "secondary" : "default"} className="w-fit gap-1.5 px-3 py-1.5 uppercase">
          {status.isStaging ? <FlaskConical className="h-3.5 w-3.5" /> : <Server className="h-3.5 w-3.5" />}
          {status.environment}
        </Badge>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-primary" />
            Environment Deployment
          </CardTitle>
          <CardDescription>
            Environment ditetapkan saat deployment dan tidak dapat diubah dari aplikasi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Environment</p>
              <p className="mt-1 text-sm font-semibold capitalize text-foreground">{status.environment}</p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Endpoint</p>
              <p className="mt-1 truncate text-sm font-semibold text-foreground">{environmentConfig?.host || "Belum dikonfigurasi"}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Credential server</p>
              <p className="mt-1 text-xs text-muted-foreground">Nilai credential tidak pernah dikirim ke browser.</p>
            </div>
            <Badge variant={environmentConfig?.configured ? "outline" : "destructive"}>
              {environmentConfig?.configured ? "Siap" : "Belum siap"}
            </Badge>
          </div>

          <Button variant="outline" onClick={runTest} disabled={testing || !environmentConfig?.configured} className="w-full gap-2 sm:w-auto">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Tes koneksi {status.environment}
          </Button>

          {testResult && (
            <div className="border-y border-border">
              {(Object.keys(checkLabels) as Array<keyof typeof checkLabels>).map((key) => (
                <CheckResult key={key} label={checkLabels[key]} result={testResult.checks[key]} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
