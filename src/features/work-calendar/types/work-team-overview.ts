/**
 * Kontrak domain Team Overview server-side (CAL-03 F4A Director Scale).
 *
 * Modul ini sengaja bebas dari Supabase dan React supaya:
 * - repository dapat diganti pada test tanpa jaringan;
 * - bentuk data yang dipakai UI tidak bergantung pada detail PostgREST.
 *
 * Penting: `Entitas` sengaja tidak ada di sini. Audit schema canonical
 * menunjukkan tidak ada relasi profile/office/department -> entity, sehingga
 * menambahkannya akan berarti mengarang model organisasi.
 */

import type {
  WorkDate,
  WorkEntry,
  WorkEntryOwner,
  WorkProgressCounts,
} from "./work-calendar";

/** Urutan hasil server. `priority` adalah urutan default. */
export const WORK_TEAM_OVERVIEW_SORTS = [
  "priority",
  "progress_asc",
  "progress_desc",
  "name",
] as const;

export type WorkTeamOverviewSort = (typeof WORK_TEAM_OVERVIEW_SORTS)[number];

/** Filter status; `all` berarti tidak menyaring status. */
export const WORK_TEAM_OVERVIEW_STATUS_FILTERS = [
  "all",
  "planned",
  "in_progress",
  "completed",
  "blocked",
  "overdue",
] as const;

export type WorkTeamOverviewStatusFilter =
  (typeof WORK_TEAM_OVERVIEW_STATUS_FILTERS)[number];

/** Status yang benar-benar dikirim ke database (tanpa `all`). */
export const WORK_TEAM_OVERVIEW_DB_STATUSES = [
  "planned",
  "in_progress",
  "completed",
  "blocked",
  "overdue",
] as const;

export type WorkTeamOverviewDbStatus =
  (typeof WORK_TEAM_OVERVIEW_DB_STATUSES)[number];

/** Ukuran halaman default dan batas maksimum (selaras dengan RPC). */
export const WORK_TEAM_OVERVIEW_DEFAULT_PAGE_SIZE = 25;
export const WORK_TEAM_OVERVIEW_MAX_PAGE_SIZE = 100;

export interface WorkTeamOverviewFilters {
  officeId: string | null;
  departmentId: string | null;
  memberId: string | null;
  search: string;
  status: WorkTeamOverviewStatusFilter;
  workDate: WorkDate;
}

export interface WorkTeamOverviewQuery {
  filters: WorkTeamOverviewFilters;
  page: number;
  pageSize: number;
  sort: WorkTeamOverviewSort;
  signal?: AbortSignal;
}

export interface WorkTeamOverviewMember {
  owner: WorkEntryOwner;
  officeId: string | null;
  officeName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  progress: WorkProgressCounts;
}

export interface WorkTeamOverviewPage {
  members: readonly WorkTeamOverviewMember[];
  /** Jumlah seluruh anggota setelah filter, bukan hanya halaman ini. */
  totalCount: number;
  /** Agregat seluruh hasil filter, bukan hanya halaman ini. */
  aggregate: WorkProgressCounts;
  page: number;
  pageSize: number;
}

export const WORK_TEAM_OVERVIEW_OPTION_KINDS = [
  "office",
  "department",
  "member",
] as const;

export type WorkTeamOverviewOptionKind =
  (typeof WORK_TEAM_OVERVIEW_OPTION_KINDS)[number];

export interface WorkTeamOverviewOption {
  kind: WorkTeamOverviewOptionKind;
  id: string;
  label: string;
  sublabel: string | null;
  officeId: string | null;
  departmentId: string | null;
  memberCount: number;
}

export interface WorkTeamOverviewEntryQuery {
  memberId: string;
  date: WorkDate;
  signal?: AbortSignal;
}

/**
 * Sumber data Team Overview. Semua metode menerima `AbortSignal` supaya
 * perubahan filter/halaman dapat membatalkan permintaan lama.
 */
export interface WorkTeamOverviewRepository {
  listTeamOverview(query: WorkTeamOverviewQuery): Promise<WorkTeamOverviewPage>;
  listAuthorizedOrganizationOptions(
    signal?: AbortSignal,
  ): Promise<readonly WorkTeamOverviewOption[]>;
  listTeamMemberEntries(
    query: WorkTeamOverviewEntryQuery,
  ): Promise<readonly WorkEntry[]>;
}
