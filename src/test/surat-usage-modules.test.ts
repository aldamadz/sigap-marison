/** G: behavioral test per modul — validate/cleanup/normalization + render slot. */
import { describe, it, expect } from "vitest";
import type {
  UsageModuleContext,
  UsageModuleKey,
} from "@/features/surat/registration/usages/usage-contract";
import { assetModule } from "@/features/surat/registration/usages/asset/asset-module";
import { fundModule } from "@/features/surat/registration/usages/fund/fund-module";
import { unitModule } from "@/features/surat/registration/usages/unit/unit-module";
import { nonUnitModule } from "@/features/surat/registration/usages/non-unit/non-unit-module";
import type { UnitAvailabilityState } from "@/features/surat/registration/usages/unit/unit-availability";
import { getPgdUnitStatus } from "@/components/surat/pgd-item-status";

function ctxFor(
  key: UsageModuleKey,
  input: Record<string, unknown> = {},
  formData: Record<string, string> = {},
  marisonProject: UsageModuleContext["marisonProject"] = null,
): UsageModuleContext {
  return {
    usage: { id: "usage-test" } as never,
    usageKey: key,
    category: key,
    formData: {
      office_id: "",
      dept_id: "",
      entity_id: "",
      letter_type_id: "",
      project_id: "",
      ...formData,
    },
    input: { ...input } as never,
    isPusatSelected: true,
    requesterDepartmentId: "",
    linkedDocumentContext: null,
    externalRevision: null,
    generatedNoSurat: null,
    master: { entities: [], depts: [], offices: [], types: [], users: [], projects: [] },
    marisonProject,
    unitAvailability: key === "unit" ? { loading: false, count: 10, error: null } : null,
    recommendationIO: null,
    setInputValue: () => undefined,
    setSelection: () => undefined,
    requestExternalOptions: async () => [],
  };
}

const readyProject = { ready: true, projectId: 19, projectName: "GA01", unavailableCount: 0 };

function ctxForUnitAvailability(availability: UnitAvailabilityState, input: Record<string, unknown> = {}) {
  const ctx = ctxFor("unit", {
    requested_project: { code: "GA01" },
    requested_unit_count: 2,
    unit_item_status: "2",
    ...input,
  });
  ctx.unitAvailability = availability;
  return ctx;
}

describe("fund module", () => {
  it("KEU 1 does not inherit PGD fund project/type requirements", () => {
    const ctx = ctxFor("non_asset", { items: [] });
    ctx.usage = { id: "keu1", master_forms: { nomor_form: "FM-UAI.KEU-01-00" } } as never;
    expect(fundModule.requiresMasterProjectMappingForUsage?.(ctx.usage)).toBe(false);
    expect(fundModule.validateNumberContext(ctx)).toEqual([]);
    const output = fundModule.normalizeInput({ items: [] } as never, ctx);
    expect(output).toMatchObject({ fund_type: "operational", fund_without_project: true });
  });

  it("KEU 10 is not classified as KEU 1", () => {
    const ctx = ctxFor("non_asset", { items: [] });
    ctx.usage = { id: "keu10", master_forms: { nomor_form: "FM-UAI.KEU-10-00" } } as never;
    expect(fundModule.requiresMasterProjectMappingForUsage?.(ctx.usage)).toBe(true);
  });
  it("validate: proyek wajib kecuali dana umum; jenis wajib", () => {
    expect(fundModule.validateNumberContext(ctxFor("non_asset", { fund_type: "operational" }))[0].title)
      .toBe("Proyek Tujuan Wajib Dipilih");
    expect(fundModule.validateNumberContext(
      ctxFor("non_asset", { fund_type: "operational" }, { project_id: "p1" }, { ...readyProject, ready: false })
    )[0].title).toBe("Proyek Belum Terhubung");
    expect(fundModule.validateNumberContext(
      ctxFor("non_asset", {}, { project_id: "p1" }, readyProject)
    )[0].title).toBe("Jenis Pengajuan Dana Wajib Dipilih");
    expect(fundModule.validateNumberContext(
      ctxFor("non_asset", { fund_type: "operational", fund_without_project: true }, {}, null)
    )).toEqual([]);
  });

  it("cleanup + normalize milik modul", () => {
    const cleaned = fundModule.cleanup(ctxFor("non_asset"), "usage_change");
    expect(cleaned.inputKeysToDelete).toEqual(
      expect.arrayContaining(["fund_type", "fund_amount", "fund_without_project"])
    );
    const out = fundModule.normalizeInput(
      { items: [{ nama_barang: "Sewa", jumlah: "2", nominal: "1500000" }] } as never,
      ctxFor("non_asset"),
    ) as Record<string, unknown>;
    expect(out.request_mode).toBe("barang");
    expect(out.fund_amount).toBe(1500000);
    expect(Array.isArray(out.items)).toBe(true);
  });

  it("submit + isFieldComplete + summary milik modul dana", () => {
    expect(fundModule.validateSubmit?.(ctxFor("non_asset", { items: [] }))[0].title)
      .toBe("Rincian Dana Belum Lengkap");
    const ctx = ctxFor("non_asset", { fund_type: "operational", items: [] });
    expect(fundModule.isFieldComplete?.({ key: "items" } as never, ctx)).toBe(false);
    expect(fundModule.isFieldComplete?.({ key: "nama_barang" } as never, ctx)).toBeNull();
    const rows = fundModule.buildSummaryFields?.(ctxFor("non_asset", { fund_type: "operational", items: [] })) ?? [];
    expect(rows.map(r => r.key)).toEqual(["fund_type", "fund_amount"]);
    expect(rows[0]).toMatchObject({ label: "Jenis Pengajuan Dana", value: "Biaya Operasional" });
  });

  it("reconcile identitas untuk dana", () => {
    const input = { request_mode: "barang" };
    expect(fundModule.reconcileInputForContext?.(input as never, ctxFor("non_asset")))
      .toBe(input);
  });

  it("G.7 baseline payload dana", () => {
    const out = fundModule.normalizeInput(
      { items: [{ nama_barang: "Sewa", jumlah: "2", nominal: "1500000" }] } as never,
      ctxFor("non_asset"),
    ) as Record<string, unknown>;
    expect(out.request_category).toBe("non_asset");
    expect(out.request_mode).toBe("barang");
    expect(out).not.toHaveProperty("is_aset");
    expect(out.fund_amount).toBe(1500000);
    expect(out.items).toEqual([
      expect.objectContaining({ nama_barang: "Sewa", nominal: "1500000" }),
    ]);
  });
  it("render slot tersedia, hidden mencakup items/fund_amount dana", () => {
    const ctx = ctxFor("non_asset");
    expect(fundModule.renderContextPanel(ctx)).not.toBeNull();
    expect(fundModule.renderDetailsPanel?.(ctx)).not.toBeNull();
    expect(fundModule.hiddenFieldKeys?.(ctx)).toEqual(
      expect.arrayContaining(["items", "fund_amount", "fund_type", "fund_without_project"])
    );
  });
});

