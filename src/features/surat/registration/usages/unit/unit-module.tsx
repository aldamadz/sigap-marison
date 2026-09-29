import React from "react";
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
import { UnitContextPanel } from "./UnitContextPanel";
import { unitAvailabilityIssues } from "./unit-availability";
import { getPgdUnitStatus, isPgdItemStatus } from "@/components/surat/pgd-item-status";

const unitRequestIssues = (ctx: UsageModuleContext) => {
  const project = ctx.input.requested_project as { code?: string } | undefined;
  if (!project?.code) {
    return [{ title: "Proyek Unit Wajib Dipilih" }];
  }
  const count = Number(ctx.input.requested_unit_count || 0);
  if (!Number.isFinite(count) || count < 1) {
    return [{ title: "Jumlah Unit Wajib Diisi", description: "Jumlah unit minimal 1." }];
  }
  // Fail-closed: lookup loading/gagal/nol atau jumlah > kapasitas aktual memblokir.
  const availabilityIssues = unitAvailabilityIssues(ctx.unitAvailability, count);
  if (availabilityIssues.length > 0) return availabilityIssues;
  if (!isPgdItemStatus(getPgdUnitStatus(ctx.input))) {
    return [{ title: "Status Wajib Dipilih", description: "Pilih status 1–4 untuk pengajuan unit." }];
  }
  return [];
};

export const unitModule: UsageModule = {
  meta: {
    key: "unit",
    label: "Pengajuan SPK",
    description: "SPK pembangunan atau pengadaan unit",
    category: "unit",
  },
  requirements: {
    requiresProject: true,
    allowsFundWithoutProject: false,
    requiresUnitAllocation: true,
    requiresRecommendationChoice: false,
    allowsLinkedRecommendation: false,
    requiresMasterProjectMapping: false,
  },
  renderContextPanel(ctx) {
    return <UnitContextPanel ctx={ctx} />;
  },
  hiddenFieldKeys() {
    return ["items", "unit"];
  },
  isFieldComplete(_field: TemplateField): boolean | null {
    return null;
  },
  validateSubmit(ctx): SubmitIssue[] {
    return unitRequestIssues(ctx);
  },
  reconcileInputForContext(input: FormInputData): FormInputData {
    return input;
  },
  validateNumberContext(ctx): NumberContextIssue[] {
    return unitRequestIssues(ctx);
  },
  cleanup(ctx, reason): CleanupResult {
    return {
      inputKeysToDelete: ["requested_project", "requested_unit_count", "unit_item_status", "unit_request_sentence", "unit_config_snapshot", "items"],
      resetSelection: [],
    };
  },
  normalizeInput(input, ctx) {
    const next = { ...input };
    next.request_category = "unit";
    next.request_mode = "unit";
    delete next.is_aset;

    // We recreate the items table based on the requested unit count
    const count = Number(next.requested_unit_count || 0);
    const unitLabel = Number.isFinite(count) && count > 0 ? count : "";
    next.items = [{
      kode: "",
      kode_barang: "",
      nama_barang: `Permohonan Order Bangun SPK Pembangunan Rumah ${unitLabel} Unit`,
      nama: `Permohonan Order Bangun SPK Pembangunan Rumah ${unitLabel} Unit`,
      barang: `Permohonan Order Bangun SPK Pembangunan Rumah ${unitLabel} Unit`,
      sat: "Unit",
      satuan: "Unit",
      jumlah: unitLabel,
      status: getPgdUnitStatus(next),
      keterangan: "",
    }];
    return next;
  },
};

registerUsageModule(unitModule);
