/**
 * Characterization tests for the pure `buildAutoTitle` helper
 * (Pass I refactor: extracted from `SuratForm.tsx`).
 *
 * The helper is a pure function — no I/O, no state, no effects. The
 * tests below exercise every category path that the inline helper
 * handled before the extraction:
 *
 *  1. asset (no items) -> "Permohonan Aset" + office suffix
 *  2. asset (with items) -> "Permohonan Aset : <list>" + office suffix
 *  3. unit (no count) -> "Permohonan Order Bangun" + office suffix
 *  4. unit (with count) -> "Permohonan Order Bangun SPK Pembangunan Rumah N Unit" + project + office suffix
 *  5. non_unit -> delegated to buildNonUnitRequestTitle
 *  6. non_asset (with items) -> "Permohonan Non Aset : <list>" + office suffix
 *  7. non_asset (no items) -> "Permohonan Non Aset" + office suffix
 *  8. fallback (no category) -> "Permohonan" or "Permohonan : <items>" + office suffix
 *  9. recommendation linked (no items, no segments) -> "Rekomendasi Peremajaan Alat" + parent suffix
 * 10. recommendation linked (with items) -> "Rekomendasi Peremajaan Alat : <items>" + parent suffix
 * 11. recommendation linked (with action segments) -> "Rekomendasi <segments>" + parent suffix
 * 12. empty form_input_data -> still produces a non-empty title
 * 13. parent summary with PUSAT office -> uses getDepartmentTitlePart
 * 14. parent summary with non-PUSAT office -> uses getOfficeTitleSuffix
 * 15. no parent summary -> empty parent suffix
 * 16. getRecommendationAction injection (tidak_direkomendasikan filtered out)
 * 17. custom getRecommendationAction: "ganti" returns "Ganti Komponen"
 * 18. default getRecommendationAction: derives "service" from row.service
 * 19. default getRecommendationAction: derives "beli_baru" from row.beli_baru
 */

import { describe, expect, it } from "vitest";
import { buildAutoTitle } from "@/features/surat/registration/lib/surat-title-formatters";
import { MASTER_DEPTS, MASTER_OFFICES, UUID } from "./surat-form-fixtures";

const officePusat = MASTER_OFFICES.find((o) => o.id === UUID.office_pusat)!;
const officeBandung: {
  id: string;
  name: string;
  kedudukan: string;
  code: string;
  marison_branch_id: number | null;
} = {
  id: "kc-bandung",
  name: "Kantor Cabang Bandung",
  kedudukan: "Cabang",
  code: "KC",
  marison_branch_id: null,
};
const deptPbo = MASTER_DEPTS.find((d) => d.id === UUID.dept_pbo)!;

describe("buildAutoTitle — category: asset", () => {
  it("returns 'Permohonan Aset' + PUSAT office suffix when no items", () => {
    expect(
      buildAutoTitle({
        category: "asset",
        formInputData: {},
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
      })
    ).toBe("Pengajuan Aset Dept. Pengembangan Organisasi Kantor Pusat");
  });

  it("returns 'Permohonan Aset : <items>' when items are present", () => {
    expect(
      buildAutoTitle({
        category: "asset",
        formInputData: {
          items: [{ nama_barang: "Printer Epson" }, { nama_barang: "Laptop ASUS" }],
        },
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
      })
    ).toBe("Pengajuan Aset: Printer Epson dan Laptop ASUS Dept. Pengembangan Organisasi Kantor Pusat");
  });
});

describe("buildAutoTitle — category: unit", () => {
  it("returns 'Permohonan Order Bangun' when count is zero", () => {
    expect(
      buildAutoTitle({
        category: "unit",
        formInputData: { requested_unit_count: 0 },
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
      })
    ).toBe("Pengajuan SPK Unit Dept. Pengembangan Organisasi Kantor Pusat");
  });

  it("returns 'Permohonan Order Bangun SPK Pembangunan Rumah N Unit' when count > 0", () => {
    expect(
      buildAutoTitle({
        category: "unit",
        formInputData: { requested_unit_count: 3, requested_project: { name: "Cluster Magelang" } },
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
      })
    ).toBe(
      "Pengajuan SPK Unit: 3 Unit Cluster Magelang Dept. Pengembangan Organisasi Kantor Pusat"
    );
  });
});

describe("buildAutoTitle — category: non_unit", () => {
  it("delegates to buildNonUnitRequestTitle", () => {
    expect(
      buildAutoTitle({
        category: "non_unit",
        formInputData: { items: [{ nama_barang: "Pembangunan Talud" }] },
        selectedOffice: officeBandung,
        selectedDepartment: deptPbo,
      })
    ).toBe("Pengajuan SPK Non Unit: Pembangunan Talud Kantor Cabang Bandung");
  });
});

