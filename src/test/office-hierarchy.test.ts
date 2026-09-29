import { describe, expect, it } from "vitest";
import { getDescendantOfficeIds, isOfficeOrDescendant } from "@/lib/office-hierarchy";

const sampleOffices = [
  { id: "pusat", parent_id: null, kedudukan: "Pusat" },
  { id: "kc-1", parent_id: "pusat", kedudukan: "KC" },
  { id: "kcp-1a", parent_id: "kc-1", kedudukan: "KCP" },
  { id: "kcp-1b", parent_id: "kc-1", kedudukan: "KCP" },
  { id: "kc-2", parent_id: "pusat", kedudukan: "KC" },
  { id: "kcp-2a", parent_id: "kc-2", kedudukan: "KCP" },
];

describe("office-hierarchy", () => {
  it("returns root plus all descendants for a KC", () => {
    const ids = getDescendantOfficeIds(sampleOffices, "kc-1");
    expect(ids).toEqual(new Set(["kc-1", "kcp-1a", "kcp-1b"]));
  });

  it("returns only the root for a leaf KCP", () => {
    const ids = getDescendantOfficeIds(sampleOffices, "kcp-1a");
    expect(ids).toEqual(new Set(["kcp-1a"]));
  });

  it("does not include siblings or unrelated branches", () => {
    const ids = getDescendantOfficeIds(sampleOffices, "kc-1");
    expect(ids.has("kc-2")).toBe(false);
    expect(ids.has("kcp-2a")).toBe(false);
  });

  it("is cycle-safe", () => {
    const cyclic = [
      { id: "a", parent_id: "b" },
      { id: "b", parent_id: "a" },
    ];
    const ids = getDescendantOfficeIds(cyclic, "a");
    expect(ids).toEqual(new Set(["a", "b"]));
  });

  it("isOfficeOrDescendant answers correctly", () => {
    expect(isOfficeOrDescendant(sampleOffices, "kc-1", "kcp-1a")).toBe(true);
    expect(isOfficeOrDescendant(sampleOffices, "kc-1", "kc-1")).toBe(true);
    expect(isOfficeOrDescendant(sampleOffices, "kc-1", "kcp-2a")).toBe(false);
  });
});
