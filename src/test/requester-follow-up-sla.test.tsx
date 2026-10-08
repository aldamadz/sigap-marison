import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequesterFollowUpSla } from "@/components/surat/RequesterFollowUpSla";
import {
  formatFollowUpMinutes, getRequesterFollowUpSlaStatus, requesterFollowUpSlaService,
  type RequesterFollowUpSla as Sla,
} from "@/services/requester-follow-up-sla.service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
const eventId = "963b7fab-d4f7-4251-aeb2-5e56a32a66ee";
const sla: Sla = {
  event_id: eventId, started_at: "2026-10-08T01:00:00Z", measured_at: "2026-10-08T02:30:00Z",
  elapsed_minutes: 90, sla_minutes: 120, department_name: "Teknik", config_source: "department", timezone: "Asia/Jakarta",
};
const clients: QueryClient[] = [];
function mount(props: { eventId?: string; compact?: boolean } = { eventId }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><RequesterFollowUpSla {...props} requesterId="owner" /></QueryClientProvider>);
}
beforeEach(() => mocks.rpc.mockReset().mockResolvedValue({ data: [sla], error: null }));
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.useRealTimers(); });

describe("requester follow-up SLA service", () => {
  it("reads only the requested event; timestamps and minutes come from the server", async () => {
    expect(await requesterFollowUpSlaService.get(eventId)).toEqual(sla);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_requester_follow_up_sla", { p_event_id: eventId });
  });
  it.each([0, 119, 120, 121, 180])("uses canonical strict expiry at %i work minutes", elapsed => {
    expect(getRequesterFollowUpSlaStatus({ ...sla, elapsed_minutes: elapsed })).toEqual({
      remainingMinutes: Math.max(0, 120 - elapsed), lateMinutes: Math.max(0, elapsed - 120), isLate: elapsed > 120,
    });
  });
  it.each([[0, "0 menit"], [59, "59 menit"], [60, "1 jam"], [121, "2 jam 1 menit"]])("formats %i minutes", (value, label) => {
    expect(formatFollowUpMinutes(value as number)).toBe(label);
  });
  it("rejects missing event IDs without querying", async () => {
    await expect(requesterFollowUpSlaService.get("")).rejects.toThrow("tidak tersedia");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns unavailable for a closed or superseded event, never a synthetic default", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect(await requesterFollowUpSlaService.get(eventId)).toBeNull();
  });
  it.each(["42501", "PGRST202", "500"])("fails closed on access/migration/server error %s", async code => {
    mocks.rpc.mockResolvedValue({ data: [sla], error: { code, message: "Private diagnostic" } });
    await expect(requesterFollowUpSlaService.get(eventId)).rejects.toThrow("SLA tindak lanjut tidak tersedia.");
  });
  it.each([
    { elapsed_minutes: -1 }, { elapsed_minutes: 1.5 }, { sla_minutes: 0 },
    { event_id: "other" }, { started_at: "invalid" }, { measured_at: null },
    { timezone: "bad/timezone" }, { timezone: undefined }, { config_source: "invented" },
  ])("rejects malformed server data %j", async change => {
    mocks.rpc.mockResolvedValue({ data: [{ ...sla, ...change }], error: null });
    await expect(requesterFollowUpSlaService.get(eventId)).rejects.toThrow("tidak tersedia");
  });
});

describe("requester follow-up SLA display", () => {
  it("shows request start, configured target, elapsed and remaining work time", async () => {
    mount();
    expect(await screen.findByText("Sisa 30 menit")).toBeInTheDocument();
    expect(screen.getByText("2 jam kerja")).toBeInTheDocument();
    expect(screen.getByText("1 jam 30 menit kerja")).toBeInTheDocument();
    expect(screen.getByText("30 menit kerja")).toBeInTheDocument();
    expect(document.querySelector("time")).toHaveAttribute("datetime", sla.started_at);
    expect(screen.getByText("Konfigurasi departemen pemohon: Teknik")).toBeInTheDocument();
  });
  it("does not count plain clock minutes on the client", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...sla, started_at: "2026-10-02T10:00:00Z", elapsed_minutes: 10 }], error: null });
    mount();
    expect(await screen.findByText("Sisa 1 jam 50 menit")).toBeInTheDocument();
  });
  it("labels default120 explicitly", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...sla, config_source: "default", department_name: null }], error: null });
    mount();
    expect(await screen.findByText("Default KPI pemohon")).toBeInTheDocument();
  });
  it("shows late time and clamps remaining to zero", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...sla, elapsed_minutes: 145 }], error: null });
    mount();
    expect(await screen.findByText("Terlambat 25 menit")).toBeInTheDocument();
    expect(screen.getByText("0 menit kerja")).toBeInTheDocument();
  });
  it("shows the exact SLA boundary without prematurely marking late", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...sla, elapsed_minutes: 120 }], error: null });
    mount();
    expect(await screen.findByText("Batas SLA tercapai")).toBeInTheDocument();
    expect(screen.queryByText(/Terlambat/)).not.toBeInTheDocument();
  });
  it("hides cached timing after a failed background refresh", async () => {
    mount();
    await screen.findByText("Sisa 30 menit");
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await act(async () => { await clients[0].invalidateQueries({ queryKey: ["requester-follow-up-sla"] }); });
    expect(await screen.findByText("SLA perbaikan tidak tersedia")).toBeInTheDocument();
    expect(screen.queryByText("Sisa 30 menit")).not.toBeInTheDocument();
  });
  it("recovers from error without hiding document actions or leaking server details", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Private diagnostic" } });
    mount();
    expect(await screen.findByText("SLA perbaikan tidak tersedia")).toBeInTheDocument();
    expect(screen.queryByText("Private diagnostic")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(await screen.findByText("Sisa 30 menit")).toBeInTheDocument();
  });
  it("never nests a retry button inside the compact queue button", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    mount({ eventId, compact: true });
    expect(await screen.findByText("SLA perbaikan tidak tersedia")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("does not request SLA without an event", () => {
    mount({});
    expect(screen.getByText("SLA perbaikan tidak tersedia")).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
