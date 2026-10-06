import { describe, expect, it } from "vitest";
import {
  mapKeu1ItemsForFund,
  mapMarisonFundSubmission,
  normalizeMarisonFundApprovalRole,
  resolveMarisonFundBranch,
  resolveMarisonFundDivision,
} from "../../server/marison-fund-submission.mjs";

const approval = {
  role: "Manager HRD & GA",
  nik: "EMP001",
  action: "approved",
  actioned_at: "2026-08-11T10:00:00+07:00",
  notes: "Disetujui",
};

describe("Marison Fund Submission mapper", () => {
  it.each(["operational", "production_cost", "marketing_cost"])("preserves the explicit %s fund type", (type) => {
    const result = mapMarisonFundSubmission({
      request: { submissionNumber: "001/TEST/FUND", type, title: "Pengajuan dana", amount: 1000,
        items: [{ nama_barang: "Kebutuhan", jumlah: 1, satuan: "paket", nominal: 1000 }] },
      branchId: 1, division: "Marketing", approvals: [approval],
    });
    expect(result.payload.type).toBe(type);
  });

  it("rejects unknown fund types without silently defaulting to operational", () => {
    expect(() => mapMarisonFundSubmission({
      request: { submissionNumber: "001/TEST/FUND", type: "marketing", title: "Dana", items: [] },
      branchId: 1, division: "Marketing", approvals: [approval],
    })).toThrow("Payload Marison fund tidak sesuai kontrak");
  });
  it("maps KEU 1 descriptions and quantity times unit price without PGD item keys", () => {
    const mapped = mapKeu1ItemsForFund([{
      keterangan: "Listrik kantor", jumlah: 2, satuan: "bulan", estimasi_harga_satuan: 150000,
    }]);
    expect(mapped).toEqual([{ nama_barang: "Listrik kantor", jumlah: 2, satuan: "bulan", nominal: 300000 }]);
    const outbound = mapMarisonFundSubmission({
      request: { submissionNumber: "001/UAI/KEU/IX/2026", type: "operational", title: "Kas kecil", amount: 250000, items: mapped },
      branchId: 2,
      division: "Keuangan",
      approvals: [approval],
    });
    expect(outbound.payload).toMatchObject({ amount: 250000, items: mapped });
    expect(() => mapKeu1ItemsForFund([{ keterangan: "Listrik", jumlah: 2, satuan: "bulan" }]))
      .toThrow("Rincian Kas Kecil item 1 tidak valid");
    expect(() => mapKeu1ItemsForFund([{ keterangan: "Listrik", jumlah: 2, satuan: "bulan", estimasi_harga_satuan: "1e6" }]))
      .toThrow("Rincian Kas Kecil item 1 tidak valid");
  });
  it.each([
    ["Staff IT", "staff"],
    ["Staff Departemen", "staff"],
    ["Pemohon", "staff"],
    ["  PEMOHON  ", "staff"],
    ["Manager Pengembangan Organisasi", "manager"],
    ["Kepala Cabang", "manager"],
    ["Pimpinan Departemen", "manager"],
    ["Mgr. HRD GA", "manager"],
    ["Direktur Utama", "director"],
    ["Direktur I / Direktur Utama", "director"],
  ])("maps SIGAP approval role %s to vendor role %s", (source, expected) => {
    expect(normalizeMarisonFundApprovalRole(source)).toBe(expected);
  });

  it("fails closed for an unknown approval role", () => {
    expect(() => normalizeMarisonFundApprovalRole("Penandatangan Khusus"))
      .toThrow("Role approval Fund Submission tidak dikenali");
  });

  it("maps the canonical production fund approval chain without changing identity or order", () => {
    const approvals = ["Pemohon", "Branch Manager", "Manager Terkait", "Direktur I", "Direktur Utama"]
      .map((role, index) => ({ ...approval, role, nik: `EMP${index + 1}`, notes: `Step ${index + 1}` }));
    const result = mapMarisonFundSubmission({
      request: {
        submissionNumber: "001/TEST/FUND",
        type: "production_cost",
        title: "Pengajuan Dana Produksi",
        items: [{ nama_barang: "Material jalan", jumlah: 1, satuan: "paket", nominal: 100000 }],
      },
      projectId: 12,
      branchId: 1,
      division: "Produksi",
      attachments: [],
      approvals,
    });
    expect(result.payload.approvals).toEqual(approvals.map((entry, index) => ({
      ...entry,
      role: ["staff", "manager", "manager", "director", "director"][index],
    })));
    expect(approvals[0].role).toBe("Pemohon");
  });

  it("uses the exact external employee division for the mapped requester NIK", () => {
    expect(resolveMarisonFundDivision({
      requesterNik: "A 114",
      employees: [
        { nik: "A 115", division: "5" },
        { nik: " a   114 ", division: "4" },
      ],
    })).toBe("4");
  });

  it("fails closed when the requester has no external division", () => {
    expect(() => resolveMarisonFundDivision({
      requesterNik: "A 114",
      employees: [{ nik: "A 114", division: null }],
    })).toThrow("Division external pemohon tidak tersedia");
  });

  it("resolves the external employee branch for dana umum", () => {
    expect(resolveMarisonFundBranch({
      requesterNik: "a   114 ",
      employees: [
        { nik: "A 115", branch: { id: "5", name: "Cabang X" } },
        { nik: "A 114", branch: { id: 11, name: "MARISON TEST" } },
      ],
    })).toBe(11);
  });

  it("fails closed when the requester employee has no external branch", () => {
    expect(() => resolveMarisonFundBranch({
      requesterNik: "A 114",
      employees: [{ nik: "A 114", branch: null }],
    })).toThrow("Branch external pemohon tidak tersedia");
    expect(() => resolveMarisonFundBranch({
      requesterNik: "A 114",
      employees: [{ nik: "A 114", branch: { id: 0 } }],
    })).toThrow("Branch external pemohon tidak tersedia");
  });

  it("maps the latest vendor contract with required branch, amount, and items", () => {
    const result = mapMarisonFundSubmission({
      request: {
        submissionNumber: "010/UAI/PBO.1/VIII/2026",
        type: "operational",
        title: "Permohonan biaya operasional",
        description: "Pembelian kebutuhan kantor",
        amount: 1500000,
        items: [{ nama_barang: "Sewa kendaraan", jumlah: 1, satuan: "bulan", nominal: 1500000 }],
      },
      projectId: 12,
      branchId: 1,
      division: "Pengembangan Organisasi",
      attachments: [{ name: "Dokumen final", link: "https://sigap.example.test/file.pdf" }],
      approvals: [approval],
    });

    expect(result).toMatchObject({ endpoint: "/fund-submissions", kind: "fund" });
    expect(result.payload).toEqual({
      submission_number: "010/UAI/PBO.1/VIII/2026",
      type: "operational",
      branch_id: 1,
      project_id: 12,
      division: "Pengembangan Organisasi",
      title: "Permohonan biaya operasional",
      description: "Pembelian kebutuhan kantor",
      amount: 1500000,
      items: [{ nama_barang: "Sewa kendaraan", jumlah: 1, satuan: "bulan", nominal: 1500000 }],
      attachments: [{ name: "Dokumen final", link: "https://sigap.example.test/file.pdf" }],
      approvals: [{ ...approval, role: "manager" }],
    });
    expect(result.payload).not.toHaveProperty("submitted_by");
  });

  it("omits project_id and sends branch_id for dana umum", () => {
    const result = mapMarisonFundSubmission({
      request: {
        submissionNumber: "012/UAI/PBO.1/VIII/2026",
        type: "operational",
        title: "Permohonan dana umum tanpa proyek",
      },
      projectId: null,
      branchId: 11,
      division: "Pengembangan Organisasi",
      attachments: [],
      approvals: [approval],
    });

    expect(result).toMatchObject({ endpoint: "/fund-submissions", kind: "fund" });
    expect(result.payload).not.toHaveProperty("project_id");
    expect(result.payload).toMatchObject({
      submission_number: "012/UAI/PBO.1/VIII/2026",
      type: "operational",
      branch_id: 11,
      division: "Pengembangan Organisasi",
    });
  });

  it("omits project_id for an empty string project reference", () => {
    const result = mapMarisonFundSubmission({
      request: { submissionNumber: "013/UAI/PBO.1/VIII/2026", type: "production_cost", title: "Dana produksi umum" },
      projectId: "",
      branchId: 7,
      division: "Produksi",
      attachments: [],
      approvals: [approval],
    });

    expect(result.payload).not.toHaveProperty("project_id");
    expect(result.payload.branch_id).toBe(7);
  });

  it("rejects every Fund Submission without branch_id", () => {
    expect(() => mapMarisonFundSubmission({
      request: { submissionNumber: "014/UAI/PBO.1/VIII/2026", type: "operational", title: "Dana umum tanpa cabang" },
      projectId: null,
      branchId: null,
      division: "Finance",
      attachments: [],
      approvals: [approval],
    })).toThrow("Payload Marison fund tidak sesuai kontrak");
  });

  it("rejects a missing user-selected type", () => {
    expect(() => mapMarisonFundSubmission({
      request: { submissionNumber: "010", title: "Dana", type: "" },
      projectId: 12,
      branchId: 1,
      division: "Finance",
      approvals: [approval],
      attachments: [],
    })).toThrow("Payload Marison fund tidak sesuai kontrak");
  });

  it("always sends optional vendor fields with explicit empty values", () => {
    const result = mapMarisonFundSubmission({
      request: {
        submissionNumber: "011/UAI/PBO.1/VIII/2026",
        type: "operational",
        title: "Dana operasional",
      },
      projectId: 12,
      branchId: 1,
      division: "Finance",
      approvals: [{
        role: "manager",
        nik: "EMP001",
        action: "approved",
        actioned_at: "2026-08-12T10:00:00+07:00",
      }],
    });

    expect(result.payload).toEqual({
      submission_number: "011/UAI/PBO.1/VIII/2026",
      type: "operational",
      branch_id: 1,
      project_id: 12,
      division: "Finance",
      title: "Dana operasional",
      description: null,
      amount: 0,
      items: [],
      attachments: [],
      approvals: [{
        role: "manager",
        nik: "EMP001",
        action: "approved",
        actioned_at: "2026-08-12T10:00:00+07:00",
        notes: null,
      }],
    });
  });
});
