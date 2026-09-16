/**
 * Helper murni Team Overview (CAL-03 F4A Director Scale).
 *
 * Semua fungsi di sini bebas DOM dan jaringan supaya:
 * - logika filter/cascading/URL dapat diuji tanpa merender komponen;
 * - perilaku "filter hanya mempersempit" tetap satu sumber kebenaran.
 *
 * Catatan schema: dimensi `Entitas` tidak disediakan karena tidak ada relasi
 * canonical profile/office/department -> entity. Filter resmi hanya Kantor,
 * Departemen, dan Anggota.
 */

import type { WorkDate } from "../types/work-calendar";
import {
  WORK_TEAM_OVERVIEW_DEFAULT_PAGE_SIZE,
  WORK_TEAM_OVERVIEW_DB_STATUSES,
  WORK_TEAM_OVERVIEW_MAX_PAGE_SIZE,
  WORK_TEAM_OVERVIEW_SORTS,
  WORK_TEAM_OVERVIEW_STATUS_FILTERS,
  type WorkTeamOverviewFilters,
  type WorkTeamOverviewOption,
  type WorkTeamOverviewSort,
  type WorkTeamOverviewStatusFilter,
} from "../types/work-team-overview";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function createWorkTeamOverviewFilters(
  workDate: WorkDate,
): WorkTeamOverviewFilters {
  return {
    officeId: null,
    departmentId: null,
    memberId: null,
    search: "",
    status: "all",
    workDate,
  };
}

/** Normalisasi input pencarian: trim dan batas panjang wajar. */
export function normalizeWorkTeamOverviewSearch(value: string): string {
  return value.trim().slice(0, 120);
}

export function isWorkTeamOverviewStatusFilter(
  value: unknown,
): value is WorkTeamOverviewStatusFilter {
  return (
    typeof value === "string" &&
    (WORK_TEAM_OVERVIEW_STATUS_FILTERS as readonly string[]).includes(value)
  );
}

export function isWorkTeamOverviewDbStatus(
  value: unknown,
): value is (typeof WORK_TEAM_OVERVIEW_DB_STATUSES)[number] {
  return (
    typeof value === "string" &&
    (WORK_TEAM_OVERVIEW_DB_STATUSES as readonly string[]).includes(value)
  );
}

export function isWorkTeamOverviewSort(value: unknown): value is WorkTeamOverviewSort {
  return (
    typeof value === "string" &&
    (WORK_TEAM_OVERVIEW_SORTS as readonly string[]).includes(value)
  );
}

/** Status `all` berarti tidak ada parameter status yang dikirim. */
export function toWorkTeamOverviewDbStatus(
  status: WorkTeamOverviewStatusFilter,
): (typeof WORK_TEAM_OVERVIEW_DB_STATUSES)[number] | null {
  return status === "all" ? null : status;
}

