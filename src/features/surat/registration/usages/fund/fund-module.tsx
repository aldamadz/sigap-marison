import React from "react";
import { FundSubmissionEditor } from "@/components/surat/FundSubmissionEditor";
import {
  getFundSubmissionAmount,
  normalizeFundSubmissionItems,
} from "@/components/surat/fund-submission";
import type { UsageModule, UsageModuleContext, CleanupResult, NumberContextIssue } from "../usage-contract";
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
