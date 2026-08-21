import { randomBytes, scryptSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const valuesFor = (flag) => args.flatMap((arg, index) => arg === flag && args[index + 1] ? [args[index + 1]] : []);
const name = valueFor("--name");
const outputPath = valueFor("--output");
const allowedIps = valuesFor("--allowed-ip");
const scopes = valuesFor("--scope");

if (!name || !outputPath) {
  console.error("Usage: node scripts/create-external-api-client.mjs --name <client-name> --output <secure-file> [--scope <scope>] [--allowed-ip <ip>]");
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
if (/[\r\n]/.test(serviceRoleKey)) {
  console.error("SUPABASE_SERVICE_ROLE_KEY contains a newline. Clear the stale shell variable and reload .env.production.");
  process.exit(1);
}

const clientId = randomBytes(16).toString("hex");
const clientSecret = randomBytes(32).toString("hex");
const salt = randomBytes(16);
const scryptN = 16384;
const scryptR = 8;
const scryptP = 1;
const derivedKey = scryptSync(clientSecret, salt, 64, {
  N: scryptN,
  r: scryptR,
  p: scryptP,
  maxmem: 64 * 1024 * 1024,
});
const clientSecretHash = `scrypt$${scryptN}$${scryptR}$${scryptP}$${salt.toString("hex")}$${derivedKey.toString("hex")}`;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const { data, error } = await supabase
  .from("external_api_clients")
  .insert({
    name,
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    allowed_ips: allowedIps,
    scopes,
  })
  .select("id, name, client_id, allowed_ips, scopes, created_at")
  .single();

if (error) {
  console.error(error.message);
  process.exit(1);
}

writeFileSync(outputPath, JSON.stringify({
  client: data,
  client_id: clientId,
  client_secret: clientSecret,
  token_endpoint: "/api/access-token",
}, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 });

console.log(JSON.stringify({
  client: data,
  credentials_file: outputPath,
  note: "Credential dibuat sekali dan tidak dicetak ke stdout.",
}, null, 2));
