import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NominalInput } from "@/components/surat/NominalInput";
import {
  formatCurrencyInput,
  formatRupiah,
  parseCurrencyInput,
} from "@/lib/rupiah";
import { cn } from "@/lib/utils";
import { itemQuantityTotal, parseItemQuantity } from "@sigap/shared";

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

/** Pilihan status barang pada editor Non Aset: tingkatan 1 sampai 4. */
const STATUS_OPTIONS = ["1", "2", "3", "4"] as const;

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
  return parseItemQuantity(value) ?? 0;
};

/** Total satu baris = harga satuan (nominal) × jumlah. */
export const getNonAsetItemRowTotal = (row: NonAsetItemRow, keys: {
  qtyKey: string;
  nominalKey: string;
}): number => parseCurrencyInput(row?.[keys.nominalKey]) !== null
  ? itemQuantityTotal(row?.[keys.qtyKey], parseCurrencyInput(row?.[keys.nominalKey])) ?? 0
  : 0;

const FieldShell = ({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) => (
  <div className={cn("space-y-1.5", className)}>
    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </Label>
    {children}
  </div>
);

/**
 * Editor item Non Aset tanpa tumpukan kartu: setiap barang adalah satu
 * bagian yang dipisah garis tipis sehingga halaman terasa lega di desktop
 * maupun mobile. Nominal tetap disimpan pada kolom `keterangan` agar tampil
 * di kolom yang sama pada PDF dan ringkasan persetujuan.
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
    <div className="space-y-5">
      <div className="divide-y divide-border/60">
        {normalizedRows.map((row, rowIndex) => {
          const name = text(row[keys.nameKey]);
          const total = rowTotals[rowIndex];
          const totalReady =
            parseCurrencyInput(row[keys.nominalKey]) !== null && parseQty(row[keys.qtyKey]) > 0;
          return (
            <div
              key={rowIndex}
              className="py-5 transition-colors first:pt-1 last:pb-1"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="text-[11px] font-black uppercase tracking-widest text-primary">
                  Barang/Jasa {rowIndex + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2 text-xs font-semibold text-muted-foreground hover:text-destructive"
                  aria-label={`Hapus ${name || `barang/jasa ${rowIndex + 1}`}`}
                  onClick={() => removeRow(rowIndex)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus
                </Button>
              </div>

              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                <FieldShell label={labelFor(keys.nameKey, "Nama Barang")} required={requiredFor(keys.nameKey)} className="sm:col-span-2">
                  <Input
                    className="h-10 bg-background"
                    placeholder="Contoh: Kertas HVS A4"
                    aria-label={`${labelFor(keys.nameKey, "Nama Barang")} barang/jasa ${rowIndex + 1}`}
                    value={name}
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
                    step="any"
                    inputMode="decimal"
                    className="h-10 bg-background text-left tabular-nums"
                    placeholder="0"
                    aria-label={`${labelFor(keys.qtyKey, "Jumlah")} barang/jasa ${rowIndex + 1}`}
                    value={text(row[keys.qtyKey])}
                    onChange={(event) => updateRow(rowIndex, { [keys.qtyKey]: event.target.value })}
                  />
                </FieldShell>
                {keys.statusKey && (
                  <FieldShell label={labelFor(keys.statusKey, "Status")} required={requiredFor(keys.statusKey)}>
                    <Select
                      value={text(row[keys.statusKey]) || undefined}
                      onValueChange={(value) => updateRow(rowIndex, { [keys.statusKey!]: value })}
                    >
                      <SelectTrigger
                        className="h-10 bg-background"
                        aria-label={`${labelFor(keys.statusKey!, "Status")} barang/jasa ${rowIndex + 1}`}
                      >
                        <SelectValue placeholder="Pilih status" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>{option}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldShell>
                )}
                <FieldShell
                  label={`Nominal Rupiah / ${labelFor(keys.unitKey, "Satuan").toLowerCase()}`}
                  required={false}
                >
                  <NominalInput
                    className="h-11 bg-background"
                    align="left"
                    ariaLabel={`Nominal rupiah per satuan barang/jasa ${rowIndex + 1}`}
                    placeholder="150.000"
                    value={row[keys.nominalKey]}
                    onCommit={(canonical) => updateRow(rowIndex, {
                      [keys.nominalKey]: canonical ? `Rp ${formatCurrencyInput(canonical)}` : "",
                    })}
                  />
                </FieldShell>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                  Total {name || `Barang/Jasa ${rowIndex + 1}`}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-base font-bold tabular-nums",
                    totalReady ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                  )}
                  aria-live="polite"
                >
                  {totalReady ? formatRupiah(total) : "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
        onClick={() => onChange([...normalizedRows, {}])}
      >
        <Plus className="h-4 w-4" /> Tambah Barang/Jasa
      </button>

      <div className="flex flex-col gap-2 border-t-2 border-primary/40 pt-4 sm:flex-row sm:items-end sm:justify-between">
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
