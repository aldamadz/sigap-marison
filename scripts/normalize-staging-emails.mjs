import { createClient } from "@supabase/supabase-js";

const applyChanges = process.argv.includes("--apply");
const environment = String(process.env.MARISON_DEPLOYMENT_ENVIRONMENT || "").trim().toLowerCase();
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (environment !== "staging") {
  throw new Error("Script hanya boleh dijalankan dengan environment staging.");
}
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib tersedia.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (authError) throw authError;

const candidates = (authData?.users || [])
  .filter((user) => /@(example\.invalid|staging\.test)$/i.test(String(user.email || "")))
  .sort((left, right) => left.id.localeCompare(right.id));

const { data: profiles, error: profilesError } = await supabase
  .from("profiles")
  .select("id,full_name")
  .in("id", candidates.map((user) => user.id));
if (profilesError) throw profilesError;
const namesById = new Map((profiles || []).map((profile) => [profile.id, profile.full_name]));
const slugCounts = new Map();
const toEmailSlug = (value, fallback) => {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 48)
    .replace(/\.+$/g, "");
  return normalized || fallback;
};

const plan = candidates.map((user, index) => {
  const baseSlug = toEmailSlug(namesById.get(user.id), `dummy${String(index + 1).padStart(3, "0")}`);
  const occurrence = (slugCounts.get(baseSlug) || 0) + 1;
  slugCounts.set(baseSlug, occurrence);
  const suffix = occurrence > 1 ? `.${String(occurrence).padStart(2, "0")}` : "";
  return {
    id: user.id,
    currentEmail: String(user.email || "").toLowerCase(),
    desiredEmail: `${baseSlug}${suffix}@staging.test`,
  };
});
const changed = plan.filter((item) => item.currentEmail !== item.desiredEmail);

console.log(JSON.stringify({
  mode: applyChanges ? "apply" : "preview",
  project: new URL(supabaseUrl).hostname.split(".")[0],
  dummyAccounts: plan.length,
  changesRequired: changed.length,
  firstEmail: plan[0]?.desiredEmail || null,
  lastEmail: plan.at(-1)?.desiredEmail || null,
}, null, 2));

if (applyChanges && changed.length > 0) {
  // Release every old address first so renamed or duplicate users cannot collide.
  for (const item of changed) {
    const { error: temporaryEmailError } = await supabase.auth.admin.updateUserById(item.id, {
      email: `migration.${item.id}@staging.test`,
      email_confirm: true,
    });
    if (temporaryEmailError) {
      throw new Error(`Gagal menyiapkan email sementara ${item.id}: ${temporaryEmailError.message}`);
    }
  }

  let updated = 0;
  for (const item of changed) {
    const { error: userError } = await supabase.auth.admin.updateUserById(item.id, {
      email: item.desiredEmail,
      email_confirm: true,
    });
    if (userError) {
      throw new Error(`Gagal memperbarui Auth user ${item.id}: ${userError.message}`);
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ email: item.desiredEmail })
      .eq("id", item.id);
    if (profileError) {
      throw new Error(`Auth user berubah tetapi profile ${item.id} gagal: ${profileError.message}`);
    }
    updated += 1;
  }

  console.log(JSON.stringify({ updated, status: "complete" }, null, 2));
}
