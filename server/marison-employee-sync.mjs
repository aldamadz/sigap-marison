import { randomBytes } from "node:crypto";

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

const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

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

  const employees = [...missingNik];
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

const MARISON_DEPARTMENT_CATALOG = Object.freeze({
  "Branch Manager": { code: "BM", deptIndex: 1 },
  Direksi: { code: "DIR", deptIndex: 2 },
  "HRD & GA": { code: "HRD", deptIndex: 3 },
  "Keuangan & Akuntansi": { code: "KEU", deptIndex: 4 },
  "Legal Lahan": { code: "LLH", deptIndex: 5 },
  "Legal Proyek": { code: "LGP", deptIndex: 6 },
  Marketing: { code: "MKT", deptIndex: 7 },
  "Marketing (Cabang)": { code: "MKC", deptIndex: 8 },
  "Operasional Kost": { code: "OPK", deptIndex: 9 },
  Pengadaan: { code: "PRC", deptIndex: 10 },
  "Pengembangan Bisnis": { code: "PBI", deptIndex: 11 },
  "Pengembangan Organisasi": { code: "PBO", deptIndex: 12 },
  Perencanaan: { code: "PLN", deptIndex: 13 },
  "Teknik (Cabang)": { code: "TKN", deptIndex: 14 },
  "Umum & Keuangan (Cabang)": { code: "UKC", deptIndex: 15 },
});

export const resolveMarisonDepartment = (division, office) => {
  const value = normalizeMarisonName(division);
  const isBranch = office && normalizeMarisonName(office.kedudukan) !== "pusat";
  let name = "";
  if (!value || /^\d+$/.test(value)) return null;
  if (/^direktur/.test(value) || value === "sekretaris direksi") name = "Direksi";
  else if (value === "cabang") name = "Branch Manager";
  else if (value === "hrd & ga") name = "HRD & GA";
  else if (value === "keuangan & akuntansi") name = isBranch ? "Umum & Keuangan (Cabang)" : "Keuangan & Akuntansi";
  else if (value === "legal lahan") name = "Legal Lahan";
  else if (["legal & humas", "legal proyek & humas", "legal proyek"].includes(value)) name = "Legal Proyek";
  if (["marketing", "marketing & branding", "marketing & sales", "marketing cabang"].includes(value)) {
    name = isBranch ? "Marketing (Cabang)" : "Marketing";
  }
  else if (["operasional kos", "operasional kost"].includes(value)) name = "Operasional Kost";
  else if (value === "pengadaan") name = "Pengadaan";
  else if (value === "pengembangan bisnis") name = "Pengembangan Bisnis";
  else if (value === "pengembangan organisasi") name = "Pengembangan Organisasi";
  else if (value === "perencanaan") name = isBranch ? "Teknik (Cabang)" : "Perencanaan";
  else if (value === "teknik") name = isBranch ? "Teknik (Cabang)" : "Perencanaan";
  else if (value === "umum & keuangan") name = isBranch ? "Umum & Keuangan (Cabang)" : "Keuangan & Akuntansi";
  const catalog = MARISON_DEPARTMENT_CATALOG[name];
  return catalog ? { name, ...catalog } : null;
};

const deriveJobTitle = (employee) => meaningfulText(employee?.department) || meaningfulText(employee?.position) || null;

export const resolveMarisonEmployeeActive = (status, fallback = true) => {
  const normalized = normalizeMarisonName(status);
  if (["keluar", "nonaktif", "inactive", "resign", "resigned", "terminated", "0"].includes(normalized)) return false;
  if (["aktif", "active", "tetap", "kontrak", "magang", "1"].includes(normalized)) return true;
  return fallback;
};

export const deriveMarisonOfficeType = (branch) => {
  const name = normalizeMarisonName(branch?.name);
  if (name === "kantor pusat" || /(^|\s)kantor pusat(\s|$)/.test(name)) return "Pusat";
  if (/^(kcp|kantor cabang pembantu)(\s|\.|-)/.test(name)) return "KCP";
  if (/^(kost|kantor site|kantor proyek)(\s|\.|-)/.test(name)) return "Kost";
  return "KC";
};

