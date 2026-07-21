import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const applyChanges = process.argv.includes("--apply");
const environment = String(process.env.MARISON_DEPLOYMENT_ENVIRONMENT || "").trim().toLowerCase();
const stagingUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const stagingServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const defaultPassword = process.env.STAGING_DEFAULT_USER_PASSWORD;

const parseEnvFile = (path) => {
  const values = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().replace(/^export\s+/, "");
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
};

if (environment !== "staging") {
  throw new Error("Script hanya boleh dijalankan dengan environment staging.");
}
if (!stagingUrl || !stagingServiceKey) {
  throw new Error("Credential Supabase staging belum lengkap.");
}
if (!defaultPassword || defaultPassword.length < 8) {
  throw new Error("STAGING_DEFAULT_USER_PASSWORD minimal 8 karakter.");
}

const productionEnv = parseEnvFile(resolve(".env.production"));
const productionUrl = productionEnv.SUPABASE_URL || productionEnv.VITE_SUPABASE_URL;
const productionServiceKey = productionEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!productionUrl || !productionServiceKey) {
  throw new Error("Credential Supabase production tidak ditemukan di .env.production.");
}
if (new URL(stagingUrl).hostname === new URL(productionUrl).hostname) {
  throw new Error("Project staging dan production tidak boleh sama.");
}

const staging = createClient(stagingUrl, stagingServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const production = createClient(productionUrl, productionServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: authData, error: authError } = await staging.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (authError) throw authError;
const dummyUsers = (authData?.users || [])
  .filter((user) => String(user.email || "").toLowerCase().endsWith("@staging.test"))
  .sort((left, right) => left.id.localeCompare(right.id));

const productionNames = new Map();
for (let offset = 0; offset < dummyUsers.length; offset += 100) {
  const ids = dummyUsers.slice(offset, offset + 100).map((user) => user.id);
  const { data, error } = await production
    .from("profiles")
    .select("id,full_name")
    .in("id", ids);
  if (error) throw error;
  for (const profile of data || []) {
    if (profile.full_name) productionNames.set(profile.id, profile.full_name);
  }
}

const { data: stagingProfiles, error: stagingProfilesError } = await staging
  .from("profiles")
  .select("id,full_name,role,is_active,email")
  .in("id", dummyUsers.map((user) => user.id));
if (stagingProfilesError) throw stagingProfilesError;
const stagingProfilesById = new Map((stagingProfiles || []).map((profile) => [profile.id, profile]));

const plan = dummyUsers.map((user) => {
  const profile = stagingProfilesById.get(user.id);
  return {
    id: user.id,
    email: user.email,
    currentName: profile?.full_name || "",
    realName: productionNames.get(user.id) || "",
    role: profile?.role || "user",
    active: profile?.is_active !== false,
  };
});
const missingNames = plan.filter((item) => !item.realName);

console.log(JSON.stringify({
  mode: applyChanges ? "apply" : "preview",
  stagingProject: new URL(stagingUrl).hostname.split(".")[0],
  productionProject: new URL(productionUrl).hostname.split(".")[0],
  dummyUsers: plan.length,
  namesAvailable: plan.length - missingNames.length,
  missingNames: missingNames.length,
  adminAccountsToDemote: plan.filter((item) => item.role === "admin").length,
  inactiveAccountsToActivate: plan.filter((item) => !item.active).length,
}, null, 2));

if (missingNames.length > 0) {
  throw new Error("Sebagian UUID staging tidak ditemukan di production. Tidak ada perubahan yang dijalankan.");
}

if (applyChanges) {
  let updated = 0;
  for (const item of plan) {
    const authUser = dummyUsers.find((user) => user.id === item.id);
    const { error: updateAuthError } = await staging.auth.admin.updateUserById(item.id, {
      password: defaultPassword,
      user_metadata: {
        ...(authUser?.user_metadata || {}),
        full_name: item.realName,
      },
    });
    if (updateAuthError) {
      throw new Error(`Gagal menyiapkan Auth user ${item.id}: ${updateAuthError.message}`);
    }

    const { error: updateProfileError } = await staging
      .from("profiles")
      .update({
        full_name: item.realName,
        is_active: true,
        role: item.role === "admin" ? "user" : item.role,
      })
      .eq("id", item.id);
    if (updateProfileError) {
      throw new Error(`Auth berubah tetapi profile ${item.id} gagal: ${updateProfileError.message}`);
    }
    updated += 1;
  }

  console.log(JSON.stringify({ updated, status: "complete" }, null, 2));
}
