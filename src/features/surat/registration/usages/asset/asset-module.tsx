import React from "react";
import type { UsageModule, UsageModuleContext, CleanupResult } from "../usage-contract";
import { registerUsageModule } from "../usage-registry";
import { AssetContextPanel } from "./AssetContextPanel";
import { clearRecommendationInput } from "@/components/surat/form/surat-form-schema";
import { RecommendationMultiDetailEditor } from "@/components/surat/RecommendationMultiDetailEditor";
import { isRecommendationItemsComplete } from "@/components/surat/recommendation-multi-detail";

export const assetModule: UsageModule = {
  meta: {
    key: "asset",
    label: "Pengajuan Aset",
    description: "Barang atau kebutuhan yang dicatat sebagai aset",
    category: "asset",
  },
  requirements: {
    requiresProject: false,
    allowsFundWithoutProject: false,
    requiresUnitAllocation: false,
    requiresRecommendationChoice: true,
    allowsLinkedRecommendation: true,
  },
  renderContextPanel(ctx) {
    return <AssetContextPanel ctx={ctx} />;
  },
  renderFieldOverride(field, ctx) {
    if (field.key === "recommendation_items" && ctx.input.recommendation_multi_detail) {
      // It's handled inside the orchestrator currently since it needs upload handlers,
      // but we can pass those down later. For now we just return null to let orchestrator handle it,
      // or we can migrate the editor here if we decouple upload. 
      // Actually, let's keep it null here and let orchestrator render it via generic table if needed,
      // but the orchestrator has renderRecommendationItemsField. Let's export what orchestrator needs,
      // or just keep it simple.
      return null;
    }
    return null;
  },
  hiddenFieldKeys(ctx) {
    return [];
  },
  cleanup(ctx, reason): CleanupResult {
    const keys = ["requires_recommendation", "recommendation_template_name", "recommendation_attachment_note"];
    return {
      inputKeysToDelete: keys,
      resetSelection: ["recommendationMultiDetail"],
    };
  },
  normalizeInput(input, ctx) {
    const next = { ...input };
    next.request_mode = "barang";
    return next;
  },
};

registerUsageModule(assetModule);
