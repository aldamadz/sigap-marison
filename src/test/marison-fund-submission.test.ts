import { describe, expect, it } from "vitest";
import { mapMarisonFundSubmission } from "../../server/marison-fund-submission.mjs";

const approval = {
  role: "Manager HRD & GA",
  nik: "EMP001",
  action: "approved",
  actioned_at: "2026-08-11T10:00:00+07:00",
  notes: "Disetujui",
};

describe("Marison Fund Submission mapper", () => {
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
      approvals: [approval],
    });
    expect(result.payload).not.toHaveProperty("submitted_by");
    expect(result.payload).not.toHaveProperty("branch_id");
    expect(result.payload).not.toHaveProperty("items");
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
