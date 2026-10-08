import { createUserSupabaseClient, adminSupabase } from "../lib/supabase.js";
import {
  hasUnavailableMarisonProjectBranch,
  resolveStagingProjectReadiness,
  type StagingProjectReadinessProject,
} from "@sigap/shared";

type QueryResult = {
  data: unknown[] | null;
  error: { message?: string } | null;
};

const assertQuery = (label: string, result: QueryResult) => {
  if (result.error) {
    const error = new Error(`Gagal memuat ${label}: ${result.error.message || "query gagal"}`) as Error & {
      statusCode: number;
    };
    error.statusCode = 503;
    throw error;
  }
  return result.data || [];
};

const loadAllCandidateRows = async (
  label: string,
  queryPage: (from: number, to: number) => PromiseLike<QueryResult>,
): Promise<QueryResult> => {
  const rows: unknown[] = [];
  const pageSize = 500;
  for (let page = 0; page < 100; page += 1) {
    const result = await queryPage(page * pageSize, (page + 1) * pageSize - 1);
    const batch = assertQuery(label, result);
    rows.push(...batch);
    if (batch.length < pageSize) return { data: rows, error: null };
  }
  // Do not return a truncated hierarchy/candidate list as a valid result.
  return { data: null, error: { message: `Daftar ${label} melebihi batas pemuatan.` } };
};

const marisonDeploymentEnvironment = String(
  process.env.MARISON_DEPLOYMENT_ENVIRONMENT || "",
).trim().toLowerCase();

type MasterRow = Record<string, unknown>;

const toStr = (value: unknown): string => value == null ? "" : String(value);
const toPositiveId = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

type OfficeReadinessInfo = {
  name: string;
  branchId: number | null;
  synced: boolean;
};

const readOfficeInfo = (row: MasterRow): OfficeReadinessInfo => ({
  name: toStr(row.name),
  branchId: toPositiveId(row.marison_branch_id),
  synced: Boolean(row.marison_synced_at),
});

const readProjectReadiness = (
  row: MasterRow,
  office: OfficeReadinessInfo | undefined,
): StagingProjectReadinessProject => ({
  projectId: toPositiveId(row.marison_project_id),
  synced: Boolean(row.marison_synced_at),
  reviewBlocked: hasUnavailableMarisonProjectBranch(row.marison_review_reasons),
  officeBranchId: office?.branchId ?? null,
  officeSynced: Boolean(office?.synced),
});

/**
 * Memperkaya master data dengan kesiapan Marison yang menghormati mapping
 * staging (marison_outbound_record_mappings). Hanya aktif di environment
 * staging dan hanya menambah kolom marison_* tanpa mengubah data asli, sehingga
 * production dan response lama tetap kompatibel.
 */
