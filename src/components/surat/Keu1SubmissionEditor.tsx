import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NominalInput } from "@/components/surat/NominalInput";
import { formatRupiahZero } from "@/lib/rupiah";
import {
  createKeu1SubmissionItem,
  getKeu1FinancialSummary,
  normalizeKeu1SubmissionItems,
  validateKeu1SubmissionItems,
  parseKeu1Quantity,
  parseKeu1Money,
  type Keu1SubmissionItem,
} from "@/components/surat/keu1-submission";

type Props = {
  value: unknown;
  freeCashValue: unknown;
  onChange: (items: Keu1SubmissionItem[]) => void;
  onFreeCashChange: (value: string) => void;
};

export function Keu1SubmissionEditor({ value, freeCashValue, onChange, onFreeCashChange }: Props) {
  const normalized = normalizeKeu1SubmissionItems(value);
  const blankRow = useMemo(createKeu1SubmissionItem, []);
  const rows = normalized.length > 0 ? normalized : [blankRow];
  const issues = validateKeu1SubmissionItems(rows);
  const financial = getKeu1FinancialSummary(rows, freeCashValue);

  const updateRow = (index: number, patch: Partial<Keu1SubmissionItem>) => {
    const nextRows = rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
    // Auto-compute total when quantity or unit price changes.
    const target = nextRows[index];
    if (target && ("jumlah" in patch || "estimasi_harga_satuan" in patch)) {
      const quantity = parseKeu1Quantity(target.jumlah) ?? 0;
      const unitPrice = parseKeu1Money(target.estimasi_harga_satuan) ?? 0;
      target.total = quantity * unitPrice;
    }
    onChange(nextRows);
  };

  const removeRow = (index: number) => {
    const next = rows.filter((_, rowIndex) => rowIndex !== index);
    onChange(next.length > 0 ? next : [createKeu1SubmissionItem()]);
  };

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)] md:p-5">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Rincian Pengajuan Kas Kecil</h4>
          <p className="mt-1 text-xs text-muted-foreground">Isi seluruh rincian. Total dihitung otomatis dari Jumlah × Estimasi Harga Satuan.</p>
        </div>
        <div className="rounded-md border border-border bg-muted/30 px-4 py-2 text-right">
          <p className="text-[11px] font-medium text-muted-foreground">Grand Total</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">{formatRupiahZero(financial.grandTotal)}</p>
        </div>
      </div>

      {rows.map((row, index) => {
        const rowIssues = issues.filter((issue) => issue.index === index);
        const quantity = parseKeu1Quantity(row.jumlah) ?? 0;
        const unitPrice = parseKeu1Money(row.estimasi_harga_satuan) ?? 0;
        const rowTotal = quantity * unitPrice;
        return (
          <fieldset key={row.id || index} className="min-w-0 rounded-md border border-border bg-background p-4">
            <legend className="px-2 text-xs font-semibold text-muted-foreground">Item {index + 1}</legend>
            <div className="grid gap-4 md:grid-cols-6">
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor={`keu1-item-keterangan-${index}`}>Keterangan</Label>
                <Input
                  id={`keu1-item-keterangan-${index}`}
                  value={String(row.keterangan ?? "")}
                  onChange={(event) => updateRow(index, { keterangan: event.target.value })}
                  placeholder="Contoh: Listrik kantor"
                  maxLength={240}
                  aria-invalid={rowIssues.some((issue) => issue.field === "keterangan")}
                />
              </div>
              <div className="space-y-2 md:col-span-1">
                <Label htmlFor={`keu1-item-jumlah-${index}`}>Jumlah</Label>
                <Input
                  id={`keu1-item-jumlah-${index}`}
                  type="number"
                  min={1}
                  step={1}
                  value={String(row.jumlah ?? "")}
                  onChange={(event) => updateRow(index, { jumlah: event.target.value })}
                  placeholder="1"
                  aria-invalid={rowIssues.some((issue) => issue.field === "jumlah")}
                />
              </div>
              <div className="space-y-2 md:col-span-1">
                <Label htmlFor={`keu1-item-satuan-${index}`}>Satuan</Label>
                <Input
                  id={`keu1-item-satuan-${index}`}
                  value={String(row.satuan ?? "")}
                  onChange={(event) => updateRow(index, { satuan: event.target.value })}
                  placeholder="Bulan / unit"
                  maxLength={80}
                  aria-invalid={rowIssues.some((issue) => issue.field === "satuan")}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`keu1-item-estimasi-${index}`}>Estimasi Harga Satuan</Label>
                <NominalInput
                  value={row.estimasi_harga_satuan}
                  onCommit={(estimasi_harga_satuan) => updateRow(index, { estimasi_harga_satuan })}
                  placeholder="0"
                  ariaLabel={`Estimasi harga satuan item ${index + 1}`}
                  className="h-10 w-full"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`keu1-item-total-${index}`}>Total</Label>
                <Input
                  id={`keu1-item-total-${index}`}
                  value={rowTotal > 0 ? rowTotal.toLocaleString("id-ID") : ""}
                  readOnly
                  aria-label={`Total item ${index + 1}`}
                />
              </div>
            </div>
            <div className="mt-4 flex min-h-9 flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-destructive" role="status">{rowIssues[0]?.message || ""}</p>
              <Button type="button" variant="ghost" size="sm" className="self-end text-destructive hover:text-destructive" onClick={() => removeRow(index)}>
                <Trash2 className="mr-2 h-4 w-4" /> Hapus item
              </Button>
            </div>
          </fieldset>
        );
      })}

      <Button type="button" variant="outline" className="min-h-11 w-full border-dashed" onClick={() => onChange([...rows, createKeu1SubmissionItem()])}>
        <Plus className="mr-2 h-4 w-4" /> Tambah item
      </Button>

      <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="keu1-free-cash">Free Cash Sisa Bulan Lalu</Label>
          <NominalInput
            value={freeCashValue}
            onCommit={onFreeCashChange}
            placeholder="Kosongkan jika tidak ada"
            ariaLabel="Free Cash Sisa Bulan Lalu"
            className="h-11 w-full"
          />
        </div>
        <div className="border-l-2 border-primary/40 pl-4">
          <p className="text-xs text-muted-foreground">Kebutuhan Dana</p>
          <p className="text-base font-semibold tabular-nums text-foreground">{formatRupiahZero(financial.kebutuhanDana)}</p>
        </div>
      </div>
    </section>
  );
}