describe("buildAutoTitle — category: non_asset (fund)", () => {
  it("uses production title when fund type is production_cost", () => {
    expect(buildAutoTitle({
      category: "non_asset",
      formInputData: { fund_type: "production_cost", items: [{ nama_barang: "Material proyek" }] },
    })).toBe("Pengajuan Dana Produksi: Material proyek");
  });

  it("keeps Kas Kecil separate from PGD fund titles", () => {
    expect(buildAutoTitle({
      category: "non_asset",
      formNumber: "FM-UAI.KEU-01-00",
      formInputData: { items: [{ keterangan: "Listrik kantor" }] },
    })).toBe("Pengajuan Kas Kecil: Listrik kantor");
  });
  it("returns 'Permohonan Non Aset' + office suffix when no items", () => {
    expect(
      buildAutoTitle({
        category: "non_asset",
        formInputData: {},
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
      })
    ).toBe("Pengajuan Dana Operasional Dept. Pengembangan Organisasi Kantor Pusat");
  });

  it("returns 'Permohonan Non Aset : <items>' when items are present", () => {
    expect(
      buildAutoTitle({
        category: "non_asset",
        formInputData: { items: [{ nama_barang: "Pembelian ATK" }] },
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
      })
    ).toBe("Pengajuan Dana Operasional: Pembelian ATK Dept. Pengembangan Organisasi Kantor Pusat");
  });
});

describe("buildAutoTitle — fallback (no category)", () => {
  it("returns 'Permohonan' when category is null and no items", () => {
    expect(
      buildAutoTitle({
        category: null,
        formInputData: {},
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
      })
    ).toBe("Pengajuan Dept. Pengembangan Organisasi Kantor Pusat");
  });

  it("returns 'Permohonan : <items>' when category is null with items", () => {
    expect(
      buildAutoTitle({
        category: null,
        formInputData: { items: [{ nama_barang: "Generic Item" }] },
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
      })
    ).toBe("Pengajuan: Generic Item Dept. Pengembangan Organisasi Kantor Pusat");
  });
});

describe("buildAutoTitle — linked recommendation flow", () => {
  const linked = {
    type: "recommendation" as const,
    parentSuratId: UUID.surat,
    parentNoSurat: "098/UAI/PBO.1/VIII/2026",
    taskId: "task-pure-01",
    usageId: UUID.form_usage,
    formId: UUID.form_a,
    departmentId: UUID.dept_pbo,
    letterTypeId: UUID.letter_type,
  };

  const parentSummaryPusat = {
    task_id: "task-pure-01",
    parent_surat_id: UUID.surat,
    no_surat: "098/UAI/PBO.1/VIII/2026",
    judul_surat: "Surat Induk",
    requester_name: "Pemohon Staging",
    requester_job_title: "Staf",
    department_name: "Pengembangan Organisasi",
    department_code: "PBO",
    office_name: "Kantor Pusat",
    office_kedudukan: "Pusat",
    project_name: null,
    request_place: null,
    request_date: null,
    request_category: "asset",
    form_input_data: {},
    attachments: [],
  };

  const parentSummaryCabang = {
    ...parentSummaryPusat,
    office_name: "Kantor Cabang Bandung",
    office_kedudukan: "Cabang",
    department_name: "Operasional",
    department_code: "OPS",
  };

  it("returns 'Rekomendasi Peremajaan Alat' fallback when no items and no segments", () => {
    expect(
      buildAutoTitle({
        category: "asset",
        formInputData: {},
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
        linkedDocumentContext: linked,
        recommendationParentSummary: parentSummaryPusat,
      })
    ).toBe("Rekomendasi Peremajaan Alat Dept. Pengembangan Organisasi");
  });

  it("returns 'Rekomendasi Peremajaan Alat : <items>' when items present but no segments", () => {
    expect(
      buildAutoTitle({
        category: "asset",
        formInputData: {
          items: [{ nama_barang: "Printer Epson L3250" }],
          recommendation_items: [{ nama_barang: "Printer Epson L3250" }],
        },
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
        linkedDocumentContext: linked,
        recommendationParentSummary: parentSummaryPusat,
      })
    ).toBe(
      "Rekomendasi Peremajaan Alat : Printer Epson L3250 Dept. Pengembangan Organisasi"
    );
  });

  it("returns 'Rekomendasi <segments>' when action segments present, joined with parent suffix", () => {
    expect(
      buildAutoTitle({
        category: "asset",
        formInputData: {
          items: [{ nama_barang: "Printer Epson" }],
          recommendation_items: [
            { nama_barang: "Printer Epson", recommendation_action: "service" },
            { nama_barang: "Laptop", recommendation_action: "ganti" },
          ],
        },
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
        linkedDocumentContext: linked,
        recommendationParentSummary: parentSummaryPusat,
      })
    ).toBe(
      "Rekomendasi Service Printer Epson dan Ganti Komponen Laptop Dept. Pengembangan Organisasi"
    );
  });

  it("uses getOfficeTitleSuffix when parent summary office is non-PUSAT", () => {
    expect(
      buildAutoTitle({
        category: "asset",
        formInputData: {},
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
        linkedDocumentContext: linked,
        recommendationParentSummary: parentSummaryCabang,
      })
    ).toBe("Rekomendasi Peremajaan Alat Kantor Cabang Bandung");
  });

  it("returns title without parent suffix when summary is null", () => {
    expect(
      buildAutoTitle({
        category: "asset",
        formInputData: {},
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
        linkedDocumentContext: linked,
        recommendationParentSummary: null,
      })
    ).toBe("Rekomendasi Peremajaan Alat");
  });

  it("filters out 'tidak_direkomendasikan' action", () => {
    expect(
      buildAutoTitle({
        category: "asset",
        formInputData: {
          items: [{ nama_barang: "A" }],
          recommendation_items: [
            { nama_barang: "A", recommendation_action: "service" },
            { nama_barang: "B", recommendation_action: "tidak_direkomendasikan" },
          ],
        },
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
        linkedDocumentContext: linked,
        recommendationParentSummary: parentSummaryPusat,
      })
    ).toBe("Rekomendasi Service A Dept. Pengembangan Organisasi");
  });

  it("uses 'Ganti Komponen' label for ganti action", () => {
    expect(
      buildAutoTitle({
        category: "asset",
        formInputData: {
          items: [{ nama_barang: "X" }],
          recommendation_items: [{ nama_barang: "X", recommendation_action: "ganti" }],
        },
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
        linkedDocumentContext: linked,
        recommendationParentSummary: parentSummaryPusat,
      })
    ).toBe("Rekomendasi Ganti Komponen X Dept. Pengembangan Organisasi");
  });
});

