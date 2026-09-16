/**
 * Repository Supabase untuk Team Overview server-side (CAL-03 F4A).
 *
 * Prinsip:
 * - tidak ada `any`, `@ts-*`, atau double cast; setiap baris divalidasi ketat;
 * - AbortSignal diteruskan ke query supaya permintaan lama benar-benar batal;
 * - tidak ada fallback yang bisa memperluas data: kegagalan selalu melempar
 *   error terkontrol, bukan mengembalikan himpunan kosong yang menyesatkan.
 */

import type { WorkEntry } from "../types/work-calendar";
import type {
  WorkTeamOverviewEntryQuery,
  WorkTeamOverviewMember,
  WorkTeamOverviewOption,
  WorkTeamOverviewOptionKind,
  WorkTeamOverviewPage,
  WorkTeamOverviewQuery,
  WorkTeamOverviewRepository,
} from "../types/work-team-overview";
import { WORK_TEAM_OVERVIEW_OPTION_KINDS } from "../types/work-team-overview";
import { toWorkTeamOverviewDbStatus } from "../lib/work-team-overview";
import type { WorkCalendarEntryRow } from "./work-entry-row-mapper";
import { mapWorkEntryRow } from "./work-entry-row-mapper";

export interface WorkTeamOverviewRpcQuery<TResult = unknown>
  extends PromiseLike<{ data: TResult; error: { message: string } | null }> {
  abortSignal?(signal: AbortSignal): WorkTeamOverviewRpcQuery<TResult>;
}

export interface SupabaseWorkTeamOverviewClient {
  rpc<TResult = unknown>(
    fn: string,
    args?: Record<string, unknown>,
  ): WorkTeamOverviewRpcQuery<TResult>;
}

/** Baris mentah dari `list_work_calendar_team_overview`. */
export interface WorkTeamOverviewRow {
  member_id: string | null;
  full_name: string | null;
  job_title: string | null;
  office_id: string | null;
  office_name: string | null;
  department_id: string | null;
  department_name: string | null;
  member_total: number | string | null;
  member_completed: number | string | null;
  member_in_progress: number | string | null;
  member_planned: number | string | null;
  member_blocked: number | string | null;
  member_overdue: number | string | null;
  total_count: number | string | null;
  aggregate_total: number | string | null;
  aggregate_completed: number | string | null;
  aggregate_in_progress: number | string | null;
  aggregate_planned: number | string | null;
  aggregate_blocked: number | string | null;
  aggregate_overdue: number | string | null;
}

/** Baris mentah dari `list_work_calendar_team_overview_options`. */
export interface WorkTeamOverviewOptionRow {
  option_kind: string | null;
  option_id: string | null;
  option_label: string | null;
  option_sublabel: string | null;
  office_id: string | null;
  department_id: string | null;
  member_count: number | string | null;
}

const OVERVIEW_RPC = "list_work_calendar_team_overview";
const OPTIONS_RPC = "list_work_calendar_team_overview_options";
const MEMBER_ENTRIES_RPC = "list_work_calendar_member_entries";

/** Nama tampilan cadangan; tidak pernah memakai UUID mentah. */
export const WORK_TEAM_OVERVIEW_UNNAMED_LABEL = "Anggota tanpa nama";

function readCount(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`Data ringkasan tim tidak valid: kolom "${field}" bukan angka.`);
}

function readNullableId(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  throw new Error(`Data ringkasan tim tidak valid: kolom "${field}" bukan teks.`);
}

function readText(value: unknown, field: string): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  throw new Error(`Data ringkasan tim tidak valid: kolom "${field}" bukan teks.`);
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Nama anggota tidak pernah memakai id, termasuk ketika `full_name` kosong. */
export function resolveWorkTeamOverviewMemberName(row: WorkTeamOverviewRow): string {
  const name = normalizeOptionalText(row.full_name);
  return name ?? WORK_TEAM_OVERVIEW_UNNAMED_LABEL;
}

export function mapWorkTeamOverviewRow(row: WorkTeamOverviewRow): WorkTeamOverviewMember {
  if (!row.member_id) {
    throw new Error("Data ringkasan tim tidak valid: anggota tanpa id.");
  }

  return {
    owner: {
      id: row.member_id,
      name: resolveWorkTeamOverviewMemberName(row),
      jobTitle: normalizeOptionalText(row.job_title),
    },
    officeId: row.office_id ?? null,
    officeName: normalizeOptionalText(row.office_name),
    departmentId: row.department_id ?? null,
    departmentName: normalizeOptionalText(row.department_name),
    progress: {
      total: readCount(row.member_total, "member_total"),
      planned: readCount(row.member_planned, "member_planned"),
      inProgress: readCount(row.member_in_progress, "member_in_progress"),
      completed: readCount(row.member_completed, "member_completed"),
      blocked: readCount(row.member_blocked, "member_blocked"),
      overdue: readCount(row.member_overdue, "member_overdue"),
    },
  };
}

