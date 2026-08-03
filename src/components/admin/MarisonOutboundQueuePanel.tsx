import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useMarisonEnvironment } from "@/providers/MarisonEnvironmentProvider";
import {
  marisonIntegrationService,
  type MarisonDispatchRow,
  type MarisonDispatchStatus,
} from "@/services/marison-integration.service";
import { cn } from "@/lib/utils";

const statusLabels: Record<MarisonDispatchStatus, string> = {
  pending: "Menunggu",
  processing: "Diproses",
  succeeded: "Berhasil",
  failed_retryable: "Dijadwalkan ulang",
  failed_terminal: "Gagal terminal",
  outcome_unknown: "Perlu rekonsiliasi",
  skipped: "Dilewati",
};

const statusTone: Record<MarisonDispatchStatus, string> = {
  pending: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  processing: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  succeeded: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  failed_retryable: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  failed_terminal: "border-destructive/40 bg-destructive/10 text-destructive",
  outcome_unknown: "border-orange-400 bg-orange-50 text-orange-800 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-200",
  skipped: "border-slate-300 bg-muted text-muted-foreground",
};

const kindLabels = { unit: "Unit", non_unit: "Non Unit", asset: "Aset" };
const formatDateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "-";

type ReconciliationAction = "mark_succeeded" | "reopen_confirmed_not_received" | "reopen_terminal_pre_post";

