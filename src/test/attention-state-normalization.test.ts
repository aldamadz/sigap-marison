import { describe, expect, it } from "vitest";
import { normalizeAttentionState } from "@/services/attention.service";

describe("attention state normalization", () => {
  it("maps the project review count from the BFF camelCase contract", () => {
    expect(normalizeAttentionState({ masterProjectReviewCount: 12 }).masterProjectReviewCount).toBe(12);
  });

  it("accepts the Postgres snake_case contract without losing sidebar counts", () => {
    const state = normalizeAttentionState({
      master_office_review_count: 9,
      profile_review_count: 35,
      master_project_review_count: 12,
    });

    expect(state.masterOfficeReviewCount).toBe(9);
    expect(state.profileReviewCount).toBe(35);
    expect(state.masterProjectReviewCount).toBe(12);
  });
});
