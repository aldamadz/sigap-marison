import React from "react";
import { validateNonUnitRows } from "@/components/surat/non-unit-request";
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
import { NonUnitContextPanel } from "./NonUnitContextPanel";
import { NonUnitItemsField } from "./NonUnitItemsField";

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
    requiresMasterProjectMapping: true,
  },
  renderContextPanel(ctx) {
    return <NonUnitContextPanel ctx={ctx} />;
  },
  renderFieldOverride(field, ctx) {
    if (field.key === "items") {
      return <NonUnitItemsField ctx={ctx} />;
    }
    return null;
  },
  hiddenFieldKeys() {
    return ["items"];
  },
  summaryFieldLabels: {
    items: "Daftar Pekerjaan Non Unit",
  },
  isFieldComplete(field: TemplateField, ctx: UsageModuleContext): boolean | null {
    if (field.key !== "items") return null;
    return validateNonUnitRows(ctx.input.items).length === 0;
  },
  validateSubmit(ctx: UsageModuleContext): SubmitIssue[] {
    const first = validateNonUnitRows(ctx.input.items)[0];
    return first ? [{ title: "Data Non Unit Belum Lengkap", description: first.message }] : [];
  },
  reconcileInputForContext(input: FormInputData): FormInputData {
    return input;
  },
  validateNumberContext(ctx): NumberContextIssue[] {
    if (!ctx.formData.project_id) {
      return [{
        title: "Proyek Tujuan Wajib Dipilih",
        description: "Pilih proyek yang sudah terhubung ke Marison untuk melanjutkan pengajuan Non Unit.",
      }];
    }
    if (!(ctx.marisonProject?.ready ?? false)) {
      return [{
        title: "Proyek Belum Terhubung",
        description: "Mapping proyek atau kantor proyek belum lengkap. Minta admin meninjau Master Proyek.",
      }];
    }
    return [];
  },
  cleanup(): CleanupResult {
    return {
      inputKeysToDelete: ["items"],
      resetSelection: [],
    };
  },
  normalizeInput(input) {
    const next = { ...input };
    next.request_mode = "barang";
    return next;
  },
};

registerUsageModule(nonUnitModule);
