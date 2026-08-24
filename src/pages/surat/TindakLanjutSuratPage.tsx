import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, FileText, Loader2, Pencil, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RegistrationSummaryDocument } from "@/components/surat/RegistrationSummaryDialog";
import { buildRegistrationSummaryData } from "@/components/surat/registration-summary-data";
import { formatRevisionValue, getRevisionItemChanges } from "@/components/surat/revision-utils";
import { supabase } from "@/lib/supabase";
import { suratService } from "@/services/surat.service";
import { cn } from "@/lib/utils";

const getOpenRequesterRevision = (surat: any) => {
  const revision = surat?.data_snapshot?.revision;
  if (!revision || typeof revision !== "object" || Array.isArray(revision)) return null;
  if (revision.target_type !== "requester") return null;
  return revision;
};

const fetchFollowUps = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesi tidak ditemukan.");
  const { data, error } = await supabase
    .from("surat_registrasi")
    .select(`
      *,
      surat_signatures (
        id, step_order, is_signed, status, role_name, label_jabatan, signed_at, catatan, signer_snapshot,
        profiles:user_id ( full_name, job_title )
      ),
      surat_attachments ( id, file_url, file_name, file_type, file_size, requirement_label )
    `)
    .eq("created_by", user.id)
    .eq("status", "MENUNGGU_PERBAIKAN")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || [])
    .filter((row) => Boolean(getOpenRequesterRevision(row)))
    .map((row) => ({
      ...row,
      _sigs: [...(row.surat_signatures || [])].sort((a: any, b: any) => Number(a.step_order || 0) - Number(b.step_order || 0)),
    }));
};

const formatRevisionTarget = (revision: any) => {
  const by = String(revision?.actor_name || revision?.requested_by_name || "").trim();
  if (by) return by;
  return "Penanda tangan";
};

