import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, keepPreviousData, type QueryClient } from "@tanstack/react-query";
import { suratInboxApi } from "@/features/surat/inbox/services/surat-inbox-api";
import { getInboxTaskKey, getInboxTaskSignatureId } from "@/features/surat/inbox/lib/inbox-task-state";

export type InboxActionFilter = "all" | "approval" | "verification";
export type InboxCategoryFilter = string;

// Caller may pass a wider string (e.g. React `useState("all")`); we narrow
// to InboxActionFilter at the boundary so the public type is exact while
// the hook is drop-in for existing component state.
const toInboxActionFilter = (value: string): InboxActionFilter =>
  value === "approval" || value === "verification" ? value : "all";

export type UseInboxPaginationParams = {
  search: string;
  categoryFilter: InboxCategoryFilter;
  actionFilter: string;
  refetchAttention: () => unknown;
  queryClient: QueryClient;
};

export type UseInboxPaginationResult = {
  items: any[];
  hasMore: boolean;
  total: number;
  remaining: number;
  loading: boolean;
  error: unknown;
  isFetching: boolean;
  detailCache: Record<string, any>;
  setDetailCache: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  loadMore: () => void;
  refetch: () => void;
  refetchFull: () => void;
  finishTaskLocally: (taskKey: string) => void;
  refreshAfterAction: () => void;
  resetPagination: () => void;
};

/**
 * Cursor-based inbox pagination extracted from InboxPage.
 *
 * Owns: cursor state, accumulated items, hasMore/total, the compact
 * `surat-inbox-compact` useQuery, local detail cache, and the four
 * lifecycle helpers (refetchFull / finishTaskLocally / refreshAfterAction /
 * resetPagination).
 *
 * Does NOT own: attention refetch, `surat-linked-documents` or
 * `surat-inbox-detail` invalidations (caller handles those on realtime
 * refresh), the KPI query, the user-profile query, the selected-detail
 * query, or any UI render logic.
 *
 * Phase 2 refactor scope: behaviour-preserving extraction only.
 */
export const useInboxPagination = (
  params: UseInboxPaginationParams,
): UseInboxPaginationResult => {
  const { search, categoryFilter, actionFilter, refetchAttention, queryClient } = params;

  const [inboxCursor, setInboxCursor] = useState<string | null>(null);
  const [inboxAllItems, setInboxAllItems] = useState<any[]>([]);
  const [inboxHasMore, setInboxHasMore] = useState(false);
  const [inboxTotal, setInboxTotal] = useState(0);
  const [detailCache, setDetailCache] = useState<Record<string, any>>({});

  const inboxFilterKey = `${search}|${categoryFilter}|${actionFilter}`;
  const prevFilterKeyRef = useRef(inboxFilterKey);

  useEffect(() => {
    if (prevFilterKeyRef.current !== inboxFilterKey) {
      prevFilterKeyRef.current = inboxFilterKey;
      setInboxCursor(null);
      setInboxAllItems([]);
      setInboxHasMore(false);
      setInboxTotal(0);
    }
  }, [inboxFilterKey]);

  const taskTypeParam = (() => {
    const narrowed = toInboxActionFilter(actionFilter);
    return narrowed === "approval"
      ? "approval"
      : narrowed === "verification"
        ? "verification"
        : undefined;
  })();

  const {
    data: inboxPage,
    isLoading: loading,
    error: inboxError,
    refetch: refetchInbox,
    isFetching,
  } = useQuery({
    queryKey: ["surat-inbox-compact", inboxFilterKey, inboxCursor] as string[],
    queryFn: () =>
      suratInboxApi.getMyInboxCompact({
        limit: 20,
        cursor: inboxCursor || undefined,
        search: search || undefined,
        request_category: categoryFilter !== "all" ? categoryFilter : undefined,
        task_type: taskTypeParam,
      }),
    staleTime: 30000,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!inboxPage) return;
    const page = inboxPage as {
      items: any[];
      total: number | null;
      hasMore: boolean;
      nextCursor: string | null;
      pageSize: number;
    };
    if (!inboxCursor) {
      setInboxAllItems(page.items);
      if (page.total !== null) setInboxTotal(page.total);
    } else {
      setInboxAllItems((prev) => {
        const taskKeys = new Set(prev.map(getInboxTaskKey).filter(Boolean));
        const next = page.items.filter((item: any) => {
          const taskKey = getInboxTaskKey(item);
          return taskKey !== null && !taskKeys.has(taskKey);
        });
        return [...prev, ...next];
      });
    }
    setInboxHasMore(page.hasMore);
  }, [inboxPage, inboxCursor]);

  const refetchFull = useCallback(() => {
    setInboxCursor(null);
    setInboxAllItems([]);
    setDetailCache({});
    refetchInbox();
  }, [refetchInbox]);

  const finishTaskLocally = useCallback(
    (taskKey: string) => {
      const signatureId = getInboxTaskSignatureId(taskKey);
      setInboxAllItems((previous) => previous.filter((item: any) => getInboxTaskKey(item) !== taskKey));
      setInboxTotal((previous) => Math.max(0, previous - 1));
      if (!signatureId) return;
      setDetailCache((previous) => {
        const next = { ...previous };
        delete next[signatureId];
        return next;
      });
      queryClient.removeQueries({ queryKey: ["surat-inbox-detail", signatureId], exact: true });
    },
    [queryClient],
  );

  const refreshAfterAction = useCallback(() => {
    void Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ["surat-inbox-compact"] }),
      queryClient.invalidateQueries({ queryKey: ["surat-inbox-kpi"] }),
      refetchAttention(),
    ]);
  }, [queryClient, refetchAttention]);

  const loadMore = useCallback(() => {
    setInboxCursor((inboxPage as any)?.nextCursor ?? null);
  }, [inboxPage]);

  const resetPagination = useCallback(() => {
    setInboxCursor(null);
    // Keep the open task visible while the first page refreshes in place.
    // Filter changes still clear the list through the filter effect above.
  }, []);

  return {
    items: inboxAllItems,
    hasMore: inboxHasMore,
    total: inboxTotal,
    remaining: Math.max(0, inboxTotal - inboxAllItems.length),
    loading,
    error: inboxError,
    isFetching,
    detailCache,
    setDetailCache,
    loadMore,
    refetch: refetchInbox,
    refetchFull,
    finishTaskLocally,
    refreshAfterAction,
    resetPagination,
  };
};
