import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NominalInput } from "@/components/surat/NominalInput";
import {
  formatCurrencyInput,
  formatRupiah,
  parseCurrencyInput,
} from "@/lib/rupiah";

export type NonAsetItemRow = Record<string, unknown>;

type TemplateColumn = {
  key: string;
  label?: string;
  type?: string;
  required?: boolean;
};

type Props = {
  rows: NonAsetItemRow[];
  columns: TemplateColumn[];
  onChange: (rows: NonAsetItemRow[]) => void;
};

const text = (value: unknown): string => String(value ?? "").trim();

/**
 * Memetakan kolom konfigurasi admin ke peran kolom editor Non Aset.
 * Mengembalikan null bila konfigurasi tidak menyerupai daftar barang
 * sehingga form jatuh kembali ke renderer tabel generik.
 */
export const getNonAsetItemColumnKeys = (
  columns: TemplateColumn[],
): { nameKey: string; unitKey: string; qtyKey: string; statusKey: string | null; nominalKey: string; kodeKey: string | null } | null => {
  const list = Array.isArray(columns) ? columns : [];
  const findBy = (...patterns: RegExp[]) =>
    list.find((column) => patterns.some((pattern) => pattern.test(column.key.toLowerCase())))?.key ?? null;

  const nameKey = findBy(/nama/, /barang/, /item/);
  const qtyKey = findBy(/jumlah/, /qty/, /volume/);
  if (!nameKey || !qtyKey) return null;

  const unitKey = findBy(/^sat/, /satuan/, /unit/) ?? "sat";
  const statusKey = findBy(/status/);
  const nominalKey =
    findBy(/keterangan/, /nominal/, /harga/, /nilai/) ?? "keterangan";
  const kodeKey = findBy(/kode/, /^code$/);
  return { nameKey, unitKey, qtyKey, statusKey, nominalKey, kodeKey };
};

