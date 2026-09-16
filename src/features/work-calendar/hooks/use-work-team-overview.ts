/**
 * Hook Team Overview server-side (CAL-03 F4A Director Scale).
 *
 * Tanggung jawab:
 * - menyimpan filter, halaman, dan opsi organisasi yang terotorisasi;
 * - memakai satu tanggal acuan (`workDate` dari kalender) untuk ringkasan,
 *   agregat, dan pemuatan pekerjaan anggota;
 * - membatalkan permintaan lama dan membersihkan hasil basi setiap filter,
 *   halaman, urutan, atau tanggal berubah;
 * - memuat pekerjaan anggota secara lazy, maksimal satu anggota terbuka;
 * - menyinkronkan filter ke URL lewat `WorkTeamOverviewRouteAdapter` (React Router).
 *
 * Hook ini tidak pernah memanggil Supabase langsung; semua akses lewat
 * `WorkTeamOverviewRepository` yang disuntikkan.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkDate, WorkEntry } from "../types/work-calendar";
import type {
  WorkTeamOverviewFilters,
  WorkTeamOverviewOption,
  WorkTeamOverviewPage,
  WorkTeamOverviewRepository,
  WorkTeamOverviewSort,
} from "../types/work-team-overview";
import {
  WORK_TEAM_OVERVIEW_DEFAULT_PAGE_SIZE,
  WORK_TEAM_OVERVIEW_MEMBER_SEARCH_PAGE_SIZE,
} from "../types/work-team-overview";
import {
  applyWorkTeamOverviewFilterChange,
  clampWorkTeamOverviewPageSize,
  countActiveWorkTeamOverviewFilters,
  getWorkTeamOverviewPageCount,
  isSameWorkTeamOverviewUrlState,
  listWorkTeamOverviewMemberOptions,
  listWorkTeamOverviewUniqueDepartmentOptions,
  reconcileWorkTeamOverviewFilters,
} from "../lib/work-team-overview";
import type { WorkTeamOverviewRouteAdapter } from "../types/work-team-overview";

export type WorkTeamOverviewStatus = "idle" | "loading" | "ready" | "error";

export type WorkTeamOverviewFilterChange =
  | { type: "office"; value: string | null }
  | { type: "department"; value: string | null }
  | { type: "member"; value: string | null }
  | { type: "search"; value: string }
  | { type: "status"; value: WorkTeamOverviewFilters["status"] };

/** Filter tanpa tanggal; tanggal selalu berasal dari kalender (`workDate`). */
type WorkTeamOverviewSelection = Omit<WorkTeamOverviewFilters, "workDate">;

const DEFAULT_SELECTION: WorkTeamOverviewSelection = {
  officeId: null,
  departmentId: null,
  memberId: null,
  search: "",
  status: "all",
};

const MEMBER_SEARCH_DEBOUNCE_MS = 200;

export interface UseWorkTeamOverviewInput {
  repository: WorkTeamOverviewRepository | null;
  /** Hanya memuat saat tab Tim aktif. */
  enabled: boolean;
  /** Tanggal acuan tunggal mode Tim (selalu `calendar.anchorDate`). */
  workDate: WorkDate;
  pageSize?: number;
  /**
   * Binding URL (React Router). Bila diisi, filter/halaman masuk history dan
   * navigasi Back/Forward memulihkan state.
   */
  adapter?: WorkTeamOverviewRouteAdapter;
}

export interface UseWorkTeamOverviewResult {
  filters: WorkTeamOverviewFilters;
  sort: WorkTeamOverviewSort;
  page: number;
  pageSize: number;
  pageCount: number;
  activeFilterCount: number;
  options: readonly WorkTeamOverviewOption[];
  departmentOptions: readonly WorkTeamOverviewOption[];
  /** Anggota dari pencarian terotorisasi yang dibatasi (bukan seluruh roster). */
  memberOptions: readonly WorkTeamOverviewOption[];
  memberSearch: string;
  memberSearchTotal: number;
  memberSearchStatus: WorkTeamOverviewStatus;
  memberSearchError: Error | null;
  memberSearchLimit: number;
  /** `true` bila pencarian anggota sudah diaktifkan (pemilih dibuka). */
  memberSearchActive: boolean;
  hasMoreMembers: boolean;
  optionsStatus: WorkTeamOverviewStatus;
  optionsError: Error | null;
  data: WorkTeamOverviewPage | null;
  status: WorkTeamOverviewStatus;
  error: Error | null;
  expandedMemberId: string | null;
  memberEntries: readonly WorkEntry[];
  memberEntriesStatus: WorkTeamOverviewStatus;
  memberEntriesError: Error | null;
  setFilter: (change: WorkTeamOverviewFilterChange) => void;
  resetFilters: () => void;
  setSort: (sort: WorkTeamOverviewSort) => void;
  setPage: (page: number) => void;
  setMemberSearch: (value: string) => void;
  loadMoreMembers: () => void;
  /** Mengaktifkan pencarian anggota saat pemilih dibuka pertama kali. */
  activateMemberSearch: () => void;
  toggleMember: (memberId: string) => void;
  reload: () => void;
  reloadMemberEntries: () => void;
}