describe("non-unit module", () => {
  it("validate: proyek + mapping wajib", () => {
    expect(nonUnitModule.validateNumberContext(ctxFor("non_unit"))[0].title)
      .toBe("Proyek Tujuan Wajib Dipilih");
    expect(nonUnitModule.validateNumberContext(
      ctxFor("non_unit", {}, { project_id: "p1" }, { ...readyProject, ready: false })
    )[0].title).toBe("Proyek Belum Terhubung");
    expect(nonUnitModule.validateNumberContext(
      ctxFor("non_unit", {}, { project_id: "p1" }, readyProject)
    )).toEqual([]);
  });

  it("submit: baris pekerjaan divalidasi modul", () => {
    expect(nonUnitModule.validateSubmit?.(ctxFor("non_unit", { items: [] }))[0].title)
      .toBe("Data Non Unit Belum Lengkap");
    expect(nonUnitModule.validateSubmit?.(
      ctxFor("non_unit", { items: [{ non_unit_id: 12, item_name: "Jalan", subtotal: 1000000, status: "2" }] })
    )).toEqual([]);
  });

  it("isFieldComplete: hanya items milik modul", () => {
    const ctx = ctxFor("non_unit", { items: [] });
    expect(nonUnitModule.isFieldComplete?.({ key: "items" } as never, ctx)).toBe(false);
    expect(nonUnitModule.isFieldComplete?.({ key: "nama_barang" } as never, ctx)).toBeNull();
  });

  it("G.7 baseline payload non-unit", () => {
    const out = nonUnitModule.normalizeInput(
      { request_mode: "unit", is_aset: true, foo: 1 } as never,
      ctxFor("non_unit"),
    ) as Record<string, unknown>;
    expect(out).toMatchObject({ request_category: "non_unit", request_mode: "barang", foo: 1 });
    expect(out).not.toHaveProperty("is_aset");
  });

  it("summary label items berasal dari modul", () => {
    expect(nonUnitModule.summaryFieldLabels?.items).toBe("Daftar Pekerjaan Non Unit");
  });

  it("G.7 baseline payload unit sama seperti sebelum refactor", () => {
    const out = unitModule.normalizeInput({ requested_unit_count: 3, unit_item_status: "2" } as never, ctxFor("unit"));
    const items = (out as Record<string, unknown>).items as Array<Record<string, unknown>>;
    expect((out as Record<string, unknown>).request_category).toBe("unit");
    expect((out as Record<string, unknown>).request_mode).toBe("unit");
    expect((out as Record<string, unknown>)).not.toHaveProperty("is_aset");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      nama_barang: "Permohonan Order Bangun SPK Pembangunan Rumah 3 Unit",
      sat: "Unit",
      jumlah: 3,
      status: "2",
    });
  });

  it("reconcile identitas untuk non-unit", () => {
    const input = { request_mode: "barang" };
    expect(nonUnitModule.reconcileInputForContext?.(input as never, ctxFor("non_unit")))
      .toBe(input);
  });

  it("cleanup + normalize milik modul; render slot bukan null", () => {
    expect(nonUnitModule.cleanup(ctxFor("non_unit"), "usage_change").inputKeysToDelete)
      .toEqual(expect.arrayContaining(["items"]));
    const out = nonUnitModule.normalizeInput({ request_mode: "unit" } as never, ctxFor("non_unit"));
    expect((out as Record<string, unknown>).request_mode).toBe("barang");
    const ctx = ctxFor("non_unit");
    expect(nonUnitModule.renderContextPanel(ctx)).not.toBeNull();
    expect(nonUnitModule.renderFieldOverride?.({ key: "items" } as never, ctx)).not.toBeNull();
    expect(nonUnitModule.renderFieldOverride?.({ key: "nama_barang" } as never, ctx)).toBeNull();
    expect(nonUnitModule.hiddenFieldKeys?.(ctx)).toEqual(
      expect.arrayContaining(["items"])
    );
  });
});

