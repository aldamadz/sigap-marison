import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { UnitAllocationHistory } from "@/components/surat/UnitAllocationHistory";
import { getUnitAllocationHistory } from "@/services/unit-allocation-history.service";

vi.mock("@/services/unit-allocation-history.service", () => ({ getUnitAllocationHistory: vi.fn() }));
const getHistory = vi.mocked(getUnitAllocationHistory);
const show = (suratId = "surat") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <UnitAllocationHistory suratId={suratId} />
</QueryClientProvider>);
describe("Unit examiner history", () => {
  beforeEach(() => { getHistory.mockReset(); });
  it("keeps 30 requested / 3 ready / 27 outstanding, examiner identity and note visible", async () => {
    getHistory.mockResolvedValue([{ id: "review", signature_id: "signature", actor_name: "Lili", created_at: "2026-10-15T03:00:00Z",
      requested_count: 30, allocated_count: 3, remaining_count: 27, note: "Hanya 3 unit siap bangun." }]);
    show();
    expect(await screen.findByText("Diperiksa oleh Lili")).toBeInTheDocument();
    for (const text of ["30 unit", "3 unit", "27 unit", "Catatan: Hanya 3 unit siap bangun."]) expect(screen.getByText(text)).toBeInTheDocument();
    expect(getHistory).toHaveBeenCalledWith("surat");
  });
  it("does not load history for an unregistered draft", () => {
    render(<UnitAllocationHistory />);
    expect(getHistory).not.toHaveBeenCalled();
  });
  it("shows a retryable error instead of claiming no examination happened", async () => {
    getHistory.mockRejectedValue(new Error("Database unavailable"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("gagal dimuat");
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
  });
});
