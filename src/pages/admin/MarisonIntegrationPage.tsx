import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { CheckCircle2, FlaskConical, Loader2, Mail, RefreshCw, Server, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useMarisonEnvironment } from "@/providers/MarisonEnvironmentProvider";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import {
  marisonIntegrationService,
  type MarisonEnvironment,
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
  const { status, loading, refetch } = useMarisonEnvironment();
  const [target, setTarget] = useState<MarisonEnvironment>("staging");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<MarisonEnvironmentTest | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (status?.environment) setTarget(status.environment === "staging" ? "production" : "staging");
  }, [status?.environment]);

  const targetConfig = useMemo(() => status?.environments?.[target], [status?.environments, target]);

  if (loading) {
    return <div className="flex h-56 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!status?.canManage) return <Navigate to="/dashboard" replace />;

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await marisonIntegrationService.test(target);
      setTestResult(result);
      if (result.allHealthy) toast.success(`Koneksi ${target} sehat`);
      else toast.error(`Sebagian endpoint ${target} bermasalah`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tes koneksi gagal");
    } finally {
      setTesting(false);
    }
  };

  const sendCode = async () => {
    setSendingCode(true);
    try {
      const result = await marisonIntegrationService.requestSwitch(target);
      setSentTo(result.sentTo);
      setCode("");
      toast.success("Kode konfirmasi dikirim");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kode belum dapat dikirim");
    } finally {
      setSendingCode(false);
    }
  };

  const confirmSwitch = async () => {
    setConfirming(true);
    try {
      await marisonIntegrationService.confirmSwitch(target, code);
      await refetch();
      setSentTo("");
      setCode("");
      setTestResult(null);
      toast.success(`Sumber data global berpindah ke ${target}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Perubahan environment gagal");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div className="hidden sm:block">
          <h1 className="text-xl font-semibold text-foreground">Integrasi Marison</h1>
          <p className="mt-1 text-sm text-muted-foreground">Kelola sumber data global projects, unit, dan non-unit.</p>
        </div>
        <Badge variant={status.isStaging ? "secondary" : "default"} className="w-fit gap-1.5 px-3 py-1.5 uppercase">
          {status.isStaging ? <FlaskConical className="h-3.5 w-3.5" /> : <Server className="h-3.5 w-3.5" />}
          {status.environment}
        </Badge>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Environment Tujuan</CardTitle>
            <CardDescription>Pilihan ini berlaku untuk seluruh pengguna setelah kode email dikonfirmasi.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ToggleGroup
              type="single"
              value={target}
              onValueChange={(value) => {
                if (!value) return;
                setTarget(value as MarisonEnvironment);
                setTestResult(null);
                setSentTo("");
                setCode("");
              }}
              className="grid grid-cols-2 rounded-md border border-border bg-muted/40 p-1"
            >
              <ToggleGroupItem value="staging" className="h-10 rounded-sm data-[state=on]:bg-background data-[state=on]:shadow-sm">Staging</ToggleGroupItem>
              <ToggleGroupItem value="production" className="h-10 rounded-sm data-[state=on]:bg-background data-[state=on]:shadow-sm">Production</ToggleGroupItem>
            </ToggleGroup>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{targetConfig?.host || target}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{targetConfig?.configured ? "Kredensial tersedia" : "Kredensial belum lengkap"}</p>
              </div>
              <Badge variant={targetConfig?.configured ? "outline" : "destructive"}>{targetConfig?.configured ? "Siap" : "Belum siap"}</Badge>
            </div>

            <Button variant="outline" onClick={runTest} disabled={testing || !targetConfig?.configured} className="w-full gap-2">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Tes Projects, Unit, dan Non Unit
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Konfirmasi Perubahan</CardTitle>
            <CardDescription>Kode sekali pakai dikirim ke email pengelola yang sedang login.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!sentTo ? (
              <Button onClick={sendCode} disabled={sendingCode || target === status.environment || !targetConfig?.configured} className="w-full gap-2">
                {sendingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Kirim Kode untuk {target}
              </Button>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="block text-center" htmlFor="marison-switch-code">Kode dari {sentTo}</Label>
                  <InputOTP
                    id="marison-switch-code"
                    value={code}
                    onChange={setCode}
                    pattern={REGEXP_ONLY_DIGITS}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    autoFocus
                    aria-label="Kode OTP enam digit"
                    containerClassName="justify-center"
                  >
                    <InputOTPGroup className="gap-1.5 sm:gap-2">
                      {Array.from({ length: 6 }, (_, index) => (
                        <InputOTPSlot
                          key={index}
                          index={index}
                          className="h-12 w-9 rounded-md border border-input text-lg tabular-nums sm:w-11"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button onClick={confirmSwitch} disabled={confirming || code.length !== 6} className="w-full gap-2">
                  {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Konfirmasi dan Terapkan
                </Button>
                <Button variant="ghost" onClick={sendCode} disabled={sendingCode} className="w-full gap-2">
                  <RefreshCw className="h-4 w-4" /> Kirim ulang kode
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
