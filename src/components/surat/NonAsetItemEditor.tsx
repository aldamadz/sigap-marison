import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NominalInput } from "@/components/surat/NominalInput";
import {
  formatCurrencyInput,
  formatRupiah,
  parseCurrencyInput,
} from "@/lib/rupiah";
import { cn } from "@/lib/utils";

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

const FieldShell = ({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      {label}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </Label>
    {children}
  </div>
);

/**
 * Editor item Non Aset bergaya kartu per barang/jasa (bukan tabel):
 * field berlabel dengan grid rapi, nominal rupiah berprefiks "Rp" dengan
 * pemformatan ribuan live, subtotal otomatis per kartu, dan kartu Total
 * Pengajuan di akhir. Nominal tetap disimpan pada kolom `keterangan` agar
 * tampil di kolom yang sama pada PDF dan ringkasan persetujuan.
 */
export function NonAsetItemEditor({ rows, columns, onChange }: Props) {
  const keys = getNonAsetItemColumnKeys(columns);
  if (!keys) return null;

  const normalizedRows = rows.length > 0 ? rows : [{} as NonAsetItemRow];
  const labelFor = (key: string, fallback: string) =>
    text(columns.find((column) => column.key === key)?.label) || fallback;
  const requiredFor = (key: string) =>
    columns.find((column) => column.key === key)?.required !== false;

  const rowTotals = normalizedRows.map((row) => getNonAsetItemRowTotal(row, keys));
  const grandTotal = rowTotals.reduce<number>((sum, value) => sum + value, 0);
  const hasAnyNominal = normalizedRows.some((row) =>
    parseCurrencyInput(row?.[keys.nominalKey]) !== null,
  );
  const filledCount = normalizedRows.filter((row) => text(row[keys.nameKey])).length;

  const updateRow = (index: number, patch: NonAsetItemRow) => {
    onChange(normalizedRows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, ...patch } : row
    ));
  };

  const removeRow = (index: number) => {
    const next = normalizedRows.filter((_, rowIndex) => rowIndex !== index);
    onChange(next.length > 0 ? next : [{}]);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {normalizedRows.map((row, rowIndex) => {
          const name = text(row[keys.nameKey]);
          const total = rowTotals[rowIndex];
          const totalReady =
            parseCurrencyInput(row[keys.nominalKey]) !== null && parseQty(row[keys.qtyKey]) > 0;
          return (
            <div
              key={rowIndex}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors focus-within:border-primary/50 hover:border-primary/30 sm:p-5"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-black text-primary">
                  {rowIndex + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    "truncate text-sm font-semibold",
                    name ? "text-foreground" : "text-muted-foreground",
                  )}>
                    {name || `Barang/Jasa ${rowIndex + 1}`}
                  </p>
                  <p className={cn(
                    "text-[11px] font-medium",
                    totalReady ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                  )}>
                    {totalReady
                      ? `Subtotal ${formatRupiah(total)}`
                      : "Isi jumlah dan nominal untuk menghitung total"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Hapus ${name || `barang/jasa ${rowIndex + 1}`}`}
                  onClick={() => removeRow(rowIndex)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldShell label={labelFor(keys.nameKey, "Nama Barang")} required={requiredFor(keys.nameKey)}>
                  <Input
                    className="h-10 bg-background"
                    placeholder="Contoh: Kertas HVS A4"
                    aria-label={`${labelFor(keys.nameKey, "Nama Barang")} barang/jasa ${rowIndex + 1}`}
                    value={text(row[keys.nameKey])}
                    onChange={(event) => updateRow(rowIndex, { [keys.nameKey]: event.target.value })}
                  />
                </FieldShell>
                {keys.kodeKey && (
                  <FieldShell label={labelFor(keys.kodeKey, "Kode")} required={requiredFor(keys.kodeKey)}>
                    <Input
                      className="h-10 bg-background"
                      placeholder="Opsional"
                      aria-label={`${labelFor(keys.kodeKey!, "Kode")} barang/jasa ${rowIndex + 1}`}
                      value={text(row[keys.kodeKey])}
                      onChange={(event) => updateRow(rowIndex, { [keys.kodeKey!]: event.target.value })}
                    />
                  </FieldShell>
                )}
                <FieldShell label={labelFor(keys.unitKey, "Satuan")} required={requiredFor(keys.unitKey)}>
                  <Input
                    className="h-10 bg-background"
                    placeholder="Contoh: Rim"
                    aria-label={`${labelFor(keys.unitKey, "Satuan")} barang/jasa ${rowIndex + 1}`}
                    value={text(row[keys.unitKey])}
                    onChange={(event) => updateRow(rowIndex, { [keys.unitKey]: event.target.value })}
                  />
                </FieldShell>
                <FieldShell label={labelFor(keys.qtyKey, "Jumlah")} required={requiredFor(keys.qtyKey)}>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    className="h-10 bg-background text-right tabular-nums"
                    placeholder="0"
                    aria-label={`${labelFor(keys.qtyKey, "Jumlah")} barang/jasa ${rowIndex + 1}`}
                    value={text(row[keys.qtyKey])}
                    onChange={(event) => updateRow(rowIndex, { [keys.qtyKey]: event.target.value })}
                  />
                </FieldShell>
                {keys.statusKey && (
                  <FieldShell label={labelFor(keys.statusKey, "Status")} required={requiredFor(keys.statusKey)}>
                    <Input
                      className="h-10 bg-background"
                      placeholder="Contoh: Baru"
                      aria-label={`${labelFor(keys.statusKey!, "Status")} barang/jasa ${rowIndex + 1}`}
                      value={text(row[keys.statusKey])}
                      onChange={(event) => updateRow(rowIndex, { [keys.statusKey!]: event.target.value })}
                    />
                  </FieldShell>
                )}
              </div>

              <div className="mt-4 space-y-3">
                <FieldShell
                  label={`Nominal Rupiah / ${labelFor(keys.unitKey, "Satuan").toLowerCase()}`}
                  required={false}
                >
                  <NominalInput
                    className="h-11 bg-card"
                    ariaLabel={`Nominal rupiah per satuan barang/jasa ${rowIndex + 1}`}
                    placeholder="150.000"
                    value={row[keys.nominalKey]}
                    onCommit={(canonical) => updateRow(rowIndex, {
                      [keys.nominalKey]: canonical ? `Rp ${formatCurrencyInput(canonical)}` : "",
                    })}
                  />
                </FieldShell>
                <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3.5 py-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Total barang ini
                  </span>
                  <span className="text-sm font-bold tabular-nums text-foreground" aria-live="polite">
                    {totalReady ? formatRupiah(total) : "—"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full rounded-2xl border-dashed text-sm font-semibold text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
        onClick={() => onChange([...normalizedRows, {}])}
      >
        <Plus className="mr-1.5 h-4 w-4" /> Tambah Barang/Jasa
      </Button>

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-primary">Total Pengajuan</p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">
            {filledCount} barang/jasa · dihitung dari harga satuan × jumlah
          </p>
        </div>
        <p className="whitespace-nowrap text-xl font-black tabular-nums text-foreground sm:text-2xl" aria-live="polite">
          {hasAnyNominal || grandTotal > 0 ? formatRupiah(grandTotal) : "—"}
        </p>
      </div>
    </div>
  );
}