describe("buildAutoTitle — empty / edge inputs", () => {
  it("compacts long item lists without hiding the first item", () => {
    expect(buildAutoTitle({
      category: "asset",
      formInputData: { items: [
        { nama_barang: "Printer" }, { nama_barang: "Scanner" },
        { nama_barang: "Laptop" }, { nama_barang: "Monitor" },
      ] },
    })).toBe("Pengajuan Aset: Printer dan 3 item lainnya");
  });
  it("still produces a non-empty title for empty formInputData + null category", () => {
    expect(
      buildAutoTitle({
        category: null,
        formInputData: {},
      }).length
    ).toBeGreaterThan(0);
  });

  it("skips empty item names", () => {
    expect(
      buildAutoTitle({
        category: "asset",
        formInputData: { items: [{ nama_barang: "" }, { nama_barang: "  " }, { nama_barang: "Valid" }] },
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
      })
    ).toBe("Pengajuan Aset: Valid Dept. Pengembangan Organisasi Kantor Pusat");
  });

  it("falls back to row.name when row.nama_barang is missing", () => {
    expect(
      buildAutoTitle({
        category: "asset",
        formInputData: { items: [{ name: "Laptop" }] },
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
      })
    ).toBe("Pengajuan Aset: Laptop Dept. Pengembangan Organisasi Kantor Pusat");
  });
});

describe("buildAutoTitle — default getRecommendationAction injection", () => {
  const linked = {
    type: "recommendation" as const,
    parentSuratId: UUID.surat,
    parentNoSurat: "098/UAI/PBO.1/VIII/2026",
    taskId: "task-default-01",
    usageId: UUID.form_usage,
    formId: UUID.form_a,
    departmentId: UUID.dept_pbo,
    letterTypeId: UUID.letter_type,
  };

  it("derives 'service' from row.service when no explicit recommendation_action", () => {
    expect(
      buildAutoTitle({
        category: "asset",
        formInputData: {
          items: [{ nama_barang: "A" }],
          recommendation_items: [{ nama_barang: "A", service: "yes" }],
        },
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
        linkedDocumentContext: linked,
      })
    ).toBe("Rekomendasi Service A");
  });

  it("derives 'beli_baru' from row.beli_baru when no explicit recommendation_action", () => {
    expect(
      buildAutoTitle({
        category: "asset",
        formInputData: {
          items: [{ nama_barang: "A" }],
          recommendation_items: [{ nama_barang: "A", beli_baru: "yes" }],
        },
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
        linkedDocumentContext: linked,
      })
    ).toBe("Rekomendasi Beli Baru A");
  });

  it("custom getRecommendationAction overrides the default", () => {
    expect(
      buildAutoTitle({
        category: "asset",
        formInputData: {
          items: [{ nama_barang: "A" }],
          recommendation_items: [{ nama_barang: "A", service: "ignored" }],
        },
        selectedOffice: officePusat,
        selectedDepartment: deptPbo,
        linkedDocumentContext: linked,
        getRecommendationAction: (row) =>
          String(row.nama_barang) === "A" ? "ganti" : "",
      })
    ).toBe("Rekomendasi Ganti Komponen A");
  });
});
