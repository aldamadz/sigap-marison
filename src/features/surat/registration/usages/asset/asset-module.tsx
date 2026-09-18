import React from "react";
import { RecommendationMultiDetailEditor } from "@/components/surat/RecommendationMultiDetailEditor";
import type { UsageModule, UsageModuleContext, CleanupResult, NumberContextIssue } from "../usage-contract";
import { registerUsageModule } from "../usage-registry";
import { AssetContextPanel } from "./AssetContextPanel";

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
    // Model rekomendasi v1 dirender modul Aset; varian baris legacy
    // tetap memakai render tabel generik orchestrator.
    if (field.key === "recommendation_items" && ctx.recommendationIO?.model) {
      const io = ctx.recommendationIO;
      return (
        <RecommendationMultiDetailEditor
          model={io.model}
          onChange={io.onModelChange}
          users={io.directory.users}
          offices={io.directory.offices}
          departments={io.directory.departments}
          uploadingKey={io.uploadingKey}
          onUpload={(parentId, detailId, files, source) => io.onUpload(parentId, detailId, files, source)}
          onDeleteAttachment={(parentId, detailId, attachment) => io.onDeleteAttachment(parentId, detailId, attachment)}
          onDeleteDetail={(parentId, detail) => io.onDeleteDetail(parentId, detail)}
        />
      );
    }
    return null;
  },
  hiddenFieldKeys() {
    return [];
  },
  validateNumberContext(): NumberContextIssue[] {
    return [];
  },
  cleanup(): CleanupResult {
    const keys = ["requires_recommendation", "recommendation_template_name", "recommendation_attachment_note"];
    return {
      inputKeysToDelete: keys,
      resetSelection: ["recommendationMultiDetail"],
    };
  },
  normalizeInput(input) {
    const next = { ...input };
    next.request_mode = "barang";
    return next;
  },
};

registerUsageModule(assetModule);
