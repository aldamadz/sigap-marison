const asRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export const normalizeMarisonName = (value) => String(value ?? "")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, " ");

export const normalizeMarisonNik = (value) => String(value ?? "")
  .trim()
  .toUpperCase()
  .replace(/\s+/g, " ");

export const marisonNikKey = (value) => normalizeMarisonNik(value).replace(/[^A-Z0-9]/g, "");

const emailSlug = (value) => normalizeMarisonName(value)
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, ".")
  .replace(/^\.+|\.+$/g, "") || "user";

export const buildMarisonStagingEmail = (employee, duplicateName = false) => {
  const suffix = duplicateName ? `.${marisonNikKey(employee?.nik).toLowerCase()}` : "";
  return `${emailSlug(employee?.name)}${suffix}@staging.test`;
};

const meaningfulText = (value) => {
  const text = String(value ?? "").trim();
  if (!text || /^\d+$/.test(text)) return "";
  if (["test", "gelandang", "striker", "supersivor"].includes(text.toLowerCase())) return "";
  return text;
};

const employeeRichness = (employee) => [
  employee?.branch?.id,
  employee?.branch?.name,
  employee?.division,
  employee?.department,
  employee?.position,
  employee?.phone,
  employee?.email,
  employee?.status,
].filter((value) => String(value ?? "").trim()).length;

export const deduplicateMarisonEmployees = (rows, options = {}) => {
  const knownNames = new Set(Array.isArray(options.knownNames) ? options.knownNames.map(normalizeMarisonName) : []);
  const missingNik = [];
  const byNik = new Map();
  for (const raw of Array.isArray(rows) ? rows : []) {
    const employee = asRecord(raw);
    const key = marisonNikKey(employee.nik);
    if (!key) {
      missingNik.push(employee);
      continue;
    }
    const group = byNik.get(key) || [];
    group.push(employee);
    byNik.set(key, group);
  }

  const employees = [];
  const conflictingNik = [];
  const mergedDuplicates = [];
  const resolvedConflicts = [];
  for (const group of byNik.values()) {
    const names = new Set(group.map((item) => normalizeMarisonName(item.name)).filter(Boolean));
    if (names.size > 1) {
      const knownMatches = group.filter((item) => knownNames.has(normalizeMarisonName(item.name)));
      if (knownMatches.length === 1) {
        employees.push(knownMatches[0]);
        resolvedConflicts.push({
          nik: normalizeMarisonNik(knownMatches[0].nik),
          selectedName: knownMatches[0].name,
          ignoredNames: group
            .filter((item) => item !== knownMatches[0])
            .map((item) => item.name),
        });
        continue;
      }
      conflictingNik.push({
        nik: normalizeMarisonNik(group[0]?.nik),
        names: [...names],
        externalIds: group.map((item) => item.id).filter((id) => id != null),
      });
      continue;
    }
    const selected = [...group].sort((left, right) => employeeRichness(right) - employeeRichness(left))[0];
    employees.push(selected);
    if (group.length > 1) {
      mergedDuplicates.push({
        nik: normalizeMarisonNik(selected.nik),
        name: selected.name,
        merged: group.length,
      });
    }
  }
  return { employees, missingNik, conflictingNik, mergedDuplicates, resolvedConflicts };
};

const normalizedOfficeName = (value) => normalizeMarisonName(value)
  .replace(/^kantor\s+cabang\s+/, "")
  .replace(/^kc\.?\s+/, "")
  .replace(/^kcp\.?\s+/, "");

const resolveDepartmentName = (division, office) => {
  const value = normalizeMarisonName(division);
  const isBranch = office && normalizeMarisonName(office.kedudukan) !== "pusat";
  if (!value || /^\d+$/.test(value)) return "";
  if (/^direktur/.test(value)) return "Direksi";
  if (value === "hrd & ga") return "HRD & GA";
  if (value === "keuangan & akuntansi") return isBranch ? "Umum & Keuangan (Cabang)" : "Keuangan & Akuntansi";
  if (value === "legal & humas") return "Legal Proyek";
  if (["marketing", "marketing & branding", "marketing & sales", "marketing cabang"].includes(value)) {
    return isBranch ? "Marketing (Cabang)" : "Marketing";
  }
  if (value === "pengembangan bisnis") return "Pengembangan Bisnis";
  if (value === "pengembangan organisasi") return "Pengembangan Organisasi";
  if (value === "perencanaan") return isBranch ? "Teknik (Cabang)" : "Perencanaan";
  return "";
};