describe("unit module", () => {
  it("preserves status on a legacy numbered draft without silently defaulting a new request", () => {
    expect(getPgdUnitStatus({ items: [{ status: "2" }] })).toBe("2");
    expect(getPgdUnitStatus({ requested_unit_count: 2 })).toBe("");
  });
  it("requirements jujur untuk derivasi orchestrator", () => {
    expect(unitModule.requirements.requiresMasterProjectMapping).toBe(false);
    expect(unitModule.requirements.requiresUnitAllocation).toBe(true);
  });

  it("reconcile identitas untuk unit", () => {
    const input = { request_mode: "unit" };
    expect(unitModule.reconcileInputForContext?.(input as never, ctxFor("unit")))
      .toBe(input);
  });

  it("validate: proyek + jumlah wajib", () => {
    expect(unitModule.validateNumberContext(ctxFor("unit"))[0].title)
      .toBe("Proyek Unit Wajib Dipilih");
    expect(unitModule.validateNumberContext(
      ctxFor("unit", { requested_project: { code: "GA01" }, requested_unit_count: 0 })
    )[0].title).toBe("Jumlah Unit Wajib Diisi");
    expect(unitModule.validateNumberContext(
      ctxFor("unit", { requested_project: { code: "GA01" }, requested_unit_count: 3, unit_item_status: "2" })
    )).toEqual([]);
    expect(unitModule.validateNumberContext(
      ctxFor("unit", { requested_project: { code: "GA01" }, requested_unit_count: 3 })
    )[0].title).toBe("Status Wajib Dipilih");
  });

  it("fail-closed: lookup loading/error/nol/jumlah melampaui memblokir nomor & submit", () => {
    const loading = ctxForUnitAvailability({ loading: true, count: null, error: null });
    expect(unitModule.validateNumberContext(loading)[0].title).toBe("Kapasitas Unit Sedang Dimuat");
    expect(unitModule.validateSubmit(loading)[0].title).toBe("Kapasitas Unit Sedang Dimuat");

    const errored = ctxForUnitAvailability({ loading: false, count: null, error: "Vendor Marison tidak terjangkau" });
    expect(unitModule.validateNumberContext(errored)[0].title).toBe("Kapasitas Unit Belum Termuat");
    expect(unitModule.validateNumberContext(errored)[0].description).toContain("Vendor Marison tidak terjangkau");

    const zero = ctxForUnitAvailability({ loading: false, count: 0, error: null });
    expect(unitModule.validateNumberContext(zero)[0].title).toBe("Proyek Belum Punya Unit Tersedia");
    expect(unitModule.validateSubmit(zero)[0].title).toBe("Proyek Belum Punya Unit Tersedia");

    const exceeds = ctxForUnitAvailability({ loading: false, count: 1, error: null }, { requested_unit_count: 2 });
    expect(unitModule.validateNumberContext(exceeds)[0].title).toBe("Jumlah Melebihi Kapasitas");
    expect(unitModule.validateNumberContext(exceeds)[0].description).toContain("Kapasitas tersedia 1 unit");
  });

  it("pass: kapasitas valid & jumlah di dalam kapasitas lolos kedua gate", () => {
    const valid = ctxForUnitAvailability({ loading: false, count: 10, error: null }, { requested_unit_count: 3 });
    expect(unitModule.validateNumberContext(valid)).toEqual([]);
    expect(unitModule.validateSubmit(valid)).toEqual([]);
  });

  it("non-unit tidak terpengaruh oleh state availabilitas unit", () => {
    const nonUnit = ctxFor("non_unit", {}, { project_id: "p1" }, readyProject);
    expect(nonUnit.unitAvailability).toBeNull();
    expect(nonUnitModule.validateNumberContext(nonUnit)).toEqual([]);
  });

  it("cleanup + normalize milik modul; render slot tersedia", () => {
    expect(unitModule.cleanup(ctxFor("unit"), "usage_change").inputKeysToDelete)
      .toEqual(expect.arrayContaining(["requested_project", "requested_unit_count", "items"]));
    const out = unitModule.normalizeInput({ requested_unit_count: 3 } as never, ctxFor("unit"));
    const items = (out as Record<string, unknown>).items as Array<Record<string, unknown>>;
    expect((out as Record<string, unknown>).request_mode).toBe("unit");
    expect(items).toHaveLength(1);
    expect(String(items[0].nama_barang)).toContain("3 Unit");
    const ctx = ctxFor("unit");
    expect(unitModule.renderContextPanel(ctx)).not.toBeNull();
    expect(unitModule.hiddenFieldKeys?.(ctx)).toEqual(
      expect.arrayContaining(["items", "unit"])
    );
  });
});

