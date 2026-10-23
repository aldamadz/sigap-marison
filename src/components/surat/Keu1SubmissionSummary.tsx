import { getKeu1FinancialSummary, normalizeKeu1SubmissionItems, parseKeu1Money, parseKeu1Quantity } from "@/components/surat/keu1-submission";
import { formatRupiahZero } from "@/lib/rupiah";
import { itemQuantityTotal } from "@sigap/shared";

type Props = {
  items: unknown;
  freeCashValue: unknown;
};

export function Keu1SubmissionSummary({ items, freeCashValue }: Props) {
  const rows = normalizeKeu1SubmissionItems(items);
  const financial = getKeu1FinancialSummary(rows, freeCashValue);

  return (
    <section className="space-y-3" aria-label="Rincian Pengajuan Kas Kecil">
      <h4 className="text-sm font-semibold text-foreground">Rincian Pengajuan Kas Kecil</h4>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="w-12 px-3 py-2 text-center">No.</th>
              <th className="px-3 py-2">Keterangan</th>
              <th className="px-3 py-2 text-right">Jumlah</th>
              <th className="px-3 py-2">Satuan</th>
              <th className="px-3 py-2 text-right">Estimasi Harga Satuan</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const quantity = parseKeu1Quantity(row.jumlah);
              const price = parseKeu1Money(row.estimasi_harga_satuan);
              return (
                <tr key={row.id || index} className="border-t border-border">
                  <td className="px-3 py-2 text-center tabular-nums">{index + 1}</td>
                  <td className="max-w-72 whitespace-pre-wrap px-3 py-2 font-medium">{row.keterangan || "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{quantity ?? "-"}</td>
                  <td className="px-3 py-2">{row.satuan || "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{price === null ? "-" : formatRupiahZero(price)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{price === null || quantity === null ? "-" : formatRupiahZero(itemQuantityTotal(quantity, price))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-border bg-muted/20 font-medium">
            <tr><th colSpan={5} className="px-3 py-2 text-left">Grand Total</th><td className="px-3 py-2 text-right tabular-nums">{formatRupiahZero(financial.grandTotal)}</td></tr>
            {financial.hasFreeCash && (
              <tr><th colSpan={5} className="px-3 py-2 text-left">Free Cash Sisa Bulan Lalu</th><td className="px-3 py-2 text-right tabular-nums">{formatRupiahZero(financial.freeCash)}</td></tr>
            )}
            <tr className="border-t border-border bg-primary/5 font-semibold"><th colSpan={5} className="px-3 py-2 text-left">Kebutuhan Dana</th><td className="px-3 py-2 text-right tabular-nums">{formatRupiahZero(financial.kebutuhanDana)}</td></tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
