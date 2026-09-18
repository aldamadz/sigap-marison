import React from "react";
import { FundSubmissionEditor } from "@/components/surat/FundSubmissionEditor";
import {
  getFundSubmissionAmount,
  normalizeFundSubmissionItems,
  validateFundSubmissionItems,
} from "@/components/surat/fund-submission";
import type {
  UsageModule,
  UsageModuleContext,
  CleanupResult,
  NumberContextIssue,
  SubmitIssue,
  SummaryField,
  TemplateField,
} from "../usage-contract";
import type { FormInputData } from "@/components/surat/form/surat-form-types";
import { formatRupiahZero } from "@/lib/rupiah";
import { registerUsageModule } from "../usage-registry";
import { FundContextPanel } from "./FundContextPanel";

const FUND_TYPES = ["operational", "production_cost"];

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
    requiresMasterProjectMapping: true,
  },
  renderContextPanel(ctx) {
    return <FundContextPanel ctx={ctx} />;
  },
  renderDetailsPanel(ctx) {
    return (
      <FundSubmissionEditor
        value={ctx.input.items}
        onChange={(items) => ctx.setInputValue("items", items)}
      />
    );
  },
  hiddenFieldKeys() {
    return ["items", "fund_amount"];
  },
  isFieldComplete(field: TemplateField, ctx: UsageModuleContext): boolean | null {
    if (field.key !== "items" && field.key !== "fund_amount") return null;
    return validateFundSubmissionItems(ctx.input.items).length === 0;
  },
  validateSubmit(ctx: UsageModuleContext): SubmitIssue[] {
    const first = validateFundSubmissionItems(ctx.input.items)[0];
    return first ? [{ title: "Rincian Dana Belum Lengkap", description: first.message }] : [];
  },
  buildSummaryFields(ctx: UsageModuleContext): SummaryField[] {
    const fundType = String(ctx.input.fund_type || "");
    return [
      {
        key: "fund_type",
        label: "Jenis Pengajuan Dana",
        value: fundType === "production_cost" ? "Biaya Produksi" : "Biaya Operasional",
      },
      {
        key: "fund_amount",
        label: "Total Pengajuan Dana",
        value: formatRupiahZero(getFundSubmissionAmount(ctx.input.items)),
      },
    ];
  },
  reconcileInputForContext(input: FormInputData): FormInputData {
    return input;
  },
  validateNumberContext(ctx): NumberContextIssue[] {
    const fundWithoutProject = ctx.input.fund_without_project === true;
    if (!fundWithoutProject && !ctx.formData.project_id) {
      return [{
        title: "Proyek Tujuan Wajib Dipilih",
        description: "Pilih proyek yang siap Marison atau centang 'Tanpa Proyek (Dana Umum)' untuk pengajuan dana tanpa proyek.",
      }];
    }
    if (!fundWithoutProject && !(ctx.marisonProject?.ready ?? false)) {
      return [{
        title: "Proyek Belum Terhubung",
        description: "Pilih proyek yang memiliki ID proyek dan kantor external yang valid.",
      }];
    }
    if (!FUND_TYPES.includes(String(ctx.input.fund_type || ""))) {
      return [{
        title: "Jenis Pengajuan Dana Wajib Dipilih",
        description: "Pilih Biaya Operasional atau Biaya Produksi.",
      }];
    }
    return [];
  },
  cleanup(): CleanupResult {
    return {
      inputKeysToDelete: ["fund_type", "fund_amount", "fund_without_project"],
      resetSelection: ["fundWithoutProject"],
    };
  },
  normalizeInput(input) {
    const next = { ...input };
    next.request_mode = "barang";
    const fundItems = normalizeFundSubmissionItems(next.items);
    next.items = fundItems;
    next.fund_amount = getFundSubmissionAmount(fundItems);
    return next;
  },
};

registerUsageModule(fundModule);
