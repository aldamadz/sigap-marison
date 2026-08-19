/**
 * Salin bundle statis @stoplight/elements ke external-api/public/stoplight/.
 *
 * Dijalankan sebagai bagian dari build/deploy agar production image hanya
 * berisi file JS + CSS yang dibutuhkan, tanpa seluruh dependency tree
 * (lodash, postman-collection, react, dll.) yang masuk ke image.
 *
 * Jalankan: `npm run sync:stoplight --workspace agenda-flow-external-api`
 * atau dari root: `node scripts/sync-stoplight-assets.mjs`
 */

import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const externalApiDir = join(repoRoot, "external-api");
const publicDir = join(externalApiDir, "public", "stoplight");

// Pastikan directory target ada.
mkdirSync(publicDir, { recursive: true });

// Cari @stoplight/elements — bisa di external-api/node_modules atau di-hoist ke root.
const localNodeModules = join(externalApiDir, "node_modules", "@stoplight", "elements");
const hoistedNodeModules = join(repoRoot, "node_modules", "@stoplight", "elements");
const sourceDir = (() => {
  try { readFileSync(join(localNodeModules, "package.json")); return localNodeModules; } catch {}
  try { readFileSync(join(hoistedNodeModules, "package.json")); return hoistedNodeModules; } catch {}
  console.error("ERROR: @stoplight/elements not found. Run npm install first.");
  process.exit(1);
})();

// Baca versi @stoplight/elements dari package.json.
let elementsVersion = "unknown";
try {
  const pkg = JSON.parse(readFileSync(join(sourceDir, "package.json"), "utf8"));
  elementsVersion = pkg.version;
} catch {}
const files = [
  { src: "web-components.min.js", dest: "web-components.min.js" },
  { src: "styles.min.css", dest: "styles.min.css" },
];

for (const { src, dest } of files) {
  const from = join(sourceDir, src);
  const to = join(publicDir, dest);
  try {
    cpSync(from, to);
    console.log(`  copied ${src} → public/stoplight/${dest}`);
  } catch (err) {
    console.error(`  FAILED to copy ${src}: ${err.message}`);
    process.exit(1);
  }
}

// Tulis manifest agar Dockerfile/CI bisa memverifikasi versi.
const manifest = {
  package: "@stoplight/elements",
  version: elementsVersion,
  files: files.map((f) => f.dest),
  syncedAt: new Date().toISOString(),
};
writeFileSync(join(publicDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`  manifest.json written (v${elementsVersion})`);
console.log("Stoplight assets synced to external-api/public/stoplight/");
