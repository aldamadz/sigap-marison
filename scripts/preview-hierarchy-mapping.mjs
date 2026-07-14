if (process.argv.length < 5) {
  console.error("Usage: node scripts/preview-hierarchy-mapping.mjs <input.xlsx> <output.sql> <preview.csv>");
  console.error("Use explicit paths, preferably under .tmp-hierarchy/ for generated files.");
  process.exit(1);
}

await import("./generate-hierarchy-parent-sql.mjs");
