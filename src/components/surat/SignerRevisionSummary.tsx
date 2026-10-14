import { formatRevisionValue, getRevisionApprovedValue, getRevisionItemChanges, getRevisionRequestedValue, type ActiveRevision } from "./revision-utils";
import { useEffect, useState } from "react";
import { getRevisionEvidence, revisionSnapshotForDisplay, revisionSubmitterName } from "@/services/revision-evidence.service";
import { RequesterRevisionSummary } from "./RequesterRevisionSummary";

export function SignerRevisionSummary({ revision, suratId }: { revision?: ActiveRevision | null; suratId?: string }) {
  const [evidence, setEvidence] = useState<Awaited<ReturnType<typeof getRevisionEvidence>> | null>(null);
  const [evidenceError, setEvidenceError] = useState(false);
  useEffect(() => {
    let active = true;
    setEvidence(null);
    setEvidenceError(false);
    if (suratId && revision?.event_id) {
      getRevisionEvidence(suratId).then(result => { if (active) setEvidence(result); })
        .catch(() => { if (active) setEvidenceError(true); });
    }
    return () => { active = false; };
  }, [suratId, revision?.event_id]);
  if (!revision?.reason) return null;
  const rows = getRevisionItemChanges(revision);
  const isProposal = revision.changes?.signer_revision_required === true || rows.length > 0;
  const actor = evidence?.events.find(event => event.id === revision.event_id
    && (!event.surat_id || event.surat_id === suratId))?.actor_name?.trim();
  const heading = isProposal ? "Revisi" : "Permintaan perbaikan";
  return <section className="space-y-3 border-t pt-4" aria-label="Catatan perbaikan pengajuan">
    <h3 className="text-sm font-semibold">{actor ? `${heading} oleh ${actor}` : heading}</h3>
    <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{revision.reason}</p>
    {evidenceError && <p role="status" className="text-xs text-muted-foreground">Rincian riwayat revisi belum berhasil dimuat.</p>}
    {rows.length > 0 && <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b"><th className="p-2">Item</th><th className="p-2">Diajukan</th><th className="p-2">Disetujui</th><th className="p-2">Alasan</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.index} className="border-b align-top">
          <td className="p-2">{row.nama_barang || `Item ${row.index + 1}`}</td>
          <td className="p-2">{formatRevisionValue(getRevisionRequestedValue(row),row)}</td>
          <td className="p-2">{row.action === "reject" ? "Tidak disetujui" : row.action === "keep" ? "Tidak berubah" : formatRevisionValue(getRevisionApprovedValue(row),row)}</td>
          <td className="p-2 whitespace-pre-wrap break-words">{row.alasan || revision.reason}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {evidence?.histories.map(history => {
      const requester = revisionSubmitterName(history);
      const requestingActor = evidence.events.find(event => event.id === history.revision_event_id
        && event.actor_id === history.requested_by)?.actor_name?.trim();
      return <div key={history.id} className="space-y-2 border-t pt-3">
        <h4 className="text-sm font-semibold">{requester ? `Perbaikan oleh ${requester}` : "Perbaikan pengajuan"}</h4>
        <p className="text-xs text-muted-foreground">
          {requestingActor ? `Diminta oleh ${requestingActor} · ` : ""}
          {new Date(history.submitted_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
        </p>
        <p className="whitespace-pre-wrap break-words text-sm">Alasan: {history.reason}</p>
        {history.requester_note && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">Catatan pemohon: {history.requester_note}</p>}
        <RequesterRevisionSummary baseline={revisionSnapshotForDisplay(history.before_snapshot)}
          current={revisionSnapshotForDisplay(history.after_snapshot)} showNoChanges />
      </div>;
    })}
  </section>;
}
