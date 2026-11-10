import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Keu10SubmissionEditor } from "./Keu10SubmissionEditor";
import { Keu10SubmissionSummary } from "./Keu10SubmissionSummary";
import { validateKeu10SubmissionItems } from "@/features/surat/registration/lib/keu10-form";
import { isKeu10FinalCandidate } from "@/features/surat/registration/lib/keu10-workflow";
import { supabase } from "@/lib/supabase";
import { suratService } from "@/services/surat.service";

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

type Props = {
  eventId: string;
  input: unknown;
  changes: unknown;
  policy: unknown;
  signatures: unknown;
  onSuccess: () => Promise<void>;
};

export function Keu10RequesterRevision({ eventId, input, changes, policy, signatures, onSuccess }: Props) {
  const originalItems = record(input).items;
  const revision = record(changes);
  const proposal = revision.keu10_finance_proposal === true;
  const proposedItems = record(revision.keu10_proposed_input).items;
  const [items, setItems] = useState<unknown>(originalItems);
  const [note, setNote] = useState("");
  const [selectedDirector, setSelectedDirector] = useState("");
  useEffect(() => { setItems(originalItems); setNote(""); setSelectedDirector(""); }, [eventId, originalItems]);
  const effectiveItems = proposal ? proposedItems : items;
  const frozenPolicy = record(policy);
  const steps = Array.isArray(frozenPolicy.keu10_steps) ? frozenPolicy.keu10_steps.map(record) : [];
  const finalStep = steps.find((step) => step.role_name === "menyetujui");
  const ids = Array.isArray(finalStep?.candidate_user_ids)
    ? finalStep.candidate_user_ids.filter((id): id is string => typeof id === "string") : [];
  const signatureRows = Array.isArray(signatures) ? signatures.map(record) : [];
  const previousDirector = signatureRows.find((signature) => signature.form_usage_step_id === finalStep?.id)?.user_id;
  const candidatesQuery = useQuery({
    queryKey: ["keu10-revision-directors", eventId, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_keu10_revision_final_candidates", { p_event_id: eventId });
      if (error) throw error;
      return (data || []).map(record);
    },
  });
  const candidates = useMemo(() => (candidatesQuery.data || []).filter((candidate) =>
    ids.includes(String(candidate.id)) && String(candidate.kedudukan || "").trim().toLowerCase() === "pusat"
    && (!finalStep?.signer_department_id || candidate.department_id === finalStep.signer_department_id)
    && isKeu10FinalCandidate({ job_title: String(candidate.job_title || ""), is_active: candidate.is_active === true },
      frozenPolicy.keu10_config, effectiveItems)),
  [candidatesQuery.data, ids.join(","), finalStep?.signer_department_id, frozenPolicy.keu10_config, effectiveItems]);
  const eligibleIds = candidates.map((candidate) => String(candidate.id));
  const director = eligibleIds.includes(selectedDirector) ? selectedDirector
    : typeof previousDirector === "string" && eligibleIds.includes(previousDirector) ? previousDirector
      : eligibleIds.length === 1 ? eligibleIds[0] : "";
  useEffect(() => { if (selectedDirector && !eligibleIds.includes(selectedDirector)) setSelectedDirector(""); },
    [selectedDirector, eligibleIds.join(",")]);
  const issues = validateKeu10SubmissionItems(effectiveItems);
  const mutation = useMutation({
    mutationFn: () => suratService.acceptKeu10RequesterRevision(eventId, {
      items: proposal ? undefined : items, note: note.trim(), finalSignerId: director,
    }),
    onSuccess: async () => { toast.success(revision.signer_revision_required === true
      ? "Revisi dikonfirmasi dan kembali ke penandatangan yang meminta perbaikan."
      : "Revisi diterima; persetujuan dimulai ulang dari BM."); await onSuccess(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Gagal menerima revisi."),
  });
  return (
    <section className="sigap-panel space-y-4" aria-label="Perbaikan KEU 10 oleh pemohon">
      <h3 className="text-sm font-semibold">{revision.signer_full_proposal === true ? "Konfirmasi revisi penandatangan" : proposal ? "Konfirmasi koreksi Verifikator" : "Perbaiki rincian pengajuan"}</h3>
      {proposal ? <div className="space-y-4">
        <h4 className="text-sm font-medium">Rincian semula</h4><Keu10SubmissionSummary items={originalItems} />
        <h4 className="text-sm font-medium">Usulan koreksi</h4><Keu10SubmissionSummary items={proposedItems} />
      </div> : <Keu10SubmissionEditor value={items} onChange={setItems} />}
      <div className="space-y-2">
        <Label htmlFor="keu10-revision-director">Pejabat penyetuju versi revisi</Label>
        <Select value={director} onValueChange={setSelectedDirector} disabled={candidatesQuery.isFetching || mutation.isPending}>
          <SelectTrigger id="keu10-revision-director"><SelectValue placeholder="Pilih pejabat penyetuju" /></SelectTrigger>
          <SelectContent>{candidates.map((candidate) => <SelectItem key={String(candidate.id)} value={String(candidate.id)}>
            {String(candidate.full_name)} - {String(candidate.job_title)}
          </SelectItem>)}</SelectContent>
        </Select>
        {candidatesQuery.isError ? <p role="alert" className="text-sm text-destructive">Pejabat gagal dimuat. Coba kembali.</p>
          : !candidatesQuery.isFetching && candidates.length === 0 && <p role="alert" className="text-sm text-destructive">Belum ada penyetuju yang memenuhi aturan revisi ini.</p>}
      </div>
      <div className="space-y-2"><Label htmlFor="keu10-revision-note">{proposal ? "Catatan konfirmasi (opsional)" : "Catatan perbaikan"}</Label>
        <Textarea id="keu10-revision-note" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
      </div>
      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || candidatesQuery.isFetching
        || candidatesQuery.isError || !director || issues.length > 0 || (!proposal && note.trim().length < 5)}>
        {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
        {proposal ? "Terima koreksi dan lanjutkan" : "Simpan perbaikan dan lanjutkan"}
      </Button>
    </section>
  );
}
