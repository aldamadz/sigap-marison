import { formatRevisionValue, getRevisionApprovedValue, getRevisionItemChanges, getRevisionRequestedValue, type ActiveRevision } from "./revision-utils";

export function SignerRevisionSummary({ revision }: { revision?: ActiveRevision | null }) {
  if (!revision?.reason) return null;
  const rows = getRevisionItemChanges(revision);
  const isProposal = revision.changes?.signer_revision_required === true || rows.length > 0;
  return <section className="space-y-3 border-t pt-4" aria-label="Catatan perbaikan pengajuan">
    <h3 className="text-sm font-semibold">{isProposal ? "Revisi oleh Penandatangan" : "Permintaan perbaikan"}</h3>
    <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{revision.reason}</p>
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
  </section>;
}
