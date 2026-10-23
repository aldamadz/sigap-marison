import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PGD_ITEM_STATUSES } from "@/components/surat/pgd-item-status";
import { NominalInput } from "@/components/surat/NominalInput";
import { formatRupiahZero } from "@/lib/rupiah";
import {
  createFundSubmissionItem,
  getFundSubmissionAmount,
  normalizeFundSubmissionItems,
  validateFundSubmissionItems,
  type FundSubmissionItem,
} from "@/components/surat/fund-submission";

type Props = {
  value: unknown;
  onChange: (items: FundSubmissionItem[]) => void;
};

export function FundSubmissionEditor({ value, onChange }: Props) {
  const normalized = normalizeFundSubmissionItems(value);
  const blankRow = useMemo(createFundSubmissionItem, []);
  const rows = normalized.length > 0 ? normalized : [blankRow];
  const issues = validateFundSubmissionItems(rows);
  const total = getFundSubmissionAmount(rows);

  const updateRow = (index: number, patch: Partial<FundSubmissionItem>) => {
    onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const removeRow = (index: number) => {
    const next = rows.filter((_, rowIndex) => rowIndex !== index);
    onChange(next.length > 0 ? next : [createFundSubmissionItem()]);
  };

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)] md:p-5">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Rincian Fund Submission</h4>
          <p className="mt-1 text-xs text-muted-foreground">Isi seluruh rincian. Total pengajuan dihitung otomatis dari nominal tiap item.</p>
        </div>
        <div className="rounded-md border border-border bg-muted/30 px-4 py-2 text-right">
          <p className="text-[11px] font-medium text-muted-foreground">Total pengajuan</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">{formatRupiahZero(total)}</p>
        </div>
      </div>

      {rows.map((row, index) => {
        const rowIssues = issues.filter((issue) => issue.index === index);
        return (
          <fieldset key={row.id || index} className="min-w-0 rounded-md border border-border bg-background p-4">
            <legend className="px-2 text-xs font-semibold text-muted-foreground">Item {index + 1}</legend>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`fund-item-name-${index}`}>Nama barang/jasa</Label>
                <Input
                  id={`fund-item-name-${index}`}
                  value={String(row.nama_barang ?? "")}
                  onChange={(event) => updateRow(index, { nama_barang: event.target.value })}
                  placeholder="Contoh: Sewa alat operasional"
                  maxLength={240}
                  aria-invalid={rowIssues.some((issue) => issue.field === "nama_barang")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`fund-item-quantity-${index}`}>Jumlah</Label>
                <Input
                  id={`fund-item-quantity-${index}`}
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={String(row.jumlah ?? "")}
                  onChange={(event) => updateRow(index, { jumlah: event.target.value })}
                  placeholder="1"
                  aria-invalid={rowIssues.some((issue) => issue.field === "jumlah")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`fund-item-unit-${index}`}>Satuan</Label>
                <Input
                  id={`fund-item-unit-${index}`}
                  value={String(row.satuan ?? "")}
                  onChange={(event) => updateRow(index, { satuan: event.target.value })}
                  placeholder="Unit / paket / bulan"
                  maxLength={80}
                  aria-invalid={rowIssues.some((issue) => issue.field === "satuan")}
                />
              </div>
              <div className="space-y-2 md:col-span-2 xl:col-span-4">
                <Label htmlFor={`fund-item-nominal-${index}`}>Nominal item</Label>
                <div className="max-w-md">
                  <NominalInput
                    value={row.nominal}
                    onCommit={(nominal) => updateRow(index, { nominal })}
                    placeholder="0"
                    ariaLabel={`Nominal item ${index + 1}`}
                    className="h-10 w-full"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`fund-item-status-${index}`}>Status <span aria-hidden="true">*</span></Label>
                <Select value={row.status || ""} onValueChange={(status) => updateRow(index, { status })}>
                  <SelectTrigger id={`fund-item-status-${index}`} className="min-h-11" aria-invalid={rowIssues.some((issue) => issue.field === "status")}>
                    <SelectValue placeholder="Pilih status" />
                  </SelectTrigger>
                  <SelectContent>
                    {PGD_ITEM_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">1 = H+1, 2 = H+3, 3 = H+7, 4 = H+10</p>
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

      <Button type="button" variant="outline" className="min-h-11 w-full border-dashed" onClick={() => onChange([...rows, createFundSubmissionItem()])}>
        <Plus className="mr-2 h-4 w-4" /> Tambah item
      </Button>
    </section>
  );
}
