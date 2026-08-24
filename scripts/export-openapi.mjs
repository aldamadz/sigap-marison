/**
 * Export OpenAPI spec dari buildExternalOpenApi() ke file JSON untuk Zudoku build.
 *
 * Dijalankan sebelum `zudoku build` agar prerender bisa membaca spec dari file.
 * Jalankan: `node scripts/export-openapi.mjs`
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

// Import buildExternalOpenApi dari external-api (gunakan file:// URL untuk Windows)
const openapiPath = join(repoRoot, "external-api", "openapi.mjs");
const { buildExternalOpenApi } = await import(pathToFileURL(openapiPath).href);

const publicUrl = String(process.env.EXTERNAL_API_PUBLIC_URL || "https://external.marison-testing.biz.id").replace(/\/+$/, "");
const spec = buildExternalOpenApi(publicUrl);

const outDir = join(repoRoot, "external-api", "docs-zudoku", "apis");
mkdirSync(outDir, { recursive: true });

const outPath = join(outDir, "openapi.json");
writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n");
console.log(`Exported OpenAPI spec to ${outPath} (${Object.keys(spec.paths).length} paths)`);
