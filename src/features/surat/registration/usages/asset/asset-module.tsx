import React from "react";
import { RecommendationMultiDetailEditor } from "@/components/surat/RecommendationMultiDetailEditor";
import { recommendationMultiDetailErrors } from "@/features/surat/registration/lib/recommendation-multi-detail-builder";
import { MasterRecord } from "@/components/surat/form/surat-form-types";
import type {
  UsageModule,
  UsageModuleContext,
  CleanupResult,
  NumberContextIssue,
  SubmitIssue,
  TemplateField,
} from "../usage-contract";
import type { FormInputData } from "@/components/surat/form/surat-form-types";
import { registerUsageModule } from "../usage-registry";
import { AssetContextPanel } from "./AssetContextPanel";
import {
  ASSET_RECOMMENDATION_NEED_NOTE,
  ASSET_RECOMMENDATION_SKIP_NOTE,
  ASSET_RECOMMENDATION_TEMPLATE_NAME,
  isRecommendationChoiceAllowed,
} from "./recommendation-eligibility";

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
    requiresMasterProjectMapping: false,
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
  isFieldComplete(field: TemplateField, ctx: UsageModuleContext): boolean | null {
    if (field.key !== "recommendation_items") return null;
    const model = ctx.recommendationIO?.model;
    if (model) {
      return model.items.length > 0 && recommendationMultiDetailErrors(model).length === 0;
    }
    return null;
  },
  validateSubmit(): SubmitIssue[] {
    return [];
  },
  reconcileInputForContext(input: FormInputData, ctx: UsageModuleContext): FormInputData {
    const next = { ...input };
    const departmentId = ctx.formData.dept_id || ctx.requesterDepartmentId;
    const department = ctx.master.depts.find((dept: MasterRecord) => dept.id === departmentId) ?? null;
    const allowed = isRecommendationChoiceAllowed(department, ctx.linkedDocumentContext?.type ?? null);
    if (!allowed) {
      delete next.requires_recommendation;
      delete next.recommendation_template_name;
      delete next.recommendation_attachment_note;
      return next;
    }
    if (typeof next.requires_recommendation !== "boolean") {
      next.requires_recommendation = false;
    }
    next.recommendation_template_name = ASSET_RECOMMENDATION_TEMPLATE_NAME;
    next.recommendation_attachment_note =
      next.requires_recommendation === true ? ASSET_RECOMMENDATION_NEED_NOTE : ASSET_RECOMMENDATION_SKIP_NOTE;
    return next;
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
