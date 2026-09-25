import { describe, expect, it } from "vitest";
import { resolveMarisonApprovalRoleLabel } from "../../server/marison-outbound-contract.mjs";
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
    ["Pemohon", "Staff Admin Teknik", "staff"],
    ["Pemohon HRD & GA", "Manager Pengembangan Organisasi", "manager"],
  ])("maps generic approval label %s using the actual signer job %s", (label, jobTitle, expected) => {
    const role = resolveMarisonApprovalRoleLabel({ label, workflowRole: "membuat", jobTitle });
    expect(normalizeMarisonFundApprovalRole(role)).toBe(expected);
  });

  it("keeps explicit approval titles and fails closed without a real requester job", () => {
    expect(resolveMarisonApprovalRoleLabel({
      label: "Direktur I", workflowRole: "menyetujui", jobTitle: "Staff Admin Teknik",
    })).toBe("Direktur I");
    expect(resolveMarisonApprovalRoleLabel({
      label: "Pemohon", jobTitle: "", snapshotJobTitle: "Staff Admin Teknik",
    })).toBe("Staff Admin Teknik");
    expect(resolveMarisonApprovalRoleLabel({
      label: "Pemohon", jobTitle: "Manager Pengembangan Organisasi", snapshotJobTitle: "Staff Admin Teknik",
    })).toBe("Staff Admin Teknik");
    expect(() => normalizeMarisonFundApprovalRole(resolveMarisonApprovalRoleLabel({
      label: "Pemohon", workflowRole: "membuat", jobTitle: "",
    }))).toThrow("Role approval Fund Submission tidak dikenali");
  });

  it.each([
    {
      scope: "Cabang",
      requesterJob: "Staff Admin Teknik",
      labels: ["Pemohon", "Branch Manager", "Manager Terkait", "Direktur I", "Direktur Utama"],
      expected: ["staff", "manager", "manager", "director", "director"],
    },
    {
      scope: "Pusat",
      requesterJob: "Manager Pengembangan Organisasi",
      labels: ["Pemohon", "Mgr. Departemen", "Mgr. HRD & GA", "Direktur I", "Direktur Utama"],
      expected: ["manager", "manager", "manager", "director", "director"],
    },
  ])("builds all Fund approval roles for the $scope single-account fixture", ({ requesterJob, labels, expected }) => {
    const result = mapMarisonFundSubmission({
      request: { submissionNumber: "004/TEST/IX/2026", type: "operational", title: "Dana uji" },
      projectId: 16,
      branchId: 2,
      division: "Teknik",
      approvals: labels.map((label) => ({
        role: resolveMarisonApprovalRoleLabel({
          label,
          workflowRole: "membuat",
          snapshotJobTitle: requesterJob,
        }),
        nik: "TEST-001",
        action: "approved",
        actioned_at: "2026-09-25T08:00:00+07:00",
      })),
    });
    expect((result.payload.approvals as Array<{ role: string }>).map((item) => item.role)).toEqual(expected);
  });

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
