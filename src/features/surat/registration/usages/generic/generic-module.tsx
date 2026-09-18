import React from "react";
import type { UsageModule, UsageModuleContext, CleanupResult } from "../usage-contract";
import { registerUsageModule } from "../usage-registry";

export const genericModule: UsageModule = {
  meta: {
    key: "generic",
    label: "Pengajuan Umum",
    description: "Pengajuan tanpa alur spesifik",
    category: null,
  },
  requirements: {
    requiresProject: false,
    allowsFundWithoutProject: false,
    requiresUnitAllocation: false,
    requiresRecommendationChoice: false,
    allowsLinkedRecommendation: false,
  },
  renderContextPanel() {
    return null;
  },
  cleanup(): CleanupResult {
    return {
      inputKeysToDelete: [],
      resetSelection: [],
    };
  },
  normalizeInput(input) {
    return input;
  },
};

registerUsageModule(genericModule);
