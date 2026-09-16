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
  WORK_TEAM_OVERVIEW_MEMBER_SEARCH_PAGE_SIZE,
  WORK_TEAM_OVERVIEW_SORTS,
  WORK_TEAM_OVERVIEW_STATUS_FILTERS,
  type WorkTeamOverviewFilters,
  type WorkTeamOverviewOption,
  type WorkTeamOverviewSort,
  type WorkTeamOverviewStatusFilter,
  type WorkTeamOverviewUrlState,
} from "../types/work-team-overview";

export type { WorkTeamOverviewUrlState };

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
 * Department bersifat global (tidak punya `office_id`), jadi relasi
 * Kantor<->Departemen hanya terlihat lewat anggota. RPC opsi mengirim satu baris
 * per pasangan (departemen, kantor) dengan `member_count` yang sudah dipersempit
 * ke kantor tersebut, sehingga cascading tidak perlu menebak relasi baru.
 *
 * Opsi departemen tanpa `officeId` (legacy/berlaku global) tetap ditampilkan
 * hanya saat tidak ada kantor terpilih, supaya tidak menyarankan departemen yang
 * tidak punya anggota di kantor aktif.
 */
export function listWorkTeamOverviewDepartmentOptions(
  options: readonly WorkTeamOverviewOption[],
  officeId: string | null,
): readonly WorkTeamOverviewOption[] {
  const departments = options.filter((option) => option.kind === "department");
  if (!officeId) return departments;

  return departments.filter((option) => option.officeId === officeId);
}

/**
 * Satu opsi departemen per departemen, digabung lintas kantor. Bila `officeId`
 * diisi, hanya departemen yang punya anggota di kantor tersebut yang disertakan.
 */
export function listWorkTeamOverviewUniqueDepartmentOptions(
  options: readonly WorkTeamOverviewOption[],
  officeId: string | null = null,
): readonly WorkTeamOverviewOption[] {
  const seen = new Map<string, WorkTeamOverviewOption>();
  for (const option of options) {
    if (option.kind !== "department") continue;
    if (officeId && option.officeId !== officeId) continue;
    const existing = seen.get(option.id);
    if (existing) {
      seen.set(option.id, {
        ...existing,
        memberCount: existing.memberCount + option.memberCount,
      });
      continue;
    }
    seen.set(option.id, option);
  }
  return [...seen.values()];
}

/**
 * Anggota yang cocok dengan filter Kantor/Departemen yang sedang aktif.
 * `memberOptions` berasal dari pencarian terotorisasi yang sudah dibatasi,
 * bukan dari daftar seluruh anggota.
 */
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
 * Buang pilihan Kantor/Departemen yang tidak lagi valid terhadap opsi terbaru
 * (mis. anggota keluar dari cakupan, atau departemen tidak lagi punya anggota
 * di kantor terpilih). Selalu fail-closed: nilai tidak valid menjadi `null`.
 *
 * `memberId` sengaja TIDAK direkonsiliasi di sini: daftar anggota tidak lagi
 * dimuat seluruhnya sebagai opsi, sehingga validitasnya diperiksa secara
 * asinkron lewat `getAuthorizedTeamMember` (lihat `useWorkTeamOverview`).
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

  if (officeId === filters.officeId && departmentId === filters.departmentId) {
    return filters;
  }

  return {
    ...filters,
    officeId,
    departmentId,
    // Departemen yang berubah juga membatalkan anggota, karena anggota
    // direkonsiliasi terhadap konteks organisasi yang tersedia.
    memberId: departmentId === filters.departmentId ? filters.memberId : null,
  };
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

/** Ukuran halaman untuk daftar anggota terbatas. */
export function getWorkTeamOverviewMemberSearchPageSize(): number {
  return WORK_TEAM_OVERVIEW_MEMBER_SEARCH_PAGE_SIZE;
}

/** Jumlah halaman hasil pencarian anggota yang dibatasi. */
export function getWorkTeamOverviewMemberSearchPageCount(
  totalCount: number,
  limit: number = WORK_TEAM_OVERVIEW_MEMBER_SEARCH_PAGE_SIZE,
): number {
  if (!Number.isFinite(totalCount) || totalCount <= 0) return 1;
  const safeLimit = limit < 1 ? WORK_TEAM_OVERVIEW_MEMBER_SEARCH_PAGE_SIZE : Math.floor(limit);
  return Math.max(1, Math.ceil(totalCount / safeLimit));
}

