import { describe, expect, it } from "vitest";
import { normalizeManualProjectMapping } from "@/lib/master-project-mapping";

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
});