const normalizeBranchCode = (value) => String(value ?? "")
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9-]/g, "")
  .slice(0, 20);

const normalizeProjectCode = (value) => String(value ?? "")
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9-]/g, "")
  .slice(0, 30);

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
  const [profilesResult, officesResult, departmentsResult, aliasesResult, authUsers] = await Promise.all([
    supabase.from("profiles").select("id,nik,full_name,email,phone,job_title,role,department_id,office_id,parent_id,join_date,resign_date,is_active,deleted_at,marison_employee_id,marison_user_id,marison_review_required,marison_review_reasons"),
    supabase.from("master_offices").select("id,code,name,kedudukan,parent_id,marison_branch_id,marison_branch_code,marison_hierarchy_confirmed,marison_review_required,marison_review_reasons"),
    supabase.from("master_departments").select("id,name,code"),
    supabase.from("master_department_aliases").select("department_id,alias_name,normalized_alias"),
    listAuthUsers(supabase),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (officesResult.error) throw officesResult.error;
  if (departmentsResult.error) throw departmentsResult.error;
  if (aliasesResult.error) throw aliasesResult.error;
  return {
    profiles: profilesResult.data || [],
    offices: officesResult.data || [],
    departments: departmentsResult.data || [],
    departmentAliases: aliasesResult.data || [],
    authUsers,
  };
};

const findOfficeForBranch = (branch, offices) => {
  const externalId = Number(branch?.id);
  const byExternalId = offices.find((office) => Number(office.marison_branch_id) === externalId);
  if (byExternalId) return { office: byExternalId, match: "external_id" };
  const externalCode = normalizeBranchCode(branch?.code);
  if (externalCode) {
    const codeMatches = offices.filter((office) => normalizeBranchCode(office.code) === externalCode);
    if (codeMatches.length === 1) return { office: codeMatches[0], match: "code" };
    if (codeMatches.length > 1) return { office: null, match: "conflict", reason: "Kode cocok dengan lebih dari satu kantor SIGAP" };
  }
  const branchName = normalizedOfficeName(branch?.name);
  const nameMatches = offices.filter((office) => normalizedOfficeName(office.name) === branchName);
  if (nameMatches.length === 1) return { office: nameMatches[0], match: "name" };
  if (nameMatches.length > 1) return { office: null, match: "conflict", reason: "Nama cocok dengan lebih dari satu kantor SIGAP" };
  return { office: null, match: "new" };
};

const syncBranches = async (supabase, branches, dryRun) => {
  const { data: currentOffices, error } = await supabase
    .from("master_offices")
    .select("id,code,name,kedudukan,parent_id,marison_branch_id,marison_branch_code,marison_hierarchy_confirmed,marison_review_required,marison_review_reasons");
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
      result.errors.push({ entityType: "branch", externalId: branch?.id ?? null, name: branch?.name || "-", reason: "ID branch tidak valid" });
      continue;
    }
    const resolved = findOfficeForBranch(branch, offices);
    if (resolved.match === "conflict") {
      result.errors.push({ entityType: "branch", externalId, name: branch?.name || "-", reason: resolved.reason });
      continue;
    }
    const existing = resolved.office;
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
      const changed = (
        Number(existing.marison_branch_id) !== externalId
        || String(existing.marison_branch_code || "") !== String(branch.code || "")
        || existing.code !== nextCode
        || existing.name !== nextName
      );
      if (!dryRun) {
        const { data, error: updateError } = await supabase
          .from("master_offices")
          .update({
            code: nextCode,
            name: nextName,
            marison_branch_id: externalId,
            marison_branch_code: String(branch.code || "").trim() || null,
            marison_synced_at: new Date().toISOString(),
            marison_last_seen_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select("id,code,name,kedudukan,parent_id,marison_branch_id,marison_branch_code,marison_hierarchy_confirmed,marison_review_required,marison_review_reasons")
          .single();
        if (updateError) {
          result.errors.push({ entityType: "branch", externalId, name: branch.name, reason: updateError.message });
          continue;
        }
        usedCodes.delete(String(existing.code || "").toUpperCase());
        usedCodes.add(String(data.code || "").toUpperCase());
        Object.assign(existing, data);
        if (changed) {
          result.updated += 1;
          result.updatedApplied += 1;
        }
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
      kedudukan: deriveMarisonOfficeType(branch),
      marison_branch_id: externalId,
      marison_branch_code: String(branch.code || "").trim() || null,
      marison_synced_at: new Date().toISOString(),
      marison_last_seen_at: new Date().toISOString(),
      marison_hierarchy_confirmed: false,
    };
    const { data, error: insertError } = await supabase
      .from("master_offices")
      .insert(payload)
      .select("id,code,name,kedudukan,parent_id,marison_branch_id,marison_branch_code,marison_hierarchy_confirmed,marison_review_required,marison_review_reasons")
      .single();
    if (insertError) {
      result.errors.push({ entityType: "branch", externalId, name: branch.name, reason: insertError.message });
      continue;
    }
    usedCodes.add(code);
    offices.push(data);
    result.mappings.set(externalId, data);
    result.createdApplied += 1;
  }
  for (const branch of Array.isArray(branches) ? branches : []) {
    const resolved = findOfficeForBranch(branch, offices);
    if (resolved.office) result.mappings.set(Number(branch.id), resolved.office);
  }
  return result;
};

const syncDepartments = async (supabase, employees, officeMappings, dryRun) => {
  const { data, error } = await supabase
    .from("master_departments")
    .select("id,name,code,dept_index");
  if (error) throw error;

  const departments = [...(data || [])];
  const byName = new Map(departments.map((row) => [normalizeMarisonName(row.name), row]));
  const required = new Map();
  for (const employee of Array.isArray(employees) ? employees : []) {
    const branchId = Number(employee?.branch?.id);
    const office = Number.isSafeInteger(branchId) ? officeMappings.get(branchId) || null : null;
    const department = resolveMarisonDepartment(employee?.division, office);
    if (department) required.set(normalizeMarisonName(department.name), department);
  }

  const result = { matched: 0, created: 0, createdApplied: 0 };
  for (const [key, department] of required) {
    if (byName.has(key)) {
      result.matched += 1;
      continue;
    }
    result.created += 1;
    if (dryRun) continue;
    const { data: inserted, error: insertError } = await supabase
      .from("master_departments")
      .insert({
        name: department.name,
        code: department.code,
        dept_index: department.deptIndex,
      })
      .select("id,name,code,dept_index")
      .single();
    if (insertError) throw insertError;
    departments.push(inserted);
    byName.set(key, inserted);
    result.createdApplied += 1;
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

const findProjectForExternal = (project, office, projects) => {
  const externalId = Number(project?.id);
  const byExternalId = projects.find((row) => Number(row.marison_project_id) === externalId);
  if (byExternalId) return { project: byExternalId, match: "external_id" };

  const externalCode = normalizeProjectCode(project?.code);
  if (externalCode) {
    const codeMatches = projects.filter((row) => normalizeProjectCode(row.code) === externalCode);
    if (codeMatches.length === 1) return { project: codeMatches[0], match: "code" };
    if (codeMatches.length > 1) {
      return { project: null, match: "conflict", reason: "Kode proyek cocok dengan lebih dari satu proyek SIGAP" };
    }
  }

  const projectName = normalizeMarisonName(project?.name);
  if (projectName && office?.id) {
    const nameMatches = projects.filter((row) => (
      row.office_id === office.id && normalizeMarisonName(row.name) === projectName
    ));
    if (nameMatches.length === 1) return { project: nameMatches[0], match: "name_office" };
    if (nameMatches.length > 1) {
      return { project: null, match: "conflict", reason: "Nama proyek pada kantor yang sama cocok dengan lebih dari satu proyek SIGAP" };
    }
  }

  return { project: null, match: "new" };
};

const syncProjects = async (supabase, { projects, branches }, dryRun) => {
  const branchResult = await syncBranches(supabase, branches, dryRun);
  const [projectsResult, officesResult] = await Promise.all([
    supabase.from("master_projects").select("id,office_id,entity_id,code,name,marison_project_id,marison_project_code,marison_review_required,marison_review_reasons"),
    supabase.from("master_offices").select("id,code,name,kedudukan,marison_branch_id"),
  ]);
  if (projectsResult.error) throw projectsResult.error;
  if (officesResult.error) throw officesResult.error;

  const localProjects = [...(projectsResult.data || [])];
  const offices = officesResult.data || [];
  const branchMappings = new Map(branchResult.mappings);
  for (const office of offices) {
    if (office.marison_branch_id != null) branchMappings.set(Number(office.marison_branch_id), office);
  }
  const fallbackOffice = offices.find((office) => normalizeMarisonName(office.kedudukan) === "pusat")
    || offices.find((office) => normalizeMarisonName(office.name).includes("kantor pusat"))
    || offices[0]
    || null;
  const result = {
    matched: 0,
    created: 0,
    updated: 0,
    createdApplied: 0,
    updatedApplied: 0,
    errors: [...branchResult.errors],
  };

  for (const rawProject of Array.isArray(projects) ? projects : []) {
    const externalId = Number(rawProject?.id);
    const externalName = String(rawProject?.name || "").trim();
    const branchId = Number(rawProject?.branch?.id ?? rawProject?.branch_id);
    if (!Number.isSafeInteger(externalId)) {
      result.errors.push({ entityType: "project", externalId: rawProject?.id ?? null, name: externalName || "-", reason: "ID proyek tidak valid" });
      continue;
    }
    const sourceCode = normalizeProjectCode(rawProject?.code);
    const externalCode = sourceCode || `EXT-PROJECT-${externalId}`;
    if (!externalName) {
      result.errors.push({ entityType: "project", externalId, name: "-", reason: "Nama proyek external belum tersedia" });
      continue;
    }
    const hasBranch = Number.isSafeInteger(branchId);
    const office = hasBranch ? branchMappings.get(branchId) : fallbackOffice;
    if (!office?.id) {
      result.errors.push({
        entityType: "project",
        externalId,
        name: externalName,
        reason: hasBranch
          ? `Branch external ${branchId} belum termapping ke kantor SIGAP`
          : "Branch proyek external belum tersedia dan kantor pusat penampung belum tersedia",
      });
      continue;
    }
    const resolved = findProjectForExternal(rawProject, office, localProjects);
    if (resolved.match === "conflict") {
      result.errors.push({ entityType: "project", externalId, name: externalName, reason: resolved.reason });
      continue;
    }

    const existing = resolved.project;
    const entityId = existing?.entity_id || null;
    const reviewReasons = [
      ...(sourceCode ? [] : ["Kode proyek external belum tersedia"]),
      ...(hasBranch ? [] : ["Branch proyek external belum tersedia"]),
      ...(entityId ? [] : ["Entitas proyek belum dipilih"]),
    ];
    if (existing) {
      result.matched += 1;
      const payload = {
        code: externalCode,
        name: externalName,
        office_id: office.id,
        entity_id: entityId,
        marison_project_id: externalId,
        marison_project_code: externalCode,
        marison_synced_at: new Date().toISOString(),
        marison_last_seen_at: new Date().toISOString(),
        marison_review_required: reviewReasons.length > 0,
        marison_review_reasons: reviewReasons,
      };
      const changed = (
        Number(existing.marison_project_id) !== externalId
        || String(existing.marison_project_code || "") !== externalCode
        || existing.code !== externalCode
        || existing.name !== externalName
        || existing.office_id !== office.id
        || existing.entity_id !== payload.entity_id
      );
      if (!dryRun) {
        const { data, error } = await supabase
          .from("master_projects")
          .update(payload)
          .eq("id", existing.id)
          .select("id,office_id,entity_id,code,name,marison_project_id,marison_project_code,marison_review_required,marison_review_reasons")
          .single();
        if (error) {
          result.errors.push({ entityType: "project", externalId, name: externalName, reason: error.message });
          continue;
        }
        Object.assign(existing, data);
        if (changed) {
          result.updated += 1;
          result.updatedApplied += 1;
        }
      } else if (changed) {
        result.updated += 1;
      }
      continue;
    }

    result.created += 1;
    if (dryRun) continue;
    const { data, error } = await supabase
      .from("master_projects")
      .insert({
        code: externalCode,
        name: externalName,
        office_id: office.id,
        entity_id: null,
        marison_project_id: externalId,
        marison_project_code: externalCode,
        marison_synced_at: new Date().toISOString(),
        marison_last_seen_at: new Date().toISOString(),
        marison_review_required: reviewReasons.length > 0,
        marison_review_reasons: reviewReasons,
      })
      .select("id,office_id,entity_id,code,name,marison_project_id,marison_project_code,marison_review_required,marison_review_reasons")
      .single();
    if (error) {
      result.errors.push({ entityType: "project", externalId, name: externalName, reason: error.message });
      continue;
    }
    localProjects.push(data);
    result.createdApplied += 1;
  }

  return result;
};

export const previewMarisonProjectSync = async ({ supabase, projects, branches, environment = "staging" }) => {
  const projectResult = await syncProjects(supabase, { projects, branches }, true);
  return {
    environment,
    generatedAt: new Date().toISOString(),
    source: {
      projects: Array.isArray(projects) ? projects.length : 0,
      branches: Array.isArray(branches) ? branches.length : 0,
    },
    matched: projectResult.matched,
    toCreate: projectResult.created,
    toUpdate: projectResult.updated,
    blocked: projectResult.errors.length,
    issues: projectResult.errors,
  };
};

export const executeMarisonProjectSync = async ({ supabase, projects, branches, environment = "staging" }) => {
  const projectResult = await syncProjects(supabase, { projects, branches }, false);
  return {
    environment,
    completedAt: new Date().toISOString(),
    source: Array.isArray(projects) ? projects.length : 0,
    created: projectResult.createdApplied,
    updated: projectResult.updatedApplied,
    matched: projectResult.matched,
    failed: projectResult.errors.length,
    errors: projectResult.errors,
  };
};

const buildProfileIndexes = (profiles) => {
  const byExternalId = new Map();
  const byNik = new Map();
  const byEmail = new Map();
  const byName = new Map();
  for (const profile of profiles) {
    if (profile.marison_employee_id != null) byExternalId.set(Number(profile.marison_employee_id), profile);
    const nik = marisonNikKey(profile.nik);
    if (nik) {
      const rows = byNik.get(nik) || [];
      rows.push(profile);
      byNik.set(nik, rows);
    }
    const email = normalizeEmail(profile.email);
    if (email) {
      const rows = byEmail.get(email) || [];
      rows.push(profile);
      byEmail.set(email, rows);
    }
    const name = normalizeMarisonName(profile.full_name);
    if (name) {
      const rows = byName.get(name) || [];
      rows.push(profile);
      byName.set(name, rows);
    }
  }
  return { byExternalId, byNik, byEmail, byName };
};

export const canUseMarisonNameFallback = (employee, profile) => {
  if (normalizeMarisonName(employee?.name) !== normalizeMarisonName(profile?.full_name)) return false;
  const profileNik = marisonNikKey(profile?.nik);
  return !profileNik || profileNik === marisonNikKey(employee?.nik);
};

const resolveExistingProfile = (employee, indexes) => {
  const external = indexes.byExternalId.get(Number(employee.id));
  if (external) return { profile: external, match: "external_id" };
  const nikRows = indexes.byNik.get(marisonNikKey(employee.nik)) || [];
  if (nikRows.length === 1) return { profile: nikRows[0], match: "nik" };
  if (nikRows.length > 1) return { profile: null, match: "ambiguous_nik" };
  const emailRows = isValidEmail(employee.email) ? indexes.byEmail.get(normalizeEmail(employee.email)) || [] : [];
  if (emailRows.length === 1) return { profile: emailRows[0], match: "email" };
  if (emailRows.length > 1) return { profile: null, match: "ambiguous_email" };
  const names = indexes.byName.get(normalizeMarisonName(employee.name)) || [];
  if (names.length > 0) return { profile: null, match: "name_requires_review" };
  return { profile: null, match: "new" };
};

const buildEmployeePlan = (employees, state, officeMappings, environment = "staging") => {
  const indexes = buildProfileIndexes(state.profiles);
  const nameCounts = new Map();
  for (const employee of employees) {
    const name = normalizeMarisonName(employee.name);
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }
  const authByEmail = new Map(state.authUsers.map((user) => [String(user.email || "").toLowerCase(), user]));
  const authById = new Map(state.authUsers.map((user) => [user.id, user]));
  const profileIds = new Set(state.profiles.map((profile) => profile.id));
  const departmentsById = new Map(state.departments.map((department) => [department.id, department]));
  const departmentsByName = new Map(state.departments.map((department) => [normalizeMarisonName(department.name), department]));
  for (const alias of state.departmentAliases) {
    const department = departmentsById.get(alias.department_id);
    if (!department) continue;
    departmentsByName.set(normalizeMarisonName(alias.alias_name), department);
    departmentsByName.set(normalizeMarisonName(alias.normalized_alias), department);
  }
  const plan = [];

  for (const employee of employees) {
    const resolved = resolveExistingProfile(employee, indexes);
    if (["ambiguous_nik", "ambiguous_email", "name_requires_review"].includes(resolved.match)) {
      const reasons = {
        ambiguous_nik: "NIK cocok dengan lebih dari satu profil SIGAP",
        ambiguous_email: "Email cocok dengan lebih dari satu profil SIGAP",
        name_requires_review: "Nama sudah ada tetapi NIK/email tidak cocok; mapping harus dikonfirmasi admin",
      };
      plan.push({ employee, action: "blocked", reason: reasons[resolved.match] });
      continue;
    }
    const duplicateName = (nameCounts.get(normalizeMarisonName(employee.name)) || 0) > 1;
    const externalEmail = isValidEmail(employee.email) ? normalizeEmail(employee.email) : "";
    const existingEmail = normalizeEmail(resolved.profile?.email);
    if (environment === "production" && !externalEmail && !existingEmail) {
      plan.push({ employee, action: "blocked", reason: "Email external wajib tersedia untuk sinkronisasi production" });
      continue;
    }
    let email = externalEmail
      || existingEmail
      || buildMarisonStagingEmail(employee, duplicateName);
    let currentAuth = resolved.profile ? authById.get(resolved.profile.id) : null;
    const occupied = authByEmail.get(email);
    if (!resolved.profile && occupied && !profileIds.has(occupied.id)) {
      currentAuth = occupied;
    }
    if (occupied && occupied.id !== currentAuth?.id) {
      if (externalEmail) {
        plan.push({ employee, action: "blocked", reason: "Email external sudah digunakan oleh akun SIGAP lain" });
        continue;
      }
      email = `${emailSlug(employee.name)}.${marisonNikKey(employee.nik).toLowerCase() || employee.id}.${employee.id}@staging.test`;
    }
    const externalBranchId = Number(employee?.branch?.id);
    const office = Number.isSafeInteger(externalBranchId) ? officeMappings.get(externalBranchId) || null : null;
    const externalDepartmentName = meaningfulText(employee.division) || meaningfulText(employee.department);
    const derivedDepartmentName = resolveMarisonDepartment(employee.division, office)?.name || "";
    const department = [
      externalDepartmentName,
      derivedDepartmentName,
    ].map(normalizeMarisonName).map((name) => departmentsByName.get(name)).find(Boolean) || null;
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
  entityType: "employee",
  externalId: item?.employee?.id ?? item?.id ?? null,
  nik: normalizeMarisonNik(item?.employee?.nik ?? item?.nik),
  name: item?.employee?.name ?? item?.name ?? "-",
  reason: item?.reason || "Data tidak valid",
});

export const previewMarisonEmployeeSync = async ({ supabase, employees, branches, environment = "staging" }) => {
  const state = await loadSyncState(supabase);
  const deduplicated = deduplicateMarisonEmployees(employees, {
    knownNames: state.profiles.map((profile) => profile.full_name),
  });
  const branchResult = await syncBranches(supabase, branches, true);
  const prospectiveMappings = new Map();
  for (const branch of branches) {
    const resolved = findOfficeForBranch(branch, state.offices);
    if (resolved.office) prospectiveMappings.set(Number(branch.id), resolved.office);
  }
  const departmentResult = await syncDepartments(supabase, deduplicated.employees, prospectiveMappings, true);
  const plan = buildEmployeePlan(deduplicated.employees, state, prospectiveMappings, environment);
  const blockedPlan = plan.filter((item) => item.action === "blocked");
  return {
    environment,
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
    departments: {
      matched: departmentResult.matched,
      toCreate: departmentResult.created,
      blocked: 0,
    },
    employees: {
      ready: plan.filter((item) => item.action !== "blocked").length,
      toCreate: plan.filter((item) => item.action === "create").length,
      toUpdate: plan.filter((item) => item.action === "update").length,
      blocked: deduplicated.conflictingNik.length + blockedPlan.length,
      missingNik: deduplicated.missingNik.length,
      conflictingNik: deduplicated.conflictingNik.length,
      mergedDuplicates: deduplicated.mergedDuplicates.length,
      resolvedConflicts: deduplicated.resolvedConflicts.length,
    },
    issues: [
      ...deduplicated.conflictingNik.map((conflict) => ({ entityType: "employee", ...conflict, reason: "Satu NIK dipakai oleh nama berbeda pada API external" })),
      ...blockedPlan.map(publicIssue),
      ...branchResult.errors,
    ],
  };
};

export const executeMarisonEmployeeSync = async ({ supabase, employees, branches, defaultPassword, environment = "staging" }) => {
  if (environment === "staging" && (typeof defaultPassword !== "string" || defaultPassword.length < 8)) {
    throw new Error("STAGING_DEFAULT_USER_PASSWORD belum dikonfigurasi dengan aman.");
  }
  const branchResult = await syncBranches(supabase, branches, false);
  const departmentResult = await syncDepartments(supabase, employees, branchResult.mappings, false);
  const state = await loadSyncState(supabase);
  const deduplicated = deduplicateMarisonEmployees(employees, {
    knownNames: state.profiles.map((profile) => profile.full_name),
  });
  const plan = buildEmployeePlan(deduplicated.employees, state, branchResult.mappings, environment);
  const result = {
    created: 0,
    updated: 0,
    failed: 0,
    skipped: deduplicated.conflictingNik.length,
    branchesCreated: branchResult.createdApplied,
    branchesUpdated: branchResult.updatedApplied,
    departmentsCreated: departmentResult.createdApplied,
    errors: [
      ...deduplicated.conflictingNik.map((conflict) => ({ entityType: "employee", ...conflict, reason: "Satu NIK dipakai oleh nama berbeda pada API external" })),
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
        const authUpdates = {
          email: item.email,
          email_confirm: true,
          user_metadata: { full_name: String(employee.name || item.profile?.full_name || "").trim() },
        };
        const { error: authError } = await supabase.auth.admin.updateUserById(userId, authUpdates);
        if (authError) throw authError;
      } else {
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: item.email,
          password: environment === "production"
            ? randomBytes(32).toString("base64url")
            : defaultPassword,
          email_confirm: true,
          user_metadata: { full_name: String(employee.name || "").trim() },
        });
        if (authError || !authData?.user?.id) throw authError || new Error("Akun Auth tidak terbentuk");
        userId = authData.user.id;
      }

      const existing = item.profile || {};
      const externalNik = normalizeMarisonNik(employee.nik);
      const externalName = String(employee.name || "").trim();
      const externalPhone = String(employee.phone || "").trim();
      const active = resolveMarisonEmployeeActive(employee.status, existing.is_active ?? true);
      const profilePayload = {
        id: userId,
        nik: externalNik || existing.nik || `EXT-${employee.id}`,
        full_name: externalName || existing.full_name || `Karyawan External ${employee.id}`,
        email: item.email,
        phone: externalPhone || existing.phone || null,
        role: existing.role || "user",
        job_title: item.derivedJobTitle || existing.job_title || "Karyawan",
        department_id: item.department?.id || existing.department_id || null,
        office_id: item.office?.id || existing.office_id || null,
        parent_id: existing.parent_id || null,
        join_date: existing.join_date || null,
        resign_date: existing.resign_date || null,
        is_active: active,
        deleted_at: null,
        marison_employee_id: Number(employee.id),
        marison_user_id: Number.isSafeInteger(Number(employee.user_id)) ? Number(employee.user_id) : null,
        marison_synced_at: new Date().toISOString(),
        marison_last_seen_at: new Date().toISOString(),
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
    environment,
    completedAt: new Date().toISOString(),
    ...result,
  };
};

const sanitizeSyncIssueDetails = (issue) => ({
  name: String(issue?.name || "-").slice(0, 200),
  nik: String(issue?.nik || "").slice(0, 80),
  externalIds: Array.isArray(issue?.externalIds) ? issue.externalIds.slice(0, 20) : undefined,
});

export const replaceMarisonSyncIssues = async ({ supabase, environment, issues, entityTypes }) => {
  const types = [...new Set(entityTypes || [])].filter((value) => ["branch", "employee", "project"].includes(value));
  if (types.length > 0) {
    const { error: resolveError } = await supabase
      .from("marison_sync_issues")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("environment", environment)
      .eq("status", "open")
      .in("entity_type", types);
    if (resolveError) throw resolveError;
  }

  for (const issue of Array.isArray(issues) ? issues : []) {
    const entityType = ["branch", "employee", "project"].includes(issue?.entityType) ? issue.entityType : "employee";
    const externalId = String(issue?.externalId ?? issue?.nik ?? "").trim();
    if (!externalId) continue;
    const { error } = await supabase
      .from("marison_sync_issues")
      .insert({
        environment,
        entity_type: entityType,
        external_id: externalId,
        reason: String(issue?.reason || "Data tidak valid").slice(0, 500),
        details: sanitizeSyncIssueDetails(issue),
        status: "open",
        last_seen_at: new Date().toISOString(),
        resolved_at: null,
        resolved_by: null,
      });
    if (error) throw error;
  }
};

export const runTrackedMarisonSync = async ({
  supabase,
  environment,
  triggerType,
  scope,
  initiatedBy = null,
  operation,
}) => {
  await supabase
    .from("marison_sync_runs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: "Proses tidak selesai dan melewati batas lock dua jam.",
    })
    .eq("environment", environment)
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

  const { data: run, error: startError } = await supabase
    .from("marison_sync_runs")
    .insert({
      environment,
      trigger_type: triggerType,
      scope,
      status: "running",
      initiated_by: initiatedBy,
    })
    .select("id")
    .single();
  if (startError) {
    const error = new Error(startError.code === "23505"
      ? "Sinkronisasi data external sedang berjalan."
      : startError.message);
    error.status = startError.code === "23505" ? 409 : 500;
    throw error;
  }

  try {
    const result = await operation();
    const issues = Array.isArray(result?.errors) ? result.errors : [];
    const entityTypes = scope === "branches"
      ? ["branch"]
      : scope === "projects"
        ? ["branch", "project"]
        : ["branch", "employee"];
    await replaceMarisonSyncIssues({ supabase, environment, issues, entityTypes });
    const status = Number(result?.failed || 0) > 0 || issues.length > 0 ? "partial" : "success";
    const stats = Object.fromEntries(Object.entries(result || {}).filter(([key]) => key !== "errors"));
    const { error: finishError } = await supabase
      .from("marison_sync_runs")
      .update({
        status,
        completed_at: new Date().toISOString(),
        stats,
      })
      .eq("id", run.id);
    if (finishError) throw finishError;
    return { ...result, runId: run.id, status };
  } catch (cause) {
    await supabase
      .from("marison_sync_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: String(cause?.message || "Sinkronisasi gagal").slice(0, 1000),
      })
      .eq("id", run.id);
    throw cause;
  }
};
