import { parseKeu1Money, parseKeu1Quantity } from "@/components/surat/keu1-submission";
import { formatRupiahZero } from "@/lib/rupiah";
import { getKeu10ItemTotal, getKeu10SubmissionAmount, normalizeKeu10SubmissionItems } from "@/features/surat/registration/lib/keu10-form";

export function Keu10SubmissionSummary({ items }: { items: unknown }) {
  const rows = normalizeKeu10SubmissionItems(items);
  return (
    <section className="min-w-0 space-y-3" aria-label="Rincian Pengajuan Dana KEU 10">
      <h4 className="text-sm font-semibold text-foreground">Rincian Pengajuan Dana</h4>
      <div className="overflow-x-auto rounded-md border border-border" tabIndex={0} role="region" aria-label="Tabel rincian dana">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th scope="col" className="w-12 px-3 py-2 text-center">No.</th>
              <th scope="col" className="px-3 py-2">Keterangan</th>
              <th scope="col" className="px-3 py-2 text-right">Jumlah</th>
              <th scope="col" className="px-3 py-2">Satuan</th>
              <th scope="col" className="px-3 py-2 text-right">Estimasi Harga Satuan</th>
              <th scope="col" className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id || index} className="border-t border-border">
                <td className="px-3 py-2 text-center tabular-nums">{index + 1}</td>
                <td className="max-w-72 whitespace-pre-wrap break-words px-3 py-2 font-medium">{row.keterangan || "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{parseKeu1Quantity(row.jumlah) ?? "-"}</td>
                <td className="max-w-40 break-words px-3 py-2">{row.satuan || "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatRupiahZero(parseKeu1Money(row.estimasi_harga_satuan))}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{formatRupiahZero(getKeu10ItemTotal(row))}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-muted-foreground">Belum ada rincian dana.</td></tr>}
          </tbody>
          <tfoot className="border-t border-border bg-muted/20 font-semibold">
            <tr><th scope="row" colSpan={5} className="px-3 py-3">Grand Total</th><td className="px-3 py-3 text-right tabular-nums">{formatRupiahZero(getKeu10SubmissionAmount(rows))}</td></tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