describe("asset module", () => {
  it("validate lolos (gate aset di level submit); cleanup + normalize milik modul", () => {
    expect(assetModule.validateNumberContext(ctxFor("asset"))).toEqual([]);
    expect(assetModule.cleanup(ctxFor("asset"), "usage_change").inputKeysToDelete)
      .toEqual(expect.arrayContaining(["requires_recommendation"]));
    const out = assetModule.normalizeInput({ request_mode: "unit" } as never, ctxFor("asset"));
    expect((out as Record<string, unknown>).request_mode).toBe("barang");
  });

  it("reconcile: default pilihan saat diizinkan, strip saat tidak", () => {
    const allowed = assetModule.reconcileInputForContext?.(
      {} as never,
      ctxFor("asset", {}, { dept_id: "dept-pbo" }),
    ) as Record<string, unknown>;
    expect(allowed.requires_recommendation).toBe(false);
    expect(allowed.recommendation_template_name).toBe("Rekomendasi Peremajaan Alat");

    // Departemen tak dikenal: policy mengizinkan → default diterapkan.
    const unknownDept = assetModule.reconcileInputForContext?.(
      { catatan: "tetap" } as never,
      ctxFor("asset", {}, { dept_id: "dept-tak-dikenal" }),
    ) as Record<string, unknown>;
    expect(unknownDept.requires_recommendation).toBe(false);
    expect(unknownDept.catatan).toBe("tetap");

    const stripped = assetModule.reconcileInputForContext?.(
      { requires_recommendation: true, recommendation_template_name: "x", catatan: "tetap" } as never,
      {
        ...ctxFor("asset", {}, { dept_id: "dept-pbo" }),
        linkedDocumentContext: { type: "recommendation", parentSuratId: "p1" } as never,
      },
    ) as Record<string, unknown>;
    expect(stripped).not.toHaveProperty("requires_recommendation");
    expect(stripped).not.toHaveProperty("recommendation_template_name");
    expect(stripped.catatan).toBe("tetap");
  });

  it("G.7 baseline payload aset", () => {
    const out = assetModule.normalizeInput(
      { request_mode: "unit", foo: "bar" } as never,
      ctxFor("asset"),
    ) as Record<string, unknown>;
    expect(out).toMatchObject({
      request_category: "asset",
      request_mode: "barang",
      is_aset: true,
      foo: "bar",
    });
  });

  it("renderFieldOverride: model v1 dirender modul, tanpa model null", () => {
    const ctx = ctxFor("asset");
    expect(assetModule.renderFieldOverride?.({ key: "nama_barang" } as never, ctx)).toBeNull();
    expect(assetModule.renderFieldOverride?.({ key: "recommendation_items" } as never, ctx)).toBeNull();
    const withModel: UsageModuleContext = {
      ...ctx,
      recommendationIO: {
        model: { version: 1, items: [] } as never,
        onModelChange: () => undefined,
        uploadingKey: null,
        onUpload: async () => undefined,
        onDeleteAttachment: async () => undefined,
        onDeleteDetail: async () => undefined,
        directory: { users: [], offices: [], departments: [] },
      },
    };
    expect(assetModule.renderFieldOverride?.({ key: "recommendation_items" } as never, withModel))
      .not.toBeNull();
    expect(assetModule.renderContextPanel(ctx)).not.toBeNull();
  });
});
