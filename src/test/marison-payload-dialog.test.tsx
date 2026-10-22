import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { MarisonOutboundQueuePanel } from "@/components/admin/MarisonOutboundQueuePanel";
import { marisonIntegrationService, type MarisonDispatchRow } from "@/services/marison-integration.service";
vi.mock("@/providers/MarisonEnvironmentProvider", () => ({ useMarisonEnvironment: () => ({ status: { canManage: true, environment: "staging" } }) }));
vi.mock("@/services/marison-integration.service", () => ({ marisonIntegrationService: { listDispatches: vi.fn(), getPayload: vi.fn(), getPostmanPayload: vi.fn(), getLatestPayload: vi.fn(), reconcileDispatch: vi.fn(), createReplacement: vi.fn(), preflightReplacement: vi.fn(), preflightDispatch: vi.fn() } }));
vi.mock("file-saver", () => ({ saveAs: vi.fn() }));
import { saveAs } from "file-saver";
const row = { id: "job-a", noSurat: "TEST/ASET", generation: 2, environment: "staging", title: "Komputer", kind: "asset", status: "succeeded", createdAt: "2026-10-21T00:00:00Z" } as MarisonDispatchRow;
const result = { dispatchId: row.id, environment: "staging" as const, generation: 2, method: "POST" as const, endpoint: "/asset-purchase-requests", postStartedAt: "2026-10-21T00:00:00Z", payloadHash: "abc", source: "frozen" as const, payload: { request_number: "TEST/ASET", items: [{ asset_name: "<script>ignored</script>", quantity: 3 }] }, redacted: false };
function panel() { return render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MarisonOutboundQueuePanel /></QueryClientProvider></MemoryRouter>); }
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(marisonIntegrationService.listDispatches).mockResolvedValue({ environment: "staging", page: 1, pageSize: 20, total: 1, items: [row] });
  vi.mocked(marisonIntegrationService.getPayload).mockResolvedValue(result);
});
describe("outbound payload modal", () => {
  it("generates only on explicit click, compares changes, copies/downloads current JSON and retains sent history", async () => {
    const candidate = { ...result, source: "latest" as const, generatedAt: "2026-10-22T01:00:00Z", validation: "passed" as const, acceptedPreviously: true,
      payload: { request_number: "TEST/ASET", units: [{ addendum_bawah_nominal: 246000 }] },
      fieldChanges: [{ path: "units[0].addendum_bawah_nominal", before: 0, after: 246000, added: false, removed: false }] };
    vi.mocked(marisonIntegrationService.getLatestPayload).mockResolvedValue(candidate);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    panel(); fireEvent.click(await screen.findByRole("button", { name: "Lihat payload" }));
    await screen.findByLabelText("JSON payload");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Payload terbaru" }), { button: 0, ctrlKey: false });
    expect(marisonIntegrationService.getLatestPayload).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Salin JSON" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Generate payload terbaru" }));
    expect(await screen.findByText("Validasi lulus")).toBeInTheDocument();
    expect(screen.getByText(/sudah diterima external/)).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("246000");
    fireEvent.click(screen.getByRole("button", { name: "Salin JSON" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(JSON.stringify(candidate.payload, null, 2)));
    fireEvent.click(screen.getByRole("button", { name: "Unduh JSON" }));
    expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), "payload_TEST_ASET_latest.json");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Payload terkirim" }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByLabelText("JSON payload")).toHaveTextContent("quantity"));
    expect(marisonIntegrationService.createReplacement).not.toHaveBeenCalled();
    expect(marisonIntegrationService.reconcileDispatch).not.toHaveBeenCalled();
  });
  it("does not export stale candidate JSON after regeneration fails", async () => {
    vi.mocked(marisonIntegrationService.getLatestPayload).mockRejectedValue(new Error("Data berubah; generate ulang"));
    panel(); fireEvent.click(await screen.findByRole("button", { name: "Lihat payload" }));
    await screen.findByLabelText("JSON payload");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Payload terbaru" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole("button", { name: "Generate payload terbaru" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Data berubah");
    expect(screen.queryByLabelText("JSON payload")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salin JSON" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unduh JSON" })).toBeDisabled();
  });
  it("offers a separate Fund Postman view, copies only the chosen candidate and retains stored history", async () => {
    vi.mocked(marisonIntegrationService.listDispatches).mockResolvedValue({ environment: "staging", page: 1, pageSize: 20, total: 1, items: [{ ...row, kind: "fund" }] });
    const candidate = { ...result, source: "postman" as const, payloadHash: "candidate-hash", payload: { type: "marketing_cost", main_document: "https://sigap.test/main.pdf", attachments: [] }, changes: ["Dokumen utama dipisahkan ke main_document."] };
    vi.mocked(marisonIntegrationService.getPostmanPayload).mockResolvedValue(candidate);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    panel(); fireEvent.click(await screen.findByRole("button", { name: "Lihat payload" }));
    expect(await screen.findByLabelText("JSON payload")).toHaveTextContent("TEST/ASET");
    expect(marisonIntegrationService.getPostmanPayload).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Payload untuk Postman" }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByLabelText("JSON payload")).toHaveTextContent("marketing_cost"));
    expect(screen.getByText(/SHA-256 kandidat/)).toHaveTextContent("candidate-hash");
    expect(screen.getByText(/duplikat/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salin JSON" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(JSON.stringify(candidate.payload, null, 2)));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Payload terkirim" }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByLabelText("JSON payload")).toHaveTextContent("TEST/ASET"));
    expect(marisonIntegrationService.createReplacement).not.toHaveBeenCalled();
  });
  it("does not retain old JSON or permit copying after Postman preparation fails", async () => {
    vi.mocked(marisonIntegrationService.listDispatches).mockResolvedValue({ environment: "staging", page: 1, pageSize: 20, total: 1, items: [{ ...row, kind: "fund" }] });
    vi.mocked(marisonIntegrationService.getPostmanPayload).mockRejectedValue(new Error("Tautan tidak aktif"));
    panel(); fireEvent.click(await screen.findByRole("button", { name: "Lihat payload" }));
    await screen.findByLabelText("JSON payload");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Payload untuk Postman" }), { button: 0, ctrlKey: false });
    expect(await screen.findByRole("alert")).toHaveTextContent("Tautan tidak aktif");
    expect(screen.queryByLabelText("JSON payload")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salin JSON" })).toBeDisabled();
  });
  it("fetches on click, copies escaped JSON without sending and closes", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    panel(); const open = await screen.findByRole("button", { name: "Lihat payload" });
    expect(marisonIntegrationService.getPayload).not.toHaveBeenCalled(); fireEvent.click(open);
    const dialog = within(await screen.findByRole("dialog"));
    expect(await dialog.findByLabelText("JSON payload")).toHaveTextContent("<script>ignored</script>");
    expect(screen.getByRole("dialog").querySelector("script")).toBeNull();
    fireEvent.click(dialog.getByRole("button", { name: "Salin JSON" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(JSON.stringify(result.payload, null, 2)));
    expect(marisonIntegrationService.reconcileDispatch).not.toHaveBeenCalled(); expect(marisonIntegrationService.createReplacement).not.toHaveBeenCalled(); expect(marisonIntegrationService.preflightReplacement).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole("button", { name: "Tutup" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("shows safe failure with explicit retry", async () => {
    vi.mocked(marisonIntegrationService.getPayload).mockRejectedValueOnce(new Error("Payload gagal dimuat"));
    panel(); fireEvent.click(await screen.findByRole("button", { name: "Lihat payload" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Payload gagal dimuat"); expect(screen.getByRole("button", { name: "Salin JSON" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" })); expect(await screen.findByLabelText("JSON payload")).toBeInTheDocument();
  });
  it("does not invent unavailable payload", async () => {
    vi.mocked(marisonIntegrationService.getPayload).mockResolvedValue({ ...result, source: "unavailable", payload: null });
    panel(); fireEvent.click(await screen.findByRole("button", { name: "Lihat payload" }));
    expect(await screen.findByText("Payload belum tersimpan untuk generasi ini.")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Salin JSON" })).toBeDisabled();
  });
  it("labels redacted snapshots and clears old JSON on reopen", async () => {
    vi.mocked(marisonIntegrationService.getPayload).mockResolvedValue({ ...result, source: "snapshot", redacted: true });
    panel(); fireEvent.click(await screen.findByRole("button", { name: "Lihat payload" }));
    expect(await screen.findByText(/Snapshot tersimpan, bukan bukti/)).toBeInTheDocument(); expect(screen.getByText(/Field credential disembunyikan/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tutup" })); await waitFor(() => expect(screen.queryByLabelText("JSON payload")).not.toBeInTheDocument());
    vi.mocked(marisonIntegrationService.getPayload).mockResolvedValue({ ...result, payload: { request_number: "NEW" } });
    fireEvent.click(screen.getByRole("button", { name: "Lihat payload" }));
    await waitFor(() => expect(screen.getByLabelText("JSON payload")).toHaveTextContent("NEW")); expect(screen.getByLabelText("JSON payload")).not.toHaveTextContent("ignored");
  });
});