function isNonEmptyId(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Indikator jumlah filter aktif. Urutan Kantor -> Departemen -> Anggota
 * mengikuti urutan toolbar supaya mudah dipetakan ke UI.
 */
export function countActiveWorkTeamOverviewFilters(
  filters: WorkTeamOverviewFilters,
): number {
  let count = 0;
  if (isNonEmptyId(filters.officeId)) count += 1;
  if (isNonEmptyId(filters.departmentId)) count += 1;
  if (isNonEmptyId(filters.memberId)) count += 1;
  if (filters.status !== "all") count += 1;
  if (filters.search.trim().length > 0) count += 1;
  return count;
}

/**
 * Terapkan perubahan filter dengan aturan cascading:
 * - mengubah Kantor selalu membersihkan Departemen dan Anggota;
 * - mengubah Departemen selalu membersihkan Anggota;
 * - mengubah Anggota tidak menyentuh parent;
 * - filter lain dibiarkan.
 *
 * Fungsi ini tidak pernah menambah filter yang tidak diminta, sehingga tidak
 * dapat memperluas authorization.
 */
export function applyWorkTeamOverviewFilterChange(
  current: WorkTeamOverviewFilters,
  change:
    | { type: "office"; value: string | null }
    | { type: "department"; value: string | null }
    | { type: "member"; value: string | null }
    | { type: "search"; value: string }
    | { type: "status"; value: WorkTeamOverviewStatusFilter }
    | { type: "workDate"; value: WorkDate },
): WorkTeamOverviewFilters {
  switch (change.type) {
    case "office":
      return {
        ...current,
        officeId: change.value,
        departmentId: null,
        memberId: null,
      };
    case "department":
      return { ...current, departmentId: change.value, memberId: null };
    case "member":
      return { ...current, memberId: change.value };
    case "search":
      return { ...current, search: change.value };
    case "status":
      return { ...current, status: change.value };
    case "workDate":
      return { ...current, workDate: change.value };
    default:
      return current;
  }
}

/**
 * Departemen yang tersedia untuk Kantor terpilih.
 *
 * Department di schema canonical bersifat global (tidak punya `office_id`).
 * Karena itu daftar ini diturunkan dari relasi yang benar-benar ada, yaitu
 * baris anggota: departemen dianggap tersedia untuk sebuah kantor hanya bila
 * ada anggota terotorisasi di kantor itu yang memakai departemen tersebut.
 * Pendekatan ini tidak mengarang relasi baru dan tidak memperluas data.
 */
export function listWorkTeamOverviewDepartmentOptions(
  options: readonly WorkTeamOverviewOption[],
  officeId: string | null,
): readonly WorkTeamOverviewOption[] {
  const memberOptions = options.filter((option) => option.kind === "member");
  const availableIds = new Set(
    memberOptions
      .filter((option) => !officeId || option.officeId === officeId)
      .map((option) => option.departmentId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  return options.filter(
    (option) => option.kind === "department" && availableIds.has(option.id),
  );
}

/** Anggota yang cocok dengan filter Kantor/Departemen yang sedang aktif. */
export function listWorkTeamOverviewMemberOptions(
  options: readonly WorkTeamOverviewOption[],
  filters: Pick<WorkTeamOverviewFilters, "officeId" | "departmentId">,
): readonly WorkTeamOverviewOption[] {
  return options.filter((option) => {
    if (option.kind !== "member") return false;
    if (filters.officeId && option.officeId !== filters.officeId) return false;
    if (filters.departmentId && option.departmentId !== filters.departmentId) {
      return false;
    }
    return true;
  });
}

/**
 * Buang pilihan yang tidak lagi valid terhadap opsi terbaru (mis. anggota
 * keluar dari cakupan, atau departemen tidak lagi punya anggota di kantor
 * terpilih). Selalu fail-closed: nilai tidak valid menjadi `null`.
 */
export function reconcileWorkTeamOverviewFilters(
  filters: WorkTeamOverviewFilters,
  options: readonly WorkTeamOverviewOption[],
): WorkTeamOverviewFilters {
  if (options.length === 0) return filters;

  const officeIds = new Set(
    options.filter((option) => option.kind === "office").map((option) => option.id),
  );

  const officeId =
    filters.officeId && officeIds.has(filters.officeId) ? filters.officeId : null;

  const departmentIds = new Set(
    listWorkTeamOverviewDepartmentOptions(options, officeId).map((option) => option.id),
  );
  const departmentId =
    filters.departmentId && departmentIds.has(filters.departmentId)
      ? filters.departmentId
      : null;

  const memberIds = new Set(
    listWorkTeamOverviewMemberOptions(options, { officeId, departmentId }).map(
      (option) => option.id,
    ),
  );
  const memberId =
    filters.memberId && memberIds.has(filters.memberId) ? filters.memberId : null;

  if (
    officeId === filters.officeId &&
    departmentId === filters.departmentId &&
    memberId === filters.memberId
  ) {
    return filters;
  }

  return { ...filters, officeId, departmentId, memberId };
}

export function clampWorkTeamOverviewPageSize(value: number): number {
  if (!Number.isFinite(value)) return WORK_TEAM_OVERVIEW_DEFAULT_PAGE_SIZE;
  const floored = Math.floor(value);
  if (floored < 1) return WORK_TEAM_OVERVIEW_DEFAULT_PAGE_SIZE;
  return Math.min(floored, WORK_TEAM_OVERVIEW_MAX_PAGE_SIZE);
}

export function clampWorkTeamOverviewPage(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const floored = Math.floor(value);
  return floored < 1 ? 1 : floored;
}

/** Jumlah halaman; selalu minimal 1 supaya UI tidak menampilkan "0 / 0". */
export function getWorkTeamOverviewPageCount(
  totalCount: number,
  pageSize: number,
): number {
  const size = clampWorkTeamOverviewPageSize(pageSize);
  if (!Number.isFinite(totalCount) || totalCount <= 0) return 1;
  return Math.max(1, Math.ceil(totalCount / size));
}

/* ------------------------------------------------------------------------- */
/* Sinkronisasi URL query                                                    */
/* ------------------------------------------------------------------------- */

const QUERY_KEYS = {
  office: "office",
  department: "department",
  member: "member",
  search: "q",
  status: "status",
  workDate: "date",
  sort: "sort",
  page: "page",
} as const;

export interface WorkTeamOverviewUrlState {
  filters: WorkTeamOverviewFilters;
  sort: WorkTeamOverviewSort;
  page: number;
}

export interface ReadWorkTeamOverviewUrlInput {
  search: string;
  fallbackDate: WorkDate;
}

/**
 * Baca state dari `location.search`. Nilai tidak dikenal selalu jatuh ke
 * default, bukan melempar error, supaya URL yang diubah manual tidak merusak
 * halaman.
 */
export function readWorkTeamOverviewUrlState(
  input: ReadWorkTeamOverviewUrlInput,
): WorkTeamOverviewUrlState {
  const params = new URLSearchParams(input.search);
  const defaults = createWorkTeamOverviewFilters(input.fallbackDate);

  const rawDate = params.get(QUERY_KEYS.workDate);
  const workDate =
    rawDate && ISO_DATE_PATTERN.test(rawDate) ? rawDate : input.fallbackDate;

  const rawStatus = params.get(QUERY_KEYS.status);
  const rawSort = params.get(QUERY_KEYS.sort);
  const rawPage = Number.parseInt(params.get(QUERY_KEYS.page) ?? "", 10);

  const officeId = params.get(QUERY_KEYS.office);
  const departmentId = params.get(QUERY_KEYS.department);
  const memberId = params.get(QUERY_KEYS.member);
  const search = params.get(QUERY_KEYS.search);

  return {
    filters: {
      ...defaults,
      workDate,
      officeId: isNonEmptyId(officeId) ? officeId : null,
      departmentId: isNonEmptyId(departmentId) ? departmentId : null,
      memberId: isNonEmptyId(memberId) ? memberId : null,
      search: search ? normalizeWorkTeamOverviewSearch(search) : "",
      status: isWorkTeamOverviewStatusFilter(rawStatus) ? rawStatus : "all",
    },
    sort: isWorkTeamOverviewSort(rawSort) ? rawSort : "priority",
    page: clampWorkTeamOverviewPage(rawPage),
  };
}

/**
 * Tulis state ke string query (tanpa `?`). Hanya nilai non-default yang
 * ditulis supaya URL tetap ringkas dan mudah dibaca.
 */
export function writeWorkTeamOverviewUrlState(state: WorkTeamOverviewUrlState): string {
  const params = new URLSearchParams();
  const { filters } = state;

  if (isNonEmptyId(filters.officeId)) params.set(QUERY_KEYS.office, filters.officeId);
  if (isNonEmptyId(filters.departmentId)) {
    params.set(QUERY_KEYS.department, filters.departmentId);
  }
  if (isNonEmptyId(filters.memberId)) params.set(QUERY_KEYS.member, filters.memberId);
  if (filters.search.trim().length > 0) {
    params.set(QUERY_KEYS.search, normalizeWorkTeamOverviewSearch(filters.search));
  }
  if (filters.status !== "all") params.set(QUERY_KEYS.status, filters.status);
  if (ISO_DATE_PATTERN.test(filters.workDate)) {
    params.set(QUERY_KEYS.workDate, filters.workDate);
  }
  if (state.sort !== "priority") params.set(QUERY_KEYS.sort, state.sort);
  if (state.page > 1) params.set(QUERY_KEYS.page, String(state.page));

  return params.toString();
}
