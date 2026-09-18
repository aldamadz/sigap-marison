import React from "react";
import type { UsageModule, UsageModuleContext, CleanupResult } from "../usage-contract";
import { registerUsageModule } from "../usage-registry";
import { NonUnitContextPanel } from "./NonUnitContextPanel";

export const nonUnitModule: UsageModule = {
  meta: {
    key: "non_unit",
    label: "Pengajuan Non Unit",
    description: "Pekerjaan proyek tanpa alokasi unit",
    category: "non_unit",
  },
  requirements: {
    requiresProject: true,
    allowsFundWithoutProject: false,
    requiresUnitAllocation: false,
    requiresRecommendationChoice: false,
    allowsLinkedRecommendation: false,
  },
  renderContextPanel(ctx) {
    return <NonUnitContextPanel ctx={ctx} />;
  },
  hiddenFieldKeys(ctx) {
    return ["items"]; // Handled by NonUnitRequestEditor internally
  },
  cleanup(ctx, reason): CleanupResult {
    return {
      inputKeysToDelete: ["items"],
      resetSelection: [],
    };
  },
  normalizeInput(input, ctx) {
    const next = { ...input };
    next.request_mode = "barang";
    return next;
  },
};

registerUsageModule(nonUnitModule);
