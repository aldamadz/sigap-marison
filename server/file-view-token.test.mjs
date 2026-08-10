import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  recommendationTokenRequestedBy,
  resolveFileViewTokenPath,
  stableRecommendationBearer,
} from "./file-view-token.mjs";

test("stable logical recommendation token resolves current PDF pointer", () => {
  const token = { id: "same-token", purpose: "external_marison_recommendation_pdf", object_path: "pdf/old.pdf" };
  assert.equal(resolveFileViewTokenPath(token, { pdf_path: "dokumen_surat/pdf/v1.pdf" }), "dokumen_surat/pdf/v1.pdf");
  assert.equal(resolveFileViewTokenPath(token, { pdf_path: "dokumen_surat/pdf/v2.pdf" }), "dokumen_surat/pdf/v2.pdf");
  assert.equal(token.id, "same-token");
});

test("normal tokens preserve stored object path", () => {
  assert.equal(resolveFileViewTokenPath({ purpose: "external_marison", object_path: "fixed.pdf" }, { pdf_path: "new.pdf" }), "fixed.pdf");
});

test("actor-null service builder keeps stable bearer identity and stores only its hash", () => {
  const first = stableRecommendationBearer("secret-at-least-32-characters-long", "child-1");
  const regenerated = stableRecommendationBearer("secret-at-least-32-characters-long", "child-1");
  const stored = createHash("sha256").update(first).digest("hex");

  assert.equal(first, regenerated);
  assert.notEqual(stored, first);
  assert.equal(stored.length, 64);
  assert.equal(recommendationTokenRequestedBy(null, "child-creator", "parent-creator"), "child-creator");
  assert.equal(recommendationTokenRequestedBy(null, null, "parent-creator"), "parent-creator");
  assert.equal(recommendationTokenRequestedBy(null, null, null), null);
});