/**
 * Mode pencarian anggota. `typing` dipakai untuk pencarian teks pengguna dan
 * dibatasi jauh lebih ketat karena hasilnya berubah setiap ketikan.
 */
export type WorkTeamOverviewMemberSearchMode = "filters" | "list" | "status" | "typing";

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

/** Kunci yang dimiliki route Work Calendar; sisanya tidak boleh dihapus. */
export const WORK_TEAM_OVERVIEW_QUERY_KEYS: readonly string[] = Object.values(QUERY_KEYS);

export interface ReadWorkTeamOverviewUrlInput {
  search: string;
  fallbackDate: WorkDate;
}

/**
 * Baca state dari `location.search`. Nilai tidak dikenal selalu jatuh ke
 * default, bukan melempar error, supaya URL yang diubah manual tidak merusak
 * halaman.
 *
 * Id/tanggal dari URL hanya divalidasi bentuknya di sini; rekonsiliasi dengan
 * opsi terotorisasi dilakukan terpisah lewat `reconcileWorkTeamOverviewFilters`.
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
 * Tulis state ke objek `URLSearchParams`, mempertahankan parameter lain milik
 * route (mis. penanda tanggal global) dan hanya menimpa kunci Tim Overview.
 * `date` selalu ditulis supaya refresh/back mempertahankan konteks tanggal.
 */
export function applyWorkTeamOverviewUrlState(
  params: URLSearchParams,
  state: WorkTeamOverviewUrlState,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  const { filters } = state;

  const setOrDelete = (key: string, value: string | null): void => {
    if (value === null) next.delete(key);
    else next.set(key, value);
  };

  setOrDelete(QUERY_KEYS.office, isNonEmptyId(filters.officeId) ? filters.officeId : null);
  setOrDelete(
    QUERY_KEYS.department,
    isNonEmptyId(filters.departmentId) ? filters.departmentId : null,
  );
  setOrDelete(QUERY_KEYS.member, isNonEmptyId(filters.memberId) ? filters.memberId : null);
  setOrDelete(
    QUERY_KEYS.search,
    filters.search.trim().length > 0
      ? normalizeWorkTeamOverviewSearch(filters.search)
      : null,
  );
  setOrDelete(QUERY_KEYS.status, filters.status !== "all" ? filters.status : null);
  setOrDelete(QUERY_KEYS.workDate, ISO_DATE_PATTERN.test(filters.workDate) ? filters.workDate : null);
  setOrDelete(QUERY_KEYS.sort, state.sort !== "priority" ? state.sort : null);
  setOrDelete(QUERY_KEYS.page, state.page > 1 ? String(state.page) : null);

  return next;
}

/**
 * Tulis state ke string query (tanpa `?`). Hanya nilai non-default yang
 * ditulis supaya URL tetap ringkas dan mudah dibaca.
 */
export function writeWorkTeamOverviewUrlState(state: WorkTeamOverviewUrlState): string {
  return applyWorkTeamOverviewUrlState(new URLSearchParams(), state).toString();
}

/**
 * Bandingkan dua state Tim secara nilai. Dipakai untuk menekan tulis-ulang URL
 * dan penerapan state dari luar yang sebenarnya identik (Back/Forward).
 */
export function isSameWorkTeamOverviewUrlState(
  left: WorkTeamOverviewUrlState,
  right: WorkTeamOverviewUrlState,
): boolean {
  return (
    left.page === right.page &&
    left.sort === right.sort &&
    isSameWorkTeamOverviewFilters(left.filters, right.filters)
  );
}

export function isSameWorkTeamOverviewFilters(
  left: WorkTeamOverviewFilters,
  right: WorkTeamOverviewFilters,
): boolean {
  return (
    left.officeId === right.officeId &&
    left.departmentId === right.departmentId &&
    left.memberId === right.memberId &&
    left.search === right.search &&
    left.status === right.status &&
    left.workDate === right.workDate
  );
}

/** Satu halaman hasil pencarian anggota yang sudah dibatasi. */
export interface WorkTeamOverviewMemberSearchSlice {
  members: readonly WorkTeamOverviewOption[];
  totalCount: number;
  hasMore: boolean;
}

export function sliceWorkTeamOverviewMembers(
  members: readonly WorkTeamOverviewOption[],
  totalCount: number,
  offset: number,
  limit: number,
): WorkTeamOverviewMemberSearchSlice {
  const end = offset + limit;
  return {
    members: members.slice(0, limit),
    totalCount,
    hasMore: members.length >= limit && end < totalCount,
  };
}
