import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { UsageModuleContext } from "../usage-contract";
import { FUND_SUBMISSION_TYPES, isFundSubmissionType } from "./fund-types";

/**
 * Konteks Dana (Section 1, pra-nomor): jenis pengajuan + opsi tanpa proyek.
 * Checkbox tampil setelah kantor penerbit terisi (syarat selector proyek).
 */
export function FundContextPanel({ ctx, allowsWithoutProject = true }: { ctx: UsageModuleContext; allowsWithoutProject?: boolean }) {
  const { input, formData, generatedNoSurat, setInputValue, setSelection } = ctx;
  const fundType = isFundSubmissionType(input.fund_type) ? input.fund_type : "";
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
        <Label htmlFor="fund-submission-type" className="text-sm font-semibold text-foreground">Jenis Pengajuan Dana</Label>
        <Select
          disabled={!!generatedNoSurat}
          value={fundType}
          onValueChange={(value) => setInputValue("fund_type", value)}
        >
          <SelectTrigger id="fund-submission-type" className="h-11" aria-required aria-invalid={!fundType}>
            <SelectValue placeholder="Pilih jenis pengajuan dana..." />
          </SelectTrigger>
          <SelectContent>
            {FUND_SUBMISSION_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {allowsWithoutProject && formData.office_id ? (
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
