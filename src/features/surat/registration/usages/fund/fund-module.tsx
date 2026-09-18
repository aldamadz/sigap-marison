import React from "react";
import type { UsageModule, UsageModuleContext, CleanupResult } from "../usage-contract";
import { registerUsageModule } from "../usage-registry";
import { FundContextPanel } from "./FundContextPanel";

export const fundModule: UsageModule = {
  meta: {
    key: "non_asset",
    label: "Pengajuan Dana",
    description: "Kebutuhan dana operasional atau non-aset",
    category: "non_asset",
  },
  requirements: {
    requiresProject: true, // Except when fundWithoutProject is checked
    allowsFundWithoutProject: true,
    requiresUnitAllocation: false,
    requiresRecommendationChoice: false,
    allowsLinkedRecommendation: false,
  },
  renderContextPanel(ctx) {
    return <FundContextPanel ctx={ctx} />;
  },
  hiddenFieldKeys(ctx) {
    return ["items", "fund_amount"]; // Handled by FundSubmissionEditor
  },
  cleanup(ctx, reason): CleanupResult {
    return {
      inputKeysToDelete: ["fund_type", "fund_amount", "fund_without_project"],
      resetSelection: ["fundWithoutProject"],
    };
  },
  normalizeInput(input, ctx) {
    const next = { ...input };
    next.request_mode = "barang";
    return next;
  },
};

registerUsageModule(fundModule);