function isWorkTeamOverviewOptionKind(
  value: unknown,
): value is WorkTeamOverviewOptionKind {
  return (
    typeof value === "string" &&
    (WORK_TEAM_OVERVIEW_OPTION_KINDS as readonly string[]).includes(value)
  );
}

export function mapWorkTeamOverviewOptionRow(
  row: WorkTeamOverviewOptionRow,
): WorkTeamOverviewOption {
  if (!isWorkTeamOverviewOptionKind(row.option_kind)) {
    throw new Error(
      `Data opsi organisasi tidak valid: jenis "${row.option_kind ?? ""}" tidak dikenali.`,
    );
  }
  if (!row.option_id) {
    throw new Error("Data opsi organisasi tidak valid: opsi tanpa id.");
  }

  return {
    kind: row.option_kind,
    id: row.option_id,
    label: normalizeOptionalText(row.option_label) ?? WORK_TEAM_OVERVIEW_UNNAMED_LABEL,
    sublabel: normalizeOptionalText(row.option_sublabel),
    officeId: readNullableId(row.office_id, "office_id"),
    departmentId: readNullableId(row.department_id, "department_id"),
    memberCount: readCount(row.member_count, "member_count"),
  };
}

function mapOverviewPage(
  rows: readonly WorkTeamOverviewRow[],
  page: number,
  pageSize: number,
): WorkTeamOverviewPage {
  const members = rows.map(mapWorkTeamOverviewRow);
  const first = rows[0];

  // Tanpa baris, hasil filter memang kosong: window aggregate tidak
  // menghasilkan baris pada himpunan kosong.
  if (!first) {
    return {
      members,
      totalCount: 0,
      aggregate: { total: 0, planned: 0, inProgress: 0, completed: 0, blocked: 0, overdue: 0 },
      page,
      pageSize,
    };
  }

  return {
    members,
    totalCount: readCount(first.total_count, "total_count"),
    aggregate: {
      total: readCount(first.aggregate_total, "aggregate_total"),
      planned: readCount(first.aggregate_planned, "aggregate_planned"),
      inProgress: readCount(first.aggregate_in_progress, "aggregate_in_progress"),
      completed: readCount(first.aggregate_completed, "aggregate_completed"),
      blocked: readCount(first.aggregate_blocked, "aggregate_blocked"),
      overdue: readCount(first.aggregate_overdue, "aggregate_overdue"),
    },
    page,
    pageSize,
  };
}

export function createSupabaseWorkTeamOverviewRepository(
  client: SupabaseWorkTeamOverviewClient,
): WorkTeamOverviewRepository {
  return {
    async listTeamOverview({ filters, page, pageSize, sort, signal }) {
      const dbStatus = toWorkTeamOverviewDbStatus(filters.status);

      let query = client.rpc<WorkTeamOverviewRow[] | null>(OVERVIEW_RPC, {
        p_office_id: filters.officeId,
        p_department_id: filters.departmentId,
        p_member_id: filters.memberId,
        p_search: filters.search.trim().length > 0 ? filters.search.trim() : null,
        p_status: dbStatus,
        p_work_date: filters.workDate,
        p_sort: sort,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      });

      if (signal && typeof query.abortSignal === "function") {
        query = query.abortSignal(signal);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error("Gagal memuat ringkasan tim.");
      }

      return mapOverviewPage(data ?? [], page, pageSize);
    },

    async listAuthorizedOrganizationOptions(signal) {
      let query = client.rpc<WorkTeamOverviewOptionRow[] | null>(OPTIONS_RPC);

      if (signal && typeof query.abortSignal === "function") {
        query = query.abortSignal(signal);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error("Gagal memuat pilihan organisasi.");
      }

      return (data ?? []).map(mapWorkTeamOverviewOptionRow);
    },

    async listTeamMemberEntries({ memberId, date, signal }: WorkTeamOverviewEntryQuery) {
      let query = client.rpc<WorkCalendarEntryRow[] | null>(MEMBER_ENTRIES_RPC, {
        p_member_id: memberId,
        p_work_date: date,
      });

      if (signal && typeof query.abortSignal === "function") {
        query = query.abortSignal(signal);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error("Gagal memuat pekerjaan anggota.");
      }

      const entries: readonly WorkEntry[] = (data ?? []).map(mapWorkEntryRow);
      return entries;
    },
  };
}