export function MarisonOutboundQueuePanel() {
  const { status: environmentStatus } = useMarisonEnvironment();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<MarisonDispatchStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MarisonDispatchRow | null>(null);
  const [action, setAction] = useState<ReconciliationAction>("mark_succeeded");
  const [reason, setReason] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [riskConfirmed, setRiskConfirmed] = useState(false);
  const [preflightId, setPreflightId] = useState<string | null>(null);
  const [preflightReason, setPreflightReason] = useState<string | null>(null);
  const [preflightReasonCode, setPreflightReasonCode] = useState<string | null>(null);

  const dispatches = useQuery({
    queryKey: ["marison-outbound-dispatches", statusFilter, page],
    queryFn: () => marisonIntegrationService.listDispatches(statusFilter, page, 20),
    enabled: environmentStatus?.canManage === true,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });

  const reconciliation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Job belum dipilih.");
      return marisonIntegrationService.reconcileDispatch(selected.id, {
        action,
        reason,
        externalReference: action === "mark_succeeded" ? externalReference : undefined,
        confirmDuplicateRisk: action === "reopen_confirmed_not_received" ? riskConfirmed : undefined,
      });
    },
    onSuccess: async () => {
      toast.success(action === "mark_succeeded" ? "Job ditandai diterima vendor" : "Job outbound dibuka ulang");
      setSelected(null);
      setReason("");
      setExternalReference("");
      setRiskConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: ["marison-outbound-dispatches"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Rekonsiliasi gagal"),
  });

  const totalPages = Math.max(1, Math.ceil((dispatches.data?.total || 0) / 20));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (!environmentStatus?.canManage) return null;

  const openReconciliation = (row: MarisonDispatchRow, nextAction: ReconciliationAction) => {
    setSelected(row);
    setAction(nextAction);
    setReason("");
    setExternalReference("");
    setRiskConfirmed(false);
    setPreflightReason(null);
    setPreflightReasonCode(null);
  };
  const openRecovery = async (row: MarisonDispatchRow) => {
    openReconciliation(row, "reopen_terminal_pre_post");
    setPreflightId(row.id);
    try {
      const result = await marisonIntegrationService.preflightDispatch(row.id);
      if (!result.eligible) {
        setPreflightReason(result.reason || "Job belum memenuhi syarat recovery.");
        setPreflightReasonCode(result.reasonCode || "NOT_PRE_POST_FAILURE");
        toast.error(result.reason || "Job belum memenuhi syarat recovery.");
        return;
      }
      setPreflightReason(null);
      setPreflightReasonCode(null);
      openReconciliation(row, "reopen_terminal_pre_post");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preflight recovery gagal.");
    } finally {
      setPreflightId(null);
    }
  };
  const closeDialog = () => {
    setSelected(null);
    setPreflightId(null);
    setPreflightReason(null);
    setPreflightReasonCode(null);
    setReason("");
  };
  const canSubmit = reason.trim().length > 0
    && (action !== "mark_succeeded" || externalReference.trim().length > 0)
    && (action !== "reopen_confirmed_not_received" || riskConfirmed);

  return (
    <>
      <Card className="border-primary/20 bg-primary/[0.025]">
        <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4 text-primary" />
              Antrean Outbound Marison
            </CardTitle>
            <CardDescription className="mt-2">
              Satu job per surat dan environment. Hasil yang tidak pasti tidak dikirim ulang otomatis.
            </CardDescription>
            <Badge
              variant={environmentStatus.outbound?.ready ? "outline" : "destructive"}
              className="mt-3"
            >
              {environmentStatus.outbound?.ready ? "Outbox aktif" : "Outbox belum diaktifkan"}
            </Badge>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Label htmlFor="marison-outbound-status" className="sr-only">Filter status antrean outbound</Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as MarisonDispatchStatus | "all");
                setPage(1);
              }}
            >
              <SelectTrigger id="marison-outbound-status" className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                {(Object.keys(statusLabels) as MarisonDispatchStatus[]).map((value) => (
                  <SelectItem key={value} value={value}>{statusLabels[value]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => void dispatches.refetch()} disabled={dispatches.isFetching}>
              {dispatches.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="sr-only">Muat ulang antrean</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div aria-live="polite" className="sr-only">
            {dispatches.isFetching ? "Memuat antrean outbound" : `${dispatches.data?.total || 0} job outbound tersedia`}
          </div>
          {dispatches.isLoading ? (
            <div className="flex min-h-44 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : dispatches.isError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-5 text-sm text-destructive">
              Antrean gagal dimuat. Coba muat ulang.
            </div>
          ) : (dispatches.data?.items.length || 0) === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Belum ada job outbound untuk filter ini.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border bg-background">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Surat</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Percobaan</TableHead>
                      <TableHead>Hasil</TableHead>
                      <TableHead className="text-right">Tindakan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dispatches.data?.items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="min-w-64 align-top">
                          <p className="font-medium text-foreground">{row.noSurat}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.title}</p>
                          <p className="mt-2 text-xs text-muted-foreground">Dibuat {formatDateTime(row.createdAt)}</p>
                        </TableCell>
                        <TableCell className="min-w-44 align-top">
                          <Badge variant="outline" className={cn("whitespace-nowrap", statusTone[row.status])}>
                            {statusLabels[row.status]}
                          </Badge>
                          <p className="mt-2 text-xs text-muted-foreground">{row.kind ? kindLabels[row.kind] : "Tidak dikirim"}</p>
                        </TableCell>
                        <TableCell className="min-w-40 align-top text-sm tabular-nums">
                           <p>Percobaan pengiriman: {row.attemptCount} dari 3</p>
                          <p className="mt-1 text-xs text-muted-foreground">Terakhir {formatDateTime(row.lastAttemptAt)}</p>
                        </TableCell>
                        <TableCell className="min-w-64 align-top">
                          {row.externalReference ? (
                            <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="h-4 w-4" /> {row.externalReference}
                            </p>
                          ) : row.failureReason ? (
                            <p className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                               <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> {row.failureReason === "Resolution sources are required"
                                 ? "Dokumen dibuat sebelum metadata payload lengkap dan perlu dibangun ulang."
                                 : row.failureReason}
                            </p>
                          ) : (
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock3 className="h-4 w-4" /> Menunggu hasil
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="min-w-44 align-top text-right">
                          {row.status === "outcome_unknown" && (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => openReconciliation(row, "mark_succeeded")}>Diterima</Button>
                              <Button size="sm" variant="destructive" onClick={() => openReconciliation(row, "reopen_confirmed_not_received")}>
                                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Kirim ulang
                              </Button>
                            </div>
                          )}
                          {row.status === "failed_terminal" && !row.postStartedAt && (
                            <Button size="sm" variant="outline" onClick={() => void openRecovery(row)} disabled={preflightId === row.id}>
                              {preflightId === row.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />} Bangun ulang dan coba lagi
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
                <span>{dispatches.data?.total || 0} job</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>Sebelumnya</Button>
                  <span className="tabular-nums">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages}>Berikutnya</Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action === "mark_succeeded" ? "Tandai Sudah Diterima" : "Buka Ulang Pengiriman"}</DialogTitle>
            <DialogDescription>
              {action === "mark_succeeded"
                ? "Gunakan hanya setelah keberadaan pengajuan dipastikan pada sistem vendor."
                : action === "reopen_confirmed_not_received"
                  ? "Gunakan hanya setelah vendor memastikan request sebelumnya tidak diterima."
                  : "Gunakan setelah konfigurasi diperbaiki. Job ini terbukti belum memulai POST."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
              {selected && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <p className="font-medium text-foreground">{selected.noSurat}</p>
                <p className="mt-1 text-xs text-muted-foreground">{selected.title}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">Job {selected.id}</p>
              </div>
              )}
            {preflightId && <div className="rounded-md border border-blue-300/60 bg-blue-50 px-3 py-3 text-sm">Memeriksa kelayakan recovery...</div>}
            {preflightReason && (
              <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                <p>{preflightReason}</p>
                {preflightReasonCode === "SIGNER_IDENTITY_MISSING" && (
                  <Link className="mt-2 inline-block font-medium underline" to="/admin/users">Buka Master User</Link>
                )}
              </div>
            )}
            {!preflightId && !preflightReason && action === "mark_succeeded" && (
              <div className="space-y-2">
                <Label htmlFor="marison-external-reference">Referensi eksternal</Label>
                <Input id="marison-external-reference" value={externalReference} onChange={(event) => setExternalReference(event.target.value)} maxLength={200} />
              </div>
            )}
            {!preflightId && !preflightReason && <div className="space-y-2">
              <Label htmlFor="marison-reconciliation-reason">Alasan dan bukti pemeriksaan</Label>
              <Textarea id="marison-reconciliation-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={2000} />
            </div>}
            {!preflightId && !preflightReason && action === "reopen_confirmed_not_received" && (
              <label className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm leading-5">
                <Checkbox checked={riskConfirmed} onCheckedChange={(checked) => setRiskConfirmed(checked === true)} />
                <span>Saya sudah memastikan request sebelumnya tidak diterima vendor dan memahami risiko data ganda.</span>
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Tutup</Button>
            <Button
              variant={action === "mark_succeeded" ? "default" : "destructive"}
              onClick={() => reconciliation.mutate()}
              disabled={Boolean(preflightId || preflightReason) || !canSubmit || reconciliation.isPending}
            >
              {reconciliation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Simpan Rekonsiliasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
