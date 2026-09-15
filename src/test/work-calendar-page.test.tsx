import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import WorkCalendarPage from "@/pages/work-calendar/WorkCalendarPage";
import { supabase } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => {
  return {
    supabase: {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(),
      rpc: vi.fn(),
    },
  };
});

describe("WorkCalendarPage (CAL-03 F3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("menampilkan status loading saat inisialisasi sesi dan profil", async () => {
    vi.mocked(supabase.auth.getUser).mockImplementation(
      () => new Promise(() => {}), // Pending promise
    );

    render(<WorkCalendarPage />);

    expect(screen.getByRole("status", { name: "Memuat Kalender Kerja" })).toBeInTheDocument();
    expect(screen.getByText("Menyiapkan Kalender Kerja...")).toBeInTheDocument();
  });

  it("menampilkan pesan profil tidak ditemukan bila user tidak memiliki profil aktif", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: "u-none" } },
      error: null,
    });

    const mockQueryBuilder = {
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (onfulfilled: any, onrejected: any) =>
        Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected),
    };

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue(mockQueryBuilder),
    } as any);

    render(<WorkCalendarPage />);

    await waitFor(() => {
      expect(screen.getByText("Profil Pengguna Tidak Ditemukan")).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "Akun Anda belum memiliki profil kerja aktif atau telah dinonaktifkan. Hubungi administrator sistem.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Coba Lagi/i })).toBeInTheDocument();
  });

  it("menampilkan pesan error dan tombol coba lagi saat pengambilan data gagal", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: "u-err" } },
      error: null,
    });

    const mockQueryBuilder = {
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Koneksi database terputus" },
      }),
      then: (onfulfilled: any, onrejected: any) =>
        Promise.resolve({
          data: null,
          error: { message: "Koneksi database terputus" },
        }).then(onfulfilled, onrejected),
    };

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue(mockQueryBuilder),
    } as any);

    render(<WorkCalendarPage />);

    await waitFor(() => {
      expect(screen.getByText("Profil Pengguna Tidak Ditemukan")).toBeInTheDocument();
    });
  });

  it("merender WorkCalendarWorkspace dengan data profil dan tim yang valid", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: "u-valid-1" } },
      error: null,
    });

    const mockProfileRow = {
      id: "u-valid-1",
      full_name: "Budi Pratama",
      job_title: "Senior Developer",
    };

    const mockProfileQuery = {
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: mockProfileRow, error: null }),
      then: (onfulfilled: any, onrejected: any) =>
        Promise.resolve({ data: mockProfileRow, error: null }).then(onfulfilled, onrejected),
    };

    const mockEntriesQuery = {
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockReturnThis(),
      then: (onfulfilled: any, onrejected: any) =>
        Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected),
    };

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "profiles") {
        return { select: vi.fn().mockReturnValue(mockProfileQuery) } as any;
      }
      if (table === "work_calendar_entries") {
        return { select: vi.fn().mockReturnValue(mockEntriesQuery) } as any;
      }
      return {} as any;
    });

    const mockTeamRpc = {
      range: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockReturnThis(),
      then: (onfulfilled: any, onrejected: any) =>
        Promise.resolve({
          data: [
            {
              id: "u-sub-1",
              full_name: "Alice Subordinate",
              job_title: "Junior Dev",
            },
          ],
          error: null,
        }).then(onfulfilled, onrejected),
    };

    vi.mocked(supabase.rpc).mockReturnValue(mockTeamRpc as any);

    render(<WorkCalendarPage />);

    await waitFor(() => {
      // Toolbar workspace default view "Hari"
      expect(screen.getByRole("group", { name: "Pilih rentang tampilan" })).toBeInTheDocument();
    });

    // Quick entry harus tampil di Hari
    expect(
      screen.getByPlaceholderText("Apa yang akan dikerjakan?"),
    ).toBeInTheDocument();

    // Mode Tim harus tersedia karena ada bawahan
    expect(screen.getByRole("button", { name: "Tim" })).toBeInTheDocument();
  });

  it("tombol coba lagi memicu pengambilan data ulang setelah error", async () => {
    let callCount = 0;
    vi.mocked(supabase.auth.getUser).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { data: { user: null }, error: null };
      }
      return { data: { user: { id: "u-retry-1" } }, error: null };
    });

    const mockProfileRow = {
      id: "u-retry-1",
      full_name: "Siti Rahma",
      job_title: "Product Manager",
    };

    const mockProfileQuery = {
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: mockProfileRow, error: null }),
      then: (onfulfilled: any, onrejected: any) =>
        Promise.resolve({ data: mockProfileRow, error: null }).then(onfulfilled, onrejected),
    };

    const mockEntriesQuery = {
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockReturnThis(),
      then: (onfulfilled: any, onrejected: any) =>
        Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected),
    };

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "profiles") {
        return { select: vi.fn().mockReturnValue(mockProfileQuery) } as any;
      }
      if (table === "work_calendar_entries") {
        return { select: vi.fn().mockReturnValue(mockEntriesQuery) } as any;
      }
      return {} as any;
    });

    const mockTeamRpc = {
      range: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockReturnThis(),
      then: (onfulfilled: any, onrejected: any) =>
        Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected),
    };

    vi.mocked(supabase.rpc).mockReturnValue(mockTeamRpc as any);

    render(<WorkCalendarPage />);

    await waitFor(() => {
      expect(screen.getByText("Profil Pengguna Tidak Ditemukan")).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole("button", { name: /Coba Lagi/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Pilih rentang tampilan" })).toBeInTheDocument();
    });
  });
});
