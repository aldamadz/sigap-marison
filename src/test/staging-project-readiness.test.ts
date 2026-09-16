import { describe, expect, it } from "vitest";
import { resolveStagingProjectReadiness } from "@sigap/shared";

const branchExists = (branchId: number | null) => branchId === 1 || branchId === 14;

describe("resolveStagingProjectReadiness", () => {
  it("merges a trial project through its staging mapping (identity Nusantara Prime)", () => {
    const result = resolveStagingProjectReadiness({
      // PKU: tidak punya identitas external sendiri
      directProject: {
        projectId: null,
        synced: false,
        reviewBlocked: false,
        officeBranchId: null,
        officeSynced: false,
      },
      // mapping staging → Nusantara Prime (project 12, kantor Pusat branch 1)
      mappedProject: {
        projectId: 12,
        synced: true,
        reviewBlocked: false,
        officeBranchId: 1,
        officeSynced: true,
      },
      // kantor Bandung punya mapping staging → Pusat branch 1
      officeMappingBranchId: 1,
      effectiveBranchExistsSynced: branchExists,
    });

    expect(result).toEqual({
      ready: true,
      projectId: 12,
      branchId: 1,
      branchSource: "staging_mapping",
    });
  });

  it("keeps a directly-mapped project ready when its own branch matches the source branch", () => {
    const result = resolveStagingProjectReadiness({
      directProject: {
        projectId: 19,
        synced: true,
        reviewBlocked: false,
        officeBranchId: 14,
        officeSynced: true,
      },
      mappedProject: null,
      officeMappingBranchId: null,
      effectiveBranchExistsSynced: branchExists,
    });

    expect(result).toEqual({
      ready: true,
      projectId: 19,
      branchId: 14,
      branchSource: "external_source",
    });
  });

  it("prefers the mapped project over a valid direct project", () => {
    const result = resolveStagingProjectReadiness({
      directProject: {
        projectId: 19,
        synced: true,
        reviewBlocked: false,
        officeBranchId: 14,
        officeSynced: true,
      },
      mappedProject: {
        projectId: 12,
        synced: true,
        reviewBlocked: false,
        officeBranchId: 1,
        officeSynced: true,
      },
      officeMappingBranchId: 1,
      effectiveBranchExistsSynced: branchExists,
    });

    expect(result.ready).toBe(true);
    expect(result.projectId).toBe(12);
    expect(result.branchSource).toBe("staging_mapping");
  });

  it("uses the mapped project's branch for a requester from another office", () => {
    const result = resolveStagingProjectReadiness({
      directProject: null,
      mappedProject: {
        projectId: 23,
        synced: true,
        reviewBlocked: false,
        officeBranchId: 14,
        officeSynced: true,
      },
      officeMappingBranchId: 1,
      effectiveBranchExistsSynced: branchExists,
    });

    expect(result).toEqual({
      ready: true,
      projectId: 23,
      branchId: 14,
      branchSource: "staging_mapping",
    });
  });

  it("fails closed when the office mapping branch does not match the project office branch", () => {
    // Bandung → Pusat (1) tapi proyek langsung memakai branch 14 → "tidak cocok"
    const result = resolveStagingProjectReadiness({
      directProject: {
        projectId: 19,
        synced: true,
        reviewBlocked: false,
        officeBranchId: 14,
        officeSynced: true,
      },
      mappedProject: null,
      officeMappingBranchId: 1,
      effectiveBranchExistsSynced: branchExists,
    });

    expect(result.ready).toBe(false);
    expect(result.projectId).toBeNull();
    expect(result.branchId).toBeNull();
  });

  it("falls back to the direct project when the mapped target is not synced", () => {
    const result = resolveStagingProjectReadiness({
      directProject: {
        projectId: 19,
        synced: true,
        reviewBlocked: false,
        officeBranchId: 14,
        officeSynced: true,
      },
      mappedProject: {
        projectId: 12,
        synced: false,
        reviewBlocked: false,
        officeBranchId: 1,
        officeSynced: true,
      },
      officeMappingBranchId: null,
      effectiveBranchExistsSynced: branchExists,
    });

    expect(result).toEqual({
      ready: true,
      projectId: 19,
      branchId: 14,
      branchSource: "external_source",
    });
  });

  it("fails closed when the mapped target is blocked by the branch-review reason", () => {
    const result = resolveStagingProjectReadiness({
      directProject: {
        projectId: null,
        synced: false,
        reviewBlocked: false,
        officeBranchId: null,
        officeSynced: false,
      },
      mappedProject: {
        projectId: 12,
        synced: true,
        reviewBlocked: true,
        officeBranchId: 1,
        officeSynced: true,
      },
      officeMappingBranchId: 1,
      effectiveBranchExistsSynced: branchExists,
    });

    expect(result.ready).toBe(false);
  });

  it("fails closed when no project identity is available at all", () => {
    const result = resolveStagingProjectReadiness({
      directProject: null,
      mappedProject: null,
      officeMappingBranchId: 1,
      effectiveBranchExistsSynced: branchExists,
    });

    expect(result.ready).toBe(false);
    expect(result.projectId).toBeNull();
    expect(result.branchId).toBeNull();
  });

  it("fails closed when the effective branch is not registered as a synced office", () => {
    const result = resolveStagingProjectReadiness({
      directProject: {
        projectId: 19,
        synced: true,
        reviewBlocked: false,
        officeBranchId: 99,
        officeSynced: true,
      },
      mappedProject: null,
      officeMappingBranchId: null,
      effectiveBranchExistsSynced: (branchId) => branchId === 1,
    });

    expect(result.ready).toBe(false);
    expect(result.branchId).toBeNull();
  });

  it("accepts a constant predicate for branch existence", () => {
    const result = resolveStagingProjectReadiness({
      directProject: {
        projectId: 19,
        synced: true,
        reviewBlocked: false,
        officeBranchId: 14,
        officeSynced: true,
      },
      mappedProject: null,
      officeMappingBranchId: null,
      effectiveBranchExistsSynced: true,
    });

    expect(result.ready).toBe(true);
    expect(result.branchId).toBe(14);
  });
});
