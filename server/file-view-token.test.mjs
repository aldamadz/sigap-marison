import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  consumedFileViewTokenResult,
  expandRecommendationFileReferences,
  generateFileViewBearer,
  hashFileViewBearer,
  recommendationFileReference,
  recommendationTokenRequestedBy,
} from "./file-view-token.mjs";

test("consumed RPC fields build download result without removed token metadata", () => {
  const file = Buffer.from("pdf");
  const result = consumedFileViewTokenResult({
    token_id: "token-1",
    surat_id: "surat-1",
    bucket: "dokumen_surat",
    object_path: "pdf/current.pdf",
    storage_origin: "external",
  }, file, { id: "surat-1" }, (_surat, path) => `download-${path}`);

  assert.deepEqual(result, {
    tokenId: "token-1",
    suratId: "surat-1",
    file,
    ref: { bucket: "dokumen_surat", path: "pdf/current.pdf", origin: "external" },
    filename: "download-pdf/current.pdf",
  });
});

test("bearers contain 32 random bytes and are non-deterministic", () => {
  const first = generateFileViewBearer();
  const second = generateFileViewBearer();
  const stored = hashFileViewBearer(first);
  assert.equal(Buffer.from(first, "base64url").length, 32);
  assert.equal(Buffer.from(second, "base64url").length, 32);
  assert.notEqual(first, second);
  assert.notEqual(stored, first);
  assert.equal(stored.length, 64);
});

test("durable logical payload expands without mutation only at transport boundary", async () => {
  const reference = recommendationFileReference("child-1");
  const logical = { items: [{ attachments: [reference] }] };
  const transport = await expandRecommendationFileReferences(logical, async ({ surat_id }) => `https://sigap.test/api/files/view/secret-${surat_id}`);
  assert.deepEqual(logical, { items: [{ attachments: [{ type: "sigap_recommendation_pdf", surat_id: "child-1", name: "Dokumen Rekomendasi Aset" }] }] });
  assert.deepEqual(transport, { items: [{ attachments: [{ name: "Dokumen Rekomendasi Aset", link: "https://sigap.test/api/files/view/secret-child-1" }] }] });
  assert.equal(JSON.stringify(logical).includes("secret-"), false);
});

test("actor-null service flow keeps attributable fallback optional", () => {
  assert.equal(recommendationTokenRequestedBy(null, "child-creator", "parent-creator"), "child-creator");
  assert.equal(recommendationTokenRequestedBy(null, null, "parent-creator"), "parent-creator");
  assert.equal(recommendationTokenRequestedBy(null, null, null), null);
});

test("durable and audit source never persist raw bearer or transport body", async () => {
  const [runtime, migration, worker] = await Promise.all([
    readFile(new URL("../backend/src/domain-runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260810143000_rec03_recommendation_multi_detail_foundation.sql", import.meta.url), "utf8"),
    readFile(new URL("./marison-outbound-worker.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(runtime, /recommendationFileReference\(recommendationDocument\.id\)/);
  assert.match(runtime, /expandRecommendationFileReferences\(logicalPayload/);
  const logicalPrepare = runtime.slice(runtime.indexOf("const payloadBody = JSON.stringify(dispatch.payload)"), runtime.indexOf("const prepared =", runtime.indexOf("const payloadBody = JSON.stringify(dispatch.payload)")));
  assert.doesNotMatch(logicalPrepare, /api\/files\/view|rawToken/);
  assert.match(migration, /token_id uuid not null references public\.file_view_tokens\(id\)/);
  assert.doesNotMatch(migration.match(/create table if not exists public\.file_view_token_audit\([\s\S]*?\);/)?.[0] || "", /url|raw_token/i);
  assert.doesNotMatch(worker, /logger\.(?:info|error)\([^\n]+(?:payloadBody|body:)/);
});
