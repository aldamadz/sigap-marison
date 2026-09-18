import React from "react";
import { NonUnitRequestEditor } from "@/components/surat/NonUnitRequestEditor";
import { normalizeTableRows } from "@/components/surat/form/surat-form-schema";
import type { NonUnitRequestRow } from "@/components/surat/non-unit-request";
import type { UsageModuleContext } from "../usage-contract";
import { useNonUnitItemOptions } from "./use-non-unit-item-options";

/** Slot editor pekerjaan Non Unit — dipakai pra-nomor (context) & pasca-nomor (override). */
export function NonUnitItemsField({ ctx }: { ctx: UsageModuleContext }) {
  const { input, marisonProject, setInputValue } = ctx;
  const { options, loading, error, reload } = useNonUnitItemOptions(ctx);

  const rows = normalizeTableRows(input.items) as NonUnitRequestRow[];

  return (
    <div className="space-y-3">
      <NonUnitRequestEditor
        rows={rows}
        options={options}
        loading={loading}
        error={error}
        projectReady={marisonProject?.ready ?? false}
        projectName={marisonProject?.projectName || ""}
        onChange={(next) => setInputValue("items", next)}
        onRetry={reload}
      />
      {(marisonProject?.unavailableCount ?? 0) > 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          {marisonProject?.unavailableCount} proyek belum tersedia karena mapping Marison (atau mapping staging trial) belum lengkap.
        </p>
      )}
    </div>
  );
}
