/**
 * Hook Team Overview server-side (CAL-03 F4A Director Scale).
 *
 * Tanggung jawab:
 * - menyimpan filter, halaman, dan opsi organisasi yang terotorisasi;
 * - membatalkan permintaan lama setiap filter/halaman berubah (stale guard);
 * - memuat pekerjaan anggota secara lazy, maksimal satu anggota terbuka;
 * - menyinkronkan filter ke URL query agar refresh/back mempertahankan konteks.
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
import { WORK_TEAM_OVERVIEW_DEFAULT_PAGE_SIZE } from "../types/work-team-overview";
import {
  applyWorkTeamOverviewFilterChange,
  clampWorkTeamOverviewPageSize,
  countActiveWorkTeamOverviewFilters,
  createWorkTeamOverviewFilters,
  getWorkTeamOverviewPageCount,
  listWorkTeamOverviewMemberOptions,
  readWorkTeamOverviewUrlState,
  reconcileWorkTeamOverviewFilters,
  writeWorkTeamOverviewUrlState,
} from "../lib/work-team-overview";

export type WorkTeamOverviewStatus = "idle" | "loading" | "ready" | "error";

export type WorkTeamOverviewFilterChange =
  | { type: "office"; value: string | null }
  | { type: "department"; value: string | null }
  | { type: "member"; value: string | null }
  | { type: "search"; value: string }
  | { type: "status"; value: WorkTeamOverviewFilters["status"] }
  | { type: "workDate"; value: WorkDate };

export interface UseWorkTeamOverviewInput {
  repository: WorkTeamOverviewRepository | null;
  /** Hanya memuat saat tab Tim aktif. */
  enabled: boolean;
  /** Tanggal acuan awal (defaultnya tanggal hari ini menurut pemanggil). */
  workDate: WorkDate;
  pageSize?: number;
  /** Sinkronkan filter ke URL query (dinonaktifkan pada test). */
  syncUrl?: boolean;
}

export interface UseWorkTeamOverviewResult {
  filters: WorkTeamOverviewFilters;
  sort: WorkTeamOverviewSort;
  page: number;
  pageSize: number;
  pageCount: number;
  activeFilterCount: number;
  options: readonly WorkTeamOverviewOption[];
  memberOptions: readonly WorkTeamOverviewOption[];
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
  toggleMember: (memberId: string) => void;
  reload: () => void;
  reloadMemberEntries: () => void;
}

export function useWorkTeamOverview(
  input: UseWorkTeamOverviewInput,
): UseWorkTeamOverviewResult {
  const { repository, enabled, workDate, syncUrl = false } = input;
  const pageSize = clampWorkTeamOverviewPageSize(
    input.pageSize ?? WORK_TEAM_OVERVIEW_DEFAULT_PAGE_SIZE,
  );

  const initialStateRef = useRef<{
    filters: WorkTeamOverviewFilters;
    sort: WorkTeamOverviewSort;
    page: number;
  } | null>(null);

  if (initialStateRef.current === null) {
    initialStateRef.current =
      syncUrl && typeof window !== "undefined"
        ? readWorkTeamOverviewUrlState({ search: window.location.search, fallbackDate: workDate })
        : {
            filters: createWorkTeamOverviewFilters(workDate),
            sort: "priority",
            page: 1,
          };
  }

  const [filters, setFilters] = useState<WorkTeamOverviewFilters>(
    initialStateRef.current.filters,
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

  const [reloadToken, setReloadToken] = useState(0);
  const [memberEntriesReloadToken, setMemberEntriesReloadToken] = useState(0);
  const overviewRequestRef = useRef(0);

  const optionsRef = useRef<readonly WorkTeamOverviewOption[]>([]);
  optionsRef.current = options;

  /* ---------------------------------------------------------------- opsi */

  useEffect(() => {
    if (!enabled || !repository) return undefined;

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
        // Pilihan lama yang tidak lagi ada di cakupan dibuang, bukan dipaksa.
        setFilters((current) => reconcileWorkTeamOverviewFilters(current, result));
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
  }, [repository, enabled, reloadToken]);

  /* --------------------------------------------------------------- halaman */

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

  // Halaman yang melewati jumlah halaman (mis. filter mempersempit) dijepit.
  useEffect(() => {
    if (!data) return;
    if (data.totalCount <= 0) {
      if (page !== 1) setPageState(1);
      return;
    }
    const pageCount = getWorkTeamOverviewPageCount(data.totalCount, pageSize);
    if (page > pageCount) setPageState(pageCount);
  }, [data, page, pageSize]);

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
        date: filters.workDate,
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
  }, [repository, enabled, expandedMemberId, filters.workDate, memberEntriesReloadToken]);

  /* -------------------------------------------------------------- URL sync */

  useEffect(() => {
    if (!syncUrl || typeof window === "undefined") return;
    const search = writeWorkTeamOverviewUrlState({ filters, sort, page });
    const url = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
  }, [syncUrl, filters, sort, page]);

  /* ---------------------------------------------------------------- aksi */

  const setFilter = useCallback((change: WorkTeamOverviewFilterChange) => {
    setFilters((current) =>
      reconcileWorkTeamOverviewFilters(
        applyWorkTeamOverviewFilterChange(current, change),
        optionsRef.current,
      ),
    );
    // Perubahan filter apa pun selalu kembali ke halaman pertama.
    setPageState(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(createWorkTeamOverviewFilters(workDate));
    setSortState("priority");
    setPageState(1);
  }, [workDate]);

  const setSort = useCallback((next: WorkTeamOverviewSort) => {
    setSortState(next);
    setPageState(1);
  }, []);

  const setPage = useCallback((next: number) => {
    setPageState(next < 1 ? 1 : Math.floor(next));
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

  const memberOptions = useMemo(
    () => listWorkTeamOverviewMemberOptions(options, filters),
    [options, filters],
  );

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
    memberOptions,
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
    toggleMember,
    reload,
    reloadMemberEntries,
  };
}
