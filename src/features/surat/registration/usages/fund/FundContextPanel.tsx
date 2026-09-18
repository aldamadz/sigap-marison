import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UsageModuleContext } from "../usage-contract";

export function FundContextPanel({ ctx }: { ctx: UsageModuleContext }) {
  const { input, generatedNoSurat, setInputValue } = ctx;
  const fundType = String(input.fund_type || "");

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4 md:p-5">
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
  );
}
