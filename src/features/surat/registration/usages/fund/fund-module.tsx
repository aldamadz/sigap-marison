import React from "react";
import { FundSubmissionEditor } from "@/components/surat/FundSubmissionEditor";
import { Keu1SubmissionEditor } from "@/components/surat/Keu1SubmissionEditor";
import { Keu10SubmissionEditor } from "@/components/surat/Keu10SubmissionEditor";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { REQUESTER_HAS_RAB_KEY, usesRequesterRabChoice } from "@/lib/fund-rab";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { getKeu10SubmissionAmount, isKeu10Form, normalizeKeu10SubmissionItems, validateKeu10SubmissionItems } from "../../lib/keu10-form";
import { normalizeKeu10Config } from "../../lib/keu10-config";
import { getFundSubmissionTypeLabel, isFundSubmissionType, usesFundSubmissionType } from "./fund-types";

const getFundTypeIssues = (value: unknown): NumberContextIssue[] => isFundSubmissionType(value) ? [] : [{
  title: "Jenis Pengajuan Dana Wajib Dipilih",
  description: "Pilih Biaya Operasional, Biaya Produksi, atau Biaya Marketing.",
}];

const isKeu1Usage = (ctx: UsageModuleContext): boolean => {
  return isKeu1Form(ctx.usage.master_forms);
};

const getKeu10NumberContextIssues = (ctx: UsageModuleContext): NumberContextIssue[] => {
  if (!ctx.formData.office_id || ctx.isPusatSelected) {
    return [{ title: "Cabang Wajib Dipilih", description: "Pilih cabang tujuan pengajuan dana." }];
  }
  if (!ctx.formData.project_id) {
    return [{ title: "Proyek Tujuan Wajib Dipilih", description: "Pilih proyek tujuan pengajuan dana." }];
  }
  return ctx.marisonProject?.ready ? [] : [{ title: "Proyek Belum Terhubung", description: "Pilih proyek yang siap digunakan." }];
};

