import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const name = process.argv[2];
const allowedIps = process.argv.slice(3);

if (!name) {
  console.error("Usage: node scripts/create-external-api-client.mjs <client-name> [allowed-ip ...]");
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const token = `sigap_${randomBytes(32).toString("base64url")}`;
const hmacSecret = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const { data, error } = await supabase
  .from("external_api_clients")
  .insert({
    name,
    token_hash: tokenHash,
    hmac_secret: hmacSecret,
    allowed_ips: allowedIps,
  })
  .select("id, name, allowed_ips, created_at")
  .single();

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(JSON.stringify({
  client: data,
  authorization: `Bearer ${token}`,
  hmac_secret: hmacSecret,
  note: "Simpan token dan hmac_secret sekarang. Token asli tidak disimpan di database.",
}, null, 2));
