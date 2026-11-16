import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { isKeu10FinalCandidate } from "@/features/surat/registration/lib/keu10-workflow";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
type Props = { signatureId: string; policy: unknown; signatures: unknown; items: unknown; value: string; onChange: (value: string) => void };
export function SignerRevisionFinalApprover({ signatureId, policy, signatures, items, value, onChange }: Props) {
  const frozen = record(policy);
  const query = useQuery({ queryKey: ["signer-revision-final-candidates", signatureId], queryFn: async () => {
    const { data, error } = await supabase.rpc("get_signer_revision_final_candidates", { p_sig_id: signatureId });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(record);
  } });
  const candidates = (query.data || []).filter(candidate => isKeu10FinalCandidate({
    job_title: String(candidate.job_title || ""), is_active: candidate.is_active === true,
  }, frozen.keu10_config, items));
  const rows = Array.isArray(signatures) ? signatures.map(record) : [];
  const previous = [...rows].sort((a,b) => Number(b.step_order) - Number(a.step_order))[0]?.user_id;
  const ids = candidates.map(candidate => String(candidate.id));
  const selected = ids.includes(value) ? value : typeof previous === "string" && ids.includes(previous) ? previous : ids.length === 1 ? ids[0] : "";
  useEffect(() => { if (value !== selected) onChange(selected); }, [value, selected, onChange]);
  return <div className="space-y-2">
    <Label htmlFor="signer-revision-final-approver">Penyetuju akhir sesuai nominal revisi</Label>
    <Select value={selected} onValueChange={onChange} disabled={query.isFetching || query.isError}>
      <SelectTrigger id="signer-revision-final-approver"><SelectValue placeholder="Pilih penyetuju akhir" /></SelectTrigger>
      <SelectContent>{candidates.map(candidate => <SelectItem key={String(candidate.id)} value={String(candidate.id)}>
        {String(candidate.full_name)} - {String(candidate.job_title)}
      </SelectItem>)}</SelectContent>
    </Select>
    {query.isError && <p role="alert" className="text-sm text-destructive">Penyetuju gagal dimuat. Coba lagi.</p>}
    {!query.isFetching && !query.isError && !candidates.length && <p role="alert" className="text-sm text-destructive">Belum ada penyetuju yang memenuhi syarat.</p>}
  </div>;
}