export default function TindakLanjutSuratPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogAction, setDialogAction] = useState<"accept" | "cancel" | null>(null);
  const [note, setNote] = useState("");

  const followUpsQuery = useQuery({
    queryKey: ["surat-follow-up-requester"],
    queryFn: fetchFollowUps,
    staleTime: 15_000,
  });

  const rows = followUpsQuery.data || [];
  const selectedId = searchParams.get("surat") || rows[0]?.id || "";
  const selected = useMemo(() => rows.find((row) => row.id === selectedId) || rows[0] || null, [rows, selectedId]);
  const activeRevision = getOpenRequesterRevision(selected);
  const revisionChanges = getRevisionItemChanges(activeRevision);
  const isExternalRevision = activeRevision?.changes?.external_submission_revision === true;

  const mutation = useMutation({
    mutationFn: async ({ action, eventId, note }: { action: "accept" | "cancel"; eventId: string; note: string }) => {
      if (action === "cancel") return suratService.cancelAfterRevision(eventId, note);
      return suratService.acceptProcessRevision(eventId, note);
    },
    onSuccess: async (_data, variables) => {
      toast.success(variables.action === "cancel" ? "Pengajuan dibatalkan" : "Pengajuan dilanjutkan", {
        description: variables.action === "cancel"
          ? "Nomor surat ditandai hangus karena perubahan tidak dilanjutkan."
          : "Persetujuan dimulai ulang agar seluruh pihak mengetahui perubahan terbaru.",
      });
      setDialogAction(null);
      setNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["surat-follow-up-requester"] }),
        queryClient.invalidateQueries({ queryKey: ["attention-state"] }),
        queryClient.invalidateQueries({ queryKey: ["surat-monitoring-list"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Gagal memproses tindak lanjut."),
  });

  const openRevisionMutation = useMutation({
    mutationFn: async (eventId: string) => suratService.createExternalSubmissionRevisionDraft(eventId),
    onSuccess: (draft) => navigate(`/surat/registrasi?draft=${encodeURIComponent(draft.id)}&revision=${encodeURIComponent(draft.revision_event_id || "")}`),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Draft perbaikan gagal dibuka."),
  });

  const openActionDialog = (action: "accept" | "cancel") => {
    setDialogAction(action);
    setNote("");
  };

  const submitAction = () => {
    if (!activeRevision?.event_id) {
      toast.error("Event revisi tidak ditemukan.");
      return;
    }
    if (dialogAction === "cancel" && note.trim().length < 5) {
      toast.error("Alasan pembatalan minimal 5 karakter.");
      return;
    }
    mutation.mutate({ action: dialogAction || "accept", eventId: activeRevision.event_id, note: note.trim() });
  };

  if (followUpsQuery.isLoading) {
    return (
      <div className="sigap-page">
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="sigap-panel h-48 animate-pulse bg-muted/30" />
          <div className="sigap-panel h-[520px] animate-pulse bg-muted/30" />
        </div>
      </div>
    );
  }

  if (followUpsQuery.error) {
    return (
      <div className="sigap-page">
        <div className="sigap-panel flex items-start gap-3 border-destructive/30 bg-destructive/5">
          <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
          <div className="space-y-3">
            <div>
              <h1 className="text-base font-semibold">Gagal memuat tindak lanjut</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {followUpsQuery.error instanceof Error ? followUpsQuery.error.message : "Silakan coba lagi."}
              </p>
            </div>
            <Button variant="outline" onClick={() => followUpsQuery.refetch()}>Coba Lagi</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sigap-page space-y-5">
      <div className="sigap-panel sigap-panel-accent flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tindak Lanjut</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pengajuan yang membutuhkan keputusan Anda setelah proses dikembalikan.
          </p>
        </div>
        <Button variant="outline" onClick={() => followUpsQuery.refetch()} disabled={followUpsQuery.isFetching}>
          {followUpsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
          Segarkan
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="sigap-panel flex min-h-[280px] flex-col items-center justify-center text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          <h2 className="mt-4 text-base font-semibold">Tidak ada tindak lanjut</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Jika ada perubahan yang perlu Anda setujui atau batalkan, pengajuan akan muncul di halaman ini.
          </p>
        </div>
      ) : (
        <div className="grid min-h-[calc(100dvh-220px)] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="sigap-panel min-h-0 space-y-3 lg:max-h-[calc(100dvh-220px)] lg:overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground">Antrean keputusan</p>
            {rows.map((row) => {
              const revision = getOpenRequesterRevision(row);
              const active = selected?.id === row.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSearchParams({ surat: row.id })}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors",
                    active ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/30"
                  )}
                >
                  <p className="line-clamp-2 text-sm font-semibold">{row.judul_surat}</p>
                  <p className="mt-1 truncate text-xs font-mono text-muted-foreground">{row.no_surat || "Nomor belum tersedia"}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span>Dari {formatRevisionTarget(revision)}</span>
                    {revision?.from_step && <span>Tahap {revision.from_step}</span>}
                  </div>
                </button>
              );
            })}
          </aside>

          <main className="min-h-0 space-y-4 lg:max-h-[calc(100dvh-220px)] lg:overflow-y-auto lg:pr-1">
            {selected && (
              <>
                <section className="sigap-panel border-amber-500/25 bg-amber-500/5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        {isExternalRevision ? "Perlu diperbaiki oleh pemohon" : "Menunggu keputusan pemohon"}
                      </p>
                      <h2 className="mt-2 text-base font-semibold">{selected.judul_surat}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {isExternalRevision
                          ? `Sistem departemen meminta perbaikan: ${activeRevision?.reason || "Alasan belum tersedia."}`
                          : `Perubahan dari ${formatRevisionTarget(activeRevision)} perlu Anda tinjau sebelum proses dilanjutkan.`}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {isExternalRevision ? (
                        <Button
                          onClick={() => activeRevision?.event_id && openRevisionMutation.mutate(activeRevision.event_id)}
                          disabled={openRevisionMutation.isPending}
                        >
                          {openRevisionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}
                          Perbaiki Pengajuan
                        </Button>
                      ) : (
                        <>
                      <Button variant="outline" onClick={() => openActionDialog("cancel")}>
                        <XCircle className="mr-2 h-4 w-4" />
                        Batalkan
                      </Button>
                      <Button onClick={() => openActionDialog("accept")}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Lanjutkan
                      </Button>
                        </>
                      )}
                    </div>
                  </div>
                </section>

                {revisionChanges.length > 0 && (
                  <section className="sigap-panel">
                    <div className="mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold">Perubahan yang diajukan</h3>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full min-w-[680px] text-left text-xs">
                        <thead className="bg-muted/40 text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">Item</th>
                            <th className="px-3 py-2">Keputusan</th>
                            <th className="px-3 py-2">Diajukan</th>
                            <th className="px-3 py-2">Disetujui</th>
                            <th className="px-3 py-2">Alasan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {revisionChanges.map((row, index) => (
                            <tr key={`${row.index}-${index}`} className="border-t border-border">
                              <td className={cn("px-3 py-2 font-semibold", row.action === "reject" && "text-muted-foreground line-through")}>
                                {row.nama_barang || `Item ${row.index + 1}`}
                              </td>
                              <td className="px-3 py-2">{row.action === "reject" ? "Tidak disetujui" : row.action === "adjust" ? "Disetujui sebagian" : "Tidak berubah"}</td>
                              <td className="px-3 py-2">{formatRevisionValue(row.nilai_diajukan, row)}</td>
                              <td className="px-3 py-2">{formatRevisionValue(row.nilai_disetujui, row)}</td>
                              <td className="px-3 py-2">{row.alasan || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                <RegistrationSummaryDocument data={buildRegistrationSummaryData(selected)} />
              </>
            )}
          </main>
        </div>
      )}

      <Dialog open={Boolean(dialogAction)} onOpenChange={(open) => { if (!open && !mutation.isPending) setDialogAction(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialogAction === "cancel" ? "Batalkan pengajuan?" : "Lanjutkan proses?"}</DialogTitle>
            <DialogDescription>
              {dialogAction === "cancel"
                ? "Nomor surat akan ditandai hangus dan proses pengajuan berhenti."
                : "Data revisi akan diterima, lalu tanda tangan dimulai ulang dari tahap pertama."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">{dialogAction === "cancel" ? "Alasan pembatalan" : "Catatan opsional"}</label>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={dialogAction === "cancel" ? "Tuliskan alasan minimal 5 karakter" : "Contoh: Perubahan sudah sesuai"}
              className="min-h-24 resize-y"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAction(null)} disabled={mutation.isPending}>Kembali</Button>
            <Button
              variant={dialogAction === "cancel" ? "destructive" : "default"}
              onClick={submitAction}
              disabled={mutation.isPending || (dialogAction === "cancel" && note.trim().length < 5)}
            >
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {dialogAction === "cancel" ? "Batalkan Pengajuan" : "Lanjutkan Proses"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