const deriveJobTitle = (employee) => meaningfulText(employee?.department) || meaningfulText(employee?.position) || null;

const isHeadOfficeBranch = (branch) => normalizeMarisonName(branch?.name) === "kantor pusat";

const normalizeBranchCode = (value) => String(value ?? "")
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9-]/g, "")
  .slice(0, 20);

const chooseOfficeCode = (branch, usedCodes) => {
  const preferred = normalizeBranchCode(branch?.code);
  if (preferred && !usedCodes.has(preferred)) return preferred;
  let candidate = `EXT${String(branch?.id ?? "").replace(/\D/g, "") || "BR"}`;
  let index = 2;
  while (usedCodes.has(candidate)) candidate = `EXT${branch?.id || "BR"}-${index++}`;
  return candidate;
};

const listAuthUsers = async (supabase) => {
  const users = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const rows = data?.users || [];
    users.push(...rows);
    if (rows.length < 1000) break;
  }
  return users;
};

const loadSyncState = async (supabase) => {
  const [profilesResult, officesResult, departmentsResult, authUsers] = await Promise.all([
    supabase.from("profiles").select("id,nik,full_name,email,phone,job_title,role,department_id,office_id,is_active,deleted_at,marison_employee_id,marison_user_id"),
    supabase.from("master_offices").select("id,code,name,kedudukan,marison_branch_id,marison_branch_code"),
    supabase.from("master_departments").select("id,name,code"),
    listAuthUsers(supabase),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (officesResult.error) throw officesResult.error;
  if (departmentsResult.error) throw departmentsResult.error;
  return {
    profiles: profilesResult.data || [],
    offices: officesResult.data || [],
    departments: departmentsResult.data || [],
    authUsers,
  };
};

const findOfficeForBranch = (branch, offices) => {
  const externalId = Number(branch?.id);
  const byExternalId = offices.find((office) => Number(office.marison_branch_id) === externalId);
  if (byExternalId) return byExternalId;
  const branchName = normalizedOfficeName(branch?.name);
  return offices.find((office) => normalizedOfficeName(office.name) === branchName) || null;
};

const syncBranches = async (supabase, branches, dryRun) => {
  const { data: currentOffices, error } = await supabase
    .from("master_offices")
    .select("id,code,name,kedudukan,marison_branch_id,marison_branch_code");
  if (error) throw error;
  const offices = [...(currentOffices || [])];
  const usedCodes = new Set(offices.map((office) => String(office.code || "").toUpperCase()));
  const result = {
    matched: 0,
    created: 0,
    updated: 0,
    createdApplied: 0,
    updatedApplied: 0,
    mappings: new Map(),
    errors: [],
  };

  for (const branch of Array.isArray(branches) ? branches : []) {
    const externalId = Number(branch?.id);
    if (!Number.isSafeInteger(externalId)) {
      result.errors.push({ externalId: branch?.id ?? null, name: branch?.name || "-", reason: "ID branch tidak valid" });
      continue;
    }
    const existing = findOfficeForBranch(branch, offices);
    if (existing) {
      result.matched += 1;
      result.mappings.set(externalId, existing);
      const externalName = String(branch?.name || "").trim();
      const externalCode = normalizeBranchCode(branch?.code);
      const nextCode = externalCode && !offices.some((office) => (
        office.id !== existing.id && String(office.code || "").toUpperCase() === externalCode
      ))
        ? externalCode
        : existing.code;
      const nextName = externalName || existing.name;
      const nextPosition = isHeadOfficeBranch(branch) ? "Pusat" : "KC";
      const changed = (
        Number(existing.marison_branch_id) !== externalId
        || String(existing.marison_branch_code || "") !== String(branch.code || "")
        || existing.code !== nextCode
        || existing.name !== nextName
        || existing.kedudukan !== nextPosition
      );
      if (changed && !dryRun) {
        const { data, error: updateError } = await supabase
          .from("master_offices")
          .update({
            code: nextCode,
            name: nextName,
            kedudukan: nextPosition,
            marison_branch_id: externalId,
            marison_branch_code: String(branch.code || "").trim() || null,
            marison_synced_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select("id,code,name,kedudukan,marison_branch_id,marison_branch_code")
          .single();
        if (updateError) {
          result.errors.push({ externalId, name: branch.name, reason: updateError.message });
          continue;
        }
        usedCodes.delete(String(existing.code || "").toUpperCase());
        usedCodes.add(String(data.code || "").toUpperCase());
        Object.assign(existing, data);
        result.updated += 1;
        result.updatedApplied += 1;
      } else if (changed) {
        result.updated += 1;
      }
      continue;
    }

    result.created += 1;
    if (dryRun) continue;
    const code = chooseOfficeCode(branch, usedCodes);
    const payload = {
      code,
      name: String(branch.name || `Branch ${externalId}`).trim(),
      kedudukan: isHeadOfficeBranch(branch) ? "Pusat" : "KC",
      marison_branch_id: externalId,
      marison_branch_code: String(branch.code || "").trim() || null,
      marison_synced_at: new Date().toISOString(),
    };
    const { data, error: insertError } = await supabase
      .from("master_offices")
      .insert(payload)
      .select("id,code,name,kedudukan,marison_branch_id,marison_branch_code")
      .single();
    if (insertError) {
      result.errors.push({ externalId, name: branch.name, reason: insertError.message });
      continue;
    }
    usedCodes.add(code);
    offices.push(data);
    result.mappings.set(externalId, data);
    result.createdApplied += 1;
  }
  for (const branch of Array.isArray(branches) ? branches : []) {
    const office = findOfficeForBranch(branch, offices);
    if (office) result.mappings.set(Number(branch.id), office);
  }
  return result;
};

export const previewMarisonBranchSync = async ({ supabase, branches, environment = "staging" }) => {
  const branchResult = await syncBranches(supabase, branches, true);
  return {
    environment,
    generatedAt: new Date().toISOString(),
    source: Array.isArray(branches) ? branches.length : 0,
    matched: branchResult.matched,
    toCreate: branchResult.created,
    toUpdate: branchResult.updated,
    blocked: branchResult.errors.length,
    issues: branchResult.errors,
  };
};

export const executeMarisonBranchSync = async ({ supabase, branches, environment = "staging" }) => {
  const branchResult = await syncBranches(supabase, branches, false);
  return {
    environment,
    completedAt: new Date().toISOString(),
    source: Array.isArray(branches) ? branches.length : 0,
    created: branchResult.createdApplied,
    updated: branchResult.updatedApplied,
    matched: branchResult.matched,
    failed: branchResult.errors.length,
    errors: branchResult.errors,
  };
};

const buildProfileIndexes = (profiles) => {
  const byExternalId = new Map();
  const byNik = new Map();
  const byName = new Map();
  for (const profile of profiles) {
    if (profile.marison_employee_id != null) byExternalId.set(Number(profile.marison_employee_id), profile);
    const nik = marisonNikKey(profile.nik);
    if (nik) byNik.set(nik, profile);
    const name = normalizeMarisonName(profile.full_name);
    if (name) {
      const rows = byName.get(name) || [];
      rows.push(profile);
      byName.set(name, rows);
    }
  }
  return { byExternalId, byNik, byName };
};

export const canUseMarisonNameFallback = (employee, profile) => {
  if (normalizeMarisonName(employee?.name) !== normalizeMarisonName(profile?.full_name)) return false;
  const profileNik = marisonNikKey(profile?.nik);
  return !profileNik || profileNik === marisonNikKey(employee?.nik);
};

const resolveExistingProfile = (employee, indexes) => {
  const external = indexes.byExternalId.get(Number(employee.id));
  if (external) return { profile: external, match: "external_id" };
  const nik = indexes.byNik.get(marisonNikKey(employee.nik));
  if (nik) return { profile: nik, match: "nik" };
  const names = indexes.byName.get(normalizeMarisonName(employee.name)) || [];
  if (names.length === 1 && canUseMarisonNameFallback(employee, names[0])) {
    return { profile: names[0], match: "name" };
  }
  if (names.length > 1) return { profile: null, match: "ambiguous_name" };
  return { profile: null, match: "new" };
};

const buildEmployeePlan = (employees, state, officeMappings) => {
  const indexes = buildProfileIndexes(state.profiles);
  const nameCounts = new Map();
  for (const employee of employees) {
    const name = normalizeMarisonName(employee.name);
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }
  const authByEmail = new Map(state.authUsers.map((user) => [String(user.email || "").toLowerCase(), user]));
  const authById = new Map(state.authUsers.map((user) => [user.id, user]));
  const profileIds = new Set(state.profiles.map((profile) => profile.id));
  const departmentsByName = new Map(state.departments.map((department) => [normalizeMarisonName(department.name), department]));
  const plan = [];

  for (const employee of employees) {
    const resolved = resolveExistingProfile(employee, indexes);
    if (resolved.match === "ambiguous_name") {
      plan.push({ employee, action: "blocked", reason: "Nama cocok dengan lebih dari satu profil SIGAP" });
      continue;
    }
    const duplicateName = (nameCounts.get(normalizeMarisonName(employee.name)) || 0) > 1;
    let email = buildMarisonStagingEmail(employee, duplicateName);
    let currentAuth = resolved.profile ? authById.get(resolved.profile.id) : null;
    const occupied = authByEmail.get(email);
    if (!resolved.profile && occupied && !profileIds.has(occupied.id)) {
      currentAuth = occupied;
    }
    if (occupied && occupied.id !== currentAuth?.id) {
      email = `${emailSlug(employee.name)}.${marisonNikKey(employee.nik).toLowerCase()}.${employee.id}@staging.test`;
    }
    const externalBranchId = Number(employee?.branch?.id);
    const office = Number.isSafeInteger(externalBranchId) ? officeMappings.get(externalBranchId) || null : null;
    const departmentName = resolveDepartmentName(employee.division, office);
    const department = departmentName ? departmentsByName.get(normalizeMarisonName(departmentName)) || null : null;
    plan.push({
      employee,
      action: resolved.profile ? "update" : "create",
      match: resolved.match,
      profile: resolved.profile,
      currentAuth,
      email,
      office,
      department,
      derivedJobTitle: deriveJobTitle(employee),
    });
  }
  return plan;
};

const publicIssue = (item) => ({
  externalId: item?.employee?.id ?? item?.id ?? null,
  nik: normalizeMarisonNik(item?.employee?.nik ?? item?.nik),
  name: item?.employee?.name ?? item?.name ?? "-",
  reason: item?.reason || "Data tidak valid",
});

export const previewMarisonEmployeeSync = async ({ supabase, employees, branches }) => {
  const state = await loadSyncState(supabase);
  const deduplicated = deduplicateMarisonEmployees(employees, {
    knownNames: state.profiles.map((profile) => profile.full_name),
  });
  const branchResult = await syncBranches(supabase, branches, true);
  const prospectiveMappings = new Map();
  for (const branch of branches) {
    const office = findOfficeForBranch(branch, state.offices);
    if (office) prospectiveMappings.set(Number(branch.id), office);
  }
  const plan = buildEmployeePlan(deduplicated.employees, state, prospectiveMappings);
  const blockedPlan = plan.filter((item) => item.action === "blocked");
  return {
    environment: "staging",
    generatedAt: new Date().toISOString(),
    source: {
      employees: Array.isArray(employees) ? employees.length : 0,
      branches: Array.isArray(branches) ? branches.length : 0,
    },
    branches: {
      matched: branchResult.matched,
      toCreate: branchResult.created,
      toUpdate: branchResult.updated,
      blocked: branchResult.errors.length,
    },
    employees: {
      ready: plan.filter((item) => item.action !== "blocked").length,
      toCreate: plan.filter((item) => item.action === "create").length,
      toUpdate: plan.filter((item) => item.action === "update").length,
      blocked: deduplicated.missingNik.length + deduplicated.conflictingNik.length + blockedPlan.length,
      missingNik: deduplicated.missingNik.length,
      conflictingNik: deduplicated.conflictingNik.length,
      mergedDuplicates: deduplicated.mergedDuplicates.length,
      resolvedConflicts: deduplicated.resolvedConflicts.length,
    },
    issues: [
      ...deduplicated.missingNik.map((employee) => publicIssue({ employee, reason: "NIK kosong pada API external" })),
      ...deduplicated.conflictingNik.map((conflict) => ({ ...conflict, reason: "Satu NIK dipakai oleh nama berbeda pada API external" })),
      ...blockedPlan.map(publicIssue),
      ...branchResult.errors,
    ],
  };
};

export const executeMarisonEmployeeSync = async ({ supabase, employees, branches, defaultPassword }) => {
  if (typeof defaultPassword !== "string" || defaultPassword.length < 8) {
    throw new Error("STAGING_DEFAULT_USER_PASSWORD belum dikonfigurasi dengan aman.");
  }
  const branchResult = await syncBranches(supabase, branches, false);
  const state = await loadSyncState(supabase);
  const deduplicated = deduplicateMarisonEmployees(employees, {
    knownNames: state.profiles.map((profile) => profile.full_name),
  });
  const plan = buildEmployeePlan(deduplicated.employees, state, branchResult.mappings);
  const result = {
    created: 0,
    updated: 0,
    failed: 0,
    skipped: deduplicated.missingNik.length + deduplicated.conflictingNik.length,
    branchesCreated: branchResult.createdApplied,
    branchesUpdated: branchResult.updatedApplied,
    errors: [
      ...deduplicated.missingNik.map((employee) => publicIssue({ employee, reason: "NIK kosong pada API external" })),
      ...deduplicated.conflictingNik.map((conflict) => ({ ...conflict, reason: "Satu NIK dipakai oleh nama berbeda pada API external" })),
      ...branchResult.errors,
    ],
  };

  for (const item of plan) {
    if (item.action === "blocked") {
      result.skipped += 1;
      result.errors.push(publicIssue(item));
      continue;
    }
    const employee = item.employee;
    try {
      let userId = item.profile?.id || item.currentAuth?.id || null;
      if (userId && !item.currentAuth) {
        throw new Error("Profil ada tetapi akun Auth tidak ditemukan");
      }
      if (userId) {
        const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
          email: item.email,
          password: defaultPassword,
          email_confirm: true,
          user_metadata: { full_name: String(employee.name || "").trim() },
        });
        if (authError) throw authError;
      } else {
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: item.email,
          password: defaultPassword,
          email_confirm: true,
          user_metadata: { full_name: String(employee.name || "").trim() },
        });
        if (authError || !authData?.user?.id) throw authError || new Error("Akun Auth tidak terbentuk");
        userId = authData.user.id;
      }

      const existing = item.profile || {};
      const profilePayload = {
        id: userId,
        nik: normalizeMarisonNik(employee.nik),
        full_name: String(employee.name || "").trim(),
        email: item.email,
        phone: String(employee.phone || "").trim() || existing.phone || null,
        role: existing.role || "user",
        job_title: existing.job_title || item.derivedJobTitle || "Karyawan",
        department_id: existing.department_id || item.department?.id || null,
        office_id: existing.office_id || item.office?.id || null,
        is_active: true,
        deleted_at: null,
        marison_employee_id: Number(employee.id),
        marison_user_id: Number.isSafeInteger(Number(employee.user_id)) ? Number(employee.user_id) : null,
        marison_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { error: profileError } = await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" });
      if (profileError) throw profileError;
      if (item.action === "create") result.created += 1;
      else result.updated += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(publicIssue({ employee, reason: error?.message || "Sinkronisasi gagal" }));
    }
  }
  return {
    environment: "staging",
    completedAt: new Date().toISOString(),
    ...result,
  };
};