const enrichStagingMarisonMappings = async (
  projects: MasterRow[],
  offices: MasterRow[],
) => {
  const { data: mappingRows, error: mappingError } = await adminSupabase!
    .from("marison_outbound_record_mappings")
    .select("entity_type, record_id, target_record_id")
    .eq("environment", "staging")
    .in("entity_type", ["office", "project"]);
  if (mappingError) throw mappingError;

  const officeMappingByRecord = new Map<string, string>();
  const projectMappingByRecord = new Map<string, string>();
  for (const row of (mappingRows || []) as MasterRow[]) {
    const recordId = toStr(row.record_id);
    const targetId = toStr(row.target_record_id);
    if (!recordId || !targetId) continue;
    if (row.entity_type === "office") officeMappingByRecord.set(recordId, targetId);
    else if (row.entity_type === "project") projectMappingByRecord.set(recordId, targetId);
  }

  // Kantor: semua master ter-load + target mapping office + kantor proyek target.
  const officeInfoById = new Map<string, OfficeReadinessInfo>();
  for (const office of offices) officeInfoById.set(toStr(office.id), readOfficeInfo(office));
  const targetOfficeIds = new Set<string>(officeMappingByRecord.values());
  const targetProjectIds = [...projectMappingByRecord.values()];

  if (targetOfficeIds.size > 0) {
    const { data, error } = await adminSupabase!
      .from("master_offices")
      .select("id, name, marison_branch_id, marison_synced_at")
      .in("id", [...targetOfficeIds]);
    if (error) throw error;
    for (const row of (data || []) as MasterRow[]) {
      officeInfoById.set(toStr(row.id), readOfficeInfo(row));
    }
  }

  const projectInfoById = new Map<string, MasterRow>();
  if (targetProjectIds.length > 0) {
    const { data, error } = await adminSupabase!
      .from("master_projects")
      .select("id, office_id, code, name, marison_project_id, marison_synced_at, marison_review_reasons")
      .in("id", targetProjectIds);
    if (error) throw error;
    for (const row of (data || []) as MasterRow[]) projectInfoById.set(toStr(row.id), row);
  }

  const branchExistsSynced = (branchId: number | null): boolean =>
    branchId !== null
    && [...officeInfoById.values()].some((info) => info.branchId === branchId && info.synced);

  for (const project of projects) {
    const row = project as MasterRow;
    const projectOffice = officeInfoById.get(toStr(row.office_id));

    const directProject = row.marison_project_id == null || toStr(row.marison_project_id) === ""
      ? null
      : readProjectReadiness(row, projectOffice);
    const targetRow = projectMappingByRecord.has(toStr(row.id))
      ? projectInfoById.get(projectMappingByRecord.get(toStr(row.id))!)
      : undefined;
    const mappedProject = targetRow
      ? readProjectReadiness(targetRow, officeInfoById.get(toStr(targetRow.office_id)))
      : null;

    const officeMappingTargetId = officeMappingByRecord.get(toStr(row.office_id));
    const officeMappingTarget = officeMappingTargetId ? officeInfoById.get(officeMappingTargetId) : undefined;
    let officeMappingBranchId: number | null = null;
    if (officeMappingTarget && officeMappingTarget.branchId !== null && officeMappingTarget.synced) {
      officeMappingBranchId = officeMappingTarget.branchId;
    }

    const result = resolveStagingProjectReadiness({
      directProject,
      mappedProject,
      officeMappingBranchId,
      effectiveBranchExistsSynced: branchExistsSynced,
    });

    row.marison_effective_project_id = result.projectId;
    row.marison_effective_branch_id = result.branchId;
    row.marison_mapping_ready = result.ready;
    row.marison_mapping_source = result.branchSource;

    if (result.ready) {
      const mappedIdentity = result.branchSource === "staging_mapping" && targetRow ? targetRow : row;
      const displayOffice = mappedIdentity === targetRow
        ? officeInfoById.get(toStr(mappedIdentity.office_id))
        : projectOffice;
      row.marison_effective_project_code = toStr(mappedIdentity.code) || toStr(row.code);
      row.marison_effective_project_name = toStr(mappedIdentity.name) || toStr(row.name);
      row.marison_effective_branch_name = displayOffice ? toStr(displayOffice.name) : "";
    }
  }
};

export const loadSuratMasterData = async (accessToken: string) => {
  const client = createUserSupabaseClient(accessToken);
  const results = await Promise.all([
    client.from("master_entities").select("*"),
    loadAllCandidateRows("kantor", (from, to) =>
      client.from("master_offices").select("*").order("id").range(from, to)),
    client.from("master_departments").select("*"),
    client.from("master_letter_types").select("*"),
    client.from("master_dept_letter_types").select("dept_id, letter_type_id, sort_index"),
    loadAllCandidateRows("pengguna", (from, to) =>
      client.from("profiles").select("id, full_name, job_title, department_id, office_id, is_active, deleted_at")
        .eq("is_active", true).is("deleted_at", null).order("full_name").order("id").range(from, to)),
    client.from("master_projects").select("*").order("name"),
    client.from("master_penggunaan_detail").select("*").order("created_at", { ascending: false }),
  ]);

  const data = {
    entities: assertQuery("entitas", results[0] as QueryResult),
    offices: assertQuery("kantor", results[1] as QueryResult),
    departments: assertQuery("departemen", results[2] as QueryResult),
    letterTypes: assertQuery("jenis dokumen", results[3] as QueryResult),
    departmentLetterTypes: assertQuery("relasi jenis dokumen", results[4] as QueryResult),
    users: assertQuery("pengguna", results[5] as QueryResult),
    projects: assertQuery("proyek", results[6] as QueryResult),
    usages: assertQuery("kegunaan form", results[7] as QueryResult),
  };

  if (marisonDeploymentEnvironment === "staging" && adminSupabase) {
    await enrichStagingMarisonMappings(data.projects as MasterRow[], data.offices as MasterRow[]);
  }

  return data;
};