const parseQty = (value: unknown): number => {
  const parsed = parseInt(text(value).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** Total satu baris = harga satuan (nominal) × jumlah. */
export const getNonAsetItemRowTotal = (row: NonAsetItemRow, keys: {
  qtyKey: string;
  nominalKey: string;
}): number => parseCurrencyInput(row?.[keys.nominalKey]) !== null
  ? (parseCurrencyInput(row?.[keys.nominalKey]) ?? 0) * parseQty(row?.[keys.qtyKey])
  : 0;

const RowTotalCell = ({ value }: { value: number | null }) => (
  <Input
    readOnly
    disabled
    tabIndex={-1}
    aria-label="Total baris"
    className="h-9 bg-muted/30 text-right text-sm font-semibold tabular-nums"
    value={value === null ? "-" : formatRupiah(value)}
  />
);

/**
 * Editor item Non Aset yang mengikuti tata letak formulir PGD:
 * No | Kode | Nama Barang | Satuan | Jumlah | Status | Nominal Rupiah/satuan | Total.
 * Nominal satuan disimpan pada kolom `keterangan` agar tampil di kolom yang
 * sama pada PDF dan ringkasan persetujuan. Baris terakhir diikuti baris TOTAL
 * hasil penjumlahan (harga × jumlah) seluruh item.
 */
export function NonAsetItemEditor({ rows, columns, onChange }: Props) {
  const keys = getNonAsetItemColumnKeys(columns);
  if (!keys) return null;

  const normalizedRows = rows.length > 0 ? rows : [{} as NonAsetItemRow];
  const labelFor = (key: string, fallback: string) =>
    text(columns.find((column) => column.key === key)?.label) || fallback;

  const rowTotals = normalizedRows.map((row) =>
    getNonAsetItemRowTotal(row, keys),
  );
  const grandTotal = rowTotals.reduce<number>((sum, value) => sum + value, 0);
  const hasAnyNominal = normalizedRows.some((row) =>
    parseCurrencyInput(row?.[keys.nominalKey]) !== null,
  );

  const updateRow = (index: number, patch: NonAsetItemRow) => {
    onChange(normalizedRows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, ...patch } : row
    ));
  };

  const removeRow = (index: number) => {
    const next = normalizedRows.filter((_, rowIndex) => rowIndex !== index);
    onChange(next.length > 0 ? next : [{}]);
  };

  const headerCount =
    2 /* No. + aksi */
    + 4 /* nama, satuan, jumlah, nominal */
    + (keys.kodeKey ? 1 : 0)
    + (keys.statusKey ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="w-12 px-2 py-2.5 text-center text-[11px] font-black uppercase tracking-wide text-muted-foreground">No.</th>
              {keys.kodeKey && (
                <th className="w-24 px-2 py-2.5 text-left text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                  {labelFor(keys.kodeKey, "Kode")}
                </th>
              )}
              <th className="min-w-[220px] px-2 py-2.5 text-left text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                {labelFor(keys.nameKey, "Nama Barang")}
              </th>
              <th className="w-28 px-2 py-2.5 text-left text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                {labelFor(keys.unitKey, "Satuan")}
              </th>
              <th className="w-24 px-2 py-2.5 text-left text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                {labelFor(keys.qtyKey, "Jumlah")}
              </th>
              {keys.statusKey && (
                <th className="w-32 px-2 py-2.5 text-left text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                  {labelFor(keys.statusKey, "Status")}
                </th>
              )}
              <th className="w-44 px-2 py-2.5 text-left text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                Nominal Rupiah / Satuan
                <span className="block text-[10px] font-medium normal-case tracking-normal opacity-70">
                  Tercatat di kolom {labelFor(keys.nominalKey, "Keterangan")}
                </span>
              </th>
              <th className="w-36 px-2 py-2.5 text-right text-[11px] font-black uppercase tracking-wide text-muted-foreground">Total</th>
              <th className="w-12 px-1 py-2.5" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {normalizedRows.map((row, rowIndex) => {
              const total = rowTotals[rowIndex];
              return (
                <tr key={rowIndex} className="border-b border-border/60 last:border-b-0">
                  <td className="px-2 py-2 text-center">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                      {rowIndex + 1}
                    </span>
                  </td>
                  {keys.kodeKey && (
                    <td className="px-2 py-2">
                      <Input
                        className="h-9 bg-background"
                        aria-label={`${labelFor(keys.kodeKey!, "Kode")} baris ${rowIndex + 1}`}
                        value={text(row[keys.kodeKey])}
                        onChange={(event) => updateRow(rowIndex, { [keys.kodeKey!]: event.target.value })}
                      />
                    </td>
                  )}
                  <td className="px-2 py-2">
                    <Input
                      className="h-9 bg-background"
                      placeholder="Contoh: Kertas HVS A4"
                      aria-label={`${labelFor(keys.nameKey, "Nama Barang")} baris ${rowIndex + 1}`}
                      value={text(row[keys.nameKey])}
                      onChange={(event) => updateRow(rowIndex, { [keys.nameKey]: event.target.value })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      className="h-9 bg-background"
                      placeholder="Unit"
                      aria-label={`${labelFor(keys.unitKey, "Satuan")} baris ${rowIndex + 1}`}
                      value={text(row[keys.unitKey])}
                      onChange={(event) => updateRow(rowIndex, { [keys.unitKey]: event.target.value })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      className="h-9 bg-background tabular-nums"
                      placeholder="0"
                      aria-label={`${labelFor(keys.qtyKey, "Jumlah")} baris ${rowIndex + 1}`}
                      value={text(row[keys.qtyKey])}
                      onChange={(event) => updateRow(rowIndex, { [keys.qtyKey]: event.target.value })}
                    />
                  </td>
                  {keys.statusKey && (
                    <td className="px-2 py-2">
                      <Input
                        className="h-9 bg-background"
                        aria-label={`${labelFor(keys.statusKey!, "Status")} baris ${rowIndex + 1}`}
                        value={text(row[keys.statusKey])}
                        onChange={(event) => updateRow(rowIndex, { [keys.statusKey]: event.target.value })}
                      />
                    </td>
                  )}
                  <td className="px-2 py-2">
                    <NominalInput
                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      ariaLabel={`Nominal rupiah per satuan baris ${rowIndex + 1}`}
                      placeholder="150.000"
                      value={row[keys.nominalKey]}
                      onCommit={(canonical) => updateRow(rowIndex, {
                        [keys.nominalKey]: canonical ? `Rp ${formatCurrencyInput(canonical)}` : "",
                      })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <RowTotalCell value={total > 0 || (parseCurrencyInput(row[keys.nominalKey]) !== null && parseQty(row[keys.qtyKey]) > 0) ? total : null} />
                  </td>
                  <td className="px-1 py-2 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label={`Hapus baris ${rowIndex + 1}`}
                      onClick={() => removeRow(rowIndex)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/40">
              <td
                colSpan={headerCount - 1}
                className="px-2 py-3 text-right text-xs font-black uppercase tracking-wide text-muted-foreground"
              >
                Total
              </td>
              <td className="px-2 py-3 text-right text-sm font-bold tabular-nums text-foreground">
                {hasAnyNominal ? formatRupiah(grandTotal) : "-"}
              </td>
              <td aria-hidden />
            </tr>
          </tfoot>
        </table>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 rounded-xl"
        onClick={() => onChange([...normalizedRows, {}])}
      >
        <Plus className="mr-1 h-4 w-4" /> Tambah Barang/Jasa
      </Button>
    </div>
  );
}