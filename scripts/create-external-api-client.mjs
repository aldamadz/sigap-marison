import { randomBytes, scryptSync } from "node:crypto";
import { closeSync, mkdirSync, openSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_SCOPE = "submission:decide";

const parseArgs = (args) => {
  const options = { allowedIps: [], scopes: [], positional: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      options.positional.push(arg);
      continue;
    }
    if (!["--name", "--output", "--scope", "--allowed-ip"].includes(arg)) {
      throw new Error(`Argumen tidak dikenal: ${arg}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Nilai untuk ${arg} wajib diisi.`);
    }
    index += 1;
    if (arg === "--name") options.name = value;
    if (arg === "--output") options.outputPath = value;
    if (arg === "--scope") options.scopes.push(value);
    if (arg === "--allowed-ip") options.allowedIps.push(value);
  }

  options.name ||= options.positional[0];
  if (!options.allowedIps.length && options.positional[1]) {
    options.allowedIps.push(options.positional[1]);
  }
  if (options.positional.length > 2) {
    throw new Error("Terlalu banyak argumen posisi.");
  }
  if (!options.name) {
    throw new Error("Nama client wajib diisi.");
  }
  if (!options.scopes.length) options.scopes.push(DEFAULT_SCOPE);
  return options;
};

const defaultOutputPath = (name) => {
  const directory = join(homedir(), ".sigap", "credentials");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "external-client";
  return join(directory, `${stem}-${Date.now()}.json`);
};

const main = async () => {
  const { name, outputPath: requestedOutputPath, allowedIps, scopes } = parseArgs(process.argv.slice(2));
  const outputPath = requestedOutputPath || defaultOutputPath(name);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/VITE_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib tersedia.");
  }
  if (/[\r\n]/.test(serviceRoleKey)) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY mengandung baris baru. Muat ulang file environment yang benar.");
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
  const credentials = {
    name,
    client_id: clientId,
    client_secret: clientSecret,
    scopes,
    token_endpoint: "/api/access-token",
  };

  const outputHandle = openSync(outputPath, "wx", 0o600);
  try {
    writeFileSync(outputHandle, JSON.stringify(credentials, null, 2), { encoding: "utf8" });
  } finally {
    closeSync(outputHandle);
  }

  try {
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

    if (error) throw new Error(error.message);
    console.log(JSON.stringify({
      client: data,
      credentials_file: outputPath,
      note: "Credential dibuat sekali dan tidak dicetak ke stdout.",
    }, null, 2));
  } catch (error) {
    rmSync(outputPath, { force: true });
    throw error;
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
