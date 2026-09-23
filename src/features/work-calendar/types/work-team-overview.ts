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
  WorkCalendarViewMode,
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

/** Batas pencarian Anggota terotorisasi; selaras dengan batas RPC. */
export const WORK_TEAM_OVERVIEW_MEMBER_SEARCH_LIMIT = 25;
export const WORK_TEAM_OVERVIEW_MEMBER_SEARCH_MAX_LIMIT = 50;
/** Batas member yang ditampilkan per mode pencarian anggota. */
export const WORK_TEAM_OVERVIEW_MEMBER_SEARCH_PAGE_SIZE = 20;

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
 * Pencarian Anggota terotorisasi, dibatasi dan dipaginasi. Dipakai supaya
 * daftar anggota tidak pernah dimuat seluruhnya ke klien. Kantor/departemen
 * ikut dikirim supaya pencarian menghormati cascading yang sama dengan
 * daftar tim.
 */
export interface WorkTeamOverviewMemberSearchQuery {
  search: string;
  officeId: string | null;
  departmentId: string | null;
  offset: number;
  limit?: number;
  signal?: AbortSignal;
}

export interface WorkTeamOverviewMemberSearchPage {
  members: readonly WorkTeamOverviewOption[];
  /** Jumlah seluruh anggota terotorisasi yang cocok, bukan hanya halaman ini. */
  totalCount: number;
  offset: number;
  limit: number;
}

/** State Tim yang dipulihkan dari/ditulis ke URL query. */
export interface WorkTeamOverviewUrlState {
  filters: WorkTeamOverviewFilters;
  sort: WorkTeamOverviewSort;
  page: number;
}

/**
 * Adapter navigasi URL untuk mode Tim. Diimplementasikan di layer hook dengan
 * React Router; didefinisikan di sini agar tipe workspace tidak bergantung
 * pada modul hook.
 */
export interface WorkTeamOverviewRouteWriteOptions {
  /** `true` mengganti entri history saat ini (mis. ketikan pencarian). */
  replace?: boolean;
}

export interface WorkTeamOverviewRouteAdapter {
  /** Kunci URL terkini; berubah pada setiap navigasi termasuk Back/Forward. */
  key: string;
  read(fallbackDate: WorkDate): WorkTeamOverviewUrlState;
  /** Tampilan dari URL, bila valid. */
  readView(): WorkCalendarViewMode | null;
  /** Tanggal acuan dari URL, bila valid. */
  readAnchorDate(): WorkDate | null;
  /**
   * Id entry terpilih dari URL, bila ada (CAL-03 F4B). Adapter ini memang
   * adapter route Unified Work Calendar, sehingga seleksi detail/Quick Add
   * memakai jalur URL yang sama dan tidak perlu adapter kedua.
   */
  readEntryId(): string | null;
  write(state: WorkTeamOverviewUrlState, options?: WorkTeamOverviewRouteWriteOptions): void;
  writeAnchorDate(date: WorkDate, options?: WorkTeamOverviewRouteWriteOptions): void;
  writeView(
    view: WorkCalendarViewMode,
    options?: WorkTeamOverviewRouteWriteOptions,
  ): void;
  /** Tulis/hapus `entry` tanpa menyentuh parameter lain milik route. */
  writeEntryId(entryId: string | null, options?: WorkTeamOverviewRouteWriteOptions): void;
}

/**
 * Sumber data Team Overview. Semua metode menerima `AbortSignal` supaya
 * perubahan filter/halaman dapat membatalkan permintaan lama.
 *
 * `hasAuthorizedTeamMembers` sengaja hanya mengembalikan boolean: bootstrap
 * halaman tidak boleh memuat daftar nama anggota untuk memutuskan tab Tim.
 */
export interface WorkTeamOverviewRepository {
  /** Apakah actor punya minimal satu bawahan aktif tanpa memuat nama. */
  hasAuthorizedTeamMembers(signal?: AbortSignal): Promise<boolean>;
  listTeamOverview(query: WorkTeamOverviewQuery): Promise<WorkTeamOverviewPage>;
  listAuthorizedOrganizationOptions(
    signal?: AbortSignal,
  ): Promise<readonly WorkTeamOverviewOption[]>;
  /** Pencarian anggota terotorisasi yang dibatasi dan dipaginasi. */
  searchTeamMembers(
    query: WorkTeamOverviewMemberSearchQuery,
  ): Promise<WorkTeamOverviewMemberSearchPage>;
  /** Resolusi satu anggota terotorisasi; `null` bila di luar cakupan. */
  getAuthorizedTeamMember(
    memberId: string,
    signal?: AbortSignal,
  ): Promise<WorkTeamOverviewOption | null>;
  listTeamMemberEntries(
    query: WorkTeamOverviewEntryQuery,
  ): Promise<readonly WorkEntry[]>;
}