function Keu10PurposeSelect({ ctx }: { ctx: UsageModuleContext }) {
  const config = normalizeKeu10Config(ctx.usage.keu10_config);
  const code = typeof ctx.input.keu10_purpose_code === "string" ? ctx.input.keu10_purpose_code : "";
  const valid = Boolean(config?.purposes.some((purpose) => purpose.code === code));
  return (
    <div className="mb-5 min-w-0 space-y-2">
      <Label htmlFor="keu10-purpose">Tujuan Pengajuan</Label>
      <Select value={valid ? code : ""} onValueChange={(value) => ctx.setInputValue("keu10_purpose_code", value)} disabled={!config}>
        <SelectTrigger id="keu10-purpose" className="h-auto min-h-11 w-full text-left [&>span]:whitespace-normal [&>span]:break-words" aria-required aria-invalid={!valid} aria-describedby="keu10-purpose-error">
          <SelectValue placeholder="Pilih tujuan pengajuan" />
        </SelectTrigger>
        <SelectContent>{config?.purposes.map((purpose) => <SelectItem key={purpose.code} value={purpose.code} className="whitespace-normal break-words">{purpose.label}</SelectItem>)}</SelectContent>
      </Select>
      <p id="keu10-purpose-error" className="text-xs text-destructive" role="status">
        {!config ? "Konfigurasi tujuan pengajuan belum tersedia. Hubungi administrator." : !valid ? "Tujuan pengajuan wajib dipilih." : ""}
      </p>
    </div>
  );
}

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
    return !isKeu1Form(usage.master_forms) || usage.scope_type === "cabang";
  },
  usesProjectForUsage(usage) {
    return !isKeu1Form(usage.master_forms) || usage.scope_type === "cabang";
  },
  allowsOptionalProjectForUsage(usage) {
    return isKeu1Form(usage.master_forms) && usage.scope_type === "cabang";
  },
  renderContextPanel(ctx) {
    return usesFundSubmissionType(ctx.usage.master_forms, ctx.category) ? <FundContextPanel ctx={ctx} /> : null;
  },
  renderDetailsPanel(ctx) {
    if (isKeu10Form(ctx.usage.master_forms)) {
      return <><Keu10PurposeSelect ctx={ctx} /><Keu10SubmissionEditor value={ctx.input.items} onChange={(items) => ctx.setInputValue("items", items)} /></>;
    }
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
      <>
        {usesRequesterRabChoice(ctx.usage, ctx.category) && (
          <div className="mb-4 space-y-1">
            <div className="flex min-h-11 items-center gap-3">
              <Checkbox id="requester-has-rab" checked={ctx.input[REQUESTER_HAS_RAB_KEY] === true}
                onCheckedChange={checked => ctx.setInputValue(REQUESTER_HAS_RAB_KEY, checked === true)} />
              <Label htmlFor="requester-has-rab" className="flex min-h-11 items-center">Ada RAB</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              {ctx.input[REQUESTER_HAS_RAB_KEY] === true
                ? "Lampirkan RAB pada bagian Lampiran. Tim pemeriksa tidak perlu melampirkan RAB lagi."
                : "RAB akan dilengkapi oleh tim pemeriksa Perencanaan."}
            </p>
          </div>
        )}
        <FundSubmissionEditor
          value={ctx.input.items}
          onChange={(items) => ctx.setInputValue("items", items)}
        />
      </>
    );
  },
  hiddenFieldKeys(ctx) {
    return ["items", "fund_amount", "fund_type", "fund_without_project", "free_cash_sisa_bulan_lalu", REQUESTER_HAS_RAB_KEY,
      ...(isKeu10Form(ctx.usage.master_forms) ? ["total", "grand_total", "keu10_grand_total", "keu1_grand_total", "keu10_purpose_code"] : []),
    ];
  },
  isFieldComplete(field: TemplateField, ctx: UsageModuleContext): boolean | null {
    if (field.key === "fund_type") return !usesFundSubmissionType(ctx.usage.master_forms, ctx.category) || isFundSubmissionType(ctx.input.fund_type);
    if (isKeu10Form(ctx.usage.master_forms) && field.key === "keu10_purpose_code") {
      return Boolean(normalizeKeu10Config(ctx.usage.keu10_config)?.purposes.some((purpose) => purpose.code === ctx.input.keu10_purpose_code));
    }
    if (isKeu10Form(ctx.usage.master_forms) && ["items", "fund_amount", "total", "grand_total", "keu10_grand_total"].includes(field.key)) {
      return validateKeu10SubmissionItems(ctx.input.items).length === 0;
    }
    if (field.key !== "items" && field.key !== "fund_amount") return null;
    if (isKeu1Usage(ctx)) {
      return validateKeu1SubmissionItems(ctx.input.items).length === 0;
    }
    return validateFundSubmissionItems(ctx.input.items).length === 0;
  },
  validateSubmit(ctx: UsageModuleContext): SubmitIssue[] {
    if (isKeu10Form(ctx.usage.master_forms)) {
      const contextIssues = getKeu10NumberContextIssues(ctx);
      if (contextIssues.length > 0) return contextIssues;
      const config = normalizeKeu10Config(ctx.usage.keu10_config);
      if (!config) return [{ title: "Konfigurasi KEU 10 Tidak Valid", description: "Hubungi administrator untuk melengkapi tujuan pengajuan." }];
      if (!config.purposes.some((purpose) => purpose.code === ctx.input.keu10_purpose_code)) {
        return [{ title: "Tujuan Pengajuan Wajib Dipilih", description: "Pilih tujuan pengajuan yang tersedia." }];
      }
      const first = validateKeu10SubmissionItems(ctx.input.items)[0];
      return first ? [{ title: "Rincian Dana Belum Lengkap", description: first.message }] : [];
    }
    if (isKeu1Usage(ctx)) {
      const first = validateKeu1SubmissionItems(ctx.input.items)[0];
      if (first) return [{ title: "Rincian Kas Kecil Belum Lengkap", description: first.message }];
      const financial = getKeu1FinancialSummary(ctx.input.items, ctx.input.free_cash_sisa_bulan_lalu);
      return financial.hasFreeCash && financial.freeCash === null
        ? [{ title: "Free Cash Tidak Valid", description: "Isi nominal Free Cash dengan angka Rupiah atau kosongkan." }]
        : [];
    }
    const fundTypeIssues = usesFundSubmissionType(ctx.usage.master_forms, ctx.category) ? getFundTypeIssues(ctx.input.fund_type) : [];
    if (fundTypeIssues.length > 0) return fundTypeIssues;
    const first = validateFundSubmissionItems(ctx.input.items)[0];
    return first ? [{ title: "Rincian Dana Belum Lengkap", description: first.message }] : [];
  },
  buildSummaryFields(ctx: UsageModuleContext): SummaryField[] {
    if (isKeu10Form(ctx.usage.master_forms)) {
      return [
        { key: "keu10_purpose_code", label: "Tujuan Pengajuan", value: normalizeKeu10Config(ctx.usage.keu10_config)?.purposes.find((purpose) => purpose.code === ctx.input.keu10_purpose_code)?.label || "-" },
        { key: "items", label: "Rincian Pengajuan Dana", value: normalizeKeu10SubmissionItems(ctx.input.items) },
        { key: "keu10_grand_total", label: "Grand Total", value: formatRupiahZero(getKeu10SubmissionAmount(ctx.input.items)) },
      ];
    }
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
    return [
      ...(usesRequesterRabChoice(ctx.usage, ctx.category) ? [{
        key: REQUESTER_HAS_RAB_KEY, label: "RAB", value: ctx.input[REQUESTER_HAS_RAB_KEY] === true ? "Dari pemohon" : "Dari tim pemeriksa Perencanaan",
      }] : []),
      ...(usesFundSubmissionType(ctx.usage.master_forms, ctx.category) ? [{
        key: "fund_type",
        label: "Jenis Pengajuan Dana",
        value: getFundSubmissionTypeLabel(ctx.input.fund_type),
      }] : []),
      {
        key: "fund_amount",
        label: "Total Pengajuan Dana",
        value: formatRupiahZero(getFundSubmissionAmount(ctx.input.items)),
      },
    ];
  },
  reconcileInputForContext(input: FormInputData, ctx): FormInputData {
    if (!usesRequesterRabChoice(ctx.usage, ctx.category) && REQUESTER_HAS_RAB_KEY in input) {
      const next = { ...input };
      delete next[REQUESTER_HAS_RAB_KEY];
      input = next;
    }
    if (isKeu10Form(ctx.usage.master_forms)) {
      const next: FormInputData = { ...input, fund_without_project: false, fund_type: "operational" };
      delete next.free_cash_sisa_bulan_lalu;
      delete next.keu1_grand_total;
      if (!normalizeKeu10Config(ctx.usage.keu10_config)?.purposes.some((purpose) => purpose.code === next.keu10_purpose_code)) delete next.keu10_purpose_code;
      return next;
    }
    return input;
  },
  validateNumberContext(ctx): NumberContextIssue[] {
    if (isKeu10Form(ctx.usage.master_forms)) {
      return getKeu10NumberContextIssues(ctx);
    }
    if (isKeu1Usage(ctx)) {
      return !ctx.isPusatSelected && ctx.formData.project_id && !ctx.marisonProject?.ready
        ? [{ title: "Proyek Belum Terhubung", description: "Pilih proyek yang siap digunakan atau pilih Tanpa proyek." }]
        : [];
    }
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
    return usesFundSubmissionType(ctx.usage.master_forms, ctx.category) ? getFundTypeIssues(ctx.input.fund_type) : [];
  },
  cleanup(ctx): CleanupResult {
    return {
      inputKeysToDelete: ["fund_type", "fund_amount", "fund_without_project", "free_cash_sisa_bulan_lalu", REQUESTER_HAS_RAB_KEY,
        ...(isKeu10Form(ctx.usage.master_forms) ? ["total", "grand_total", "keu10_grand_total", "keu10_purpose_code"] : []),
      ],
      resetSelection: ["fundWithoutProject"],
    };
  },
  normalizeInput(input, ctx) {
    const next = { ...input };
    if (!usesRequesterRabChoice(ctx.usage, ctx.category)) delete next[REQUESTER_HAS_RAB_KEY];
    else next[REQUESTER_HAS_RAB_KEY] = input[REQUESTER_HAS_RAB_KEY] === true;
    next.request_category = "non_asset";
    next.request_mode = "barang";
    delete next.is_aset;
    if (isKeu10Form(ctx.usage.master_forms)) {
      next.fund_type = "operational";
      next.items = normalizeKeu10SubmissionItems(next.items);
      next.fund_amount = getKeu10SubmissionAmount(next.items);
      next.fund_without_project = false;
      delete next.free_cash_sisa_bulan_lalu;
      delete next.keu1_grand_total;
      delete next.keu10_grand_total;
      delete next.total;
      delete next.grand_total;
    } else if (isKeu1Usage(ctx)) {
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
      next.fund_without_project = ctx.isPusatSelected || !ctx.formData.project_id;
    } else {
      const fundItems = normalizeFundSubmissionItems(next.items);
      next.items = fundItems;
      next.fund_amount = getFundSubmissionAmount(fundItems);
    }
    return next;
  },
};

registerUsageModule(fundModule);
