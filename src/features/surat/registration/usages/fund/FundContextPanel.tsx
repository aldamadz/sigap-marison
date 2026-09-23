import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { UsageModuleContext } from "../usage-contract";

/**
 * Konteks Dana (Section 1, pra-nomor): jenis pengajuan + opsi tanpa proyek.
 * Checkbox tampil setelah kantor penerbit terisi (syarat selector proyek).
 */
export function FundContextPanel({ ctx }: { ctx: UsageModuleContext }) {
  const { input, formData, generatedNoSurat, setInputValue, setSelection } = ctx;
  const fundType = String(input.fund_type || "");
  const fundWithoutProject = input.fund_without_project === true;

  const applyWithoutProject = (checked: boolean) => {
    if (checked) {
      setSelection({ project_id: "" });
      setInputValue("fund_without_project", true);
    } else {
      setInputValue("fund_without_project", false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4 md:p-5">
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-foreground">Jenis Pengajuan Dana</Label>
        <p className="text-xs text-muted-foreground">
          Pilihan ini dikirim sebagai tipe Fund Submission ke Marison.
        </p>
        <Select
          disabled={!!generatedNoSurat}
          value={fundType}
          onValueChange={(value) => setInputValue("fund_type", value)}
        >
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Pilih jenis pengajuan dana..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="operational">Biaya Operasional</SelectItem>
            <SelectItem value="production_cost">Biaya Produksi</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {formData.office_id ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-muted bg-muted/40 px-3 py-2.5">
          <Checkbox
            className="mt-0.5"
            checked={fundWithoutProject}
            disabled={!!generatedNoSurat}
            onCheckedChange={(checked) => applyWithoutProject(checked === true)}
          />
          <span className="text-sm">
            <span className="font-medium text-foreground">Tanpa Proyek (Dana Umum)</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Pengajuan dana tidak terikat proyek; dikirim ke Marison tanpa <code>project_id</code>.
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}
