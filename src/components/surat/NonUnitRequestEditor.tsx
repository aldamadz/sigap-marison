import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Loader2, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  formatNonUnitCurrency,
  formatNonUnitMoneyInput,
  getNonUnitRowOption,
  getNonUnitTotal,
  parseNonUnitMoney,
  selectNonUnitType,
  updateNonUnitRow,
  validateNonUnitRows,
  type NonUnitExternalOption,
  type NonUnitRequestRow,
} from "@/components/surat/non-unit-request";

type Props = {
  rows: NonUnitRequestRow[];
  options: NonUnitExternalOption[];
  loading: boolean;
  error?: string | null;
  projectReady: boolean;
  projectName?: string;
  onChange: (rows: NonUnitRequestRow[]) => void;
  onRetry: () => void;
};

export function NonUnitRequestEditor({
  rows,
  options,
  loading,
  error,
  projectReady,
  projectName,
  onChange,
  onRetry,
}: Props) {
  const [openRow, setOpenRow] = useState<number | null>(null);
  const normalizedRows = rows.length > 0 ? rows : [{}];
  const validation = useMemo(() => validateNonUnitRows(normalizedRows), [normalizedRows]);
  const total = getNonUnitTotal(normalizedRows);

  const updateRow = (index: number, patch: Partial<NonUnitRequestRow>) => {
    onChange(normalizedRows.map((row, rowIndex) =>
      rowIndex === index ? updateNonUnitRow(row, patch) : row
    ));
  };

  const removeRow = (index: number) => {
    const next = normalizedRows.filter((_, rowIndex) => rowIndex !== index);
    onChange(next.length > 0 ? next : [{}]);
  };

  return (
    <div className="space-y-4">
      {!projectReady ? (
        <div className="flex gap-3 rounded-md border border-amber-500/30 bg-amber-500/[0.07] p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <div>
            <p className="font-semibold text-foreground">Proyek belum terhubung ke Marison</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Pilih proyek yang siap terhubung ke Marison (ID Marison lengkap atau pemetaan manual). Jika belum, admin perlu melengkapinya di Master Proyek.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-4 py-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Proyek</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{projectName || "-"}</p>
          </div>
          <p className="text-sm font-semibold tabular-nums text-foreground">{formatNonUnitCurrency(total)}</p>
        </div>
      )}

      {error && projectReady && (
        <div className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-destructive">Jenis pekerjaan gagal dimuat</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Coba lagi
          </Button>
        </div>
      )}

      {normalizedRows.map((row, index) => {
        const selected = getNonUnitRowOption(row);
        const rowErrors = validation.filter((item) => item.index === index);
        return (
          <fieldset key={index} className="min-w-0 rounded-md border border-border bg-background p-4 sm:p-5">
            <legend className="px-2 text-xs font-semibold text-muted-foreground">Pekerjaan {index + 1}</legend>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2 lg:col-span-2">
                <Label>Jenis pekerjaan <span aria-hidden="true">*</span></Label>
                <Popover open={openRow === index} onOpenChange={(open) => setOpenRow(open ? index : null)}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!projectReady || loading}
                      className="h-auto min-h-11 w-full justify-between px-3 py-2 text-left font-normal"
                      aria-invalid={rowErrors.some((item) => item.field === "non_unit_id")}
                    >
                      <span className="min-w-0">
                        {loading ? (
                          <span className="inline-flex items-center text-muted-foreground">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat jenis pekerjaan
                          </span>
                        ) : selected ? (
                          <>
                            <span className="block truncate text-sm font-medium text-foreground">
                              {String(selected.raw?.code || "").trim() ? `${selected.raw?.code} - ` : ""}{selected.label}
                            </span>
                            {String(selected.raw?.description || "").trim() && (
                              <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                                {String(selected.raw?.description)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Pilih jenis pekerjaan Non Unit</span>
                        )}
                      </span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" collisionPadding={12}>
                    <Command>
                      <CommandInput placeholder="Cari kode atau jenis pekerjaan..." />
                      <CommandList className="max-h-72">
                        <CommandEmpty>Jenis pekerjaan tidak ditemukan.</CommandEmpty>
                        <CommandGroup>
                          {options.map((option) => {
                            const checked = selected?.value === option.value;
                            return (
                              <CommandItem
                                key={option.value}
                                value={`${option.raw?.code || ""} ${option.label}`}
                                onSelect={() => {
                                  onChange(normalizedRows.map((candidate, rowIndex) =>
                                    rowIndex === index ? selectNonUnitType(candidate, option) : candidate
                                  ));
                                  setOpenRow(null);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium">
                                    {String(option.raw?.code || "").trim() ? `${option.raw?.code} - ` : ""}{option.label}
                                  </span>
                                  {String(option.raw?.description || "").trim() && (
                                    <span className="block truncate text-xs text-muted-foreground">{String(option.raw?.description)}</span>
                                  )}
                                </span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selected?.raw?.has_submitted === true && (
                  <p className="text-xs text-muted-foreground">Jenis pekerjaan ini pernah diajukan pada proyek yang sama.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`non-unit-name-${index}`}>Nama pekerjaan <span aria-hidden="true">*</span></Label>
                <Input
                  id={`non-unit-name-${index}`}
                  value={String(row.item_name ?? row.nama_barang ?? "")}
                  onChange={(event) => updateRow(index, { item_name: event.target.value })}
                  placeholder="Contoh: Pembangunan saluran blok A"
                  maxLength={240}
                  aria-invalid={rowErrors.some((item) => item.field === "item_name")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`non-unit-subtotal-${index}`}>Nilai pengajuan <span aria-hidden="true">*</span></Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">Rp</span>
                  <Input
                    id={`non-unit-subtotal-${index}`}
                    inputMode="numeric"
                    value={formatNonUnitMoneyInput(row.subtotal)}
                    onChange={(event) => updateRow(index, { subtotal: parseNonUnitMoney(event.target.value) })}
                    className="pl-10 text-right tabular-nums"
                    placeholder="0"
                    aria-invalid={rowErrors.some((item) => item.field === "subtotal")}
                  />
                </div>
              </div>

              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor={`non-unit-notes-${index}`}>Catatan perencanaan <span className="font-normal text-muted-foreground">(opsional)</span></Label>
                <Textarea
                  id={`non-unit-notes-${index}`}
                  value={String(row.planning_notes ?? "")}
                  onChange={(event) => updateRow(index, { planning_notes: event.target.value })}
                  placeholder="Ruang lingkup, lokasi pekerjaan, atau informasi teknis yang perlu diketahui."
                  className="min-h-24 resize-y"
                  maxLength={1000}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-h-5 text-xs text-destructive" role="status">
                {rowErrors[0]?.message || ""}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-end text-destructive hover:text-destructive"
                onClick={() => removeRow(index)}
                disabled={normalizedRows.length === 1 && !String(row.item_name || "").trim()}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Hapus pekerjaan
              </Button>
            </div>
          </fieldset>
        );
      })}

      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full border-dashed"
        onClick={() => onChange([...normalizedRows, {}])}
        disabled={!projectReady}
      >
        <Plus className="mr-2 h-4 w-4" /> Tambah pekerjaan
      </Button>
    </div>
  );
}
