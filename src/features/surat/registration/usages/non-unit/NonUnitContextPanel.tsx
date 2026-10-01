import React from "react";
import type { UsageModuleContext } from "../usage-contract";
import { NonUnitItemsField } from "./NonUnitItemsField";

/** Pekerjaan proyek diisi pada tahap berkas setelah nomor dipesan. */
export function NonUnitContextPanel({ ctx }: { ctx: UsageModuleContext }) {
  if (!ctx.generatedNoSurat || !ctx.formData.project_id) return null;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4 md:p-5">
      <p className="text-sm font-semibold text-foreground">Pekerjaan Non Unit</p>
      <p className="text-xs text-muted-foreground">
        Lengkapi pekerjaan untuk proyek tujuan yang telah dipilih.
      </p>
      <NonUnitItemsField ctx={ctx} />
    </div>
  );
}
