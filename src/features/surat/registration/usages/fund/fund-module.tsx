import React from "react";
import { FundSubmissionEditor } from "@/components/surat/FundSubmissionEditor";
import { Keu1SubmissionEditor } from "@/components/surat/Keu1SubmissionEditor";
import {
  getFundSubmissionAmount,
  normalizeFundSubmissionItems,
  validateFundSubmissionItems,
} from "@/components/surat/fund-submission";
import {
  getKeu1FinancialSummary,
  normalizeKeu1SubmissionItems,
  validateKeu1SubmissionItems,
} from "@/components/surat/keu1-submission";
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
import { isKeu1Form } from "../../lib/keu1-form";

const FUND_TYPES = ["operational", "production_cost"];

const isKeu1Usage = (ctx: UsageModuleContext): boolean => {
  return isKeu1Form(ctx.usage.master_forms);
};

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
  requiresMasterProjectMappingForUsage(usage) {
    return !isKeu1Form(usage.master_forms);
  },
  usesProjectForUsage(usage) {
    return !isKeu1Form(usage.master_forms);
  },
  renderContextPanel(ctx) {
    return isKeu1Usage(ctx) ? null : <FundContextPanel ctx={ctx} />;
  },
  renderDetailsPanel(ctx) {
    if (isKeu1Usage(ctx)) {
      return (
        <Keu1SubmissionEditor
          value={ctx.input.items}
          freeCashValue={ctx.input.free_cash_sisa_bulan_lalu}
          onChange={(items) => ctx.setInputValue("items", items)}
          onFreeCashChange={(value) => ctx.setInputValue("free_cash_sisa_bulan_lalu", value)}
        />
      );
    }
    return (
      <FundSubmissionEditor
        value={ctx.input.items}
        onChange={(items) => ctx.setInputValue("items", items)}
      />
    );
  },
  hiddenFieldKeys() {
    return ["items", "fund_amount", "fund_type", "fund_without_project", "free_cash_sisa_bulan_lalu"];
  },
  isFieldComplete(field: TemplateField, ctx: UsageModuleContext): boolean | null {
    if (field.key !== "items" && field.key !== "fund_amount") return null;
    if (isKeu1Usage(ctx)) {
      return validateKeu1SubmissionItems(ctx.input.items).length === 0;
    }
    return validateFundSubmissionItems(ctx.input.items).length === 0;
  },
  validateSubmit(ctx: UsageModuleContext): SubmitIssue[] {
    if (isKeu1Usage(ctx)) {
      const first = validateKeu1SubmissionItems(ctx.input.items)[0];
      if (first) return [{ title: "Rincian Kas Kecil Belum Lengkap", description: first.message }];
      const financial = getKeu1FinancialSummary(ctx.input.items, ctx.input.free_cash_sisa_bulan_lalu);
      return financial.hasFreeCash && financial.freeCash === null
        ? [{ title: "Free Cash Tidak Valid", description: "Isi nominal Free Cash dengan angka Rupiah atau kosongkan." }]
        : [];
    }
    const first = validateFundSubmissionItems(ctx.input.items)[0];
    return first ? [{ title: "Rincian Dana Belum Lengkap", description: first.message }] : [];
  },
  buildSummaryFields(ctx: UsageModuleContext): SummaryField[] {
    if (isKeu1Usage(ctx)) {
      const financial = getKeu1FinancialSummary(ctx.input.items, ctx.input.free_cash_sisa_bulan_lalu);
      return [
        { key: "items", label: "Rincian Pengajuan Kas Kecil", value: ctx.input.items },
        {
          key: "keu1_grand_total",
          label: "Grand Total",
          value: formatRupiahZero(financial.grandTotal),
        },
        ...(financial.hasFreeCash ? [{ key: "free_cash_sisa_bulan_lalu", label: "Free Cash Sisa Bulan Lalu", value: formatRupiahZero(financial.freeCash) }] : []),
        { key: "fund_amount", label: "Kebutuhan Dana", value: formatRupiahZero(financial.kebutuhanDana) },
      ];
    }
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
    if (isKeu1Usage(ctx)) return [];
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
      inputKeysToDelete: ["fund_type", "fund_amount", "fund_without_project", "free_cash_sisa_bulan_lalu"],
      resetSelection: ["fundWithoutProject"],
    };
  },
  normalizeInput(input, ctx) {
    const next = { ...input };
    next.request_category = "non_asset";
    next.request_mode = "barang";
    delete next.is_aset;
    if (isKeu1Usage(ctx)) {
      const keu1Items = normalizeKeu1SubmissionItems(next.items).map((item) => {
        const quantity = Number(item.jumlah) || 0;
        const unitPrice = Number(item.estimasi_harga_satuan) || 0;
        return { ...item, total: quantity * unitPrice };
      });
      next.items = keu1Items;
      const financial = getKeu1FinancialSummary(keu1Items, next.free_cash_sisa_bulan_lalu);
      if (financial.hasFreeCash && financial.freeCash !== null) next.free_cash_sisa_bulan_lalu = financial.freeCash;
      else delete next.free_cash_sisa_bulan_lalu;
      next.fund_amount = financial.kebutuhanDana;
      next.fund_type = "operational";
      next.fund_without_project = true;
    } else {
      const fundItems = normalizeFundSubmissionItems(next.items);
      next.items = fundItems;
      next.fund_amount = getFundSubmissionAmount(fundItems);
    }
    return next;
  },
};

registerUsageModule(fundModule);