export function useWorkTeamOverview(
  input: UseWorkTeamOverviewInput,
): UseWorkTeamOverviewResult {
  const { repository, enabled, workDate, adapter } = input;
  const pageSize = clampWorkTeamOverviewPageSize(
    input.pageSize ?? WORK_TEAM_OVERVIEW_DEFAULT_PAGE_SIZE,
  );

  const initialStateRef = useRef<{
    selection: WorkTeamOverviewSelection;
    sort: WorkTeamOverviewSort;
    page: number;
  } | null>(null);

  if (initialStateRef.current === null) {
    const urlState = adapter?.read(workDate);
    initialStateRef.current = urlState
      ? {
          selection: {
            officeId: urlState.filters.officeId,
            departmentId: urlState.filters.departmentId,
            memberId: urlState.filters.memberId,
            search: urlState.filters.search,
            status: urlState.filters.status,
          },
          sort: urlState.sort,
          page: urlState.page,
        }
      : { selection: DEFAULT_SELECTION, sort: "priority", page: 1 };
  }

  const [selection, setSelection] = useState<WorkTeamOverviewSelection>(
    initialStateRef.current.selection,
  );
  const [sort, setSortState] = useState<WorkTeamOverviewSort>(initialStateRef.current.sort);
  const [page, setPageState] = useState<number>(initialStateRef.current.page);

  const [options, setOptions] = useState<readonly WorkTeamOverviewOption[]>([]);
  const [optionsStatus, setOptionsStatus] = useState<WorkTeamOverviewStatus>("idle");
  const [optionsError, setOptionsError] = useState<Error | null>(null);

  const [data, setData] = useState<WorkTeamOverviewPage | null>(null);
  const [status, setStatus] = useState<WorkTeamOverviewStatus>("idle");
  const [error, setError] = useState<Error | null>(null);

  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [memberEntries, setMemberEntries] = useState<readonly WorkEntry[]>([]);
  const [memberEntriesStatus, setMemberEntriesStatus] =
    useState<WorkTeamOverviewStatus>("idle");
  const [memberEntriesError, setMemberEntriesError] = useState<Error | null>(null);

  // Anggota: hasil pencarian terbatas + anggota terpilih yang diresolusi.
  const [memberSearch, setMemberSearchValue] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<
    readonly WorkTeamOverviewOption[]
  >([]);
  const [memberSearchTotal, setMemberSearchTotal] = useState(0);
  const [memberSearchStatus, setMemberSearchStatus] =
    useState<WorkTeamOverviewStatus>("idle");
  const [memberSearchError, setMemberSearchError] = useState<Error | null>(null);
  const [memberSearchPage, setMemberSearchPage] = useState(1);
  const [resolvedMember, setResolvedMember] = useState<WorkTeamOverviewOption | null>(null);
  /**
   * Pencarian anggota baru dijalankan setelah pengguna benar-benar membuka
   * pemilih anggota. Ini menjaga agar bootstrap tab Tim tidak pernah memuat
   * daftar anggota sama sekali.
   */
  const [memberSearchActive, setMemberSearchActive] = useState(false);

  const [reloadToken, setReloadToken] = useState(0);
  const [memberSearchReloadToken, setMemberSearchReloadToken] = useState(0);
  const [memberEntriesReloadToken, setMemberEntriesReloadToken] = useState(0);
  const overviewRequestRef = useRef(0);

  const optionsRef = useRef<readonly WorkTeamOverviewOption[]>([]);
  optionsRef.current = options;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  /** Tanggal acuan tunggal: selalu dari kalender, bukan state filter lokal. */
  const filters = useMemo<WorkTeamOverviewFilters>(
    () => ({ ...selection, workDate }),
    [selection, workDate],
  );

  const contextKey = `${selection.officeId ?? ""}|${selection.departmentId ?? ""}|${
    selection.memberId ?? ""
  }|${selection.search}|${selection.status}|${workDate}`;

  /* ---------------------------------------------------------------- opsi */

  useEffect(() => {
    if (!enabled || !repository) {
      setOptions([]);
      setOptionsStatus("idle");
      setOptionsError(null);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setOptionsStatus("loading");
    setOptionsError(null);

    repository
      .listAuthorizedOrganizationOptions(controller.signal)
      .then((result) => {
        if (!active || controller.signal.aborted) return;
        setOptions(result);
        setOptionsStatus("ready");
        // Pilihan organisasi yang tidak lagi ada di cakupan dibuang, bukan dipaksa.
        setSelection((current) =>
          (() => {
            const reconciled = reconcileWorkTeamOverviewFilters(
              { ...current, workDate },
              result,
            );
            return {
              officeId: reconciled.officeId,
              departmentId: reconciled.departmentId,
              memberId: reconciled.memberId,
              search: reconciled.search,
              status: reconciled.status,
            };
          })(),
        );
      })
      .catch((thrown: unknown) => {
        if (!active || controller.signal.aborted) return;
        setOptionsError(
          thrown instanceof Error ? thrown : new Error("Gagal memuat pilihan organisasi."),
        );
        setOptionsStatus("error");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [repository, enabled, reloadToken, workDate]);

  /* ------------------------------------------------------------ halaman */

  useEffect(() => {
    if (!enabled || !repository) {
      setData(null);
      setStatus("idle");
      setError(null);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    const requestId = overviewRequestRef.current + 1;
    overviewRequestRef.current = requestId;

    // Hasil basi tidak pernah ditampilkan: halaman lama dibersihkan sebelum
    // permintaan baru dimulai.
    setData(null);
    setStatus("loading");
    setError(null);

    repository
      .listTeamOverview({ filters, page, pageSize, sort, signal: controller.signal })
      .then((result) => {
        if (!active || controller.signal.aborted) return;
        if (overviewRequestRef.current !== requestId) return;
        setData(result);
        setStatus("ready");
      })
      .catch((thrown: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (overviewRequestRef.current !== requestId) return;
        setError(thrown instanceof Error ? thrown : new Error("Gagal memuat ringkasan tim."));
        setStatus("error");
        setData(null);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [repository, enabled, filters, page, pageSize, sort, reloadToken]);

  // Detail yang terbuka ditutup saat konteks berubah (filter/halaman/urutan/
  // tanggal), supaya pekerjaan anggota lama tidak tampil sebagai hasil baru.
  const previousContextKeyRef = useRef(contextKey);
  useEffect(() => {
    if (previousContextKeyRef.current !== contextKey) {
      previousContextKeyRef.current = contextKey;
      setExpandedMemberId(null);
      setMemberEntries([]);
      setMemberEntriesStatus("idle");
      setMemberEntriesError(null);
    }
  }, [contextKey]);

  // Halaman di luar rentang dijepit setelah server melaporkan total sebenarnya.
  // Total TIDAK pernah disimpulkan 0 hanya karena halaman kosong: server
  // menjepit offset ke halaman terakhir yang tersedia.
  useEffect(() => {
    if (status !== "ready" || !data) return;
    const pageCount = getWorkTeamOverviewPageCount(data.totalCount, pageSize);
    if (page > pageCount) setPageState(pageCount);
  }, [status, data, page, pageSize]);

  /* ------------------------------------------------------- pencarian anggota */

  const [debouncedMemberSearch, setDebouncedMemberSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedMemberSearch(memberSearch),
      MEMBER_SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [memberSearch]);

  // Filter/pencarian baru selalu memulai dari halaman pertama dan membuang
  // hasil anggota lama supaya tidak tampil sebagai hasil baru.
  useEffect(() => {
    setMemberSearchPage(1);
    setMemberSearchResults([]);
    setMemberSearchTotal(0);
  }, [debouncedMemberSearch, selection.officeId, selection.departmentId, memberSearchReloadToken]);

  useEffect(() => {
    if (!enabled || !repository || !memberSearchActive) {
      setMemberSearchResults([]);
      setMemberSearchTotal(0);
      setMemberSearchStatus("idle");
      setMemberSearchError(null);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setMemberSearchStatus("loading");
    setMemberSearchError(null);

    const offset = (memberSearchPage - 1) * WORK_TEAM_OVERVIEW_MEMBER_SEARCH_PAGE_SIZE;

    repository
      .searchTeamMembers({
        search: debouncedMemberSearch,
        officeId: selection.officeId,
        departmentId: selection.departmentId,
        offset,
        limit: WORK_TEAM_OVERVIEW_MEMBER_SEARCH_PAGE_SIZE,
        signal: controller.signal,
      })
      .then((result) => {
        if (!active || controller.signal.aborted) return;
        setMemberSearchTotal(result.totalCount);
        setMemberSearchResults((current) =>
          memberSearchPage <= 1 ? result.members : [...current, ...result.members],
        );
        setMemberSearchStatus("ready");
      })
      .catch((thrown: unknown) => {
        if (!active || controller.signal.aborted) return;
        setMemberSearchError(
          thrown instanceof Error ? thrown : new Error("Gagal mencari anggota tim."),
        );
        setMemberSearchStatus("error");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    repository,
    enabled,
    memberSearchActive,
    debouncedMemberSearch,
    selection.officeId,
    selection.departmentId,
    memberSearchPage,
    memberSearchReloadToken,
  ]);

  /* ------------------------------------------- rekonsiliasi anggota dari URL */

  useEffect(() => {
    if (!enabled || !repository || !selection.memberId) {
      setResolvedMember(null);
      return undefined;
    }

    // Sudah tersedia di hasil pencarian: tidak perlu permintaan tambahan.
    const known = memberSearchResults.find((option) => option.id === selection.memberId);
    if (known) {
      setResolvedMember(known);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    repository
      .getAuthorizedTeamMember(selection.memberId, controller.signal)
      .then((option) => {
        if (!active || controller.signal.aborted) return;
        if (!option) {
          // Fail-closed: id dari URL yang tidak terotorisasi dibuang.
          setResolvedMember(null);
          setSelection((current) =>
            current.memberId === option?.id ? current : { ...current, memberId: null },
          );
          return;
        }
        setResolvedMember(option);
      })
      .catch(() => {
        if (!active || controller.signal.aborted) return;
        setResolvedMember(null);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [repository, enabled, selection.memberId, memberSearchResults]);

  /* -------------------------------------------------- pekerjaan anggota lazy */

  useEffect(() => {
    if (!enabled || !repository || !expandedMemberId) {
      setMemberEntries([]);
      setMemberEntriesStatus("idle");
      setMemberEntriesError(null);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setMemberEntriesStatus("loading");
    setMemberEntriesError(null);
    setMemberEntries([]);

    repository
      .listTeamMemberEntries({
        memberId: expandedMemberId,
        date: workDate,
        signal: controller.signal,
      })
      .then((result) => {
        if (!active || controller.signal.aborted) return;
        setMemberEntries(result);
        setMemberEntriesStatus("ready");
      })
      .catch((thrown: unknown) => {
        if (!active || controller.signal.aborted) return;
        setMemberEntriesError(
          thrown instanceof Error ? thrown : new Error("Gagal memuat pekerjaan anggota."),
        );
        setMemberEntriesStatus("error");
        setMemberEntries([]);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [repository, enabled, expandedMemberId, workDate, memberEntriesReloadToken]);

  /* -------------------------------------------------------------- URL sync */

  /** Penulisan berikutnya memakai `replace` (mis. ketikan pencarian). */
  const replaceNextRef = useRef(false);
  const adapterKey = adapter?.key ?? null;
  const lastAppliedAdapterKeyRef = useRef<string | null>(null);

  // Tulis state ke URL. Dibandingkan dulu dengan state URL saat ini supaya
  // tidak menulis ulang nilai yang sama (mencegah loop dengan efek adopsi).
  useEffect(() => {
    if (!enabled || !adapter) return;
    const next = { filters, sort, page };
    const current = adapter.read(workDate);
    if (isSameWorkTeamOverviewUrlState(current, next)) {
      replaceNextRef.current = false;
      return;
    }
    adapter.write(next, { replace: replaceNextRef.current });
    replaceNextRef.current = false;
  }, [enabled, adapter, filters, sort, page, workDate]);

  // Adopsi state dari navigasi luar (Back/Forward/deep link). State yang
  // identik dengan state internal tidak mengubah apa pun. Tanggal TIDAK diatur
  // di sini: `workDate` selalu berasal dari kalender (`calendar.anchorDate`).
  useEffect(() => {
    if (!enabled || !adapter || adapterKey === null) return;
    if (lastAppliedAdapterKeyRef.current === adapterKey) return;
    lastAppliedAdapterKeyRef.current = adapterKey;

    const next = adapter.read(workDate);

    const nextSelection: WorkTeamOverviewSelection = {
      officeId: next.filters.officeId,
      departmentId: next.filters.departmentId,
      memberId: next.filters.memberId,
      search: next.filters.search,
      status: next.filters.status,
    };
    setSelection((current) =>
      current.officeId === nextSelection.officeId &&
      current.departmentId === nextSelection.departmentId &&
      current.memberId === nextSelection.memberId &&
      current.search === nextSelection.search &&
      current.status === nextSelection.status
        ? current
        : nextSelection,
    );
    setSortState((current) => (current === next.sort ? current : next.sort));
    setPageState((current) => (current === next.page ? current : next.page));
    // Pemicu tunggal adalah `adapterKey`; nilai lain dibaca lewat ref adapter.
  }, [enabled, adapter, adapterKey]);

  /* ----------------------------------------------------------------- aksi */

  const setFilter = useCallback(
    (change: WorkTeamOverviewFilterChange) => {
      setSelection((current) => {
        const applied = applyWorkTeamOverviewFilterChange(
          { ...current, workDate },
          change,
        );
        const reconciled = reconcileWorkTeamOverviewFilters(applied, optionsRef.current);
        return {
          officeId: reconciled.officeId,
          departmentId: reconciled.departmentId,
          memberId: reconciled.memberId,
          search: reconciled.search,
          status: reconciled.status,
        };
      });
      // Ketikan pencarian memakai `replace` agar history tidak dibanjiri;
      // filter diskret lain masuk history supaya Back/Forward bermakna.
      replaceNextRef.current = change.type === "search";
      setPageState(1);
    },
    [workDate],
  );

  const resetFilters = useCallback(() => {
    replaceNextRef.current = false;
    setSelection(DEFAULT_SELECTION);
    setSortState("priority");
    setPageState(1);
    setMemberSearchValue("");
  }, []);

  const setSort = useCallback((next: WorkTeamOverviewSort) => {
    replaceNextRef.current = false;
    setSortState(next);
    setPageState(1);
  }, []);

  const setPage = useCallback((next: number) => {
    replaceNextRef.current = false;
    setPageState(next < 1 ? 1 : Math.floor(next));
  }, []);

  const setMemberSearch = useCallback((value: string) => {
    // Simpan apa adanya (hanya dibatasi panjang) agar pengguna bisa mengetik
    // spasi; normalisasi trim dilakukan oleh repository saat mengirim RPC.
    setMemberSearchValue(value.slice(0, 120));
    setMemberSearchActive(true);
  }, []);

  const loadMoreMembers = useCallback(() => {
    setMemberSearchPage((current) => current + 1);
  }, []);

  const activateMemberSearch = useCallback(() => {
    setMemberSearchActive(true);
  }, []);

  const toggleMember = useCallback((memberId: string) => {
    setExpandedMemberId((current) => (current === memberId ? null : memberId));
  }, []);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  const reloadMemberEntries = useCallback(
    () => setMemberEntriesReloadToken((token) => token + 1),
    [],
  );

  /* -------------------------------------------------------------- turunan */

  const activeFilterCount = useMemo(
    () => countActiveWorkTeamOverviewFilters(filters),
    [filters],
  );

  const departmentOptions = useMemo(
    () => listWorkTeamOverviewUniqueDepartmentOptions(options, selection.officeId),
    [options, selection.officeId],
  );

  const memberOptions = useMemo(() => {
    const base = listWorkTeamOverviewMemberOptions(memberSearchResults, selection);
    if (resolvedMember && !base.some((option) => option.id === resolvedMember.id)) {
      return [resolvedMember, ...base];
    }
    return base;
  }, [memberSearchResults, selection, resolvedMember]);

  const hasMoreMembers = useMemo(() => {
    const loaded = memberSearchPage * WORK_TEAM_OVERVIEW_MEMBER_SEARCH_PAGE_SIZE;
    return memberSearchResults.length < memberSearchTotal && loaded < memberSearchTotal;
  }, [memberSearchPage, memberSearchResults.length, memberSearchTotal]);

  const pageCount = useMemo(
    () => getWorkTeamOverviewPageCount(data?.totalCount ?? 0, pageSize),
    [data, pageSize],
  );

  return {
    filters,
    sort,
    page,
    pageSize,
    pageCount,
    activeFilterCount,
    options,
    departmentOptions,
    memberOptions,
    memberSearch,
    memberSearchTotal,
    memberSearchStatus,
    memberSearchError,
    memberSearchLimit: WORK_TEAM_OVERVIEW_MEMBER_SEARCH_PAGE_SIZE,
    memberSearchActive,
    hasMoreMembers,
    optionsStatus,
    optionsError,
    data,
    status,
    error,
    expandedMemberId,
    memberEntries,
    memberEntriesStatus,
    memberEntriesError,
    setFilter,
    resetFilters,
    setSort,
    setPage,
    setMemberSearch,
    loadMoreMembers,
    activateMemberSearch,
    toggleMember,
    reload,
    reloadMemberEntries,
  };
}
