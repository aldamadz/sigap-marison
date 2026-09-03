/**
 * Branch Asset Fallback — predicate tests (MRN-22).
 */
import { describe, it, expect } from "vitest";
import {
  isBranchAssetFallback,
  type BranchAssetFallbackInput,
} from "../features/surat/registration/lib/branch-asset-fallback";

function input(overrides: Partial<BranchAssetFallbackInput> = {}): BranchAssetFallbackInput {
  return {
    officeKedudukan: "KC",
    requestCategory: "asset",
    formUsageId: "usage-asset",
    branchHasRegisteredProjects: false,
    projectId: "",
    projectIsDefault: true,
    projectCode: "000",
    projectName: "Tanpa proyek",
    ...overrides,
  };
}

describe("isBranchAssetFallback", () => {
  it("returns true for full canonical marker on a branch with no projects", () => {
    expect(isBranchAssetFallback(input())).toBe(true);
  });

  it("rejects when office is Pusat", () => {
    expect(isBranchAssetFallback(input({ officeKedudukan: "Pusat" }))).toBe(false);
  });

  it("rejects when category is not asset", () => {
    expect(isBranchAssetFallback(input({ requestCategory: "unit" }))).toBe(false);
    expect(isBranchAssetFallback(input({ requestCategory: "non_unit" }))).toBe(false);
    expect(isBranchAssetFallback(input({ requestCategory: "non_asset" }))).toBe(false);
  });

  it("rejects legacy usage without a canonical form usage id", () => {
    expect(isBranchAssetFallback(input({ formUsageId: "" }))).toBe(false);
    expect(isBranchAssetFallback(input({ formUsageId: null }))).toBe(false);
  });

  it("rejects when branch already has projects", () => {
    expect(isBranchAssetFallback(input({ branchHasRegisteredProjects: true }))).toBe(false);
  });

  it("rejects when projectId is set", () => {
    expect(isBranchAssetFallback(input({ projectId: "abc-123" }))).toBe(false);
  });

  it("rejects when projectIsDefault is missing or false", () => {
    expect(isBranchAssetFallback(input({ projectIsDefault: undefined }))).toBe(false);
    expect(isBranchAssetFallback(input({ projectIsDefault: false }))).toBe(false);
  });

  it("rejects when projectCode is not '000'", () => {
    expect(isBranchAssetFallback(input({ projectCode: "001" }))).toBe(false);
  });

  it("rejects when projectName is not 'Tanpa proyek'", () => {
    expect(isBranchAssetFallback(input({ projectName: "Tanpa Proyek" }))).toBe(false);
    expect(isBranchAssetFallback(input({ projectName: "" }))).toBe(false);
  });

  it("rejects when officeKedudukan is null", () => {
    expect(isBranchAssetFallback(input({ officeKedudukan: null }))).toBe(false);
  });

  it("accepts null/empty projectId the same way", () => {
    expect(isBranchAssetFallback(input({ projectId: null }))).toBe(true);
    expect(isBranchAssetFallback(input({ projectId: undefined }))).toBe(true);
    expect(isBranchAssetFallback(input({ projectId: "" }))).toBe(true);
  });
});
