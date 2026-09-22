/**
 * Hook lookup unit: state kapasitas tidak boleh bocor ke proyek lain.
 */
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import {
  useUnitAvailability,
  type UnitAvailabilityContext,
} from "@/features/surat/registration/usages/unit/use-unit-availability";

type UnitOption = { value: string; label: string };

const projectUnits: Record<string, UnitOption[]> = {
  "project-old": [
    { value: "old-1", label: "OLD-01" },
    { value: "old-2", label: "OLD-02" },
  ],
  "project-new": Array.from({ length: 5 }, (_, index) => ({
    value: `new-${index + 1}`,
    label: `NEW-0${index + 1}`,
  })),
};

const sourceCalls: Array<{ sourceKey: string; projectId: string }> = [];
let resolveOldLookup: ((options: UnitOption[]) => void) | null = null;

const requestExternalOptions: UnitAvailabilityContext["requestExternalOptions"] = async (
  sourceKey,
  variables = {},
) => {
  const projectId = String(variables.project_id || "");
  sourceCalls.push({ sourceKey, projectId });
  if (projectId === "project-old") {
    return new Promise<UnitOption[]>((resolve) => {
      resolveOldLookup = resolve;
    });
  }
  return projectUnits[projectId] ?? [];
};

const makeCtx = (projectId: string, category: UnitAvailabilityContext["category"] = "unit"): UnitAvailabilityContext => ({
  usage: { id: "usage-unit" },
  category,
  input: { requested_project: { id: projectId, code: projectId === "project-new" ? "NEW" : "OLD" } },
  requestExternalOptions,
});

describe("useUnitAvailability", () => {
  beforeEach(() => {
    sourceCalls.length = 0;
    resolveOldLookup = null;
  });

  it("ganti proyek membuang kapasitas lama; response stale proyek lama tidak dipakai", async () => {
    const { result, rerender } = renderHook(
      ({ projectId }) => useUnitAvailability(makeCtx(projectId)),
      { initialProps: { projectId: "project-old" } },
    );

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.count).toBeNull();

    await act(async () => {
      resolveOldLookup?.(projectUnits["project-old"]);
    });
    await waitFor(() => expect(result.current.count).toBe(2));

    rerender({ projectId: "project-new" });
    await waitFor(() => expect(result.current.count).toBe(5));
    expect(result.current.error).toBeNull();

    expect(sourceCalls.map((call) => call.projectId)).toEqual(["project-old", "project-new"]);
  });

  it("kategori bukan unit tidak melakukan lookup unit", async () => {
    const { result } = renderHook(() =>
      useUnitAvailability(makeCtx("project-old", "asset")),
    );

    expect(result.current).toEqual({ loading: false, count: null, error: null });
    expect(sourceCalls).toHaveLength(0);
  });
});
