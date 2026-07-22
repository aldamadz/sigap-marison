import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyStoragePathPrefix,
  isStoragePathWithinPrefix,
  normalizeStoragePath,
  normalizeStoragePathPrefix,
  removeStoragePathPrefix,
} from "../storage-path-policy.mjs";

test("production path remains unchanged when prefix is empty", () => {
  assert.equal(applyStoragePathPrefix("dokumen/abc.pdf", ""), "dokumen/abc.pdf");
});

test("staging prefix is applied once", () => {
  assert.equal(applyStoragePathPrefix("dokumen/abc.pdf", "staging"), "staging/dokumen/abc.pdf");
  assert.equal(applyStoragePathPrefix("staging/dokumen/abc.pdf", "staging"), "staging/dokumen/abc.pdf");
});

test("paths normalize separators and unsafe filename characters", () => {
  assert.equal(normalizeStoragePath("folder\\nama file.pdf"), "folder/nama_file.pdf");
  assert.equal(normalizeStoragePathPrefix("/staging/"), "staging");
});

test("directory traversal is rejected", () => {
  assert.throws(() => applyStoragePathPrefix("../production/file.pdf", "staging"), /traversal/i);
});

test("namespace validation distinguishes staging and production paths", () => {
  assert.equal(isStoragePathWithinPrefix("staging/dokumen/a.pdf", "staging"), true);
  assert.equal(isStoragePathWithinPrefix("dokumen/a.pdf", "staging"), false);
  assert.equal(removeStoragePathPrefix("staging/dokumen/a.pdf", "staging"), "dokumen/a.pdf");
  assert.throws(() => removeStoragePathPrefix("dokumen/a.pdf", "staging"), /namespace/i);
});

test("server, worker, and compose enforce the environment namespace", async () => {
  const [server, worker, stagingCompose, productionCompose] = await Promise.all([
    readFile(new URL("../server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../pdf-worker.mjs", import.meta.url), "utf8"),
    readFile(new URL("../docker-compose.staging.yml", import.meta.url), "utf8"),
    readFile(new URL("../docker-compose.prod.yml", import.meta.url), "utf8"),
  ]);

  assert.match(server, /writableStoragePath\(form\.get\("path"\)\)/);
  assert.match(server, /writableStoragePath\(`\$\{user\.id\}\/avatar_/);
  assert.match(server, /writableStoragePath\(`lampiran_/);
  assert.match(worker, /applyStoragePathPrefix\(`pdf\//);
  assert.match(stagingCompose, /STORAGE_PATH_PREFIX: "staging"/);
  assert.match(productionCompose, /STORAGE_PATH_PREFIX: ""/);
});
