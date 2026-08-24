import { describe, expect, it } from "vitest";
import {
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
  it.each([
    ["Staff IT", "staff"],
    ["Staff Departemen", "staff"],
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

  it("maps the exact vendor contract without requester, branch, or items", () => {
    const result = mapMarisonFundSubmission({
      request: {
        submissionNumber: "010/UAI/PBO.1/VIII/2026",
        type: "operational",
        title: "Permohonan biaya operasional",
        description: "Pembelian kebutuhan kantor",
      },
      projectId: 12,
      division: "Pengembangan Organisasi",
      attachments: [{ name: "Dokumen final", link: "https://sigap.example.test/file.pdf" }],
      approvals: [approval],
    });

    expect(result).toMatchObject({ endpoint: "/fund-submissions", kind: "fund" });
    expect(result.payload).toEqual({
      submission_number: "010/UAI/PBO.1/VIII/2026",
      type: "operational",
      project_id: 12,
      division: "Pengembangan Organisasi",
      title: "Permohonan biaya operasional",
      description: "Pembelian kebutuhan kantor",
      attachments: [{ name: "Dokumen final", link: "https://sigap.example.test/file.pdf" }],
      approvals: [{ ...approval, role: "manager" }],
    });
    expect(result.payload).not.toHaveProperty("submitted_by");
    expect(result.payload).not.toHaveProperty("branch_id");
    expect(result.payload).not.toHaveProperty("items");
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

  it("rejects dana umum without project_id and branch_id", () => {
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
      project_id: 12,
      division: "Finance",
      title: "Dana operasional",
      description: null,
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
