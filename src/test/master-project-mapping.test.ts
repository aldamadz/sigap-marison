import { describe, expect, it } from "vitest";
import { normalizeManualProjectMapping, planManualProjectMapping, type ExistingMarisonProject } from "@/lib/master-project-mapping";

const existingProject: ExistingMarisonProject = {
  id: "source-project",
  name: "Sragen Test",
  marison_project_code: "SRG",
  marison_synced_at: "2026-09-16T00:00:00Z",
  master_offices: {
    marison_branch_id: 7,
    marison_synced_at: "2026-09-16T00:00:00Z",
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
    expect(planManualProjectMapping(requested, null)).toEqual({
      projectMapping: requested,
      targetRecordId: null,
    });
  });

  it("reuses a valid external ID through a separate local-project mapping", () => {
    expect(planManualProjectMapping({ marison_project_id: 19, marison_project_code: "SRG" }, existingProject)).toEqual({
      projectMapping: { marison_project_id: null, marison_project_code: null },
      targetRecordId: "source-project",
    });
  });

  it("rejects an external target without a synced project or branch", () => {
    expect(() => planManualProjectMapping(
      { marison_project_id: 19, marison_project_code: null },
      { ...existingProject, marison_synced_at: null },
    )).toThrow("belum tersinkronisasi");
    expect(() => planManualProjectMapping(
      { marison_project_id: 19, marison_project_code: null },
      { ...existingProject, master_offices: { marison_branch_id: null, marison_synced_at: null } },
    )).toThrow("belum tersinkronisasi");
  });

  it("allows a local project from another office to use the target's external branch", () => {
    expect(planManualProjectMapping(
      { marison_project_id: 19, marison_project_code: null },
      existingProject,
    ).targetRecordId).toBe("source-project");
  });

  it("rejects conflicting external codes instead of silently remapping them", () => {
    expect(() => planManualProjectMapping(
      { marison_project_id: 19, marison_project_code: "OTHER" },
      existingProject,
    )).toThrow("Kode Proyek Marison harus sama");
  });
});
