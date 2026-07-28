import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, FileCheck2, Lock, Loader2, RefreshCcw, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/Breadcrumbs";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  suratService,
  type RecommendationTask,
  type SuratRegistrationDraft,
} from "@/services/surat.service";
import { toast } from "sonner";

const buildDraftUrl = (draft: SuratRegistrationDraft) => {
  const context = draft.payload?.linkedDocumentContext || {};
  const params = new URLSearchParams({
    draft: draft.id,
    linked_type: "recommendation",
    parent_surat: String(context.parentSuratId || ""),
    parent_no_surat: String(context.parentNoSurat || ""),
    required_before_step: String(context.requiredBeforeStep || ""),
    form_id: String(context.formId || ""),
    usage_id: String(context.usageId || ""),
    dept_id: String(context.departmentId || ""),
    letter_type_id: String(context.letterTypeId || ""),
    task_id: String(context.taskId || ""),
  });
  return `/surat/rekomendasi/registrasi?${params.toString()}`;
};

const getCandidateNames = (task: RecommendationTask) => {
  const candidates = Array.isArray(task.candidate_snapshot) ? task.candidate_snapshot : [];
  return candidates
    .map((candidate) => String(candidate?.full_name || "").trim())
    .filter(Boolean)
    .join(", ");
};

const RecommendationListSkeleton = () => (
  <div className="grid gap-3" aria-label="Memuat tugas rekomendasi">
    {[1, 2, 3].map((item) => (
      <Card key={item} className="overflow-hidden border-border/70 bg-card/80">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                <div className="h-6 w-32 animate-pulse rounded-full bg-muted" />
              </div>
              <div className="h-5 w-full max-w-md animate-pulse rounded bg-muted" />
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="h-4 w-56 animate-pulse rounded bg-muted" />
                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                <div className="h-4 w-52 animate-pulse rounded bg-muted" />
                <div className="h-4 w-60 animate-pulse rounded bg-muted" />
              </div>
            </div>
            <div className="h-10 w-full animate-pulse rounded-md bg-muted lg:w-36" />
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

const RefreshNotice = ({ show }: { show: boolean }) => {
  if (!show) return null;
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-primary/15 bg-primary/5 px-3 py-2 text-xs font-medium text-primary animate-in fade-in slide-in-from-top-1 duration-200"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      Menyinkronkan tugas rekomendasi terbaru
    </div>
  );
};

const RecommendationErrorState = ({
  message,
  isRetrying,
  onRetry,
}: {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}) => (
  <Card className="overflow-hidden border-destructive/20 bg-destructive/5 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
    <CardContent className="p-0">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">Tugas rekomendasi belum bisa dimuat</p>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Koneksi atau akses data sedang bermasalah. Coba muat ulang daftar rekomendasi.
            </p>
            {message && (
              <p className="mt-3 rounded-md border border-destructive/15 bg-background/80 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                Detail: {message}
              </p>
            )}
          </div>
        </div>
        <Button variant="outline" className="shrink-0 gap-2" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          {isRetrying ? "Mencoba" : "Coba Lagi"}
        </Button>
      </div>
    </CardContent>
  </Card>
);

const RecommendationEmptyState = ({ isRefreshing, onRefresh }: { isRefreshing: boolean; onRefresh: () => void }) => (
  <Card className="overflow-hidden border-border/70 bg-card shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
    <CardContent className="p-0">
      <div className="grid gap-0 lg:grid-cols-[1fr_340px]">
        <div className="p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileCheck2 className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold text-foreground">Belum ada rekomendasi yang perlu dikerjakan</p>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Tugas akan muncul otomatis setelah pengajuan aset dikonfirmasi dan membutuhkan dokumen rekomendasi.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  ["1", "Pengajuan aset dikonfirmasi"],
                  ["2", "Nomor rekomendasi dibuat"],
                  ["3", "Staff IT mengambil tugas"],
                ].map(([step, label]) => (
                  <div key={step} className="rounded-lg border border-border/70 bg-muted/25 p-3">
                    <div className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-background text-xs font-semibold text-primary shadow-sm">
                      {step}
                    </div>
                    <p className="text-xs font-medium leading-relaxed text-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="mt-5 gap-2" onClick={onRefresh} disabled={isRefreshing}>
                {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                {isRefreshing ? "Menyegarkan" : "Cek Lagi"}
              </Button>
            </div>
          </div>
        </div>
        <div className="border-t border-border/70 bg-muted/20 p-6 lg:border-l lg:border-t-0">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Alur lock tugas</p>
          <div className="mt-4 space-y-3">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm leading-relaxed text-muted-foreground">Semua kandidat bisa melihat tugas yang sama.</p>
            </div>
            <div className="flex gap-3">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm leading-relaxed text-muted-foreground">Orang pertama yang mengambil tugas akan mengunci draft rekomendasi.</p>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
);

export default function RecommendationTasksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentUserId, setCurrentUserId] = useState("");
  const [accessAllowed, setAccessAllowed] = useState<boolean | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const checkAccess = async () => {
      const { data } = await supabase.auth.getUser();
      const authUser = data.user;
      if (!authUser) {
        if (active) {
          setCurrentUserId("");
          setAccessAllowed(false);
        }
        return;
      }
      setCurrentUserId(authUser.id);

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("master_departments(name, code), is_active")
        .eq("id", authUser.id)
        .maybeSingle();

      const department = Array.isArray(profile?.master_departments)
        ? profile?.master_departments[0]
        : profile?.master_departments;
      const code = String(department?.code || "").trim().toUpperCase();
      const name = String(department?.name || "").trim().toLowerCase();
      if (active) {
        setAccessAllowed(!error && profile?.is_active !== false && (code === "PBO" || name === "pengembangan organisasi" || name === "po"));
      }
    };
    checkAccess();
    return () => {
      active = false;
    };
  }, []);

  const tasksQuery = useQuery({
    queryKey: ["recommendation-tasks"],
    queryFn: suratService.getMyRecommendationTasks,
    staleTime: 15_000,
    enabled: accessAllowed === true,
  });

  const tasks = useMemo(
    () => [...(tasksQuery.data || [])].sort((a, b) => {
      const priorityA = a.status === "revision_requested" ? 0 : 1;
      const priorityB = b.status === "revision_requested" ? 0 : 1;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }),
    [tasksQuery.data]
  );

  const handleClaim = async (task: RecommendationTask) => {
    if (claimingId) return;
    setClaimingId(task.id);
    try {
      const draft = await suratService.claimRecommendationTask(task.id);
      await queryClient.invalidateQueries({ queryKey: ["recommendation-tasks"] });
      navigate(buildDraftUrl(draft));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tugas rekomendasi gagal dikunci.");
    } finally {
      setClaimingId(null);
    }
  };

  const isRefreshing = tasksQuery.isFetching && !tasksQuery.isLoading;

  if (accessAllowed === null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-4 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm font-semibold text-foreground">Memeriksa akses rekomendasi</p>
        </div>
      </div>
    );
  }

  if (!accessAllowed) return <Navigate to="/dashboard" replace />;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6 sm:py-8">
      <PageHeader
        title="Rekomendasi"
        subtitle="Tugas pembuatan rekomendasi aset yang sudah mendapatkan nomor dokumen."
      >
        <Button
          variant="outline"
          className="min-w-[132px] gap-2"
          onClick={() => tasksQuery.refetch()}
          disabled={tasksQuery.isFetching}
          aria-label={tasksQuery.isFetching ? "Sedang menyegarkan tugas rekomendasi" : "Segarkan tugas rekomendasi"}
        >
          {tasksQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          {tasksQuery.isFetching ? "Menyegarkan" : "Segarkan"}
        </Button>
      </PageHeader>

      <RefreshNotice show={isRefreshing && !tasksQuery.error} />

      {tasksQuery.isLoading && <RecommendationListSkeleton />}

      {tasksQuery.error && (
        <RecommendationErrorState
          message={tasksQuery.error instanceof Error ? tasksQuery.error.message : "Silakan coba lagi."}
          isRetrying={tasksQuery.isFetching}
          onRetry={() => tasksQuery.refetch()}
        />
      )}

      {!tasksQuery.isLoading && !tasksQuery.error && tasks.length === 0 && (
        <RecommendationEmptyState isRefreshing={isRefreshing} onRefresh={() => tasksQuery.refetch()} />
      )}

      <div className="grid gap-3">
        {tasks.map((task) => {
          const lockedByOther = Boolean(task.claimed_by && task.claimed_by !== currentUserId);
          const claimedByMe = Boolean(task.claimed_by && task.claimed_by === currentUserId);
          const candidateNames = getCandidateNames(task);
          const isRevision = task.status === "revision_requested";
          return (
            <Card key={task.id} className={cn("overflow-hidden", lockedByOther && "bg-muted/30")}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-xs font-semibold text-primary">{task.no_surat}</p>
                      <Badge
                        variant="outline"
                        className={cn(
                          isRevision && "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
                          !isRevision && !task.claimed_by && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                          claimedByMe && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                          lockedByOther && "border-muted-foreground/30 bg-muted text-muted-foreground"
                        )}
                      >
                        {isRevision
                          ? "Perlu Revisi"
                          : !task.claimed_by
                            ? "Menunggu Staff IT"
                            : claimedByMe
                              ? "Sedang Anda kerjakan"
                              : "Terkunci"}
                      </Badge>
                    </div>
                    <h2 className="mt-2 truncate text-base font-semibold text-foreground">
                      {task.parent_judul_surat || "Pengajuan aset"}
                    </h2>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                      <p><span className="text-foreground">Induk:</span> {task.parent_no_surat || "-"}</p>
                      <p><span className="text-foreground">Pemohon:</span> {task.parent_requester_name || "-"}</p>
                      <p><span className="text-foreground">Masuk:</span> {new Date(task.created_at).toLocaleString("id-ID")}</p>
                      <p><span className="text-foreground">Kandidat:</span> {candidateNames || "-"}</p>
                    </div>
                    {task.claimed_by && (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                        {claimedByMe ? <UserCheck className="h-4 w-4 text-emerald-600" /> : <Lock className="h-4 w-4" />}
                        {claimedByMe
                          ? "Draft sudah terkunci untuk akun Anda."
                          : `Sedang dikerjakan oleh ${task.claimed_by_name || "user lain"}.`}
                      </div>
                    )}
                    {isRevision && !task.claimed_by && (
                      <div className="mt-3 rounded-md border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-xs leading-relaxed text-orange-800 dark:text-orange-200">
                        Rekomendasi sebelumnya dikembalikan oleh penanda tangan. Ambil tugas ini untuk memperbaiki data rekomendasi dari versi terakhir.
                      </div>
                    )}
                  </div>

                  <Button
                    className="shrink-0 gap-2"
                    variant={claimedByMe ? "default" : lockedByOther ? "outline" : "default"}
                    disabled={lockedByOther || claimingId === task.id}
                    onClick={() => handleClaim(task)}
                  >
                    {claimingId === task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {claimedByMe ? "Lanjutkan Draft" : lockedByOther ? "Terkunci" : isRevision ? "Ambil Revisi" : "Ambil Tugas"}
                    {!lockedByOther && claimingId !== task.id ? <ArrowRight className="h-4 w-4" /> : null}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
