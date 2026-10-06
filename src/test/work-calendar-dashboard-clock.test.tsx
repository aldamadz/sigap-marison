import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Dashboard from "@/components/dashboard/Dashboard";

const mocks = vi.hoisted(() => ({
  user: { id: "me", officeId: null },
  query: vi.fn(() => ({ data: [], isLoading: false, error: null })),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.query }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/feature-availability", () => ({ isWorkCalendarEnabled: true }));
vi.mock("@/services", () => ({ isParentUser: vi.fn().mockResolvedValue(false) }));
vi.mock("@/services/dashboard.service", () => ({
  getDashboardKPI: vi.fn(), getStatusDistribution: vi.fn(), getRecentActivities: vi.fn(), getDepartmentActivity: vi.fn(),
}));
vi.mock("@/components/dashboard/KPICard", () => ({ KPICard: () => null }));
vi.mock("@/components/dashboard/StatusChart", () => ({ StatusChart: () => null }));
vi.mock("@/components/dashboard/DepartmentChart", () => ({ DepartmentChart: () => null }));
vi.mock("@/components/dashboard/RecentActivity", () => ({ RecentActivity: () => null }));
vi.mock("@/components/dashboard/SuratSummaryCards", () => ({ SuratSummaryCards: () => null }));
vi.mock("@/components/agenda/AgendaParentFilter", () => ({ AgendaParentFilter: () => null }));
vi.mock("@/components/ui/Breadcrumbs", () => ({ PageHeader: () => null }));
vi.mock("@/features/work-calendar", async () => {
  const dates = await vi.importActual<typeof import("@/features/work-calendar/lib/work-calendar-date")>("@/features/work-calendar/lib/work-calendar-date");
  const summary = await vi.importActual<typeof import("@/features/work-calendar/lib/work-calendar-dashboard")>("@/features/work-calendar/lib/work-calendar-dashboard");
  return {
    todayWorkDate: dates.todayWorkDate,
    workDateToUtcRange: dates.workDateToUtcRange,
    buildWorkCalendarDashboardSummary: summary.buildWorkCalendarDashboardSummary,
    createSupabaseWorkCalendarDashboardRepository: () => ({ listDashboardEntries: vi.fn() }),
    WorkCalendarDashboardWidget: ({ today }: { today: string }) => <span data-testid="dashboard-day">{today}</span>,
  };
});

describe("dashboard work-calendar clock", () => {
  it("refreshes the query key at WIB midnight, focus and visibility, and cleans up its timer/listeners", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T16:59:59.900Z"));
    const windowAdd = vi.spyOn(window, "addEventListener");
    const windowRemove = vi.spyOn(window, "removeEventListener");
    const documentAdd = vi.spyOn(document, "addEventListener");
    const documentRemove = vi.spyOn(document, "removeEventListener");
    const mounted = render(<Dashboard />);
    try {
      await act(async () => {});
      expect(screen.getByTestId("dashboard-day")).toHaveTextContent("2026-03-09");
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      expect(screen.getByTestId("dashboard-day")).toHaveTextContent("2026-03-10");
      expect(mocks.query).toHaveBeenLastCalledWith(expect.objectContaining({ queryKey: ["work-calendar-dashboard", "me", "2026-03-10"] }));
      vi.setSystemTime(new Date("2026-03-11T01:00:00Z"));
      await act(async () => { window.dispatchEvent(new Event("focus")); });
      expect(screen.getByTestId("dashboard-day")).toHaveTextContent("2026-03-11");
      vi.setSystemTime(new Date("2026-03-12T01:00:00Z"));
      await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
      expect(screen.getByTestId("dashboard-day")).toHaveTextContent("2026-03-12");
      expect(mocks.query).toHaveBeenLastCalledWith(expect.objectContaining({ queryKey: ["work-calendar-dashboard", "me", "2026-03-12"] }));
      const focusListener = windowAdd.mock.calls.find(([type]) => type === "focus")?.[1];
      const visibilityListener = documentAdd.mock.calls.find(([type]) => type === "visibilitychange")?.[1];
      mounted.unmount();
      expect(vi.getTimerCount()).toBe(0);
      expect(windowRemove).toHaveBeenCalledWith("focus", focusListener);
      expect(documentRemove).toHaveBeenCalledWith("visibilitychange", visibilityListener);
    } finally {
      mounted.unmount();
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });
});
