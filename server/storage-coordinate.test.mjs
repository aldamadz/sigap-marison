import assert from "node:assert/strict";
import test from "node:test";
import { configuredStorageOriginAliases, normalizeLegacyStorageCoordinate, parseStorageCoordinate } from "./storage-coordinate.mjs";

const options = { origins: { external: "https://storage.test", primary: "https://database.test" } };

test("parses full public storage URL to canonical coordinates", () => {
  assert.deepEqual(parseStorageCoordinate("https://storage.test/storage/v1/object/public/dokumen_surat/final%20pdf/file.pdf?token=ignored", options), {
    origin: "external", bucket: "dokumen_surat", objectPath: "final pdf/file.pdf",
  });
});

test("parses signed and authenticated URL routes", () => {
  for (const route of ["sign", "authenticated"]) {
    assert.equal(parseStorageCoordinate(`https://database.test/storage/v1/object/${route}/bucket/path/file.pdf`, options).objectPath, "path/file.pdf");
  }
});

test("rejects unknown origins, traversal, and encoded separators", () => {
  assert.throws(() => parseStorageCoordinate("https://evil.test/storage/v1/object/public/bucket/file.pdf", options));
  assert.throws(() => parseStorageCoordinate("bucket/a/%2e%2e/file.pdf", options));
  assert.throws(() => parseStorageCoordinate("bucket/a%2Fb.pdf", options));
});

test("preserves canonical buckets and prefixes only legacy filenames", () => {
  assert.equal(
    normalizeLegacyStorageCoordinate("dokumen_surat/acceptance/fund.pdf"),
    "dokumen_surat/acceptance/fund.pdf",
  );
  assert.equal(
    normalizeLegacyStorageCoordinate("lampiran_surat/acceptance/support.pdf"),
    "lampiran_surat/acceptance/support.pdf",
  );
  assert.equal(normalizeLegacyStorageCoordinate("dokumen_legacy.pdf"), "dokumen_surat/dokumen_legacy.pdf");
  assert.equal(normalizeLegacyStorageCoordinate("lampiran_legacy.pdf"), "lampiran_surat/lampiran_legacy.pdf");
});

test("explicit legacy origins retain coordinates without contacting the historical host", () => {
  const aliases = { external: configuredStorageOriginAliases("https://old-storage.test, https://current-public.test") };
  assert.deepEqual(parseStorageCoordinate("https://old-storage.test/storage/v1/object/public/lampiran_surat/photo.png", { ...options, aliases }), {
    origin: "external", bucket: "lampiran_surat", objectPath: "photo.png",
  });
  assert.throws(() => parseStorageCoordinate("https://old-storage.test.evil/storage/v1/object/public/lampiran_surat/photo.png", { ...options, aliases }));
  assert.throws(() => parseStorageCoordinate("https://user:password@old-storage.test/storage/v1/object/public/lampiran_surat/photo.png", { ...options, aliases }));
});

test("configured legacy origins reject credentials, paths and non-HTTPS URLs", () => {
  assert.deepEqual(configuredStorageOriginAliases(""), []);
  for (const origin of ["http://old.test", "https://user:password@old.test", "https://old.test/path", "https://old.test/?token=secret"]) {
    assert.throws(() => configuredStorageOriginAliases(origin));
  }
});
