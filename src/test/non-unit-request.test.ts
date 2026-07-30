import { describe, expect, it } from "vitest";
import {
  formatNonUnitMoneyInput,
  getNonUnitTotal,
  resolveNonUnitProjectMapping,
  selectNonUnitType,
  updateNonUnitRow,
  validateNonUnitRows,
} from "@/components/surat/non-unit-request";
import { suratService } from "@/services/surat.service";

describe("Non Unit request normalization", () => {
  it("keeps the vendor identifier and PGD-compatible fields in one row", () => {
    const selected = selectNonUnitType({}, {
      value: "12",
      label: "Pekerjaan Infrastruktur",
      raw: { id: 12, code: "INFRA", name: "Pekerjaan Infrastruktur", project_id: 19 },
    });
    const row = updateNonUnitRow(selected, {
      item_name: "Pembangunan saluran blok A",
      subtotal: "1.000.000" as unknown as number,
      planning_notes: "Termasuk material",
    });

    expect(row).toMatchObject({
      non_unit_id: 12,
      item_name: "Pembangunan saluran blok A",
      nama_barang: "Pembangunan saluran blok A",
      subtotal: 1_000_000,
      kode: "INFRA",
      sat: "Pekerjaan",
      jumlah: "1",
      status: "2",
      keterangan: "Rp\u00a01.000.000",
    });
  });

  it("formats pasted monetary values and totals them", () => {
    expect(formatNonUnitMoneyInput("Rp 1.000.000")).toBe("1.000.000");
    expect(getNonUnitTotal([{ subtotal: "1.000.000" }, { subtotal: "2,500,000" }])).toBe(3_500_000);
  });

  it("reports actionable errors for incomplete rows", () => {
    expect(validateNonUnitRows([{}])[0].message).toContain("minimal satu");
    expect(validateNonUnitRows([{ non_unit_id: 12, item_name: "Jalan", subtotal: 0 }]))
      .toEqual([{ index: 0, field: "subtotal", message: "Isi nilai pengajuan lebih dari 0 untuk item 1." }]);
  });

  it("preserves the external project snapshot during registration normalization", () => {
    const requestedProject = {
      id: 19,
      value: "19",
      name: "Project Seed Sample",
      branch_id: 11,
      raw: { id: 19, branch_id: 11 },
    };
    const normalized = suratService.normalizeFormInputData({
      request_category: "non_unit",
      requested_project: requestedProject,
      items: [{ non_unit_id: 12, item_name: "Pembangunan jalan", subtotal: 2_000_000 }],
    });

    expect(normalized.requested_project).toEqual(requestedProject);
    expect(normalized.request_mode).toBe("barang");
  });

  it("uses the branch mapping owned by the destination project", () => {
    const mapping = resolveNonUnitProjectMapping(
      {
        id: "local-project",
        office_id: "project-office",
        marison_project_id: 19,
      },
      [
        { id: "requester-office", marison_branch_id: 1 },
        { id: "project-office", marison_branch_id: 14, name: "Cabang Seed Sample" },
      ],
    );

    expect(mapping).toMatchObject({
      projectId: 19,
      branchId: 14,
      ready: true,
      projectOffice: {
        id: "project-office",
        name: "Cabang Seed Sample",
      },
    });
  });

  it("fails closed when the project or its office has no external mapping", () => {
    expect(resolveNonUnitProjectMapping(
      { office_id: "project-office", marison_project_id: null },
      [{ id: "project-office", marison_branch_id: 14 }],
    ).ready).toBe(false);

    expect(resolveNonUnitProjectMapping(
      { office_id: "project-office", marison_project_id: 19 },
      [{ id: "project-office", marison_branch_id: null }],
    ).ready).toBe(false);
  });
});
