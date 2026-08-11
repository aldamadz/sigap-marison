import assert from "node:assert/strict";
import test from "node:test";
import { parseStorageCoordinate } from "./storage-coordinate.mjs";

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
