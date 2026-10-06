import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NominalInput } from "@/components/surat/NominalInput";
import { formatRupiahZero } from "@/lib/rupiah";
import {
  createKeu10SubmissionItem,
  getKeu10ItemTotal,
  getKeu10SubmissionAmount,
  normalizeKeu10SubmissionItems,
  validateKeu10SubmissionItems,
  type Keu10SubmissionItem,
} from "@/features/surat/registration/lib/keu10-form";

type Props = {
  value: unknown;
  onChange: (items: Keu10SubmissionItem[]) => void;
};

export function Keu10SubmissionEditor({ value, onChange }: Props) {
  const normalized = normalizeKeu10SubmissionItems(value);
  const blankRow = useMemo(createKeu10SubmissionItem, []);
  const rows = normalized.length > 0 ? normalized : [blankRow];
  const issues = validateKeu10SubmissionItems(rows);

  const updateRow = (index: number, patch: Partial<Keu10SubmissionItem>) => {
    onChange(normalizeKeu10SubmissionItems(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row)));
  };
  const removeRow = (index: number) => {
    const next = rows.filter((_, rowIndex) => rowIndex !== index);
    onChange(next.length > 0 ? next : [createKeu10SubmissionItem()]);
  };

  return (
    <section className="min-w-0 space-y-4" aria-label="Rincian Pengajuan Dana KEU 10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <h4 className="text-sm font-semibold text-foreground">Rincian Pengajuan Dana</h4>
        <div className="min-w-0 text-right">
          <p className="text-xs text-muted-foreground">Grand Total</p>
          <p className="break-words text-sm font-semibold tabular-nums">{formatRupiahZero(getKeu10SubmissionAmount(rows))}</p>
        </div>
      </div>
      {rows.map((row, index) => {
        const rowIssues = issues.filter((issue) => issue.index === index);
        const errorId = `keu10-item-error-${index}`;
        return (
          <fieldset key={row.id || index} className="min-w-0 border-b border-border pb-4">
            <legend className="mb-3 text-xs font-semibold text-muted-foreground">Item {index + 1}</legend>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <div className="min-w-0 space-y-2 sm:col-span-2 lg:col-span-6">
                <Label htmlFor={`keu10-keterangan-${index}`}>Keterangan</Label>
                <Input id={`keu10-keterangan-${index}`} value={row.keterangan ?? ""} maxLength={240} required
                  aria-invalid={rowIssues.some((issue) => issue.field === "keterangan")} aria-describedby={errorId}
                  onChange={(event) => updateRow(index, { keterangan: event.target.value })} />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor={`keu10-jumlah-${index}`}>Jumlah</Label>
                <Input id={`keu10-jumlah-${index}`} type="number" min={1} step={1} required value={row.jumlah ?? ""}
                  aria-invalid={rowIssues.some((issue) => issue.field === "jumlah")} aria-describedby={errorId}
                  onChange={(event) => updateRow(index, { jumlah: event.target.value })} />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor={`keu10-satuan-${index}`}>Satuan</Label>
                <Input id={`keu10-satuan-${index}`} value={row.satuan ?? ""} maxLength={80} required
                  aria-invalid={rowIssues.some((issue) => issue.field === "satuan")} aria-describedby={errorId}
                  onChange={(event) => updateRow(index, { satuan: event.target.value })} />
              </div>
              <div className="min-w-0 space-y-2 lg:col-span-2">
                <Label>Estimasi Harga Satuan</Label>
                <NominalInput value={row.estimasi_harga_satuan} ariaLabel={`Estimasi harga satuan item ${index + 1}`}
                  onCommit={(estimasi_harga_satuan) => updateRow(index, { estimasi_harga_satuan })} className="h-10 w-full" />
              </div>
              <div className="min-w-0 space-y-2 lg:col-span-2">
                <Label htmlFor={`keu10-total-${index}`}>Total</Label>
                <Input id={`keu10-total-${index}`} value={formatRupiahZero(getKeu10ItemTotal(row))} readOnly aria-label={`Total item ${index + 1}`} />
              </div>
            </div>
            <div className="mt-3 flex min-h-10 items-center justify-between gap-3">
              <p id={errorId} className="text-xs text-destructive" role="status">{rowIssues[0]?.message || ""}</p>
              <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive"
                aria-label={`Hapus item ${index + 1}`} title={`Hapus item ${index + 1}`} onClick={() => removeRow(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </fieldset>
        );
      })}
      <Button type="button" variant="outline" className="min-h-11 w-full border-dashed"
        onClick={() => onChange([...rows, createKeu10SubmissionItem()])}>
        <Plus className="mr-2 h-4 w-4" /> Tambah item
      </Button>
    </section>
  );
}
