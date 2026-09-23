import React from "react";
import type { UsageModuleContext } from "../usage-contract";
import { NonUnitItemsField } from "./NonUnitItemsField";

/** Konteks pekerjaan Non Unit (Section 1, pra-nomor). */
export function NonUnitContextPanel({ ctx }: { ctx: UsageModuleContext }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4 md:p-5">
      <p className="text-sm font-semibold text-foreground">Pekerjaan Non Unit</p>
      <p className="text-xs text-muted-foreground">
        Pilih jenis pekerjaan setelah proyek tujuan siap terhubung ke Marison.
      </p>
      <NonUnitItemsField ctx={ctx} />
    </div>
  );
}
