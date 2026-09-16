import { describe, expect, it } from "vitest";
import { normalizeManualProjectMapping, planManualProjectMapping, type ExistingMarisonProject } from "@/lib/master-project-mapping";

const existingProject: ExistingMarisonProject = {
  id: "source-project",
  name: "Sragen Test",
  marison_project_code: "SRG",
  marison_synced_at: "2026-09-16T00:00:00Z",
  marison_review_required: false,
  master_offices: {
    marison_branch_id: 7,
    marison_synced_at: "2026-09-16T00:00:00Z",
    marison_review_required: false,
  },
};

describe("manual Master Project mapping", () => {
  it("keeps a manual SIGAP project disconnected when mapping is empty", () => {
    expect(normalizeManualProjectMapping({
      projectId: "",
      projectCode: "",
    })).toEqual({
      marison_project_id: null,
      marison_project_code: null,
    });
  });

  it("normalizes a positive Marison project ID and external code", () => {
    expect(normalizeManualProjectMapping({
      projectId: "19",
      projectCode: " prj01 ",
    })).toEqual({
      marison_project_id: 19,
      marison_project_code: "PRJ01",
    });
  });

  it("rejects incomplete or invalid external mapping", () => {
    expect(() => normalizeManualProjectMapping({
      projectId: "",
      projectCode: "PRJ01",
    })).toThrow("Isi ID Proyek Marison");

    expect(() => normalizeManualProjectMapping({
      projectId: "0",
      projectCode: "",
    })).toThrow("lebih dari 0");
  });

  it("keeps a new external ID as the direct canonical identity", () => {
    const requested = { marison_project_id: 19, marison_project_code: "SRG" };
    expect(planManualProjectMapping(requested, null, null)).toEqual({
      projectMapping: requested,
      targetRecordId: null,
    });
  });

  it("reuses a valid external ID through a separate local-project mapping", () => {
    expect(planManualProjectMapping({ marison_project_id: 19, marison_project_code: "SRG" }, existingProject, 7)).toEqual({
      projectMapping: { marison_project_id: null, marison_project_code: null },
      targetRecordId: "source-project",
    });
  });

  it("rejects a target not synced or still requiring review", () => {
    expect(() => planManualProjectMapping(
      { marison_project_id: 19, marison_project_code: null },
      { ...existingProject, marison_synced_at: null },
      7,
    )).toThrow("belum tervalidasi");
    expect(() => planManualProjectMapping(
      { marison_project_id: 19, marison_project_code: null },
      { ...existingProject, marison_review_required: true },
      7,
    )).toThrow("belum tervalidasi");
  });

  it("rejects a different or missing effective branch", () => {
    for (const branchId of [null, 8]) {
      expect(() => planManualProjectMapping(
        { marison_project_id: 19, marison_project_code: null },
        existingProject,
        branchId,
      )).toThrow("branch Marison yang sama");
    }
  });

  it("rejects conflicting external codes instead of silently remapping them", () => {
    expect(() => planManualProjectMapping(
      { marison_project_id: 19, marison_project_code: "OTHER" },
      existingProject,
      7,
    )).toThrow("Kode Proyek Marison harus sama");
  });
});
