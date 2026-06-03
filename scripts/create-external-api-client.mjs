import { randomBytes, scryptSync } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const nameFlagIndex = args.indexOf("--name");
const name = nameFlagIndex >= 0 ? args[nameFlagIndex + 1] : args[0];
const allowedIps = args.filter((_arg, index) =>
  index !== nameFlagIndex &&
  index !== nameFlagIndex + 1 &&
  !(nameFlagIndex < 0 && index === 0)
);

if (!name) {
  console.error("Usage: node scripts/create-external-api-client.mjs --name <client-name> [allowed-ip ...]");
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
  })
  .select("id, name, client_id, allowed_ips, created_at")
  .single();

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(JSON.stringify({
  client: data,
  client_id: clientId,
  client_secret: clientSecret,
  token_endpoint: "/api/access-token",
  note: "Simpan client_id dan client_secret sekarang. Client secret asli tidak disimpan di database.",
}, null, 2));
