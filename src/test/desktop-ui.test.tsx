import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/desktop-api", () => ({ desktopWebApi: mocks.api }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { email: "tester@example.test" } } }) } } }));
import DesktopAuthorizePage from "@/pages/auth/DesktopAuthorizePage";
import DesktopDevicesPage from "@/pages/settings/DesktopDevicesPage";

beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, "", "/desktop/authorize?request=11111111-1111-4111-8111-111111111111"); });
afterEach(cleanup);
describe("desktop consent and device UI", () => {
  it("requires explicit code and consent, escapes device names", async () => {
    mocks.api.mockResolvedValue({ device_name: "<script>untrusted</script>", platform: "windows" });
    render(<MemoryRouter><DesktopAuthorizePage /></MemoryRouter>);
    expect(await screen.findByText("<script>untrusted</script>")).toBeInTheDocument();
    expect(document.querySelector("script")).toBe(null);
    const confirm = screen.getByRole("button", { name: "Hubungkan perangkat" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Kode 8 digit dari aplikasi Anda"), { target: { value: "01234567" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith(expect.stringContaining("/decision"), { user_code: "01234567", approve: true }));
    expect(await screen.findByRole("heading", { name: "Perangkat terhubung" })).toBeInTheDocument();
  });
  it("shows expired/invalid requests without presenting a consent form", async () => {
    mocks.api.mockRejectedValue(new Error("Permintaan telah berakhir"));
    render(<MemoryRouter><DesktopAuthorizePage /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Permintaan telah berakhir");
    expect(screen.queryByRole("button", { name: "Hubungkan perangkat" })).toBe(null);
  });
  it("does not revoke until the user confirms", async () => {
    mocks.api.mockResolvedValue({ devices: [{ id: "test", device_name: "Finance PC", platform: "windows", refreshed_at: "2026-10-22", expires_at: "2099-10-22", revoked_at: null }] });
    render(<DesktopDevicesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Cabut akses" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });
});
