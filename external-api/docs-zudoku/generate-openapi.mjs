import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildExternalOpenApi } from "../openapi.mjs";

const publicUrl = String(process.env.EXTERNAL_API_PUBLIC_URL || "https://external.marison-testing.biz.id")
  .replace(/\/+$/, "");
const outputPath = fileURLToPath(new URL("./apis/openapi.json", import.meta.url));

writeFileSync(outputPath, `${JSON.stringify(buildExternalOpenApi(publicUrl), null, 2)}\n`, "utf8");
