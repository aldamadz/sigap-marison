import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useInboxPagination } from "@/features/surat/inbox/lib/use-inbox-pagination";

const getPage = vi.hoisted(() => vi.fn());
vi.mock("@/features/surat/inbox/services/surat-inbox-api", () => ({
  suratInboxApi: { getMyInboxCompact: getPage },
}));

describe("Inbox background refresh", () => {
  it("keeps the visible task and detail until a refreshed page replaces them", async () => {
    getPage.mockResolvedValueOnce({ items: [{ id: "signature-1", task_type: "approval" }], total: 1, hasMore: false, nextCursor: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => useInboxPagination({ search: "", categoryFilter: "all", actionFilter: "all", refetchAttention: vi.fn(), queryClient: client }), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    act(() => result.current.setDetailCache({ "signature-1": { id: "signature-1" } }));
    act(() => result.current.resetPagination());
    expect(result.current.items).toHaveLength(1);
    expect(result.current.detailCache["signature-1"]).toBeDefined();
    const invalidation = vi.spyOn(client, "invalidateQueries");
    getPage.mockResolvedValueOnce({ items: [{ id: "signature-1", task_type: "approval" }], total: 1, hasMore: false, nextCursor: null });
    act(() => result.current.refreshAfterAction());
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ["surat-monitoring-list"] });
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ["admin-monitoring-list"] });
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ["surat-detail"] });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    getPage.mockResolvedValueOnce({ items: [], total: 0, hasMore: false, nextCursor: null });
    await act(() => client.invalidateQueries({ queryKey: ["surat-inbox-compact"] }));
    await waitFor(() => expect(result.current.items).toHaveLength(0));
    expect(result.current.total).toBe(0);
    unmount();
    client.clear();
  });
});
